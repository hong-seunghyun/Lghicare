// pages/admin/boards/index.tsx
"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/router";
import styled from "styled-components";

import { getBoardCategoryPath, SALES_HUB_ID } from "@/config/boardCategories";

const AdminBoardsIndexPage: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace(getBoardCategoryPath(SALES_HUB_ID));
  }, [router]);

  return (
    <PageWrapper>
      <InfoText>게시판 카테고리를 불러오는 중입니다...</InfoText>
    </PageWrapper>
  );
};

export default AdminBoardsIndexPage;

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  padding: 25px;
`;

const InfoText = styled.div`
  font-size: 13px;
  color: #555;
`;
