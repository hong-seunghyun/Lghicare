/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/manager/boards/[category]/index.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";

import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import {
  getBoardCategoryById,
  getBoardCategoryChildren,
  getBoardCategoryFullLabel,
  isSalesIndexedCategory,
  isSalesHubCategory,
} from "@/config/boardCategories";

type Attachment = {
  name: string;
  url: string;
};

type LinkMeta = {
  label: string;
  url: string;
};

type BoardPostListItem = {
  id: string;
  title: string;
  author: string;
  publishedDate?: string;
  createdAt?: Timestamp | null;
  attachments: Attachment[];
  links: LinkMeta[];
  thumbnailUrl?: string;
  salesIndex?: number;
};

const ManagerBoardListPage: React.FC = () => {
  const router = useRouter();
  const categoryId =
    typeof router.query.category === "string" ? router.query.category : "";

  const category = getBoardCategoryById(categoryId);
  const children = category ? getBoardCategoryChildren(category.id) : [];
  const isParentCategory = children.length > 0;
  const isAllowedCategory =
    Boolean(category) &&
    (isSalesHubCategory(categoryId) || categoryId === "inquiry");
  const isSalesCategory = isSalesIndexedCategory(categoryId);
  const canCreateInquiry = categoryId === "inquiry";

  const [posts, setPosts] = useState<BoardPostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!router.isReady) return;
    if (!category || !isAllowedCategory || isParentCategory) return;

    const fetchPosts = async () => {
      try {
        setLoading(true);
        setError(null);

        const postsCol = collection(db, "boardPosts");
        const q = query(
          postsCol,
          where("categoryId", "==", category.id),
          orderBy("createdAt", "desc"),
        );
        const snap = await getDocs(q);

        const list: BoardPostListItem[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            title: data.title ?? "(제목 없음)",
            author: data.author ?? "-",
            publishedDate: data.publishedDate,
            createdAt: data.createdAt ?? null,
            attachments: data.attachments ?? [],
            links: data.links ?? [],
            thumbnailUrl: data.thumbnailUrl,
            salesIndex: data.salesIndex,
          };
        });

        setPosts(list);
      } catch (err: any) {
        console.error("게시글 목록 불러오기 오류:", err);
        setError("게시글 목록을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [router.isReady, category, isAllowedCategory, isParentCategory]);

  const handleRowClick = (id: string) => {
    if (!category) return;
    router.push(`/manager/boards/${category.id}/${id}`);
  };

  const handleCreate = () => {
    if (!category) return;
    router.push(`/manager/boards/${category.id}/new`);
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

  const filteredPosts = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return posts;
    return posts.filter((post) => {
      const title = post.title?.toLowerCase() ?? "";
      const author = post.author?.toLowerCase() ?? "";
      return title.includes(keyword) || author.includes(keyword);
    });
  }, [posts, searchTerm]);
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedPosts = useMemo(
    () =>
      filteredPosts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredPosts, currentPage],
  );

  useEffect(() => {
    setPage(1);
  }, [searchTerm, categoryId]);

  const pageTitle = category
    ? getBoardCategoryFullLabel(category.id)
    : "게시판";

  if (!category || !isAllowedCategory) {
    return (
      <PageWrapper>
        <InfoText>접근할 수 없는 게시판입니다.</InfoText>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <HeaderRow>
        <Title>{pageTitle}</Title>
        {!isParentCategory && (
          <RightActions>
            <SearchInput
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="제목 또는 작성자 검색"
            />
            {canCreateInquiry && (
              <PrimaryButton type="button" onClick={handleCreate}>
                문의 작성
              </PrimaryButton>
            )}
          </RightActions>
        )}
      </HeaderRow>

      {isParentCategory && (
        <SubCategoryCard>
          <InfoText>하위 게시판을 선택하세요.</InfoText>
          <SubCategoryGrid>
            {children.map((child) => (
              <SubCategoryButton
                key={child.id}
                type="button"
                onClick={() => router.push(`/manager/boards/${child.id}`)}
              >
                <SubCategoryLabel>{child.label}</SubCategoryLabel>
                <SubCategoryMeta>
                  {getBoardCategoryFullLabel(child.id)}
                </SubCategoryMeta>
              </SubCategoryButton>
            ))}
          </SubCategoryGrid>
        </SubCategoryCard>
      )}

      {!isParentCategory && loading && (
        <InfoText>게시글을 불러오는 중입니다...</InfoText>
      )}
      {!isParentCategory && error && <ErrorText>{error}</ErrorText>}

      {!isParentCategory && !loading && !error && filteredPosts.length === 0 && (
        <InfoText>등록된 게시글이 없습니다.</InfoText>
      )}

      {!isParentCategory && !loading && !error && filteredPosts.length > 0 && (
        <>
          <GalleryGrid>
            {pagedPosts.map((post) => (
            <GalleryCard
              key={post.id}
              onClick={() => handleRowClick(post.id)}
            >
              <GalleryThumb>
                {post.thumbnailUrl ? (
                  <GalleryImage src={post.thumbnailUrl} alt="thumbnail" />
                ) : (
                  <ThumbPlaceholder>
                    <ThumbLogo src={"/images/logo.png"} alt="logo" />
                    <ThumbText>이미지 준비중</ThumbText>
                  </ThumbPlaceholder>
                )}
              </GalleryThumb>
              <GalleryBody>
                <GalleryTitle>{post.title}</GalleryTitle>
                <GalleryMetaRow>
                  <MetaText>{post.author || "-"}</MetaText>
                </GalleryMetaRow>
                <GallerySubRow>
                  <MetaText>
                    {formatDate(post.publishedDate, post.createdAt)}
                  </MetaText>
                  <MetaText>
                    {post.attachments && post.attachments.length > 0
                      ? `파일 ${post.attachments.length}개`
                      : "파일 -"}
                  </MetaText>
                  <MetaText>
                    {post.links && post.links.length > 0
                      ? `링크 ${post.links.length}개`
                      : "링크 -"}
                  </MetaText>
                </GallerySubRow>
              </GalleryBody>
            </GalleryCard>
            ))}
          </GalleryGrid>
          {totalPages > 1 && (
            <Pagination>
              <PageButton
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                이전
              </PageButton>
              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(
                (p) => (
                  <PageNumber
                    key={`page-${p}`}
                    type="button"
                    onClick={() => setPage(p)}
                    $active={p === currentPage}
                  >
                    {p}
                  </PageNumber>
                ),
              )}
              <PageButton
                type="button"
                onClick={() =>
                  setPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={currentPage === totalPages}
              >
                다음
              </PageButton>
            </Pagination>
          )}
        </>
      )}
    </PageWrapper>
  );
};

export default ManagerBoardListPage;

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
  flex-wrap: wrap;
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
`;

const RightActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const SearchInput = styled.input`
  width: 220px;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 13px;
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

const SubCategoryCard = styled.div`
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SubCategoryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
`;

const SubCategoryButton = styled.button`
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #e5e5e5;
  background: #fafafa;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: #f0f0f0;
  }
`;

const SubCategoryLabel = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #222;
`;

const SubCategoryMeta = styled.div`
  font-size: 11px;
  color: #777;
  margin-top: 4px;
`;

const GalleryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 1200px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
`;

const GalleryCard = styled.button`
  border: none;
  background: #fff;
  border-radius: 14px;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.08);
  }
`;

const GalleryThumb = styled.div`
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #f7f7f7;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const GalleryImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const GalleryBody = styled.div`
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const GalleryTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: #222;
  line-height: 1.3;
  max-height: 2.6em;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const GalleryMetaRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const GallerySubRow = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
`;

const MetaText = styled.span`
  font-size: 11px;
  color: #666;
`;

const ThumbPlaceholder = styled.div`
  width: 100%;
  height: 100%;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
`;

const ThumbLogo = styled.img`
  width: 36px;
  height: 36px;
  object-fit: contain;
  opacity: 0.9;
`;

const ThumbText = styled.div`
  font-size: 11px;
  color: #8a8a8a;
  line-height: 1;
  text-align: center;
`;

const Pagination = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  margin-top: 18px;
  flex-wrap: wrap;
`;

const PageButton = styled.button`
  border: 1px solid #ddd;
  background: #fff;
  color: #333;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const PageNumber = styled(PageButton)<{ $active: boolean }>`
  border-color: ${(p) => (p.$active ? "#333" : "#ddd")};
  background: ${(p) => (p.$active ? "#333" : "#fff")};
  color: ${(p) => (p.$active ? "#fff" : "#333")};
`;
