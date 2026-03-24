/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/manager/index.tsx

"use client";

import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";
import { db } from "@/lib/firebase";
import { SALES_HUB_ID } from "@/config/boardCategories";

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import type {
  ManagerDashboardResponse,
  ManagerSummary,
} from "@/pages/api/manager/dashboard";

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
  categoryId?: string;
};

type StatRow = {
  key: string;
  label: string;
  estimateCount: number;
  shareCount: number;
};

type ManagerScopeRole = "teamLeader" | "officeHead" | "regionLeader" | null;

const formatPostDate = (value: any) => {
  if (!value) return "-";
  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleDateString("ko-KR");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("ko-KR");
};

const ManagerDashboardPage: React.FC = () => {
  const router = useRouter();
  const [session, setSession] = useState<ManagerSession | null>(null);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [salesHubPosts, setSalesHubPosts] = useState<Notice[]>([]);
  const [categoryStats, setCategoryStats] = useState<StatRow[]>([]);
  const [productStats, setProductStats] = useState<StatRow[]>([]);

  const [teamCategoryStats, setTeamCategoryStats] = useState<StatRow[]>([]);
  const [teamProductStats, setTeamProductStats] = useState<StatRow[]>([]);

  const [regionCategoryStats, setRegionCategoryStats] = useState<StatRow[]>([]);
  const [regionProductStats, setRegionProductStats] = useState<StatRow[]>([]);

  const [dashboardStats, setDashboardStats] =
    useState<ManagerDashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null);

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
    session?.position &&
    session.position.includes("팀장") &&
    !session.position.includes("사무소장");
  const isOfficeHead = session?.position?.includes("사무소장");

  const managerRole = useMemo<ManagerScopeRole>(() => {
    const position = session?.position ?? "";
    if (position.includes("리더사무소장")) return "regionLeader";
    if (position.includes("사무소장")) return "officeHead";
    if (position.includes("팀장")) return "teamLeader";
    return null;
  }, [session?.position]);

  const aggregateStats = (
    items: any[],
    keyField: string,
    labelField: string,
  ) => {
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
      (a, b) =>
        b.estimateCount + b.shareCount - (a.estimateCount + a.shareCount),
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
        const salesHubQuery = query(
          collection(db, "boardPosts"),
          where("categoryId", "==", SALES_HUB_ID),
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

        const [noticesSnap, categorySnap, productSnap, salesHubSnap] =
          await Promise.all([
            getDocs(noticesQuery),
            getDocs(categoryQuery),
            getDocs(productQuery),
            getDocs(salesHubQuery),
          ]);

        const noticeList: Notice[] = noticesSnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: data.title ?? "(제목 없음)",
            createdAt: data.createdAt,
            categoryId: data.categoryId,
          };
        });

        const categoryItems = categorySnap.docs.map((docSnap) => ({
          ...docSnap.data(),
        }));
        const productItems = productSnap.docs.map((docSnap) => ({
          ...docSnap.data(),
        }));

        setNotices(noticeList);
        setSalesHubPosts(
          salesHubSnap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              title: data.title ?? "(제목 없음)",
              createdAt: data.createdAt,
              categoryId: data.categoryId ?? SALES_HUB_ID,
            };
          }),
        );
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

              catSnap.docs.forEach((docSnap) =>
                teamCategoryRows.push(docSnap.data()),
              );
              prodSnap.docs.forEach((docSnap) =>
                teamProductRows.push(docSnap.data()),
              );
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

  useEffect(() => {
    if (!session || !managerRole) {
      setDashboardStats(null);
      return;
    }

    let cancelled = false;

    const fetchDashboardStats = async () => {
      try {
        setDashboardLoading(true);
        setDashboardError(null);

        const response = await fetch("/api/manager/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            managerUid: session.id,
            managerId: session.managerId,
            role: managerRole,
            region: session.region,
            office: session.office,
          }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "failed to load");
        }
        const data = (await response.json()) as ManagerDashboardResponse;
        if (cancelled) return;
        setDashboardStats(data);
      } catch (err) {
        console.error("매니저 대시보드 통계 오류:", err);
        if (!cancelled) {
          setDashboardError("상위 매니저 통계를 불러오지 못했습니다.");
          setDashboardStats(null);
        }
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    };

    fetchDashboardStats();
    return () => {
      cancelled = true;
    };
  }, [session, managerRole]);

  const topCategoryStats = useMemo(
    () => categoryStats.slice(0, 8),
    [categoryStats],
  );
  const topProductStats = useMemo(
    () => productStats.slice(0, 8),
    [productStats],
  );

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

  const availableTeamTops = useMemo(() => {
    if (!dashboardStats) return [];
    const base =
      managerRole === "teamLeader"
        ? dashboardStats.teamTops.filter(
            (team) => team.teamLeaderId === session?.managerId,
          )
        : dashboardStats.teamTops;
    return base.filter((team) => Boolean(team.teamLeaderId));
  }, [dashboardStats, managerRole, session?.managerId]);

  const filteredTeamTops = useMemo(() => {
    if (!selectedTeamId) return availableTeamTops;
    return availableTeamTops.filter(
      (team) => team.teamLeaderId === selectedTeamId,
    );
  }, [availableTeamTops, selectedTeamId]);

  useEffect(() => {
    if (
      selectedTeamId &&
      !availableTeamTops.some((team) => team.teamLeaderId === selectedTeamId)
    ) {
      setSelectedTeamId(null);
    }
  }, [availableTeamTops, selectedTeamId]);

  useEffect(() => {
    if (!selectedTeamId && availableTeamTops.length > 0) {
      setSelectedTeamId(availableTeamTops[0].teamLeaderId);
    }
  }, [availableTeamTops, selectedTeamId]);

  const availableOfficeTops = useMemo(
    () => dashboardStats?.officeTops ?? [],
    [dashboardStats],
  );

  const filteredOfficeTops = useMemo(() => {
    if (!selectedOfficeId) return availableOfficeTops;
    return availableOfficeTops.filter(
      (office) => office.office === selectedOfficeId,
    );
  }, [availableOfficeTops, selectedOfficeId]);

  useEffect(() => {
    if (
      selectedOfficeId &&
      !availableOfficeTops.some((office) => office.office === selectedOfficeId)
    ) {
      setSelectedOfficeId(null);
    }
  }, [availableOfficeTops, selectedOfficeId]);

  useEffect(() => {
    if (!selectedOfficeId && availableOfficeTops.length > 0) {
      setSelectedOfficeId(availableOfficeTops[0].office);
    }
  }, [availableOfficeTops, selectedOfficeId]);

  const scopeLabel = (roleKey: ManagerScopeRole) => {
    if (roleKey === "regionLeader") return "권역";
    if (roleKey === "officeHead") return "사무소";
    return "팀";
  };

  const rankingLimit =
    managerRole === "teamLeader" ? 5 : managerRole === "regionLeader" ? 5 : 10;

  const topTeamRanking = useMemo(() => {
    if (availableTeamTops.length === 0) return [];
    return availableTeamTops
      .map((team) => {
        const estimateTotal = team.estimateTop.reduce(
          (sum, manager) => sum + manager.estimateCount,
          0,
        );
        const shareTotal = team.shareTop.reduce(
          (sum, manager) => sum + manager.shareCount,
          0,
        );
        return {
          id: team.teamLeaderId,
          label: team.teamLeaderName || team.teamLeaderId,
          estimateTotal,
          shareTotal,
          total: estimateTotal + shareTotal,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [availableTeamTops]);

  const topOfficeRanking = useMemo(() => {
    if (availableOfficeTops.length === 0) return [];
    return availableOfficeTops
      .map((office) => {
        const estimateTotal = office.estimateTop.reduce(
          (sum, manager) => sum + manager.estimateCount,
          0,
        );
        const shareTotal = office.shareTop.reduce(
          (sum, manager) => sum + manager.shareCount,
          0,
        );
        return {
          office: office.office,
          estimateTotal,
          shareTotal,
          total: estimateTotal + shareTotal,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [availableOfficeTops]);

  const goToBoardPost = (categoryId: string | undefined, postId: string) => {
    router.push(`/manager/boards/${categoryId ?? "notice"}/${postId}`);
  };

  const categorySliderRef = React.useRef<HTMLDivElement | null>(null);
  const productSliderRef = React.useRef<HTMLDivElement | null>(null);

  const scrollSlider = (
    ref: React.RefObject<HTMLDivElement | null>,
    direction: "left" | "right",
  ) => {
    if (!ref.current) return;
    const width = ref.current.clientWidth;
    const amount = direction === "left" ? -width * 0.6 : width * 0.6;
    ref.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  const renderTeamList = (items: ManagerSummary[], label: string) => (
    <TeamColumn>
      <TeamLabel>{label} Top5</TeamLabel>
      {items.length === 0 ? (
        <EmptyText>데이터가 없습니다.</EmptyText>
      ) : (
        items.map((item, index) => (
          <TeamEntry key={`${label}-${item.id}-${index}`}>
            <TeamEntryRank>{index + 1}</TeamEntryRank>
            <TeamEntryInfo>
              <strong>{item.name || item.managerId}</strong>
              <span>{item.managerId}</span>
            </TeamEntryInfo>
            <TeamEntryValue>
              {label === "견적" ? item.estimateCount : item.shareCount}
            </TeamEntryValue>
          </TeamEntry>
        ))
      )}
    </TeamColumn>
  );

  const renderTeamSection = () => {
    if (!dashboardStats || availableTeamTops.length === 0) return null;

    return (
      <TeamSection>
        <TeamFilterBar>
          <FilterButton
            type="button"
            $active={!selectedTeamId}
            onClick={() => setSelectedTeamId(null)}
          >
            전체
          </FilterButton>
          {availableTeamTops.map((team) => (
            <FilterButton
              key={team.teamLeaderId}
              type="button"
              $active={selectedTeamId === team.teamLeaderId}
              onClick={() =>
                setSelectedTeamId((prev) =>
                  prev === team.teamLeaderId ? null : team.teamLeaderId,
                )
              }
            >
              {team.teamLeaderName || team.teamLeaderId}
            </FilterButton>
          ))}
        </TeamFilterBar>
        {filteredTeamTops.length === 0 ? (
          <EmptyText>선택한 팀에 통계 데이터가 없습니다.</EmptyText>
        ) : (
          <TeamGrid>
            {filteredTeamTops.map((team) => (
              <TeamCard key={team.teamLeaderId}>
                <TeamHeader>
                  <TeamTitle>{team.teamLeaderName} 팀</TeamTitle>
                  <TeamSubtitle>팀원 {team.estimateTop.length}명</TeamSubtitle>
                </TeamHeader>
                <TeamColumns>
                  {renderTeamList(team.estimateTop, "견적")}
                  {renderTeamList(team.shareTop, "공유")}
                </TeamColumns>
              </TeamCard>
            ))}
          </TeamGrid>
        )}
      </TeamSection>
    );
  };

  const renderOfficeSection = () => {
    if (!dashboardStats || managerRole === "teamLeader") return null;
    if (availableOfficeTops.length === 0) return null;
    return (
      <OfficeSection>
        <OfficeFilterBar>
          <FilterButton
            type="button"
            $active={!selectedOfficeId}
            onClick={() => setSelectedOfficeId(null)}
          >
            전체
          </FilterButton>
          {availableOfficeTops.map((office) => (
            <FilterButton
              key={office.office}
              type="button"
              $active={selectedOfficeId === office.office}
              onClick={() =>
                setSelectedOfficeId((prev) =>
                  prev === office.office ? null : office.office,
                )
              }
            >
              {office.office || "사무소 미정"}
            </FilterButton>
          ))}
        </OfficeFilterBar>
        {filteredOfficeTops.length === 0 ? (
          <EmptyText>선택한 사무소에 통계 데이터가 없습니다.</EmptyText>
        ) : (
          <OfficeGrid>
            {filteredOfficeTops.map((office) => (
              <OfficeCard key={office.office}>
                <TeamHeader>
                  <TeamTitle>{office.office} 사무소</TeamTitle>
                  <TeamSubtitle>
                    상위 {office.estimateTop.length}명
                  </TeamSubtitle>
                </TeamHeader>
                <TeamColumns>
                  <OfficeList>
                    <TeamLabel>견적 Top10</TeamLabel>
                    {office.estimateTop.length === 0 ? (
                      <EmptyText>데이터가 없습니다.</EmptyText>
                    ) : (
                      office.estimateTop.map((item, index) => (
                        <TeamEntry key={`office-est-${item.id}-${index}`}>
                          <TeamEntryRank>{index + 1}</TeamEntryRank>
                          <TeamEntryInfo>
                            <strong>{item.name || item.managerId}</strong>
                            <span>{item.managerId}</span>
                          </TeamEntryInfo>
                          <TeamEntryValue>{item.estimateCount}</TeamEntryValue>
                        </TeamEntry>
                      ))
                    )}
                  </OfficeList>
                  <OfficeList>
                    <TeamLabel>공유 Top10</TeamLabel>
                    {office.shareTop.length === 0 ? (
                      <EmptyText>데이터가 없습니다.</EmptyText>
                    ) : (
                      office.shareTop.map((item, index) => (
                        <TeamEntry key={`office-share-${item.id}-${index}`}>
                          <TeamEntryRank>{index + 1}</TeamEntryRank>
                          <TeamEntryInfo>
                            <strong>{item.name || item.managerId}</strong>
                            <span>{item.managerId}</span>
                          </TeamEntryInfo>
                          <TeamEntryValue>{item.shareCount}</TeamEntryValue>
                        </TeamEntry>
                      ))
                    )}
                  </OfficeList>
                </TeamColumns>
              </OfficeCard>
            ))}
          </OfficeGrid>
        )}
      </OfficeSection>
    );
  };

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
        <>
          <Grid>
            <FullWidthCard>
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
                        onClick={() => goToBoardPost(n.categoryId, n.id)}
                      >
                        <NoticeTitle>{n.title}</NoticeTitle>
                        <NoticeDate>{formatPostDate(n.createdAt)}</NoticeDate>
                      </NoticeItem>
                    ))}
                  </NoticeList>
                )}
                <SalesHubSection>
                  <SalesHubHeader>
                    <SalesHubTitle>세일즈허브 최신 게시글</SalesHubTitle>
                    <CardSubTitle>최신글 5개</CardSubTitle>
                  </SalesHubHeader>
                  {salesHubPosts.length === 0 ? (
                    <EmptyText>세일즈허브 게시글이 없습니다.</EmptyText>
                  ) : (
                    <SalesHubList>
                      {salesHubPosts.map((post) => (
                        <SalesHubItem
                          key={post.id}
                          onClick={() =>
                            goToBoardPost(post.categoryId, post.id)
                          }
                        >
                          <NoticeTitle>{post.title}</NoticeTitle>
                          <NoticeDate>
                            {formatPostDate(post.createdAt)}
                          </NoticeDate>
                        </SalesHubItem>
                      ))}
                    </SalesHubList>
                  )}
                </SalesHubSection>
              </CardBody>
            </FullWidthCard>

            <StatsPairGrid>
              <Card>
                <CardHeader>
                  <CardTitle>내 활동 통계 (카테고리별)</CardTitle>
                  <CardSubTitle>견적/공유 합산 상위</CardSubTitle>
                  <SliderControls>
                    <SliderButton
                      type="button"
                      onClick={() => scrollSlider(categorySliderRef, "left")}
                    >
                      ‹
                    </SliderButton>
                    <SliderButton
                      type="button"
                      onClick={() => scrollSlider(categorySliderRef, "right")}
                    >
                      ›
                    </SliderButton>
                  </SliderControls>
                </CardHeader>
                <SliderTrack ref={categorySliderRef}>
                  {topCategoryStats.length === 0 ? (
                    <EmptyText>통계 데이터가 없습니다.</EmptyText>
                  ) : (
                    topCategoryStats.map((row) => (
                      <SliderCard key={row.key}>
                        <SliderLabel>{row.label}</SliderLabel>
                        <SliderValue>
                          <span>견적</span>
                          <strong>{row.estimateCount}</strong>
                        </SliderValue>
                        <SliderValue>
                          <span>공유</span>
                          <strong>{row.shareCount}</strong>
                        </SliderValue>
                        <SliderTotal>
                          {row.estimateCount + row.shareCount}
                        </SliderTotal>
                      </SliderCard>
                    ))
                  )}
                </SliderTrack>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>내 활동 통계 (제품별)</CardTitle>
                  <CardSubTitle>견적/공유 합산 상위</CardSubTitle>
                  <SliderControls>
                    <SliderButton
                      type="button"
                      onClick={() => scrollSlider(productSliderRef, "left")}
                    >
                      ‹
                    </SliderButton>
                    <SliderButton
                      type="button"
                      onClick={() => scrollSlider(productSliderRef, "right")}
                    >
                      ›
                    </SliderButton>
                  </SliderControls>
                </CardHeader>
                <SliderTrack ref={productSliderRef}>
                  {topProductStats.length === 0 ? (
                    <EmptyText>통계 데이터가 없습니다.</EmptyText>
                  ) : (
                    topProductStats.map((row) => (
                      <SliderCard key={row.key}>
                        <SliderLabel>{row.label || row.key}</SliderLabel>
                        <SliderValue>
                          <span>견적</span>
                          <strong>{row.estimateCount}</strong>
                        </SliderValue>
                        <SliderValue>
                          <span>공유</span>
                          <strong>{row.shareCount}</strong>
                        </SliderValue>
                        <SliderTotal>
                          {row.estimateCount + row.shareCount}
                        </SliderTotal>
                      </SliderCard>
                    ))
                  )}
                </SliderTrack>
              </Card>
            </StatsPairGrid>

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

            {managerRole && managerRole !== "teamLeader" && (
              <RegionStatsPanel>
                <RegionStatsCard>
                  <CardHeader>
                    <CardTitle>권역 통계 (카테고리별)</CardTitle>
                    <CardSubTitle>권역 활동 현황</CardSubTitle>
                  </CardHeader>
                  <RegionStatsTable>
                    <thead>
                      <tr>
                        <th>카테고리</th>
                        <th>견적</th>
                        <th>공유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regionTopCategoryStats.length === 0 ? (
                        <tr>
                          <td colSpan={3}>통계 데이터가 없습니다.</td>
                        </tr>
                      ) : (
                        regionTopCategoryStats.map((row) => (
                          <tr key={row.key}>
                            <td>{row.label}</td>
                            <td>{row.estimateCount}</td>
                            <td>{row.shareCount}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </RegionStatsTable>
                </RegionStatsCard>
                <RegionStatsCard>
                  <CardHeader>
                    <CardTitle>권역 통계 (제품별)</CardTitle>
                    <CardSubTitle>제품 활동 현황</CardSubTitle>
                  </CardHeader>
                  <RegionStatsTable>
                    <thead>
                      <tr>
                        <th>제품</th>
                        <th>견적</th>
                        <th>공유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regionTopProductStats.length === 0 ? (
                        <tr>
                          <td colSpan={3}>통계 데이터가 없습니다.</td>
                        </tr>
                      ) : (
                        regionTopProductStats.map((row) => (
                          <tr key={row.key}>
                            <td>
                              <ProductName title={row.label || row.key}>
                                {row.label || row.key}
                              </ProductName>
                            </td>
                            <td>{row.estimateCount}</td>
                            <td>{row.shareCount}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </RegionStatsTable>
                </RegionStatsCard>
              </RegionStatsPanel>
            )}
          </Grid>
          {managerRole && (
            <StatsSection>
              {dashboardLoading && (
                <InfoText>상위 매니저 통계를 불러오는 중입니다...</InfoText>
              )}
              {dashboardError && <ErrorText>{dashboardError}</ErrorText>}
              {!dashboardLoading && !dashboardError && dashboardStats && (
                <>
                  <RankingGrid>
                    <RankingCard>
                      <CardHeader>
                        <CardTitle>
                          {scopeLabel(managerRole)} 견적내기 Top {rankingLimit}
                        </CardTitle>
                      </CardHeader>
                      <RankList>
                        {dashboardStats.estimateTop
                          .slice(0, rankingLimit)
                          .map((row, index) => (
                            <RankingRow key={row.id}>
                              <RankIndex>{index + 1}</RankIndex>
                              <RankDetails>
                                <RankName>{row.name || row.managerId}</RankName>
                                <RankMeta>
                                  {row.managerId} ·{" "}
                                  {row.office || "사무소 미정"}
                                </RankMeta>
                              </RankDetails>
                              <RankValue>{row.estimateCount}</RankValue>
                            </RankingRow>
                          ))}
                        {dashboardStats.estimateTop.length === 0 && (
                          <RankingRow>
                            <RankIndex>–</RankIndex>
                            <RankDetails>데이터가 없습니다.</RankDetails>
                          </RankingRow>
                        )}
                      </RankList>
                    </RankingCard>

                    <RankingCard>
                      <CardHeader>
                        <CardTitle>
                          {scopeLabel(managerRole)} 공유하기 Top {rankingLimit}
                        </CardTitle>
                      </CardHeader>
                      <RankList>
                        {dashboardStats.shareTop
                          .slice(0, rankingLimit)
                          .map((row, index) => (
                            <RankingRow key={row.id}>
                              <RankIndex>{index + 1}</RankIndex>
                              <RankDetails>
                                <RankName>{row.name || row.managerId}</RankName>
                                <RankMeta>
                                  {row.managerId} ·{" "}
                                  {row.office || "사무소 미정"}
                                </RankMeta>
                              </RankDetails>
                              <RankValue>{row.shareCount}</RankValue>
                            </RankingRow>
                          ))}
                        {dashboardStats.shareTop.length === 0 && (
                          <RankingRow>
                            <RankIndex>–</RankIndex>
                            <RankDetails>데이터가 없습니다.</RankDetails>
                          </RankingRow>
                        )}
                      </RankList>
                    </RankingCard>
                  </RankingGrid>

                  {(topTeamRanking.length > 0 ||
                    topOfficeRanking.length > 0) && (
                    <TeamOfficeRankingGrid>
                      {topTeamRanking.length > 0 && (
                        <RankingCard>
                          <CardHeader>
                            <CardTitle>팀 랭킹 Top5</CardTitle>
                          </CardHeader>
                          <RankList>
                            {topTeamRanking.map((team, index) => (
                              <RankingRow key={team.id}>
                                <RankIndex>{index + 1}</RankIndex>
                                <RankDetails>
                                  <RankName>{team.label}</RankName>
                                  <RankMeta>
                                    견적 {team.estimateTotal} · 공유{" "}
                                    {team.shareTotal}
                                  </RankMeta>
                                </RankDetails>
                                <RankValue>{team.total}</RankValue>
                              </RankingRow>
                            ))}
                          </RankList>
                        </RankingCard>
                      )}

                      {topOfficeRanking.length > 0 && (
                        <RankingCard>
                          <CardHeader>
                            <CardTitle>사무소 랭킹 Top5</CardTitle>
                          </CardHeader>
                          <RankList>
                            {topOfficeRanking.map((office, index) => (
                              <RankingRow key={office.office}>
                                <RankIndex>{index + 1}</RankIndex>
                                <RankDetails>
                                  <RankName>
                                    {office.office || "사무소 미정"}
                                  </RankName>
                                  <RankMeta>
                                    견적 {office.estimateTotal} · 공유{" "}
                                    {office.shareTotal}
                                  </RankMeta>
                                </RankDetails>
                                <RankValue>{office.total}</RankValue>
                              </RankingRow>
                            ))}
                          </RankList>
                        </RankingCard>
                      )}
                    </TeamOfficeRankingGrid>
                  )}

                  {renderTeamSection()}
                  {renderOfficeSection()}
                </>
              )}
            </StatsSection>
          )}
        </>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f2f2f2;
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }
`;

const SalesHubSection = styled.div`
  margin-top: 16px;
`;

const SalesHubHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const SalesHubTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #1f2933;
`;

const SalesHubList = styled(NoticeList)`
  margin-top: 6px;
`;

const SalesHubItem = styled(NoticeItem)`
  padding: 6px 0;
`;

const NoticeTitle = styled.div`
  font-size: 13px;
  color: #333;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const NoticeDate = styled.span`
  font-size: 12px;
  color: #9aa5b1;
  min-width: 80px;
  text-align: right;
  white-space: nowrap;
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

const StatsSection = styled.div`
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const RankingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
`;

const RankingCard = styled.div`
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e3e8ef;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const RankList = styled.ol`
  padding: 0;
  margin: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const RankingRow = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #f0f2f5;
`;

const RankIndex = styled.span`
  font-size: 12px;
  font-weight: 600;
  width: 26px;
`;

const RankDetails = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-left: 6px;
`;

const RankName = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: #1f2933;
`;

const RankMeta = styled.span`
  font-size: 12px;
  color: #7f8ba4;
`;

const RankValue = styled.span`
  font-size: 13px;
  font-weight: 700;
  color: #2d7fff;
  min-width: 40px;
  text-align: right;
`;

const TeamGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
`;

const TeamCard = styled.div`
  background: #fff;
  border: 1px solid #e3e8ef;
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const TeamHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
`;

const TeamTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
`;

const TeamSubtitle = styled.div`
  font-size: 12px;
  color: #7f8ba4;
`;

const TeamColumns = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
`;

const TeamColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const TeamLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #555;
`;

const TeamEntry = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px dashed #ebedf3;
  font-size: 12px;
  color: #444;
`;

const TeamEntryRank = styled.span`
  font-weight: 600;
  width: 18px;
`;

const TeamEntryInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 8px;
  strong {
    font-size: 13px;
  }
`;

const TeamEntryValue = styled.span`
  font-weight: 600;
  color: #2d7fff;
`;

const OfficeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
`;

const OfficeCard = styled(TeamCard)`
  padding: 18px;
`;

const OfficeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FullWidthCard = styled(Card)`
  grid-column: 1 / -1;
`;

const StatsPairGrid = styled.div`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
`;

const RegionStatsPanel = styled.div`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
`;

const RegionStatsCard = styled(Card)`
  min-height: auto;
`;

const RegionStatsTable = styled.table`
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

const ProductName = styled.span`
  display: inline-block;
  max-width: 160px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const TeamSection = styled.div`
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const OfficeSection = styled(TeamSection)``;

const FilterRow = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  flex-wrap: wrap;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
`;

const TeamFilterBar = styled(FilterRow)``;
const OfficeFilterBar = styled(FilterRow)``;

const FilterButton = styled.button<{ $active?: boolean }>`
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: ${({ $active }) => ($active ? "#1f2933" : "#fff")};
  color: ${({ $active }) => ($active ? "#fff" : "#1f2933")};
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition:
    background 0.2s,
    color 0.2s,
    border-color 0.2s;
  flex-shrink: 0;

  &:hover {
    border-color: #1f2933;
  }

  &:focus-visible {
    outline: 2px solid #2d7fff;
    outline-offset: 2px;
  }
`;

const TeamOfficeRankingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
`;

const SliderControls = styled.div`
  display: flex;
  gap: 8px;
  margin-left: auto;
`;

const SliderButton = styled.button`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #d1d5db;
  background: #fff;
  font-size: 16px;
  line-height: 1;
  color: #1f2933;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s;

  &:hover {
    border-color: #1f2933;
  }
`;

const SliderTrack = styled.div`
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
  scroll-behavior: smooth;
  margin-top: 12px;
`;

const SliderCard = styled.div`
  min-width: 240px;
  padding: 12px;
  border-radius: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scroll-snap-align: start;
  flex-shrink: 0;
`;

const SliderLabel = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: #111827;
`;

const SliderValue = styled.div`
  font-size: 12px;
  display: flex;
  justify-content: space-between;
  color: #374151;
`;

const SliderTotal = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: #2563eb;
`;
