/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/admin/boards/[category]/edit/[id].tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";

import { app, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  SALES_HUB_ID,
  getBoardCounterId,
  getBoardCategoryById,
  getBoardCategoryChildren,
  getBoardCategoryFullLabel,
  getSalesHubProductCategories,
  getSalesHubProductId,
  isSalesHubCategory,
  isSalesIndexedCategory,
} from "@/config/boardCategories";
import { BOARD_THUMBNAIL_PLACEHOLDER } from "@/config/boardPlaceholders";
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

const AdminBoardEditPage: React.FC = () => {
  const router = useRouter();
  const routeCategoryId =
    typeof router.query.category === "string" ? router.query.category : "";
  const postId = typeof router.query.id === "string" ? router.query.id : "";

  const salesHubProducts = useMemo(() => getSalesHubProductCategories(), []);

  const [categoryId, setCategoryId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [subCategoryId, setSubCategoryId] = useState<string>("");
  const [originalCategoryId, setOriginalCategoryId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [publishedDate, setPublishedDate] = useState("");
  const [content, setContent] = useState("");

  const [existingAttachments, setExistingAttachments] = useState<AttachmentMeta[]>([]);
  const [newAttachments, setNewAttachments] = useState<FileList | null>(null);
  const [links, setLinks] = useState<LinkMeta[]>([]);

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [removeThumbnail, setRemoveThumbnail] = useState(false);

  const [salesIndex, setSalesIndex] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || !postId) return;

    const fetchPost = async () => {
      try {
        setLoading(true);
        setError(null);

        const refDoc = doc(db, "boardPosts", postId);
        const snap = await getDoc(refDoc);
        if (!snap.exists()) {
          setError("해당 게시글을 찾을 수 없습니다.");
          return;
        }

        const data = snap.data() as any;
        const initialCategory = data.categoryId || routeCategoryId || "";
        setOriginalCategoryId(initialCategory);
        setCategoryId(initialCategory);
        if (isSalesHubCategory(initialCategory)) {
          const resolvedProductId =
            getSalesHubProductId(initialCategory) ||
            salesHubProducts[0]?.id ||
            "";
          const children = resolvedProductId
            ? getBoardCategoryChildren(resolvedProductId)
            : [];
          const resolvedSubCategoryId =
            (getBoardCategoryById(initialCategory)?.salesIndexed
              ? initialCategory
              : "") ||
            children[0]?.id ||
            "";
          setProductId(resolvedProductId);
          setSubCategoryId(resolvedSubCategoryId);
          setCategoryId(resolvedSubCategoryId);
        }
        setTitle(data.title ?? "");
        setAuthor(data.author ?? "");
        setPublishedDate(data.publishedDate ?? "");
        setContent(data.content ?? "");
        setExistingAttachments(data.attachments ?? []);
        setLinks(data.links ?? []);
        setThumbnailUrl(data.thumbnailUrl ?? null);
        setSalesIndex(data.salesIndex ?? null);
      } catch (err: any) {
        console.error("게시글 불러오기 오류:", err);
        setError("게시글을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [router.isReady, postId, routeCategoryId, salesHubProducts]);

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewAttachments(e.target.files);
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setThumbnailFile(e.target.files?.[0] ?? null);
    setRemoveThumbnail(false);
  };

  const handleRemoveAttachment = (index: number) => {
    setExistingAttachments((prev) => prev.filter((_, idx) => idx !== index));
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

    if (!author.trim()) {
      setError("작성자를 입력해주세요.");
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
      const refDoc = doc(db, "boardPosts", postId);

      const attachmentMetas: AttachmentMeta[] = [...existingAttachments];
      const pdfFile = shouldAutoPdfThumbnail
        ? getFirstPdfFile(newAttachments)
        : null;

      if (newAttachments && newAttachments.length > 0) {
        const uploadTasks = Array.from(newAttachments).map(async (file) => {
          const storageRef = ref(
            storage,
            `boardPosts/${postId}/attachments/${Date.now()}_${file.name}`,
          );
          const snapshot = await uploadBytes(storageRef, file);
          const url = await getDownloadURL(snapshot.ref);
          attachmentMetas.push({ name: file.name, url });
        });
        await Promise.all(uploadTasks);
      }

      let nextThumbnailUrl = thumbnailUrl;
      if (removeThumbnail) {
        nextThumbnailUrl = null;
      }
      if (!thumbnailFile && !removeThumbnail && !nextThumbnailUrl && pdfFile) {
        try {
          const pdfThumb = await createPdfThumbnailBlob(pdfFile);
          const storageRef = ref(
            storage,
            `boardPosts/${postId}/thumbnail/${Date.now()}_pdf.jpg`,
          );
          const snapshot = await uploadBytes(storageRef, pdfThumb, {
            contentType: "image/jpeg",
          });
          nextThumbnailUrl = await getDownloadURL(snapshot.ref);
        } catch (err) {
          console.error("PDF 썸네일 생성 오류:", err);
        }
      }
      if (thumbnailFile) {
        const storageRef = ref(
          storage,
          `boardPosts/${postId}/thumbnail/${Date.now()}_${thumbnailFile.name}`,
        );
        const snapshot = await uploadBytes(storageRef, thumbnailFile);
        nextThumbnailUrl = await getDownloadURL(snapshot.ref);
      }

      const sanitizedLinks = links
        .map((link) => ({
          label: link.label.trim(),
          url: link.url.trim(),
        }))
        .filter((link) => link.label || link.url);

      let nextSalesIndex = isSalesIndexedCategory(categoryId) ? salesIndex : null;
      if (
        isSalesIndexedCategory(categoryId) &&
        (!nextSalesIndex || categoryId !== originalCategoryId)
      ) {
        await runTransaction(db, async (tx) => {
          const counterRef = doc(db, "boardCounters", getBoardCounterId(categoryId));
          const counterSnap = await tx.get(counterRef);
          const current = counterSnap.exists()
            ? (counterSnap.data() as any).current ?? 0
            : 0;
          const next = Number(current) + 1;
          tx.set(counterRef, { categoryId, current: next }, { merge: true });
          nextSalesIndex = next;
        });
      }

      await updateDoc(refDoc, {
        title: title.trim(),
        author: author.trim(),
        publishedDate: publishedDate || new Date().toISOString().slice(0, 10),
        content: content.trim(),
        categoryId,
        attachments: attachmentMetas,
        links: sanitizedLinks,
        thumbnailUrl: nextThumbnailUrl || null,
        salesIndex: nextSalesIndex ?? null,
        updatedAt: serverTimestamp(),
      });

      router.replace(`/admin/boards/${categoryId}/${postId}`);
    } catch (err: any) {
      console.error("게시글 수정 오류:", err);
      setError("게시글을 수정하는 중 오류가 발생했습니다.");
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

  useEffect(() => {
    if (!productId) return;
    if (!isSalesHubCategory(routeCategoryId) && !isSalesHubCategory(categoryId)) {
      return;
    }
    const children = getBoardCategoryChildren(productId);
    if (children.length === 0) return;
    if (children.some((child) => child.id === subCategoryId)) return;
    const next = children[0].id;
    setSubCategoryId(next);
    setCategoryId(next);
  }, [productId, routeCategoryId, categoryId, subCategoryId]);

  if (loading) {
    return (
      <PageWrapper>
        <InfoText>게시글을 불러오는 중입니다...</InfoText>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <HeaderRow>
        <Title>게시글 수정</Title>
      </HeaderRow>

      <Form onSubmit={handleSubmit}>
        <FieldRow>
          <Field>
            <Label>카테고리 *</Label>
            {isSalesHubRoute || isSalesHubCategory(categoryId) ? (
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
          <ThumbnailPreview
            src={thumbnailUrl || BOARD_THUMBNAIL_PLACEHOLDER}
            alt="thumbnail"
          />
          <Input type="file" accept="image/*" onChange={handleThumbnailChange} />
          <ToggleRow>
            <input
              id="removeThumbnail"
              type="checkbox"
              checked={removeThumbnail}
              onChange={(e) => setRemoveThumbnail(e.target.checked)}
            />
            <ToggleLabel htmlFor="removeThumbnail">썸네일 제거</ToggleLabel>
          </ToggleRow>
        </FieldRowColumn>

        <FieldRowColumn>
          <Label>파일 업로드</Label>
          <Input type="file" multiple onChange={handleAttachmentChange} />
          {existingAttachments.length > 0 && (
            <AttachmentList>
              {existingAttachments.map((file, idx) => (
                <AttachmentRow key={`${file.url}-${idx}`}>
                  <AttachmentName>{file.name}</AttachmentName>
                  <RemoveButton
                    type="button"
                    onClick={() => handleRemoveAttachment(idx)}
                  >
                    삭제
                  </RemoveButton>
                </AttachmentRow>
              ))}
            </AttachmentList>
          )}
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
                {links.length > 0 && (
                  <RemoveButton type="button" onClick={() => handleRemoveLink(index)}>
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

export default AdminBoardEditPage;

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

const ThumbnailPreview = styled.img`
  width: 240px;
  height: auto;
  border-radius: 10px;
  border: 1px solid #e5e5e5;
  background: #f7f7f7;
  margin-bottom: 8px;
`;

const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: #555;
`;

const ToggleLabel = styled.label`
  font-size: 12px;
`;

const AttachmentList = styled.div`
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const AttachmentRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid #eee;
  border-radius: 6px;
  font-size: 12px;
`;

const AttachmentName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
`;

const RemoveButton = styled.button`
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #eee;
  background: #f7f7f7;
  font-size: 12px;
  cursor: pointer;
`;

const InfoText = styled.div`
  font-size: 13px;
  color: #555;
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

  &:disabled {
    background: #aaa;
    cursor: default;
  }
`;
