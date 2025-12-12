/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/manager/notices/[id].tsx

"use client";

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

type Attachment = {
  name: string;
  url: string;
};

type NoticeDetail = {
  id: string;
  title: string;
  content: string;
  publishedDate?: string;
  attachments: Attachment[];
};

const ManagerNoticeDetailPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;

  const [notice, setNotice] = useState<NoticeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || typeof id !== "string") return;

    const fetchNotice = async () => {
      try {
        setLoading(true);
        setError(null);

        const ref = doc(db, "notices", id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("해당 공지사항을 찾을 수 없습니다.");
          setNotice(null);
          return;
        }

        const data = snap.data() as any;
        setNotice({
          id: snap.id,
          title: data.title ?? "(제목 없음)",
          content: data.content ?? "",
          publishedDate: data.publishedDate,
          attachments: data.attachments ?? [],
        });
      } catch (err: any) {
        console.error("매니저용 공지 상세 오류:", err);
        setError("공지사항을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchNotice();
  }, [id]);

  const handleBack = () => {
    router.push("/manager/notices");
  };

  const handleDownloadAttachment = (
    e: React.MouseEvent<HTMLAnchorElement>,
    file: Attachment
  ) => {
    e.preventDefault();

    try {
      const link = document.createElement("a");
      const hasQuery = file.url.includes("?");
      const downloadUrl = hasQuery
        ? `${file.url}&alt=media`
        : `${file.url}?alt=media`;

      link.href = downloadUrl;
      link.download = file.name || "attachment";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("첨부파일 다운로드 오류:", err);
    }
  };

  return (
    <PageWrapper>
      <HeaderRow>
        <Title>공지사항 상세</Title>
        <RightActions>
          <Button type="button" onClick={handleBack}>
            목록으로
          </Button>
        </RightActions>
      </HeaderRow>

      {loading && <InfoText>공지사항을 불러오는 중입니다...</InfoText>}
      {error && <ErrorText>{error}</ErrorText>}

      {notice && !loading && !error && (
        <DetailCard>
          <DetailHeader>
            <DetailTitle>{notice.title}</DetailTitle>
            <DetailMeta>
              <span>게시일: {notice.publishedDate ?? "-"}</span>
            </DetailMeta>
          </DetailHeader>

          {notice.attachments && notice.attachments.length > 0 && (
            <AttachBox>
              <AttachTitle>첨부파일</AttachTitle>
              <AttachList>
                {notice.attachments.map((file, idx) => (
                  <li key={`${file.url}_${idx}`}>
                    <a
                      href={file.url}
                      onClick={(e) => handleDownloadAttachment(e, file)}
                    >
                      {file.name}
                    </a>
                  </li>
                ))}
              </AttachList>
            </AttachBox>
          )}

          <ContentBox dangerouslySetInnerHTML={{ __html: notice.content }} />
        </DetailCard>
      )}
    </PageWrapper>
  );
};

export default ManagerNoticeDetailPage;

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

  &:hover {
    background: #f7f7f7;
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

const DetailCard = styled.div`
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
`;

const DetailHeader = styled.div`
  margin-bottom: 16px;
`;

const DetailTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
`;

const DetailMeta = styled.div`
  font-size: 12px;
  color: #777;
`;

const AttachBox = styled.div`
  margin-bottom: 16px;
`;

const AttachTitle = styled.div`
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
`;

const AttachList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;

  li + li {
    margin-top: 4px;
  }

  a {
    font-size: 13px;
    color: #0070f3;
    text-decoration: underline;
    cursor: pointer;
  }
`;

const ContentBox = styled.div`
  font-size: 14px;
  line-height: 1.6;

  img {
    max-width: 100%;
    height: auto;
  }
`;
