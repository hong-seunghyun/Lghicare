/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/manager/notices/index.tsx

"use client";

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";

import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";

type Attachment = {
  name: string;
  url: string;
};

type NoticeListItem = {
  id: string;
  title: string;
  publishedDate?: string;
  createdAt?: Timestamp | null;
  attachments: Attachment[];
};

const ManagerNoticeListPage: React.FC = () => {
  const router = useRouter();

  const [notices, setNotices] = useState<NoticeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNotices = async () => {
      try {
        setLoading(true);
        setError(null);

        const noticesCol = collection(db, "notices");
        // 🔥 최신순 정렬 (createdAt 기준)
        const q = query(noticesCol, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const list: NoticeListItem[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            title: data.title ?? "(제목 없음)",
            publishedDate: data.publishedDate,
            createdAt: data.createdAt ?? null,
            attachments: data.attachments ?? [],
          };
        });

        setNotices(list);
      } catch (err: any) {
        console.error("매니저용 공지 목록 불러오기 오류:", err);
        setError("공지사항 목록을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchNotices();
  }, []);

  const handleRowClick = (id: string) => {
    router.push(`/manager/notices/${id}`);
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
        <Title>공지사항</Title>
      </HeaderRow>

      {loading && <InfoText>공지사항을 불러오는 중입니다...</InfoText>}
      {error && <ErrorText>{error}</ErrorText>}

      {!loading && !error && notices.length === 0 && (
        <InfoText>등록된 공지사항이 없습니다.</InfoText>
      )}

      {!loading && !error && notices.length > 0 && (
        <ListCard>
          <ListHeader>
            <ColTitle>제목</ColTitle>
            <ColDate>게시일</ColDate>
            <ColAttach>첨부</ColAttach>
          </ListHeader>

          <ListBody>
            {notices.map((notice) => (
              <Row key={notice.id} onClick={() => handleRowClick(notice.id)}>
                <CellTitle>{notice.title}</CellTitle>
                <CellDate>
                  {formatDate(notice.publishedDate, notice.createdAt)}
                </CellDate>
                <CellAttach>
                  {notice.attachments && notice.attachments.length > 0
                    ? `${notice.attachments.length}개`
                    : "-"}
                </CellAttach>
              </Row>
            ))}
          </ListBody>
        </ListCard>
      )}
    </PageWrapper>
  );
};

export default ManagerNoticeListPage;

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

const InfoText = styled.div`
  font-size: 13px;
  color: #555;
`;

const ErrorText = styled.div`
  margin-top: 4px;
  font-size: 12px;
  color: #e74c3c;
`;

const ListCard = styled.div`
  background: #fff;
  border-radius: 12px;
  padding: 12px 16px 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
`;

const ListHeader = styled.div`
  display: grid;
  grid-template-columns: 1fr 120px 80px;
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

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 120px 80px;
  padding: 8px 0;
  font-size: 13px;
  cursor: pointer;

  &:not(:last-child) {
    border-bottom: 1px solid #f3f3f3;
  }

  &:hover {
    background: #fafafa;
  }
`;

const ColTitle = styled.div`
  padding-left: 4px;
`;
const ColDate = styled.div`
  text-align: center;
`;
const ColAttach = styled.div`
  text-align: center;
`;

const CellTitle = styled.div`
  padding-left: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CellDate = styled.div`
  text-align: center;
`;

const CellAttach = styled.div`
  text-align: center;
`;
