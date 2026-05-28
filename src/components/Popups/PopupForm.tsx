/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { app } from "@/lib/firebase";
import {
  popupDisplayLocationOptions,
  type PopupDisplayLocation,
  type PopupStatus,
} from "@/types/popup";
import {
  DEFAULT_POPUP_PRIORITY,
  sanitizeFileName,
  sanitizePopupHtml,
} from "@/lib/popups";

export type PopupFormValues = {
  title: string;
  contentHtml: string;
  imageFile: File | null;
  status: PopupStatus;
  priority: number;
  startDate: string;
  endDate: string;
  displayLocations: PopupDisplayLocation[];
};

type PopupFormInitialValues = {
  title?: string;
  contentHtml?: string;
  imageUrl?: string | null;
  status?: PopupStatus;
  priority?: number;
  startDate?: string;
  endDate?: string;
  displayLocations?: PopupDisplayLocation[];
};

type PopupFormProps = {
  popupId: string;
  initialValues?: PopupFormInitialValues;
  submitLabel: string;
  saving: boolean;
  onSubmit: (values: PopupFormValues) => Promise<void>;
  onCancel: () => void;
};

const getPlainText = (html: string) => {
  if (typeof window === "undefined") return html.replace(/<[^>]*>/g, "");
  const element = document.createElement("div");
  element.innerHTML = html;
  return element.textContent?.trim() ?? "";
};

export default function PopupForm({
  popupId,
  initialValues,
  submitLabel,
  saving,
  onSubmit,
  onCancel,
}: PopupFormProps) {
  const editorId = useMemo(() => `popupEditor_${popupId}`, [popupId]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const oEditorsRef = useRef<any[]>([]);
  const editorLoadedRef = useRef(false);

  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [contentHtml, setContentHtml] = useState(
    initialValues?.contentHtml ?? "",
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    initialValues?.imageUrl ?? null,
  );
  const [status, setStatus] = useState<PopupStatus>(
    initialValues?.status ?? "active",
  );
  const [priority, setPriority] = useState(
    String(initialValues?.priority ?? DEFAULT_POPUP_PRIORITY),
  );
  const [startDate, setStartDate] = useState(initialValues?.startDate ?? "");
  const [endDate, setEndDate] = useState(initialValues?.endDate ?? "");
  const [displayLocations, setDisplayLocations] = useState<
    PopupDisplayLocation[]
  >(initialValues?.displayLocations ?? ["admin_dashboard"]);
  const [editorImageUploading, setEditorImageUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getEditorInstance = useCallback(() => {
    if (typeof window === "undefined") return null;
    const w = window as any;
    if (w.oEditors?.getById?.[editorId]) return w.oEditors.getById[editorId];
    const editors = oEditorsRef.current as any;
    if (editors?.getById?.[editorId]) return editors.getById[editorId];
    if (Array.isArray(editors) && editors[0]?.exec) return editors[0];
    return null;
  }, [editorId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (editorLoadedRef.current) return;
    if (!textareaRef.current) return;

    let disposed = false;
    let retryTimer: number | null = null;
    const scriptSrc = "/smarteditor2/js/service/HuskyEZCreator.js";

    const createEditor = () => {
      if (disposed || editorLoadedRef.current || !textareaRef.current) return;
      const w = window as any;
      const creator = w.nhn?.husky?.EZCreator;
      if (!creator) return;

      creator.createInIFrame({
        oAppRef: oEditorsRef.current,
        elPlaceHolder: editorId,
        sSkinURI: "/smarteditor2/SmartEditor2Skin.html",
        fCreator: "createSEditor2",
        fOnAppLoad: () => {
          getEditorInstance()?.exec("SET_IR", [contentHtml]);
        },
      });

      editorLoadedRef.current = true;
      setError(null);
    };

    createEditor();
    if (editorLoadedRef.current) return;

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${scriptSrc}"]`,
    );
    const script = existingScript ?? document.createElement("script");
    const handleLoad = () => createEditor();
    const handleError = () =>
      setError("스마트 에디터 스크립트를 불러오지 못했습니다.");

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    if (!existingScript) {
      script.src = scriptSrc;
      script.async = true;
      document.head.appendChild(script);
    }

    retryTimer = window.setTimeout(() => {
      createEditor();
      if (!editorLoadedRef.current) {
        setError("스마트 에디터 스크립트를 불러오지 못했습니다.");
      }
    }, 800);

    return () => {
      disposed = true;
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [contentHtml, editorId, getEditorInstance]);

  useEffect(() => {
    return () => {
      if (imagePreview && imageFile) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imageFile, imagePreview]);

  const syncEditorContent = () => {
    try {
      getEditorInstance()?.exec("UPDATE_CONTENTS_FIELD", []);
    } catch (err) {
      console.warn("SmartEditor UPDATE_CONTENTS_FIELD error:", err);
    }
    const nextHtml = textareaRef.current?.value ?? "";
    setContentHtml(nextHtml);
    return nextHtml;
  };

  const handleMainImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImageFile(file);
    if (!file) {
      setImagePreview(initialValues?.imageUrl ?? null);
      return;
    }
    setImagePreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const handleLocationChange = (location: PopupDisplayLocation) => {
    setDisplayLocations((prev) =>
      prev.includes(location)
        ? prev.filter((item) => item !== location)
        : [...prev, location],
    );
  };

  const handleEditorImageInsert = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setEditorImageUploading(true);
      setError(null);
      const storage = getStorage(app);
      const storageRef = ref(
        storage,
        `popups/${popupId}/editor/${Date.now()}_${sanitizeFileName(file.name)}`,
      );
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      const imageHtml = `<p><img src="${url}" alt="${file.name}" style="max-width: 100%; height: auto;" /></p>`;
      const editor = getEditorInstance();

      if (editor) {
        editor.exec("PASTE_HTML", [imageHtml]);
        return;
      }

      const textarea = textareaRef.current;
      if (textarea) {
        textarea.value = `${textarea.value}${imageHtml}`;
      }
    } catch (err) {
      console.error("popup editor image upload error:", err);
      setError("본문 이미지를 업로드하지 못했습니다.");
    } finally {
      setEditorImageUploading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const html = syncEditorContent();
    const sanitizedHtml = sanitizePopupHtml(html);
    const plainText = getPlainText(sanitizedHtml);
    const hasImage = Boolean(imageFile || imagePreview);

    if (!title.trim()) {
      setError("팝업 제목을 입력해 주세요.");
      return;
    }
    if (!startDate || !endDate) {
      setError("게시 시작일과 종료일을 모두 선택해 주세요.");
      return;
    }
    const priorityValue = Number(priority);
    if (!Number.isFinite(priorityValue)) {
      setError("팝업 우선순위를 숫자로 입력해 주세요.");
      return;
    }
    if (startDate > endDate) {
      setError("게시 종료일은 시작일 이후로 선택해 주세요.");
      return;
    }
    if (displayLocations.length === 0) {
      setError("노출 위치를 1개 이상 선택해 주세요.");
      return;
    }
    if (!hasImage && !plainText) {
      setError("팝업 이미지 또는 텍스트 내용을 입력해 주세요.");
      return;
    }

    setError(null);
    await onSubmit({
      title: title.trim(),
      contentHtml: sanitizedHtml,
      imageFile,
      status,
      priority: priorityValue,
      startDate,
      endDate,
      displayLocations,
    });
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Section>
        <SectionTitle>기본 정보</SectionTitle>
        <FieldGrid>
          <Field>
            <Label htmlFor="popup-title">팝업 제목 *</Label>
            <Input
              id="popup-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="팝업 제목을 입력하세요"
            />
          </Field>
          <Field>
            <Label>게시 상태</Label>
            <SwitchButton
              type="button"
              $active={status === "active"}
              onClick={() =>
                setStatus((prev) => (prev === "active" ? "inactive" : "active"))
              }
            >
              <SwitchKnob $active={status === "active"} />
              {status === "active" ? "게시중" : "게시중지"}
            </SwitchButton>
          </Field>
          <Field>
            <Label htmlFor="popup-priority">팝업 우선순위</Label>
            <Input
              id="popup-priority"
              type="number"
              min="1"
              step="1"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              placeholder="예: 1"
            />
            <HintText>숫자가 작을수록 먼저, 더 앞쪽에 노출됩니다.</HintText>
          </Field>
        </FieldGrid>
      </Section>

      <Section>
        <SectionTitle>게시 기간 *</SectionTitle>
        <FieldGrid>
          <Field>
            <Label htmlFor="popup-start-date">게시 시작일</Label>
            <Input
              id="popup-start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="popup-end-date">게시 종료일</Label>
            <Input
              id="popup-end-date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
        </FieldGrid>
      </Section>

      <Section>
        <SectionTitle>노출 위치</SectionTitle>
        <CheckboxGrid>
          {popupDisplayLocationOptions.map((option) => (
            <CheckboxLabel key={option.value}>
              <input
                type="checkbox"
                checked={displayLocations.includes(option.value)}
                onChange={() => handleLocationChange(option.value)}
              />
              <span>{option.label}</span>
            </CheckboxLabel>
          ))}
        </CheckboxGrid>
      </Section>

      <Section>
        <SectionTitle>팝업 이미지</SectionTitle>
        <ImageUploadRow>
          <FileInputLabel>
            이미지 선택
            <input type="file" accept="image/*" onChange={handleMainImageChange} />
          </FileInputLabel>
          <HintText>새 이미지를 업로드하면 기존 이미지 URL을 교체합니다.</HintText>
        </ImageUploadRow>
        {imagePreview && (
          <PreviewWrap>
            <PreviewImage src={imagePreview} alt="popup preview" />
          </PreviewWrap>
        )}
      </Section>

      <Section>
        <EditorHeader>
          <SectionTitle>텍스트 내용</SectionTitle>
          <FileInputLabel>
            {editorImageUploading ? "업로드 중..." : "본문 이미지 삽입"}
            <input
              type="file"
              accept="image/*"
              disabled={editorImageUploading}
              onChange={handleEditorImageInsert}
            />
          </FileInputLabel>
        </EditorHeader>
        <EditorWrapper>
          <Textarea id={editorId} ref={textareaRef} defaultValue={contentHtml} />
        </EditorWrapper>
      </Section>

      {error && <ErrorText>{error}</ErrorText>}

      <ButtonRow>
        <SecondaryButton type="button" onClick={onCancel} disabled={saving}>
          취소
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={saving || editorImageUploading}>
          {saving ? "저장 중..." : submitLabel}
        </PrimaryButton>
      </ButtonRow>
    </Form>
  );
}

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const SectionTitle = styled.h2`
  font-size: 15px;
  font-weight: 700;
  color: #111827;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
`;

const Input = styled.input`
  height: 40px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  color: #111827;
  background: #fff;
`;

const SwitchButton = styled.button<{ $active: boolean }>`
  width: 132px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid ${(p) => (p.$active ? "#2563eb" : "#d1d5db")};
  background: ${(p) => (p.$active ? "#eff6ff" : "#f9fafb")};
  color: ${(p) => (p.$active ? "#1d4ed8" : "#6b7280")};
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  cursor: pointer;
`;

const SwitchKnob = styled.span<{ $active: boolean }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${(p) => (p.$active ? "#2563eb" : "#9ca3af")};
`;

const CheckboxGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const CheckboxLabel = styled.label`
  min-height: 40px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #111827;
  cursor: pointer;
`;

const ImageUploadRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const FileInputLabel = styled.label`
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  input {
    display: none;
  }
`;

const HintText = styled.span`
  font-size: 12px;
  color: #6b7280;
`;

const PreviewWrap = styled.div`
  width: min(360px, 100%);
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  background: #f9fafb;
`;

const PreviewImage = styled.img`
  display: block;
  width: 100%;
  max-height: 260px;
  object-fit: contain;
`;

const EditorHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const EditorWrapper = styled.div`
  border: 1px solid #d1d5db;
  border-radius: 8px;
  overflow: hidden;
  min-height: 320px;
  background: #fff;
`;

const Textarea = styled.textarea`
  width: 100%;
  min-height: 300px;
  padding: 12px;
  resize: vertical;
  font-size: 14px;
  line-height: 1.6;
`;

const ErrorText = styled.div`
  color: #dc2626;
  font-size: 13px;
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
`;

const buttonStyle = css`
  height: 38px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`;

const SecondaryButton = styled.button`
  ${buttonStyle}
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
`;

const PrimaryButton = styled.button`
  ${buttonStyle}
  border: 1px solid #111827;
  background: #111827;
  color: #fff;
`;
