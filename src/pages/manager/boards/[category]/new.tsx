/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/manager/boards/[category]/new.tsx
"use client";

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";

import { app, db } from "@/lib/firebase";
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth } from "firebase/auth";
import { getBoardCategoryFullLabel } from "@/config/boardCategories";

type AttachmentMeta = {
  name: string;
  url: string;
};

type LinkMeta = {
  label: string;
  url: string;
};

const ManagerInquiryCreatePage: React.FC = () => {
  const router = useRouter();
  const routeCategoryId =
    typeof router.query.category === "string" ? router.query.category : "";

  const isInquiry = routeCategoryId === "inquiry";

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");

  const [attachments, setAttachments] = useState<FileList | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [links, setLinks] = useState<LinkMeta[]>([{ label: "", url: "" }]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    if (!isInquiry) return;

    const initAuthor = async () => {
      try {
        const auth = getAuth();
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (userSnap.exists()) {
          const data = userSnap.data() as any;
          setAuthor(data.name ?? "");
        }
      } catch {
        // ignore
      }
    };

    initAuthor();
  }, [router.isReady, isInquiry]);

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAttachments(e.target.files);
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setThumbnailFile(e.target.files?.[0] ?? null);
  };

  const handleAddLink = () => {
    setLinks((prev) => [...prev, { label: "", url: "" }]);
  };

  const handleRemoveLink = (index: number) => {
    setLinks((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleLinkChange = (
    index: number,
    field: keyof LinkMeta,
    value: string,
  ) => {
    setLinks((prev) =>
      prev.map((link, idx) =>
        idx === index ? { ...link, [field]: value } : link,
      ),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isInquiry) {
      setError("문의하기 게시판만 작성할 수 있습니다.");
      return;
    }

    if (!title.trim()) {
      setError("제목을 입력해 주세요.");
      return;
    }

    if (!author.trim()) {
      setError("작성자명을 입력해 주세요.");
      return;
    }

    if (!content.trim()) {
      setError("게시글 내용을 입력해 주세요.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const storage = getStorage(app);
      const postsCol = collection(db, "boardPosts");
      const postRef = doc(postsCol);

      const todayStr = new Date().toISOString().slice(0, 10);

      const attachmentMetas: AttachmentMeta[] = [];
      if (attachments && attachments.length > 0) {
        const uploadTasks = Array.from(attachments).map(async (file) => {
          const storageRef = ref(
            storage,
            `boardPosts/${postRef.id}/attachments/${Date.now()}_${file.name}`,
          );
          const snapshot = await uploadBytes(storageRef, file);
          const url = await getDownloadURL(snapshot.ref);
          attachmentMetas.push({ name: file.name, url });
        });
        await Promise.all(uploadTasks);
      }

      let thumbnailUrl: string | null = null;
      if (thumbnailFile) {
        const storageRef = ref(
          storage,
          `boardPosts/${postRef.id}/thumbnail/${Date.now()}_${thumbnailFile.name}`,
        );
        const snapshot = await uploadBytes(storageRef, thumbnailFile);
        thumbnailUrl = await getDownloadURL(snapshot.ref);
      }

      const sanitizedLinks = links
        .map((link) => ({
          label: link.label.trim(),
          url: link.url.trim(),
        }))
        .filter((link) => link.label || link.url);

      await setDoc(postRef, {
        title: title.trim(),
        author: author.trim(),
        publishedDate: todayStr,
        content: content.trim(),
        categoryId: "inquiry",
        attachments: attachmentMetas,
        links: sanitizedLinks,
        thumbnailUrl: thumbnailUrl || null,
        salesIndex: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.replace("/manager/boards/inquiry");
    } catch (err: any) {
      console.error("문의글 저장 오류:", err);
      setError("문의글을 저장하는 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (!isInquiry) {
    return (
      <PageWrapper>
        <InfoText>문의하기 게시판만 작성할 수 있습니다.</InfoText>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <HeaderRow>
        <Title>문의하기 작성</Title>
        <SubTitle>{getBoardCategoryFullLabel("inquiry")}</SubTitle>
      </HeaderRow>

      <Form onSubmit={handleSubmit}>
        <FieldRow>
          <Field>
            <Label>제목 *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="문의 제목을 입력해 주세요."
            />
          </Field>
          <Field>
            <Label>작성자 *</Label>
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="작성자명을 입력해 주세요."
            />
          </Field>
        </FieldRow>

        <FieldRowColumn>
          <Label>문의 내용 *</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="문의 내용을 입력해 주세요."
          />
        </FieldRowColumn>

        <FieldRowColumn>
          <Label>썸네일</Label>
          <Input type="file" accept="image/*" onChange={handleThumbnailChange} />
          <HintText>이미지 파일 1개를 업로드할 수 있습니다.</HintText>
        </FieldRowColumn>

        <FieldRowColumn>
          <Label>파일 업로드</Label>
          <Input type="file" multiple onChange={handleAttachmentChange} />
          <HintText>여러 개의 파일을 업로드할 수 있습니다.</HintText>
        </FieldRowColumn>

        <FieldRowColumn>
          <Label>링크 첨부</Label>
          <LinkList>
            {links.map((link, index) => (
              <LinkRow key={`link-${index}`}>
                <LinkInput
                  value={link.label}
                  onChange={(e) =>
                    handleLinkChange(index, "label", e.target.value)
                  }
                  placeholder="링크 이름"
                />
                <LinkInput
                  value={link.url}
                  onChange={(e) =>
                    handleLinkChange(index, "url", e.target.value)
                  }
                  placeholder="https://"
                />
                {links.length > 1 && (
                  <RemoveButton
                    type="button"
                    onClick={() => handleRemoveLink(index)}
                  >
                    삭제
                  </RemoveButton>
                )}
              </LinkRow>
            ))}
          </LinkList>
          <SecondaryButton type="button" onClick={handleAddLink}>
            링크 추가
          </SecondaryButton>
        </FieldRowColumn>

        {error && <ErrorText>{error}</ErrorText>}

        <ButtonRow>
          <Button type="button" onClick={handleCancel} disabled={saving}>
            취소
          </Button>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "저장 중.." : "저장"}
          </PrimaryButton>
        </ButtonRow>
      </Form>
    </PageWrapper>
  );
};

export default ManagerInquiryCreatePage;

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

const HeaderRow = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
  gap: 4px;
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
`;

const SubTitle = styled.p`
  font-size: 12px;
  color: #888;
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

const Textarea = styled.textarea`
  width: 100%;
  min-height: 220px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
`;

const HintText = styled.div`
  font-size: 11px;
  color: #888;
  margin-top: 4px;
`;

const LinkList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
`;

const LinkRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.4fr 70px;
  gap: 8px;
  align-items: center;
`;

const LinkInput = styled.input`
  width: 100%;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 13px;
`;

const SecondaryButton = styled.button`
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #ccc;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  width: fit-content;

  &:hover {
    background: #f7f7f7;
  }
`;

const RemoveButton = styled.button`
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #eee;
  background: #f7f7f7;
  font-size: 12px;
  cursor: pointer;
`;

const ErrorText = styled.div`
  margin-top: 4px;
  font-size: 12px;
  color: #e74c3c;
`;

const InfoText = styled.div`
  font-size: 13px;
  color: #555;
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

