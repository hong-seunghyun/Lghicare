/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/admin/boards/[category]/new.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";

import { app, db } from "@/lib/firebase";
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  SALES_HUB_ID,
  getBoardCategoryById,
  getBoardCategoryChildren,
  getBoardCategoryFullLabel,
  getBoardLeafCategories,
  getSalesHubProductCategories,
  getSalesHubProductId,
  isSalesHubCategory,
  isSalesIndexedCategory,
} from "@/config/boardCategories";
import { createPdfThumbnailBlob } from "@/lib/pdfThumbnail";

type AttachmentMeta = {
  name: string;
  url: string;
};

type LinkMeta = {
  label: string;
  url: string;
};

const getFirstPdfFile = (files: FileList | null) => {
  if (!files) return null;
  return Array.from(files).find((file) =>
    file.name.toLowerCase().endsWith(".pdf"),
  ) ?? null;
};

const AdminBoardCreatePage: React.FC = () => {
  const router = useRouter();
  const routeCategoryId =
    typeof router.query.category === "string" ? router.query.category : "";

  const leafCategories = useMemo(() => getBoardLeafCategories(), []);
  const salesHubProducts = useMemo(() => getSalesHubProductCategories(), []);

  const [categoryId, setCategoryId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [subCategoryId, setSubCategoryId] = useState<string>("");

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("LG하이케어솔루션");
  const [publishedDate, setPublishedDate] = useState("");
  const [content, setContent] = useState("");

  const [attachments, setAttachments] = useState<FileList | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [links, setLinks] = useState<LinkMeta[]>([{ label: "", url: "" }]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    const routeCategory = getBoardCategoryById(routeCategoryId);
    const isSalesHubRoute = routeCategoryId === SALES_HUB_ID;
    const isSalesHubRouteOrDescendant = isSalesHubCategory(routeCategoryId);

    if (isSalesHubRoute || isSalesHubRouteOrDescendant) {
      const resolvedProductId =
        getSalesHubProductId(routeCategoryId) || salesHubProducts[0]?.id || "";
      const productChildren = resolvedProductId
        ? getBoardCategoryChildren(resolvedProductId)
        : [];
      const resolvedSubCategoryId =
        (routeCategory?.salesIndexed ? routeCategoryId : "") ||
        productChildren[0]?.id ||
        "";

      setProductId(resolvedProductId);
      setSubCategoryId(resolvedSubCategoryId);
      setCategoryId(resolvedSubCategoryId);
      return;
    }

    if (routeCategoryId) {
      const isLeaf = leafCategories.some((c) => c.id === routeCategoryId);
      if (isLeaf) {
        setCategoryId(routeCategoryId);
        return;
      }
    }

    if (leafCategories.length > 0) {
      setCategoryId(leafCategories[0].id);
    }
  }, [router.isReady, routeCategoryId, leafCategories, salesHubProducts]);

  useEffect(() => {
    if (!productId) return;
    if (!isSalesHubCategory(routeCategoryId)) return;
    const children = getBoardCategoryChildren(productId);
    if (children.length === 0) return;
    if (children.some((child) => child.id === subCategoryId)) return;
    const next = children[0].id;
    setSubCategoryId(next);
    setCategoryId(next);
  }, [productId, routeCategoryId, subCategoryId]);

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

  const isSalesHubRoute =
    routeCategoryId === SALES_HUB_ID || isSalesHubCategory(routeCategoryId);
  const shouldAutoPdfThumbnail = isSalesHubCategory(categoryId);

  const handleProductChange = (value: string) => {
    setProductId(value);
    const children = value ? getBoardCategoryChildren(value) : [];
    const nextSub = children[0]?.id || "";
    setSubCategoryId(nextSub);
    setCategoryId(nextSub);
  };

  const handleSubCategoryChange = (value: string) => {
    setSubCategoryId(value);
    setCategoryId(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!categoryId) {
      setError("카테고리를 선택해주세요.");
      return;
    }

    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }

    if (!content.trim()) {
      setError("게시글 내용을 입력해주세요.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const storage = getStorage(app);
      const postsCol = collection(db, "boardPosts");
      const postRef = doc(postsCol);

      const todayStr = publishedDate || new Date().toISOString().slice(0, 10);

      const attachmentMetas: AttachmentMeta[] = [];
      const pdfFile = shouldAutoPdfThumbnail
        ? getFirstPdfFile(attachments)
        : null;
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
      if (!thumbnailFile && pdfFile) {
        try {
          const pdfThumb = await createPdfThumbnailBlob(pdfFile);
          const storageRef = ref(
            storage,
            `boardPosts/${postRef.id}/thumbnail/${Date.now()}_pdf.jpg`,
          );
          const snapshot = await uploadBytes(storageRef, pdfThumb, {
            contentType: "image/jpeg",
          });
          thumbnailUrl = await getDownloadURL(snapshot.ref);
        } catch (err) {
          console.error("PDF 썸네일 생성 오류:", err);
        }
      }
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

      let salesIndex: number | null = null;
      if (isSalesIndexedCategory(categoryId)) {
        await runTransaction(db, async (tx) => {
          const counterRef = doc(db, "boardCounters", "salesHub");
          const counterSnap = await tx.get(counterRef);
          const current = counterSnap.exists()
            ? ((counterSnap.data() as any).current ?? 0)
            : 0;
          const next = Number(current) + 1;
          tx.set(counterRef, { current: next }, { merge: true });
          salesIndex = next;
        });
      }

      await setDoc(postRef, {
        title: title.trim(),
        author: "LG하이케어솔루션",
        publishedDate: todayStr,
        content: content.trim(),
        categoryId,
        attachments: attachmentMetas,
        links: sanitizedLinks,
        thumbnailUrl: thumbnailUrl || null,
        salesIndex: salesIndex ?? null,
        readByManagerIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.replace(`/admin/boards/${categoryId}`);
    } catch (err: any) {
      console.error("게시글 저장 오류:", err);
      setError("게시글을 저장하는 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const categoryOptions = useMemo(
    () =>
      categoryId
        ? [
            {
              id: categoryId,
              label: getBoardCategoryFullLabel(categoryId),
            },
          ]
        : [],
    [categoryId],
  );

  const productOptions = useMemo(
    () =>
      salesHubProducts.map((product) => ({
        id: product.id,
        label: product.label,
      })),
    [salesHubProducts],
  );

  const subCategoryOptions = useMemo(() => {
    if (!productId) return [];
    return getBoardCategoryChildren(productId).map((child) => ({
      id: child.id,
      label: child.label,
    }));
  }, [productId]);

  return (
    <PageWrapper>
      <HeaderRow>
        <Title>게시글 작성</Title>
      </HeaderRow>

      <Form onSubmit={handleSubmit}>
        <FieldRow>
          <Field>
            <Label>카테고리 *</Label>
            {isSalesHubRoute ? (
              <SalesHubSelectGrid>
                <Select
                  value={productId}
                  onChange={(e) => handleProductChange(e.target.value)}
                >
                  {productOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Select
                  value={subCategoryId}
                  onChange={(e) => handleSubCategoryChange(e.target.value)}
                  disabled={!productId}
                >
                  {subCategoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </SalesHubSelectGrid>
            ) : (
              <Select value={categoryId} onChange={() => undefined} disabled>
                {categoryOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
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

        <FieldRow>
          <Field>
            <Label>제목 *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="게시글 제목을 입력하세요."
            />
          </Field>
          <Field>
            <Label>작성자 *</Label>
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="작성자 이름을 입력하세요."
            />
          </Field>
        </FieldRow>

        <FieldRowColumn>
          <Label>게시글 내용 *</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="게시글 내용을 입력하세요."
          />
        </FieldRowColumn>

        <FieldRowColumn>
          <Label>썸네일</Label>
          <Input
            type="file"
            accept="image/*"
            onChange={handleThumbnailChange}
          />
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

export default AdminBoardCreatePage;

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  padding: 25px;
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

const Select = styled.select`
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 13px;
  background: #fff;
`;

const SalesHubSelectGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
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
/* eslint-disable @typescript-eslint/no-explicit-any */
