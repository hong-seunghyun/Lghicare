/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/manager/index.tsx

"use client";

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";
import { db } from "@/lib/firebase";

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";

interface ManagerSession {
  id: string; // auth uid
  managerId: string;
  name: string;
  branch: string;
}

type Notice = {
  id: string;
  title: string;
  createdAt?: any;
};

type CategoryStat = {
  categoryName: string;
  estimateCount: number;
  shareCount: number;
};

const ManagerDashboardPage: React.FC = () => {
  const router = useRouter();
  const [session, setSession] = useState<ManagerSession | null>(null);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ 매니저 세션 읽기
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("managerSession");
    if (!stored) {
      router.replace("/manager/login");
      return;
    }
    try {
      const parsed: ManagerSession = JSON.parse(stored);
      setSession(parsed);
    } catch (e) {
      console.error("세션 파싱 오류:", e);
      router.replace("/manager/login");
    }
  }, [router]);

  // ✅ 대시보드 데이터 불러오기
  useEffect(() => {
    const fetchData = async () => {
      if (!session) return;

      try {
        setLoading(true);
        setError(null);

        // 🔹 1) 최근 공지 5개
        const noticesQuery = query(
          collection(db, "notices"),
          orderBy("createdAt", "desc"),
          limit(5)
        );

        // 🔹 2) 이 매니저가 보낸 "카테고리별 견적" 카운트
        // estimatesCount 컬렉션에서 managerUid == session.id 인 문서들
        const estimatesQuery = query(
          collection(db, "estimatesCount"),
          where("managerUid", "==", session.id)
        );

        // 🔹 3) 이 매니저가 공유한 "카테고리별 링크공유" 카운트
        // shareCount 컬렉션에서 managerUid == session.id 인 문서들
        const sharesQuery = query(
          collection(db, "shareCount"),
          where("managerUid", "==", session.id)
        );

        const [noticesSnap, estimatesSnap, sharesSnap] = await Promise.all([
          getDocs(noticesQuery),
          getDocs(estimatesQuery),
          getDocs(sharesQuery),
        ]);

        // ====== 공지 리스트 ======
        const noticeList: Notice[] = noticesSnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: data.title ?? "(제목 없음)",
            createdAt: data.createdAt,
          };
        });

        // ====== 카테고리(중분류)별 통계 ======
        // estimatesCount: manager_${uid}_${type} 형태 문서
        //   { type, managerUid, managerId, managerName, branch, managerCount, ... }
        // shareCount: manager_${uid}_${type} 형태 문서
        //   { type, managerUid, managerId, managerName, branch, managerShareCount, ... }

        const categoryMap = new Map<
          string,
          { estimateCount: number; shareCount: number }
        >();

        // 👉 견적 카운트 합산
        estimatesSnap.docs.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const type = (data.type as string) || "unknown";

          const estimateCount =
            (data.managerCount as number | undefined) ??
            (data.totalCount as number | undefined) ??
            0;

          const prev = categoryMap.get(type) || {
            estimateCount: 0,
            shareCount: 0,
          };

          categoryMap.set(type, {
            estimateCount: prev.estimateCount + estimateCount,
            shareCount: prev.shareCount,
          });
        });

        // 👉 공유 카운트 합산
        sharesSnap.docs.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const type = (data.type as string) || "unknown";

          const shareCount =
            (data.managerShareCount as number | undefined) ??
            (data.shareCount as number | undefined) ??
            0;

          const prev = categoryMap.get(type) || {
            estimateCount: 0,
            shareCount: 0,
          };

          categoryMap.set(type, {
            estimateCount: prev.estimateCount,
            shareCount: prev.shareCount + shareCount,
          });
        });

        // Map → 배열로 변환 + 상위 5개만 정렬
        const categories: CategoryStat[] = Array.from(
          categoryMap.entries()
        ).map(([type, counts]) => ({
          categoryName: type,
          estimateCount: counts.estimateCount,
          shareCount: counts.shareCount,
        }));

        const topCategories = categories
          .map((c) => ({
            ...c,
            total: (c.estimateCount ?? 0) + (c.shareCount ?? 0),
          }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5)
          .map(({ total, ...rest }) => rest);

        setNotices(noticeList);
        setCategoryStats(topCategories);
      } catch (err: any) {
        console.error("매니저 대시보드 데이터 오류:", err);
        setError("대시보드 데이터를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [session]);

  // ✅ 차트용 데이터 (+ total 필드)
  const chartData = categoryStats.map((item) => {
    const total = item.estimateCount + item.shareCount;
    return {
      name: item.categoryName,
      estimateCount: item.estimateCount,
      shareCount: item.shareCount,
      total,
    };
  });

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fill: "#555",
    fontWeight: 500,
  };

  return (
    <PageWrapper>
      <HeaderRow>
        <Title>대시보드</Title>
        {session && (
          <SubTitle>
            {session.branch && <span>{session.branch} · </span>}
            <strong>{session.name}</strong> 매니저님의 활동 요약이에요.
          </SubTitle>
        )}
      </HeaderRow>

      {loading && <InfoText>대시보드 데이터를 불러오는 중입니다...</InfoText>}
      {error && <ErrorText>{error}</ErrorText>}

      {!loading && !error && (
        <Grid>
          {/* 최근 공지사항 */}
          <Card>
            <CardHeader>
              <CardTitle>최근 공지사항</CardTitle>
              <CardSubTitle>최신 공지 5개</CardSubTitle>
            </CardHeader>
            <CardBody>
              {notices.length === 0 ? (
                <EmptyText>공지사항이 없습니다.</EmptyText>
              ) : (
                <NoticeList>
                  {notices.map((n) => (
                    <NoticeItem
                      key={n.id}
                      onClick={() => router.push(`/manager/notices/${n.id}`)}
                    >
                      <NoticeTitle>{n.title}</NoticeTitle>
                    </NoticeItem>
                  ))}
                </NoticeList>
              )}
            </CardBody>
          </Card>

          {/* 내가 많이 내보낸 카테고리 */}
          <Card>
            <CardHeader>
              <CardTitle>내가 많이 내보낸 카테고리</CardTitle>
              <CardSubTitle>견적내기 · 링크공유 상위 5개</CardSubTitle>
            </CardHeader>
            <ChartWrapper>
              {chartData.length === 0 ? (
                <EmptyText>아직 통계 데이터가 없습니다.</EmptyText>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    barSize={30}
                    margin={{ top: 16, right: 16, left: 0, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      interval={0}
                      angle={0}
                      textAnchor="middle"
                      height={40}
                      tick={{ fontSize: 11, fill: "#666" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#666" }}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #eee",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      wrapperStyle={{
                        fontSize: 11,
                      }}
                    />
                    {/* 아래 막대: 견적 */}
                    <Bar
                      dataKey="estimateCount"
                      name="견적내기"
                      stackId="a"
                      fill="#2854b9ff"
                    />
                    {/* 위 막대: 공유 + 상단 라운드 + 합계 라벨 */}
                    <Bar
                      dataKey="shareCount"
                      name="링크공유"
                      stackId="a"
                      radius={[4, 4, 0, 0]}
                      fill="#f0b381ff"
                    >
                      <LabelList
                        dataKey="total"
                        position="top"
                        style={labelStyle}
                        formatter={(value: any) =>
                          value == null ? "" : String(value)
                        }
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartWrapper>
          </Card>
        </Grid>
      )}
    </PageWrapper>
  );
};

export default ManagerDashboardPage;

// =============== styled-components ===============

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  padding: 8px 0 40px;
`;

const HeaderRow = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
  color: #222;
  margin-bottom: 4px;
`;

const SubTitle = styled.p`
  font-size: 13px;
  color: #888;

  span {
    margin-right: 2px;
  }

  strong {
    font-weight: 600;
    color: #333;
  }
`;

const InfoText = styled.div`
  font-size: 14px;
  color: #555;
  padding: 12px 0;
`;

const ErrorText = styled.div`
  font-size: 14px;
  color: #e74c3c;
  padding: 12px 0;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.1fr);
  gap: 20px;

  @media (max-width: 960px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Card = styled.div`
  background: #ffffff;
  border-radius: 16px;
  padding: 16px 18px 14px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(226, 232, 240, 0.8);
  display: flex;
  flex-direction: column;
  min-height: 260px;
`;

const CardHeader = styled.div`
  margin-bottom: 10px;
`;

const CardTitle = styled.h2`
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 2px;
  color: #1f2933;
`;

const CardSubTitle = styled.p`
  font-size: 12px;
  color: #9aa5b1;
`;

const CardBody = styled.div`
  flex: 1;
`;

const NoticeList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const NoticeItem = styled.li`
  padding: 6px 0;
  border-bottom: 1px solid #f2f2f2;
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }
`;

const NoticeTitle = styled.div`
  font-size: 13px;
  color: #333;
`;

const EmptyText = styled.div`
  font-size: 13px;
  color: #999;
  padding: 16px 0;
`;

const ChartWrapper = styled.div`
  flex: 1;
  min-height: 250px;
`;
