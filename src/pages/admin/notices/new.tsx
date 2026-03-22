/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/admin/notices/new.tsx

"use client";

import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";

import { db, app } from "@/lib/firebase";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";

import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

type AttachmentMeta = {
  name: string;
  url: string;
};

const AdminNoticeCreatePage: React.FC = () => {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [publishedDate, setPublishedDate] = useState(""); // 'YYYY-MM-DD'
  const [content, setContent] = useState(""); // SmartEditor에서 가져온 HTML 저장용

  const [files, setFiles] = useState<FileList | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🔥 SmartEditor2 관련 ref
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const oEditorsRef = useRef<any[]>([]);
  const editorLoadedRef = useRef(false);

  // 🔧 SmartEditor 초기화
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
      oAppRef: oEditorsRef.current, // 🔥 여기로 인스턴스 배열이 채워짐
      elPlaceHolder: textareaRef.current.id, // textarea id와 반드시 동일해야 함
      sSkinURI: "/smarteditor2/SmartEditor2Skin.html",
      fCreator: "createSEditor2",
    });

    editorLoadedRef.current = true;
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }

    // 🔥 SmartEditor 내용 textarea에 반영
    try {
      const oEditors = oEditorsRef.current as any;
      const textarea = textareaRef.current;

      if (oEditors && textarea) {
        const editorId = textarea.id;

        if (oEditors.getById && oEditors.getById[editorId]) {
          oEditors.getById[editorId].exec("UPDATE_CONTENTS_FIELD", []);
        } else if (Array.isArray(oEditors) && oEditors[0]?.exec) {
          oEditors[0].exec("UPDATE_CONTENTS_FIELD", []);
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

    setContent(html);
    setError(null);
    setSaving(true);

    try {
      const storage = getStorage(app);

      //  공지 문서 ID 미리 생성
      const noticesCol = collection(db, "notices");
      const noticeRef = doc(noticesCol);

      // 날짜가 비어 있으면 오늘 날짜로 설정
      const todayStr = publishedDate || new Date().toISOString().slice(0, 10);

      // 첨부파일 업로드 (병렬)
      const attachments: AttachmentMeta[] = [];

      if (files && files.length > 0) {
        const uploadTasks = Array.from(files).map(async (file) => {
          const storageRef = ref(
            storage,
            `notices/${noticeRef.id}/${Date.now()}_${file.name}`
          );

          try {
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);
            attachments.push({
              name: file.name,
              url,
            });
          } catch (uploadErr: any) {
            console.error("📦 파일 업로드 오류:", {
              code: uploadErr?.code,
              message: uploadErr?.message,
              full: uploadErr,
            });
            throw uploadErr;
          }
        });

        await Promise.all(uploadTasks);
      }

      // Firestore에 저장
      await setDoc(noticeRef, {
        title: title.trim(),
        content: html,
        publishedDate: todayStr,
        attachments,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.replace("/admin/notices");
    } catch (err: any) {
      console.error("📄 공지사항 저장 전체 오류:", {
        code: err?.code,
        message: err?.message,
        full: err,
      });
      setError("공지사항을 저장하는 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const defaultToday = new Date().toISOString().slice(0, 10);

  return (
    <PageWrapper>
      <HeaderRow>
        <Title>공지사항 작성</Title>
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
              placeholder={defaultToday}
            />
            <HintText>입력하지 않으면 오늘 날짜로 저장됩니다.</HintText>
          </Field>
        </FieldRow>

        <FieldRowColumn>
          <Label>내용 *</Label>
          {/* 🔥 SmartEditor2가 붙을 textarea */}
          <EditorWrapper>
            <Textarea
              id="noticeEditorNew"
              ref={textareaRef}
              defaultValue={content}
            />
          </EditorWrapper>
        </FieldRowColumn>

        <FieldRowColumn>
          <Label>첨부파일</Label>
          <Input type="file" multiple onChange={handleFileChange} />
          <HintText>여러 개의 파일을 함께 업로드할 수 있습니다.</HintText>
        </FieldRowColumn>

        {error && <ErrorText>{error}</ErrorText>}

        <ButtonRow>
          <Button type="button" onClick={handleCancel} disabled={saving}>
            취소
          </Button>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </PrimaryButton>
        </ButtonRow>
      </Form>
    </PageWrapper>
  );
};

export default AdminNoticeCreatePage;

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
