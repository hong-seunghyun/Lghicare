// pages/manager/boards/index.tsx
"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/router";
import styled from "styled-components";

import { SALES_HUB_ID } from "@/config/boardCategories";

const ManagerBoardsIndexPage: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/manager/boards/${SALES_HUB_ID}`);
  }, [router]);

  return (
    <PageWrapper>
      <InfoText>게시판 카테고리를 불러오는 중입니다...</InfoText>
    </PageWrapper>
  );
};

export default ManagerBoardsIndexPage;

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

const InfoText = styled.div`
  font-size: 13px;
  color: #555;
`;
