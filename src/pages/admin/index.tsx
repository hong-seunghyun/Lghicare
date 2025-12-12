/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/admin/index.tsx

"use client";

import React, { useEffect, useState } from "react";
import styled from "styled-components";
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

// ✅ 중분류(estimateType) 통계
type EstimateTypeStat = {
  type: string; // 예: "정수기", "TV", "세탁기"
  estimateCount: number; // estimatesCount의 type_* 기반 합산
  shareCount: number; // shareCount를 type 기준으로 집계한 값
};

// ✅ 매니저별 통계
type TopManager = {
  id: string; // managerUid 또는 managerId
  name: string; // 매니저 이름
  branchName: string; // 소속 지점명
  estimateCount: number; // 견적 횟수
  shareCount: number; // 링크 공유 횟수
};

// ✅ 지점별 통계
type TopBranch = {
  id: string; // branch key
  name: string; // 지점명
  estimateCount: number; // 견적 합산
  shareCount: number; // 공유 합산
};

// ✅ /api/admin/dashboard 응답 타입
type DashboardResponse = {
  estimateTypes: EstimateTypeStat[]; // 중분류 기준 TOP 리스트
  topManagers: TopManager[]; // 매니저별
  topBranches: TopBranch[]; // 지점별
};

const AdminDashboardPage: React.FC = () => {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 🔥 대시보드 데이터 단일 호출 (API 한 번)
  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) {
          throw new Error("대시보드 데이터를 불러오지 못했습니다.");
        }

        const json: DashboardResponse = await res.json();
        setData(json);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  // 로딩 상태
  if (loading) {
    return (
      <PageWrapper>
        <PageHeader>
          <PageTitle>대시보드</PageTitle>
          <PageSubTitle>견적 · 공유 현황을 한눈에 확인해요.</PageSubTitle>
        </PageHeader>
        <LoadingBox>대시보드 데이터를 불러오는 중입니다...</LoadingBox>
      </PageWrapper>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <PageWrapper>
        <PageHeader>
          <PageTitle>대시보드</PageTitle>
          <PageSubTitle>데이터 로딩 중 문제가 발생했습니다.</PageSubTitle>
        </PageHeader>
        <ErrorBox>{error}</ErrorBox>
      </PageWrapper>
    );
  }

  // 데이터 없음
  if (!data) {
    return (
      <PageWrapper>
        <PageHeader>
          <PageTitle>대시보드</PageTitle>
          <PageSubTitle>아직 집계된 데이터가 없습니다.</PageSubTitle>
        </PageHeader>
        <EmptyBox>표시할 데이터가 없습니다.</EmptyBox>
      </PageWrapper>
    );
  }

  // ✅ recharts용 데이터 변환 (+ total 필드 추가해서 라벨 표시)
  // 1) 중분류(estimateType)별
  const estimateTypesData = data.estimateTypes.map((item) => {
    const total = item.estimateCount + item.shareCount;
    return {
      name: item.type,
      estimateCount: item.estimateCount,
      shareCount: item.shareCount,
      total,
    };
  });

  // 2) 매니저별
  const topManagersData = data.topManagers.map((item) => {
    const total = item.estimateCount + item.shareCount;
    return {
      name: `${item.name} (${item.branchName})`,
      estimateCount: item.estimateCount,
      shareCount: item.shareCount,
      total,
    };
  });

  // 3) 지점별
  const topBranchesData = data.topBranches.map((item) => {
    const total = item.estimateCount + item.shareCount;
    return {
      name: item.name,
      estimateCount: item.estimateCount,
      shareCount: item.shareCount,
      total,
    };
  });

  // 공통 라벨 스타일
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fill: "#555",
    fontWeight: 500,
  };

  return (
    <PageWrapper>
      <PageHeader>
        <PageTitle>대시보드</PageTitle>
        <PageSubTitle>
          카테고리 / 매니저 / 지점별로 견적과 공유 현황을 확인할 수 있어요.
        </PageSubTitle>
      </PageHeader>

      <Grid>
        {/* 🔹 1. 중분류(카테고리) 기준 TOP */}
        <Card>
          <CardHeader>
            <CardTitle>카테고리(중분류) TOP 10</CardTitle>
            <CardSubTitle>견적내기 · 링크공유 횟수 기준</CardSubTitle>
          </CardHeader>
          <ChartWrapper>
            {estimateTypesData.length === 0 ? (
              <CardEmptyText>데이터가 없습니다.</CardEmptyText>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={estimateTypesData}
                  barSize={30} // ✅ 막대 최대 넓이
                  margin={{ top: 16, right: 16, left: 0, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    angle={0} // ✅ 기울기 없음
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
                  {/* 아래 막대: 견적 (상단 라운드) */}
                  <Bar
                    dataKey="estimateCount"
                    name="견적내기"
                    stackId="a"
                    fill="#2854b9ff"
                  />
                  {/* 위 막대: 공유 (상단 라운드) + 합계 라벨 */}
                  <Bar
                    dataKey="shareCount"
                    name="링크공유"
                    stackId="a"
                    radius={[4, 4, 0, 0]} // ✅ 상단만 라운드
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

        {/* 🔹 2. 상위 매니저 TOP 20 */}
        <Card>
          <CardHeader>
            <CardTitle>상위 매니저 TOP 20</CardTitle>
            <CardSubTitle>견적내기 · 링크공유 횟수 기준</CardSubTitle>
          </CardHeader>
          <ChartWrapper>
            {topManagersData.length === 0 ? (
              <CardEmptyText>데이터가 없습니다.</CardEmptyText>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topManagersData}
                  barSize={30} // ✅ 막대 최대 넓이
                  margin={{ top: 16, right: 16, left: 0, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    angle={0}
                    textAnchor="middle"
                    height={40}
                    tick={{ fontSize: 10, fill: "#666" }}
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
                  <Bar
                    dataKey="estimateCount"
                    name="견적내기"
                    stackId="a"
                    fill="#2854b9ff"
                  />
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

        {/* 🔹 3. 상위 지점 TOP 10 (세로 막대) */}
        <Card>
          <CardHeader>
            <CardTitle>상위 지점 TOP 10</CardTitle>
            <CardSubTitle>지점별 견적내기 · 링크공유 합산 기준</CardSubTitle>
          </CardHeader>
          <ChartWrapper>
            {topBranchesData.length === 0 ? (
              <CardEmptyText>데이터가 없습니다.</CardEmptyText>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topBranchesData}
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
                  <Bar
                    dataKey="estimateCount"
                    name="견적내기"
                    stackId="a"
                    fill="#2854b9ff"
                  />
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
    </PageWrapper>
  );
};

export default AdminDashboardPage;

// ================== styled-components ==================

const PageWrapper = styled.div`
  padding: 8px 0 40px;
`;

const PageHeader = styled.div`
  margin-bottom: 24px;
`;

const PageTitle = styled.h1`
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
  color: #222;
`;

const PageSubTitle = styled.p`
  font-size: 13px;
  color: #888;
`;

const LoadingBox = styled.div`
  padding: 40px 0;
  font-size: 15px;
  color: #555;
`;

const ErrorBox = styled.div`
  padding: 40px 0;
  font-size: 14px;
  color: #e74c3c;
`;

const EmptyBox = styled.div`
  padding: 40px 0;
  font-size: 14px;
  color: #888;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
  gap: 20px;
`;

const Card = styled.div`
  background: #ffffff;
  border-radius: 16px;
  padding: 16px 18px 14px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(226, 232, 240, 0.8);
  display: flex;
  flex-direction: column;
  min-height: 320px;
`;

const CardHeader = styled.div`
  margin-bottom: 12px;
`;

const CardTitle = styled.h2`
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
  color: #1f2933;
`;

const CardSubTitle = styled.p`
  font-size: 12px;
  color: #9aa5b1;
`;

const ChartWrapper = styled.div`
  flex: 1;
  min-height: 250px; /* ✅ 요청한 높이 */
`;

const CardEmptyText = styled.div`
  font-size: 13px;
  color: #999;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;
