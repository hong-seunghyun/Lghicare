/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/manager/index.tsx

"use client";

import React, { useEffect, useMemo, useState } from "react";
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

interface ManagerSession {
  id: string;
  managerId: string;
  name: string;
  branch: string;
  region: string;
  office: string;
  position: string;
  teamLeaderId: string;
}

type Notice = {
  id: string;
  title: string;
  createdAt?: any;
};

type StatRow = {
  key: string;
  label: string;
  estimateCount: number;
  shareCount: number;
};

const ManagerDashboardPage: React.FC = () => {
  const router = useRouter();
  const [session, setSession] = useState<ManagerSession | null>(null);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [categoryStats, setCategoryStats] = useState<StatRow[]>([]);
  const [productStats, setProductStats] = useState<StatRow[]>([]);

  const [teamCategoryStats, setTeamCategoryStats] = useState<StatRow[]>([]);
  const [teamProductStats, setTeamProductStats] = useState<StatRow[]>([]);

  const [regionCategoryStats, setRegionCategoryStats] = useState<StatRow[]>([]);
  const [regionProductStats, setRegionProductStats] = useState<StatRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const isTeamLeader =
    session?.position && session.position.includes("팀장") &&
    !session.position.includes("사무소장");
  const isOfficeHead = session?.position?.includes("사무소장");

  const aggregateStats = (items: any[], keyField: string, labelField: string) => {
    const map = new Map<string, StatRow>();
    items.forEach((item) => {
      const key = String(item[keyField] ?? "unknown");
      const label = String(item[labelField] ?? key);
      const estimate = Number(item.estimateCount ?? 0);
      const share = Number(item.shareCount ?? 0);

      const prev = map.get(key) || {
        key,
        label,
        estimateCount: 0,
        shareCount: 0,
      };
      map.set(key, {
        key,
        label,
        estimateCount: prev.estimateCount + estimate,
        shareCount: prev.shareCount + share,
      });
    });
    return Array.from(map.values()).sort(
      (a, b) => b.estimateCount + b.shareCount - (a.estimateCount + a.shareCount),
    );
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!session) return;

      try {
        setLoading(true);
        setError(null);

        const noticesQuery = query(
          collection(db, "boardPosts"),
          where("categoryId", "==", "notice"),
          orderBy("createdAt", "desc"),
          limit(5),
        );

        const categoryQuery = query(
          collection(db, "managerCategoryStats"),
          where("managerUid", "==", session.id),
        );
        const productQuery = query(
          collection(db, "managerProductStats"),
          where("managerUid", "==", session.id),
        );

        const [noticesSnap, categorySnap, productSnap] = await Promise.all([
          getDocs(noticesQuery),
          getDocs(categoryQuery),
          getDocs(productQuery),
        ]);

        const noticeList: Notice[] = noticesSnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: data.title ?? "(제목 없음)",
            createdAt: data.createdAt,
          };
        });

        const categoryItems = categorySnap.docs.map((docSnap) => ({
          ...docSnap.data(),
        }));
        const productItems = productSnap.docs.map((docSnap) => ({
          ...docSnap.data(),
        }));

        setNotices(noticeList);
        setCategoryStats(aggregateStats(categoryItems, "type", "type"));
        setProductStats(
          aggregateStats(productItems, "modelCode", "productName"),
        );

        if (isTeamLeader || isOfficeHead) {
          const managerQuery = isOfficeHead
            ? query(
                collection(db, "users"),
                where("role", "==", "manager"),
                where("region", "==", session.region),
              )
            : query(
                collection(db, "users"),
                where("role", "==", "manager"),
                where("teamLeaderId", "==", session.managerId),
              );

          const managerSnap = await getDocs(managerQuery);
          const managerUids = managerSnap.docs
            .map((docSnap) => ({
              uid: docSnap.id,
              name: docSnap.data().name ?? "",
            }))
            .filter((m) => m.uid !== session.id)
            .map((m) => m.uid);

          const teamCategoryRows: any[] = [];
          const teamProductRows: any[] = [];

          await Promise.all(
            managerUids.map(async (uid) => {
              const [catSnap, prodSnap] = await Promise.all([
                getDocs(
                  query(
                    collection(db, "managerCategoryStats"),
                    where("managerUid", "==", uid),
                  ),
                ),
                getDocs(
                  query(
                    collection(db, "managerProductStats"),
                    where("managerUid", "==", uid),
                  ),
                ),
              ]);

              catSnap.docs.forEach((docSnap) => teamCategoryRows.push(docSnap.data()));
              prodSnap.docs.forEach((docSnap) => teamProductRows.push(docSnap.data()));
            }),
          );

          if (isOfficeHead) {
            setRegionCategoryStats(
              aggregateStats(teamCategoryRows, "type", "type"),
            );
            setRegionProductStats(
              aggregateStats(teamProductRows, "modelCode", "productName"),
            );
          } else {
            setTeamCategoryStats(
              aggregateStats(teamCategoryRows, "type", "type"),
            );
            setTeamProductStats(
              aggregateStats(teamProductRows, "modelCode", "productName"),
            );
          }
        }
      } catch (err: any) {
        console.error("매니저 대시보드 오류:", err);
        setError("대시보드 데이터를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [session, isTeamLeader, isOfficeHead]);

  const topCategoryStats = useMemo(() => categoryStats.slice(0, 8), [categoryStats]);
  const topProductStats = useMemo(() => productStats.slice(0, 8), [productStats]);

  const teamTopCategoryStats = useMemo(
    () => teamCategoryStats.slice(0, 8),
    [teamCategoryStats],
  );
  const teamTopProductStats = useMemo(
    () => teamProductStats.slice(0, 8),
    [teamProductStats],
  );

  const regionTopCategoryStats = useMemo(
    () => regionCategoryStats.slice(0, 8),
    [regionCategoryStats],
  );
  const regionTopProductStats = useMemo(
    () => regionProductStats.slice(0, 8),
    [regionProductStats],
  );

  return (
    <PageWrapper>
      <HeaderRow>
        <Title>대시보드</Title>
        {session && (
          <SubTitle>
            {session.office && <span>{session.office} · </span>}
            <strong>{session.name}</strong> 매니저님의 활동 요약입니다.
          </SubTitle>
        )}
      </HeaderRow>

      {loading && <InfoText>대시보드 데이터를 불러오는 중입니다...</InfoText>}
      {error && <ErrorText>{error}</ErrorText>}

      {!loading && !error && (
        <Grid>
          <Card>
            <CardHeader>
              <CardTitle>최근 공지사항</CardTitle>
              <CardSubTitle>최근 게시글 5건</CardSubTitle>
            </CardHeader>
            <CardBody>
              {notices.length === 0 ? (
                <EmptyText>공지사항이 없습니다.</EmptyText>
              ) : (
                <NoticeList>
                  {notices.map((n) => (
                    <NoticeItem
                      key={n.id}
                      onClick={() => router.push(`/manager/boards/notice/${n.id}`)}
                    >
                      <NoticeTitle>{n.title}</NoticeTitle>
                    </NoticeItem>
                  ))}
                </NoticeList>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>내 활동 통계 (카테고리별)</CardTitle>
              <CardSubTitle>견적/공유 합산 상위</CardSubTitle>
            </CardHeader>
            <StatsTable>
              <thead>
                <tr>
                  <th>카테고리</th>
                  <th>견적</th>
                  <th>공유</th>
                  <th>합계</th>
                </tr>
              </thead>
              <tbody>
                {topCategoryStats.length === 0 ? (
                  <tr>
                    <td colSpan={4}>통계 데이터가 없습니다.</td>
                  </tr>
                ) : (
                  topCategoryStats.map((row) => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>{row.estimateCount}</td>
                      <td>{row.shareCount}</td>
                      <td>{row.estimateCount + row.shareCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </StatsTable>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>내 활동 통계 (제품별)</CardTitle>
              <CardSubTitle>견적/공유 합산 상위</CardSubTitle>
            </CardHeader>
            <StatsTable>
              <thead>
                <tr>
                  <th>제품</th>
                  <th>견적</th>
                  <th>공유</th>
                  <th>합계</th>
                </tr>
              </thead>
              <tbody>
                {topProductStats.length === 0 ? (
                  <tr>
                    <td colSpan={4}>통계 데이터가 없습니다.</td>
                  </tr>
                ) : (
                  topProductStats.map((row) => (
                    <tr key={row.key}>
                      <td>{row.label || row.key}</td>
                      <td>{row.estimateCount}</td>
                      <td>{row.shareCount}</td>
                      <td>{row.estimateCount + row.shareCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </StatsTable>
          </Card>

          {isTeamLeader && (
            <Card>
              <CardHeader>
                <CardTitle>담당 매니저 통계 (카테고리별)</CardTitle>
                <CardSubTitle>담당팀장 기준 합산</CardSubTitle>
              </CardHeader>
              <StatsTable>
                <thead>
                  <tr>
                    <th>카테고리</th>
                    <th>견적</th>
                    <th>공유</th>
                    <th>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {teamTopCategoryStats.length === 0 ? (
                    <tr>
                      <td colSpan={4}>통계 데이터가 없습니다.</td>
                    </tr>
                  ) : (
                    teamTopCategoryStats.map((row) => (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        <td>{row.estimateCount}</td>
                        <td>{row.shareCount}</td>
                        <td>{row.estimateCount + row.shareCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </StatsTable>
            </Card>
          )}

          {isTeamLeader && (
            <Card>
              <CardHeader>
                <CardTitle>담당 매니저 통계 (제품별)</CardTitle>
                <CardSubTitle>담당팀장 기준 합산</CardSubTitle>
              </CardHeader>
              <StatsTable>
                <thead>
                  <tr>
                    <th>제품</th>
                    <th>견적</th>
                    <th>공유</th>
                    <th>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {teamTopProductStats.length === 0 ? (
                    <tr>
                      <td colSpan={4}>통계 데이터가 없습니다.</td>
                    </tr>
                  ) : (
                    teamTopProductStats.map((row) => (
                      <tr key={row.key}>
                        <td>{row.label || row.key}</td>
                        <td>{row.estimateCount}</td>
                        <td>{row.shareCount}</td>
                        <td>{row.estimateCount + row.shareCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </StatsTable>
            </Card>
          )}

          {isOfficeHead && (
            <Card>
              <CardHeader>
                <CardTitle>권역 통계 (카테고리별)</CardTitle>
                <CardSubTitle>사무소장 권한</CardSubTitle>
              </CardHeader>
              <StatsTable>
                <thead>
                  <tr>
                    <th>카테고리</th>
                    <th>견적</th>
                    <th>공유</th>
                    <th>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {regionTopCategoryStats.length === 0 ? (
                    <tr>
                      <td colSpan={4}>통계 데이터가 없습니다.</td>
                    </tr>
                  ) : (
                    regionTopCategoryStats.map((row) => (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        <td>{row.estimateCount}</td>
                        <td>{row.shareCount}</td>
                        <td>{row.estimateCount + row.shareCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </StatsTable>
            </Card>
          )}

          {isOfficeHead && (
            <Card>
              <CardHeader>
                <CardTitle>권역 통계 (제품별)</CardTitle>
                <CardSubTitle>사무소장 권한</CardSubTitle>
              </CardHeader>
              <StatsTable>
                <thead>
                  <tr>
                    <th>제품</th>
                    <th>견적</th>
                    <th>공유</th>
                    <th>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {regionTopProductStats.length === 0 ? (
                    <tr>
                      <td colSpan={4}>통계 데이터가 없습니다.</td>
                    </tr>
                  ) : (
                    regionTopProductStats.map((row) => (
                      <tr key={row.key}>
                        <td>{row.label || row.key}</td>
                        <td>{row.estimateCount}</td>
                        <td>{row.shareCount}</td>
                        <td>{row.estimateCount + row.shareCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </StatsTable>
            </Card>
          )}
        </Grid>
      )}
    </PageWrapper>
  );
};

export default ManagerDashboardPage;

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
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
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

const StatsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th,
  td {
    padding: 8px 10px;
    border-bottom: 1px solid #eee;
    text-align: left;
  }

  th {
    background: #f5f5f5;
    font-weight: 600;
  }
`;
