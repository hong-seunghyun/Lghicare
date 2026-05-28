/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/manager/boards/[category]/[id].tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";
import PdfPreview from "@/components/PdfPreview";

import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  setDoc,
  increment,
  serverTimestamp,
  where,
} from "firebase/firestore";
import {
  getBoardCategoryFullLabel,
  isSalesIndexedCategory,
  getManagerBoardLeafCategories,
} from "@/config/boardCategories";
import { getAuth } from "firebase/auth";

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

const isRestrictedSalesHubCategory = (categoryId?: string | null) => {
  if (!categoryId) return false;
  const normalized = categoryId.toLowerCase();
  return (
    normalized === "spec-book" ||
    normalized === "sales-new-book" ||
    normalized.startsWith("spec-book-") ||
    normalized.startsWith("sales-new-book-")
  );
};

const ManagerBoardDetailPage: React.FC = () => {
  const router = useRouter();
  const categoryId =
    typeof router.query.category === "string" ? router.query.category : "";
  const postId = typeof router.query.id === "string" ? router.query.id : "";

  const [post, setPost] = useState<BoardPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [displayIndex, setDisplayIndex] = useState<number | null>(null);
  const viewLoggedRef = useRef<Set<string>>(new Set());

  const managerLeafCategories = useMemo(
    () => getManagerBoardLeafCategories(),
    [],
  );
  const isAllowedCategory = managerLeafCategories.some(
    (item) => item.id === categoryId,
  );

  const categoryLabel = useMemo(() => {
    const targetCategoryId = post?.categoryId || categoryId;
    if (!targetCategoryId) return "-";
    return getBoardCategoryFullLabel(targetCategoryId);
  }, [categoryId, post?.categoryId]);

  const isSalesCategory = isSalesIndexedCategory(post?.categoryId || categoryId);
  const currentCategoryId = post?.categoryId || categoryId;
  const isRestrictedSalesHub = isRestrictedSalesHubCategory(currentCategoryId);
  const shareEnabled = isSalesCategory && !isRestrictedSalesHub;
  const saveEnabled =
    Boolean(post) && !isRestrictedSalesHub && (post?.attachments.length ?? 0) > 0;

  useEffect(() => {
    if (!router.isReady || !postId) return;
    if (!isAllowedCategory) return;

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
        const postCategoryId = data.categoryId ?? categoryId;

        try {
          const sameCategoryQuery = query(
            collection(db, "boardPosts"),
            where("categoryId", "==", postCategoryId),
            orderBy("createdAt", "desc"),
          );
          const sameCategorySnap = await getDocs(sameCategoryQuery);
          const descIndex = sameCategorySnap.docs.findIndex(
            (docSnap) => docSnap.id === snap.id,
          );
          setDisplayIndex(
            descIndex >= 0 ? sameCategorySnap.docs.length - descIndex : null,
          );
        } catch (indexErr) {
          console.warn("게시글 카테고리 번호 계산 오류:", indexErr);
          setDisplayIndex(data.salesIndex ?? null);
        }

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
          categoryId: postCategoryId,
        });
      } catch (err: any) {
        console.error("게시글 상세 오류:", err);
        setError("게시글을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [router.isReady, postId, categoryId, isAllowedCategory]);

  useEffect(() => {
    if (!postId || !isSalesCategory) return;
    if (viewLoggedRef.current.has(postId)) return;
    viewLoggedRef.current.add(postId);

    const logView = async () => {
      try {
        const auth = getAuth();
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (!userSnap.exists()) return;
        const userData = userSnap.data() as any;
        if (userData.role !== "manager") return;

        const activityRef = doc(
          db,
          "boardPostActivity",
          `${currentUser.uid}_${postId}`,
        );

        await setDoc(
          activityRef,
          {
            postId,
            categoryId: post?.categoryId || categoryId,
            managerUid: currentUser.uid,
            managerId: userData.managerId ?? "",
            managerName: userData.name ?? "",
            managerBranch: userData.branch ?? userData.office ?? "",
            viewCount: increment(1),
            lastViewedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (err) {
        console.error("boardPostActivity view log error:", err);
      }
    };

    logView();
  }, [postId, categoryId, isSalesCategory, post?.categoryId]);

  const handleBack = () => {
    router.push(`/manager/boards/${categoryId}`);
  };

  const handleShare = async () => {
    if (!postId || !shareEnabled || sharing) return;
    try {
      setSharing(true);
      const shareUrl = window.location.href;
      await navigator.clipboard.writeText(shareUrl);
      alert("링크를 복사했습니다.");

      const now = new Date();
      const categoryIdSafe = post?.categoryId || categoryId || "unknown";
      const categoryLabelSafe = categoryLabel || "-";

      const shareCategoryCol = collection(db, "boardShareCountByCategory");
      const sharePostCol = collection(db, "boardShareCountByPost");
      const shareManagerCol = collection(db, "boardShareCountByManager");
      const shareBranchCol = collection(db, "boardShareCountByBranch");

      const analyticsTasks: Promise<unknown>[] = [];

      analyticsTasks.push(
        setDoc(
          doc(shareCategoryCol, `category_${categoryIdSafe}`),
          {
            categoryId: categoryIdSafe,
            categoryLabel: categoryLabelSafe,
            totalCount: increment(1),
            updatedAt: now,
          },
          { merge: true },
        ),
      );

      analyticsTasks.push(
        setDoc(
          doc(sharePostCol, `post_${postId}`),
          {
            postId,
            categoryId: categoryIdSafe,
            categoryLabel: categoryLabelSafe,
            totalCount: increment(1),
            updatedAt: now,
          },
          { merge: true },
        ),
      );

      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (currentUser) {
        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (userSnap.exists()) {
          const userData = userSnap.data() as any;
          if (userData.role === "manager") {
            const managerId = userData.managerId ?? "";
            const managerName = userData.name ?? "";
            const managerBranch = userData.branch ?? userData.office ?? "";

            analyticsTasks.push(
              setDoc(
                doc(shareManagerCol, `manager_${currentUser.uid}`),
                {
                  managerUid: currentUser.uid,
                  managerId,
                  managerName,
                  branch: managerBranch,
                  totalCount: increment(1),
                  updatedAt: now,
                },
                { merge: true },
              ),
            );

            if (managerBranch) {
              analyticsTasks.push(
                setDoc(
                  doc(shareBranchCol, `branch_${managerBranch}`),
                  {
                    branch: managerBranch,
                    totalCount: increment(1),
                    updatedAt: now,
                  },
                  { merge: true },
                ),
              );
            }

            const activityRef = doc(
              db,
              "boardPostActivity",
              `${currentUser.uid}_${postId}`,
            );

            analyticsTasks.push(
              setDoc(
                activityRef,
                {
                  postId,
                  categoryId: categoryIdSafe,
                  managerUid: currentUser.uid,
                  managerId,
                  managerName,
                  managerBranch,
                  shareCount: increment(1),
                  lastSharedAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                },
                { merge: true },
              ),
            );
          }
        }
      }

      if (analyticsTasks.length > 0) {
        await Promise.all(analyticsTasks);
      }
    } catch (err) {
      console.error("boardPostActivity share log error:", err);
    } finally {
      setSharing(false);
    }
  };

  const handleSaveAttachment = () => {
    if (!post || !saveEnabled) {
      alert("저장할 첨부 파일이 없습니다.");
      return;
    }

    const file = post.attachments.find(isPdfAttachment) || post.attachments[0];
    if (!file?.url) {
      alert("저장할 첨부 파일이 없습니다.");
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = file.url;
    anchor.download = file.name || "attachment";
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
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

  if (!isAllowedCategory) {
    return (
      <PageWrapper>
        <InfoText>접근할 수 없는 게시판입니다.</InfoText>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <HeaderRow>
        <Title>게시글 상세</Title>
        <RightActions>
          <Button type="button" onClick={handleBack}>
            목록
          </Button>
          {shareEnabled && (
            <PrimaryButton type="button" onClick={handleShare}>
              {sharing ? "공유 중..." : "공유하기"}
            </PrimaryButton>
          )}
          {saveEnabled && (
            <Button type="button" onClick={handleSaveAttachment}>
              저장
            </Button>
          )}
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
              <MetaValue>{formatDate(post.publishedDate, post.createdAt)}</MetaValue>
            </MetaItem>
            {displayIndex || post.salesIndex ? (
              <MetaItem>
                <MetaLabel>번호</MetaLabel>
                <MetaValue>#{displayIndex ?? post.salesIndex}</MetaValue>
              </MetaItem>
            ) : null}
          </MetaGrid>

          <TitleRow>{post.title}</TitleRow>

          {post.attachments.some(isPdfAttachment) && (
            <Section>
              <SectionTitle>PDF 미리보기</SectionTitle>
              <PdfList>
                {post.attachments
                  .filter(isPdfAttachment)
                  .map((file, idx) => (
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
                    {isRestrictedSalesHub ? (
                      <FileName>{file.name}</FileName>
                    ) : (
                      <FileLink
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        download={file.name}
                      >
                        {file.name}
                      </FileLink>
                    )}
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

export default ManagerBoardDetailPage;

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
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

const FileName = styled.span`
  font-size: 13px;
  color: #555;
`;

