/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/admin/boards/[category]/index.tsx
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
  getBoardCategoryPath,
  isSalesIndexedCategory,
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

const AdminBoardListPage: React.FC = () => {
  const router = useRouter();
  const categoryId =
    typeof router.query.category === "string" ? router.query.category : "";

  const category = getBoardCategoryById(categoryId);
  const children = category ? getBoardCategoryChildren(category.id) : [];
  const isParentCategory = children.length > 0;
  const isSalesCategory = isSalesIndexedCategory(categoryId);

  const [posts, setPosts] = useState<BoardPostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!router.isReady) return;
    if (!category || isParentCategory) return;

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
  }, [router.isReady, category, isParentCategory]);

  const handleCreate = () => {
    if (!category) return;
    router.push(`/admin/boards/${category.id}/new`);
  };

  const handleRowClick = (id: string) => {
    if (!category) return;
    router.push(`/admin/boards/${category.id}/${id}`);
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

  const pageTitle = category
    ? getBoardCategoryFullLabel(category.id)
    : "게시판";

  if (!category) {
    return (
      <PageWrapper>
        <InfoText>존재하지 않는 게시판입니다.</InfoText>
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
            <PrimaryButton type="button" onClick={handleCreate}>
              게시글 작성
            </PrimaryButton>
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
                onClick={() => router.push(getBoardCategoryPath(child.id))}
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
        <ListCard>
          <ListHeader $showIndex={isSalesCategory}>
            <ColThumb>썸네일</ColThumb>
            {isSalesCategory && <ColIndex>번호</ColIndex>}
            <ColTitle>제목</ColTitle>
            <ColAuthor>작성자</ColAuthor>
            <ColDate>게시일</ColDate>
            <ColAttach>파일</ColAttach>
            <ColLink>링크</ColLink>
          </ListHeader>

          <ListBody>
            {filteredPosts.map((post) => (
              <Row
                key={post.id}
                onClick={() => handleRowClick(post.id)}
                $showIndex={isSalesCategory}
              >
                <CellThumb>
                  {post.thumbnailUrl ? (
                    <ThumbImage src={post.thumbnailUrl} alt="thumbnail" />
                  ) : (
                    <ThumbPlaceholder>
                      <ThumbLogo src={"/images/logo.png"} alt="logo" />
                      <ThumbText>이미지 준비중</ThumbText>
                    </ThumbPlaceholder>
                  )}
                </CellThumb>
                {isSalesCategory && (
                  <CellIndex>
                    {post.salesIndex ? `#${post.salesIndex}` : "-"}
                  </CellIndex>
                )}
                <CellTitle>{post.title}</CellTitle>
                <CellAuthor>{post.author || "-"}</CellAuthor>
                <CellDate>
                  {formatDate(post.publishedDate, post.createdAt)}
                </CellDate>
                <CellAttach>
                  {post.attachments && post.attachments.length > 0
                    ? `${post.attachments.length}개`
                    : "-"}
                </CellAttach>
                <CellLink>
                  {post.links && post.links.length > 0
                    ? `${post.links.length}개`
                    : "-"}
                </CellLink>
              </Row>
            ))}
          </ListBody>
        </ListCard>
      )}
    </PageWrapper>
  );
};

export default AdminBoardListPage;

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

const ListCard = styled.div`
  background: #fff;
  border-radius: 12px;
  padding: 12px 16px 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
`;

const ListHeader = styled.div<{ $showIndex: boolean }>`
  display: grid;
  grid-template-columns: ${(p) =>
    p.$showIndex
      ? "80px 70px 1fr 120px 120px 80px 80px"
      : "80px 1fr 120px 120px 80px 80px"};
  padding: 6px 0;
  border-bottom: 1px solid #eee;
  font-size: 12px;
  font-weight: 600;
  color: #666;
`;

const ListBody = styled.div`
  display: flex;
  flex-direction: column;
`;

const Row = styled.div<{ $showIndex: boolean }>`
  display: grid;
  grid-template-columns: ${(p) =>
    p.$showIndex
      ? "80px 70px 1fr 120px 120px 80px 80px"
      : "80px 1fr 120px 120px 80px 80px"};
  padding: 8px 0;
  font-size: 13px;
  cursor: pointer;
  align-items: center;

  &:not(:last-child) {
    border-bottom: 1px solid #f3f3f3;
  }

  &:hover {
    background: #fafafa;
  }
`;

const ColThumb = styled.div`
  padding-left: 4px;
`;

const ColIndex = styled.div`
  text-align: center;
`;

const ColTitle = styled.div`
  padding-left: 4px;
`;

const ColAuthor = styled.div`
  text-align: center;
`;

const ColDate = styled.div`
  text-align: center;
`;

const ColAttach = styled.div`
  text-align: center;
`;

const ColLink = styled.div`
  text-align: center;
`;

const CellThumb = styled.div`
  display: flex;
  justify-content: center;
`;

const CellIndex = styled.div`
  text-align: center;
  font-weight: 600;
`;

const CellTitle = styled.div`
  padding-left: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CellAuthor = styled.div`
  text-align: center;
`;

const CellDate = styled.div`
  text-align: center;
`;

const CellAttach = styled.div`
  text-align: center;
`;

const CellLink = styled.div`
  text-align: center;
`;

const ThumbImage = styled.img`
  width: 56px;
  height: 40px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #e5e5e5;
  background: #f7f7f7;
`;

const ThumbPlaceholder = styled.div`
  width: 56px;
  height: 40px;
  border-radius: 6px;
  border: 1px solid #e5e5e5;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
`;

const ThumbLogo = styled.img`
  width: 18px;
  height: 18px;
  object-fit: contain;
  opacity: 0.9;
`;

const ThumbText = styled.div`
  font-size: 8px;
  color: #8a8a8a;
  line-height: 1;
  text-align: center;
`;
/* eslint-disable @typescript-eslint/no-explicit-any */
