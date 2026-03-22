/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/admin/boards/[category]/[id].tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";

import { app, db } from "@/lib/firebase";
import { deleteDoc, doc, getDoc, Timestamp } from "firebase/firestore";
import { deleteObject, getStorage, listAll, ref } from "firebase/storage";
import { getBoardCategoryFullLabel } from "@/config/boardCategories";
import PdfPreview from "@/components/PdfPreview";

type Attachment = {
  name: string;
  url: string;
};

type LinkMeta = {
  label: string;
  url: string;
};

type BoardPostDetail = {
  id: string;
  title: string;
  author: string;
  content: string;
  publishedDate?: string;
  createdAt?: Timestamp | null;
  attachments: Attachment[];
  links: LinkMeta[];
  thumbnailUrl?: string;
  salesIndex?: number;
  categoryId: string;
};

const isPdfAttachment = (file: Attachment) => {
  const name = file.name?.toLowerCase() ?? "";
  const url = file.url?.toLowerCase() ?? "";
  return name.endsWith(".pdf") || url.includes(".pdf");
};

const deleteStorageFolder = async (folderRef: ReturnType<typeof ref>) => {
  const listing = await listAll(folderRef);
  await Promise.all(listing.items.map((item) => deleteObject(item)));
  await Promise.all(
    listing.prefixes.map((prefix) => deleteStorageFolder(prefix)),
  );
};

const AdminBoardDetailPage: React.FC = () => {
  const router = useRouter();
  const categoryId =
    typeof router.query.category === "string" ? router.query.category : "";
  const postId = typeof router.query.id === "string" ? router.query.id : "";

  const [post, setPost] = useState<BoardPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const categoryLabel = useMemo(() => {
    const targetCategoryId = post?.categoryId || categoryId;
    if (!targetCategoryId) return "-";
    return getBoardCategoryFullLabel(targetCategoryId);
  }, [categoryId, post?.categoryId]);

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
          setPost(null);
          return;
        }

        const data = snap.data() as any;
        setPost({
          id: snap.id,
          title: data.title ?? "(제목 없음)",
          author: data.author ?? "-",
          content: data.content ?? "",
          publishedDate: data.publishedDate,
          createdAt: data.createdAt ?? null,
          attachments: data.attachments ?? [],
          links: data.links ?? [],
          thumbnailUrl: data.thumbnailUrl,
          salesIndex: data.salesIndex ?? null,
          categoryId: data.categoryId ?? categoryId,
        });
      } catch (err: any) {
        console.error("게시글 상세 오류:", err);
        setError("게시글을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [router.isReady, postId, categoryId]);

  const handleBack = () => {
    router.push(`/admin/boards/${categoryId}`);
  };

  const handleEdit = () => {
    router.push(`/admin/boards/${categoryId}/edit/${postId}`);
  };

  const handleDelete = async () => {
    if (!postId) return;
    const confirmDelete = window.confirm("해당 게시글을 삭제하시겠습니까?");
    if (!confirmDelete) return;

    try {
      setDeleting(true);
      await deleteDoc(doc(db, "boardPosts", postId));

      try {
        const storage = getStorage(app);
        const folderRef = ref(storage, `boardPosts/${postId}`);
        await deleteStorageFolder(folderRef);
      } catch (storageErr) {
        console.warn("첨부 파일 삭제 실패:", storageErr);
      }

      const targetCategoryId = post?.categoryId || categoryId;
      router.replace(`/admin/boards/${targetCategoryId}`);
    } catch (err) {
      console.error("게시글 삭제 오류:", err);
      alert("게시글 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (publishedDate?: string, createdAt?: Timestamp | null) => {
    if (publishedDate && publishedDate.trim() !== "") {
      return publishedDate;
    }
    if (createdAt && createdAt.toDate) {
      const d = createdAt.toDate();
      const yyyy = d.getFullYear();
      const mm = `${d.getMonth() + 1}`.padStart(2, "0");
      const dd = `${d.getDate()}`.padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
    return "-";
  };

  return (
    <PageWrapper>
      <HeaderRow>
        <Title>게시글 상세</Title>
        <RightActions>
          <Button type="button" onClick={handleBack}>
            목록
          </Button>
          <PrimaryButton type="button" onClick={handleEdit}>
            수정
          </PrimaryButton>
          <DangerButton
            type="button"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "삭제 중..." : "삭제"}
          </DangerButton>
        </RightActions>
      </HeaderRow>

      {loading && <InfoText>게시글을 불러오는 중입니다...</InfoText>}
      {error && <ErrorText>{error}</ErrorText>}

      {!loading && !error && post && (
        <Card>
          <MetaGrid>
            <MetaItem>
              <MetaLabel>카테고리</MetaLabel>
              <MetaValue>{categoryLabel}</MetaValue>
            </MetaItem>
            <MetaItem>
              <MetaLabel>작성자</MetaLabel>
              <MetaValue>{post.author}</MetaValue>
            </MetaItem>
            <MetaItem>
              <MetaLabel>게시일</MetaLabel>
              <MetaValue>
                {formatDate(post.publishedDate, post.createdAt)}
              </MetaValue>
            </MetaItem>
            {post.salesIndex ? (
              <MetaItem>
                <MetaLabel>번호</MetaLabel>
                <MetaValue>#{post.salesIndex}</MetaValue>
              </MetaItem>
            ) : null}
          </MetaGrid>

          <TitleRow>{post.title}</TitleRow>

          {post.attachments.some(isPdfAttachment) && (
            <Section>
              <SectionTitle>PDF 미리보기</SectionTitle>
              <PdfList>
                {post.attachments.filter(isPdfAttachment).map((file, idx) => (
                  <PdfItem key={`${file.url}-${idx}`}>
                    <PdfLabel>{file.name}</PdfLabel>
                    <PdfPreview url={file.url} name={file.name} />
                  </PdfItem>
                ))}
              </PdfList>
            </Section>
          )}

          <ContentBox>{post.content}</ContentBox>

          <Section>
            <SectionTitle>첨부 파일</SectionTitle>
            {post.attachments.length === 0 ? (
              <InfoText>등록된 파일이 없습니다.</InfoText>
            ) : (
              <List>
                {post.attachments.map((file, idx) => (
                  <li key={`${file.url}-${idx}`}>
                    <FileLink href={file.url} target="_blank" rel="noreferrer">
                      {file.name}
                    </FileLink>
                  </li>
                ))}
              </List>
            )}
          </Section>

          

          <Section>
            <SectionTitle>링크</SectionTitle>
            {post.links.length === 0 ? (
              <InfoText>등록된 링크가 없습니다.</InfoText>
            ) : (
              <List>
                {post.links.map((link, idx) => (
                  <li key={`${link.url}-${idx}`}>
                    <FileLink href={link.url} target="_blank" rel="noreferrer">
                      {link.label || link.url}
                    </FileLink>
                  </li>
                ))}
              </List>
            )}
          </Section>
        </Card>
      )}
    </PageWrapper>
  );
};

export default AdminBoardDetailPage;

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
  gap: 12px;
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
`;

const RightActions = styled.div`
  display: flex;
  gap: 8px;
`;

const Button = styled.button`
  padding: 7px 12px;
  border-radius: 6px;
  border: 1px solid #ccc;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
`;

const PrimaryButton = styled(Button)`
  border: none;
  background: #333;
  color: #fff;
`;

const DangerButton = styled(Button)`
  border: none;
  background: #e74c3c;
  color: #fff;

  &:disabled {
    background: #f0b3aa;
    cursor: default;
  }
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

const Card = styled.div`
  background: #fff;
  border-radius: 12px;
  padding: 18px 20px 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
`;

const MetaItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const MetaLabel = styled.span`
  font-size: 12px;
  color: #777;
`;

const MetaValue = styled.span`
  font-size: 14px;
  font-weight: 600;
`;

const TitleRow = styled.div`
  font-size: 18px;
  font-weight: 700;
`;

const ContentBox = styled.div`
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  background: #fafafa;
  border-radius: 10px;
  padding: 14px 16px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SectionTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
`;

const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
`;

const PdfList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const PdfItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const PdfLabel = styled.div`
  font-size: 12px;
  color: #666;
`;

const FileLink = styled.a`
  color: #2c5cff;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;
/* eslint-disable @typescript-eslint/no-explicit-any */
