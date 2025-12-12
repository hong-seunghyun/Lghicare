/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/admin/notices/edit/[id].tsx

"use client";

import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";

import { db, app } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

type AttachmentMeta = {
  name: string;
  url: string;
};

type NoticeData = {
  title: string;
  content: string;
  publishedDate?: string;
  attachments: AttachmentMeta[];
};

const AdminNoticeEditPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;

  const [title, setTitle] = useState("");
  const [publishedDate, setPublishedDate] = useState("");
  const [content, setContent] = useState("");
  const [existingAttachments, setExistingAttachments] = useState<
    AttachmentMeta[]
  >([]);

  const [files, setFiles] = useState<FileList | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🔥 SmartEditor2 관련 ref
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const oEditorsRef = useRef<any[]>([]);
  const editorLoadedRef = useRef(false);

  // 공지 불러오기
  useEffect(() => {
    if (!id || typeof id !== "string") return;

    const fetchNotice = async () => {
      try {
        setLoading(true);
        setError(null);

        const refDoc = doc(db, "notices", id);
        const snap = await getDoc(refDoc);

        if (!snap.exists()) {
          setError("해당 공지사항을 찾을 수 없습니다.");
          return;
        }

        const data = snap.data() as NoticeData;

        setTitle(data.title ?? "");
        setContent(data.content ?? "");
        setPublishedDate(data.publishedDate ?? "");
        setExistingAttachments(data.attachments ?? []);
      } catch (err: any) {
        console.error("공지사항 불러오기 오류:", err);
        setError("공지사항을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchNotice();
  }, [id]);

  // SmartEditor 초기화
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (editorLoadedRef.current) return;
    if (!textareaRef.current) return;

    const w = window as any;
    if (!w.nhn || !w.nhn.husky || !w.nhn.husky.EZCreator) {
      console.warn("SmartEditor HuskyEZCreator.js 가 로드되지 않았습니다.");
      return;
    }

    w.nhn.husky.EZCreator.createInIFrame({
      oAppRef: oEditorsRef.current, // ✅ 그대로 넘기기만 사용
      elPlaceHolder: textareaRef.current.id,
      sSkinURI: "/smarteditor2/SmartEditor2Skin.html",
      fCreator: "createSEditor2",
      fOnAppLoad: () => {
        // 에디터 로드 완료 후, 기존 content를 에디터에 세팅
        if (content && textareaRef.current) {
          try {
            if (
              w.oEditors &&
              w.oEditors.getById &&
              w.oEditors.getById[textareaRef.current.id]
            ) {
              w.oEditors.getById[textareaRef.current.id].exec("SET_IR", [
                content,
              ]);
            }
          } catch (e) {
            console.warn("SmartEditor SET_IR 초기 세팅 오류:", e);
          }
        }
      },
    });

    editorLoadedRef.current = true;
  }, [content]);

  useEffect(() => {
    if (!editorLoadedRef.current) return;
    if (!content) return;
    if (!textareaRef.current) return;
    if (typeof window === "undefined") return;

    const w = window as any;

    try {
      if (
        w.oEditors &&
        w.oEditors.getById &&
        w.oEditors.getById[textareaRef.current.id]
      ) {
        w.oEditors.getById[textareaRef.current.id].exec("SET_IR", [content]);
      }
    } catch (e) {
      // 이미 fOnAppLoad에서 한 번 세팅했기 때문에, 추가 오류는 무시
    }
  }, [content]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || typeof id !== "string") return;

    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }

    // 🔥 SmartEditor 내부 내용을 textarea로 반영
    try {
      if (typeof window !== "undefined" && textareaRef.current) {
        const w = window as any;
        if (
          w.oEditors &&
          w.oEditors.getById &&
          w.oEditors.getById[textareaRef.current.id]
        ) {
          w.oEditors.getById[textareaRef.current.id].exec(
            "UPDATE_CONTENTS_FIELD",
            []
          );
        }
      }
    } catch (err) {
      console.warn("SmartEditor UPDATE_CONTENTS_FIELD 오류:", err);
    }

    const html = textareaRef.current?.value || "";

    if (!html || html === "<p><br></p>" || html.trim() === "") {
      setError("내용을 입력해주세요.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const storage = getStorage(app);
      const refDoc = doc(db, "notices", id);

      const newAttachments: AttachmentMeta[] = []; // 🔥 let → const

      if (files && files.length > 0) {
        const uploadTasks = Array.from(files).map(async (file) => {
          const storageRef = ref(
            storage,
            `notices/${id}/${Date.now()}_${file.name}`
          );
          const snapshot = await uploadBytes(storageRef, file);
          const url = await getDownloadURL(snapshot.ref);
          newAttachments.push({
            name: file.name,
            url,
          });
        });

        await Promise.all(uploadTasks);
      }

      const todayStr = publishedDate || new Date().toISOString().slice(0, 10);

      await updateDoc(refDoc, {
        title: title.trim(),
        content: html,
        publishedDate: todayStr,
        attachments: [...existingAttachments, ...newAttachments],
        updatedAt: serverTimestamp(),
      });

      router.replace(`/admin/notices/${id}`);
    } catch (err: any) {
      console.error("공지사항 수정 오류:", err);
      setError("공지사항을 수정하는 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!id || typeof id !== "string") {
      router.push("/admin/notices");
      return;
    }
    router.push(`/admin/notices/${id}`);
  };

  if (loading) {
    return (
      <PageWrapper>
        <InfoText>공지사항을 불러오는 중입니다...</InfoText>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <HeaderRow>
        <Title>공지사항 수정</Title>
      </HeaderRow>

      <Form onSubmit={handleSubmit}>
        <FieldRow>
          <Field>
            <Label>제목 *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="공지사항 제목을 입력하세요."
            />
          </Field>
          <Field>
            <Label>게시일</Label>
            <Input
              type="date"
              value={publishedDate}
              onChange={(e) => setPublishedDate(e.target.value)}
            />
            <HintText>입력하지 않으면 오늘 날짜로 저장됩니다.</HintText>
          </Field>
        </FieldRow>

        <FieldRowColumn>
          <Label>내용 *</Label>
          <EditorWrapper>
            {/* SmartEditor2 붙을 textarea */}
            <Textarea
              id="noticeEditorEdit"
              ref={textareaRef}
              defaultValue={content}
            />
          </EditorWrapper>
        </FieldRowColumn>

        {existingAttachments.length > 0 && (
          <FieldRowColumn>
            <Label>기존 첨부파일</Label>
            <AttachList>
              {existingAttachments.map((file, idx) => (
                <li key={`${file.url}_${idx}`}>
                  <a href={file.url} target="_blank" rel="noopener noreferrer">
                    {file.name}
                  </a>
                </li>
              ))}
            </AttachList>
          </FieldRowColumn>
        )}

        <FieldRowColumn>
          <Label>추가 첨부파일</Label>
          <Input type="file" multiple onChange={handleFileChange} />
          <HintText>새로 업로드하는 파일은 기존 첨부 뒤에 추가됩니다.</HintText>
        </FieldRowColumn>

        {error && <ErrorText>{error}</ErrorText>}

        <ButtonRow>
          <Button type="button" onClick={handleCancel} disabled={saving}>
            취소
          </Button>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "수정 중..." : "수정 완료"}
          </PrimaryButton>
        </ButtonRow>
      </Form>
    </PageWrapper>
  );
};

export default AdminNoticeEditPage;

// =============== styled-components ===============

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
`;

const Form = styled.form`
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
`;

const FieldRow = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`;

const FieldRowColumn = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
`;

const Field = styled.div`
  flex: 1;
  min-width: 0;
`;

const Label = styled.div`
  font-size: 13px;
  margin-bottom: 4px;
  font-weight: 500;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 13px;
`;

const EditorWrapper = styled.div`
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  min-height: 240px;
`;

const Textarea = styled.textarea`
  width: 100%;
  min-height: 220px;
  padding: 8px 10px;
  border: none;
  resize: vertical;
  font-size: 14px;
  line-height: 1.6;
  outline: none;
`;

const AttachList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 13px;

  li + li {
    margin-top: 4px;
  }

  a {
    color: #0066cc;
  }
`;

const HintText = styled.div`
  font-size: 11px;
  color: #888;
  margin-top: 4px;
`;

const ErrorText = styled.div`
  margin-top: 4px;
  font-size: 12px;
  color: #e74c3c;
`;

const InfoText = styled.div`
  font-size: 14px;
  color: #555;
  padding: 12px 0;
`;

const ButtonRow = styled.div`
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`;

const Button = styled.button`
  padding: 7px 12px;
  border-radius: 6px;
  border: 1px solid #ccc;
  background: #fff;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: #f7f7f7;
  }

  &:disabled {
    background: #f5f5f5;
    cursor: default;
  }
`;

const PrimaryButton = styled.button`
  padding: 7px 14px;
  border-radius: 6px;
  border: none;
  background: #333;
  color: #fff;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: #111;
  }

  &:disabled {
    background: #aaa;
    cursor: default;
  }
`;
