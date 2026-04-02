import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  ManagerDashboardRequest,
  ManagerDashboardResponse,
  ManagerDashboardScope,
  ManagerSummary,
} from "@/pages/api/manager/dashboard";

type DashboardFilterField =
  | "all"
  | "area"
  | "region"
  | "office"
  | "team"
  | "manager";

type ScopeOption = {
  value: DashboardFilterField;
  label: string;
};

type GroupRankingItem = {
  key: string;
  label: string;
  estimateTotal: number;
  shareTotal: number;
  total: number;
};

type OrganizationExplorerProps = {
  requestPayload: ManagerDashboardRequest;
  onManagerSelect?: (manager: ManagerSummary) => void;
  title?: string;
  baseManagerLabel?: string;
};

type ExplorerAggregateItem = {
  estimateCount?: number;
  shareCount?: number;
  [key: string]: unknown;
};

const aggregateStats = (
  items: ExplorerAggregateItem[],
  keyField: string,
  labelField: string,
) => {
  const map = new Map<
    string,
    { key: string; label: string; estimateCount: number; shareCount: number }
  >();
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

const getAreaFromRegion = (region?: string) => {
  const trimmed = String(region ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("_")) {
    return trimmed.split("_")[0]?.trim() ?? trimmed;
  }
  if (/[가-힣]/u.test(trimmed)) {
    const normalized = trimmed.replace(/[A-Z0-9]+$/u, "").trim();
    return normalized || trimmed;
  }
  return trimmed;
};

const scopeLabel = (scope: ManagerDashboardScope | null) => {
  if (scope === "national") return "전국";
  if (scope === "area") return "지역";
  if (scope === "region") return "권역";
  if (scope === "office") return "사무소";
  if (scope === "team") return "팀";
  if (scope === "self") return "본인";
  return "전체";
};

const buildFilterOptions = (scope: ManagerDashboardScope | null): ScopeOption[] => {
  if (!scope || scope === "self") return [];
  if (scope === "national") {
    return [
      { value: "all", label: "전체" },
      { value: "area", label: "지역" },
      { value: "region", label: "권역" },
      { value: "office", label: "사무소" },
      { value: "team", label: "팀장" },
      { value: "manager", label: "매니저" },
    ];
  }
  if (scope === "area") {
    return [
      { value: "all", label: "전체" },
      { value: "region", label: "권역" },
      { value: "office", label: "사무소" },
      { value: "team", label: "팀장" },
      { value: "manager", label: "매니저" },
    ];
  }
  if (scope === "region") {
    return [
      { value: "all", label: "전체" },
      { value: "office", label: "사무소" },
      { value: "team", label: "팀장" },
      { value: "manager", label: "매니저" },
    ];
  }
  if (scope === "office") {
    return [
      { value: "all", label: "전체" },
      { value: "team", label: "팀장" },
      { value: "manager", label: "매니저" },
    ];
  }
  return [
    { value: "all", label: "전체" },
    { value: "manager", label: "매니저" },
  ];
};

const getManagerFieldValue = (
  manager: ManagerSummary,
  field: DashboardFilterField,
) => {
  if (field === "area") return getAreaFromRegion(manager.region);
  if (field === "region") return manager.region;
  if (field === "office") return manager.office;
  if (field === "team") return manager.teamLeaderId;
  if (field === "manager") return manager.id;
  return "";
};

const getManagerFieldLabel = (
  manager: ManagerSummary,
  field: DashboardFilterField,
  teamLeaderNameRegistry: Map<string, string>,
) => {
  if (field === "area") return getAreaFromRegion(manager.region) || "지역 미정";
  if (field === "region") return manager.region || "권역 미정";
  if (field === "office") return manager.office || "사무소 미정";
  if (field === "team") {
    const teamLeaderId = manager.teamLeaderId || "";
    if (!teamLeaderId) return "팀장 미지정";
    const teamLeaderName = teamLeaderNameRegistry.get(teamLeaderId);
    return teamLeaderName
      ? `${teamLeaderName} (${teamLeaderId})`
      : teamLeaderId;
  }
  if (field === "manager") {
    return `${manager.name || manager.managerId} (${manager.managerId})`;
  }
  return "전체";
};

const getManagerFieldTitleLabel = (
  manager: ManagerSummary,
  field: DashboardFilterField,
  teamLeaderNameRegistry: Map<string, string>,
) => {
  if (field === "team") {
    const teamLeaderId = manager.teamLeaderId || "";
    return teamLeaderNameRegistry.get(teamLeaderId) || teamLeaderId || "팀장";
  }
  if (field === "manager") {
    return manager.name || manager.managerId || "매니저";
  }
  return getManagerFieldLabel(manager, field, teamLeaderNameRegistry);
};

const OrganizationExplorer: React.FC<OrganizationExplorerProps> = ({
  requestPayload,
  onManagerSelect,
  title = "조직 조회",
  baseManagerLabel,
}) => {
  const [dashboardStats, setDashboardStats] = useState<ManagerDashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [filterField, setFilterField] = useState<DashboardFilterField>("all");
  const [filterValue, setFilterValue] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [resultPage, setResultPage] = useState(1);
  const [scopedCategoryItems, setScopedCategoryItems] = useState<
    ExplorerAggregateItem[]
  >([]);
  const [scopedProductItems, setScopedProductItems] = useState<
    ExplorerAggregateItem[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    setDashboardStats(null);
    setScopedCategoryItems([]);
    setScopedProductItems([]);
    setFilterField("all");
    setFilterValue("all");
    setSearchKeyword("");
    setResultPage(1);

    const fetchDashboardStats = async () => {
      setDashboardLoading(true);
      setDashboardError(null);
      try {
        const response = await fetch("/api/manager/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "조직 통계를 불러오지 못했습니다.");
        }
        const data = (await response.json()) as ManagerDashboardResponse;
        if (!cancelled) {
          setDashboardStats(data);
        }
      } catch (err: unknown) {
        console.error("조직 통계 로딩 오류:", err);
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : "조직 통계를 불러오는 중 오류가 발생했습니다.";
          setDashboardError(message);
          setDashboardStats(null);
        }
      } finally {
        if (!cancelled) {
          setDashboardLoading(false);
        }
      }
    };

    fetchDashboardStats();
    return () => {
      cancelled = true;
    };
  }, [requestPayload]);

  useEffect(() => {
    if (!dashboardStats || dashboardStats.managers.length === 0) {
      setScopedCategoryItems([]);
      setScopedProductItems([]);
      return;
    }

    let cancelled = false;

    const fetchScopedStats = async () => {
      try {
        const managerIds = new Set(
          dashboardStats.managers.map((item) => item.id),
        );
        const [categorySnap, productSnap] = await Promise.all([
          getDocs(collection(db, "managerCategoryStats")),
          getDocs(collection(db, "managerProductStats")),
        ]);

        if (cancelled) return;

        const nextCategoryItems = categorySnap.docs
          .map((docSnap) => docSnap.data())
            .filter(
              (item) => managerIds.has(String(item.managerUid ?? "")),
            );
        const nextProductItems = productSnap.docs
          .map((docSnap) => docSnap.data())
            .filter(
              (item) => managerIds.has(String(item.managerUid ?? "")),
            );

        setScopedCategoryItems(nextCategoryItems);
        setScopedProductItems(nextProductItems);
      } catch (err) {
        console.error("범위별 통계 집계 오류:", err);
        if (!cancelled) {
          setScopedCategoryItems([]);
          setScopedProductItems([]);
        }
      }
    };

    fetchScopedStats();
    return () => {
      cancelled = true;
    };
  }, [dashboardStats]);
  const scopedManagers = useMemo(
    () => dashboardStats?.managers ?? [],
    [dashboardStats],
  );

  const teamLeaderNameRegistry = useMemo(() => {
    const registry = new Map<string, string>();
    scopedManagers.forEach((manager) => {
      if (manager.position.includes("팀장")) {
        registry.set(manager.managerId, manager.name || manager.managerId);
      }
    });
    return registry;
  }, [scopedManagers]);

  const filterOptions = useMemo(() =>
    buildFilterOptions(dashboardStats?.scope ?? null),
    [dashboardStats?.scope],
  );

  useEffect(() => {
    if (filterOptions.length === 0) {
      setFilterField("all");
      return;
    }
    if (!filterOptions.some((option) => option.value === filterField)) {
      setFilterField(filterOptions[0].value);
    }
  }, [filterField, filterOptions]);

  const filterValueOptions = useMemo(() => {
    if (filterField === "all") {
      return [{ value: "all", label: "전체" }];
    }

    const optionMap = new Map<string, string>();
    scopedManagers.forEach((manager) => {
      const value = getManagerFieldValue(manager, filterField);
      if (!value) return;
      optionMap.set(
        value,
        getManagerFieldLabel(manager, filterField, teamLeaderNameRegistry),
      );
    });

    return [
      { value: "all", label: "전체" },
      ...Array.from(optionMap.entries())
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "ko")),
    ];
  }, [filterField, scopedManagers, teamLeaderNameRegistry]);

  useEffect(() => {
    if (!filterValueOptions.some((option) => option.value === filterValue)) {
      setFilterValue("all");
    }
  }, [filterValue, filterValueOptions]);

  const scopeFilteredManagers = useMemo(() => {
    if (filterField === "all" || filterValue === "all") return scopedManagers;
    return scopedManagers.filter(
      (manager) => getManagerFieldValue(manager, filterField) === filterValue,
    );
  }, [filterField, filterValue, scopedManagers]);

  const filteredManagers = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return scopeFilteredManagers;

    return scopeFilteredManagers.filter((manager) => {
      const searchTargets = [
        manager.name,
        manager.position,
        manager.region,
        manager.office,
        manager.managerId,
      ];

      return searchTargets.some((value) =>
        String(value ?? "").toLowerCase().includes(keyword),
      );
    });
  }, [scopeFilteredManagers, searchKeyword]);

  const filteredManagerIds = useMemo(
    () => new Set(filteredManagers.map((manager) => manager.id)),
    [filteredManagers],
  );

  const paginatedManagers = useMemo(
    () =>
      [...filteredManagers]
        .sort(
          (a, b) =>
            b.estimateCount + b.shareCount -
            (a.estimateCount + a.shareCount),
        )
        .slice((resultPage - 1) * 10, resultPage * 10),
    [filteredManagers, resultPage],
  );

  const resultTotalPages = Math.max(1, Math.ceil(filteredManagers.length / 10));
  const visiblePageNumbers = useMemo(() => {
    const maxVisible = 5;
    const startPage =
      Math.floor((resultPage - 1) / maxVisible) * maxVisible + 1;
    const endPage = Math.min(resultTotalPages, startPage + maxVisible - 1);
    return Array.from(
      { length: endPage - startPage + 1 },
      (_, index) => startPage + index,
    );
  }, [resultPage, resultTotalPages]);

  useEffect(() => {
    setResultPage(1);
  }, [filterField, filterValue, searchKeyword]);

  useEffect(() => {
    if (resultPage > resultTotalPages) {
      setResultPage(resultTotalPages);
    }
  }, [resultPage, resultTotalPages]);

  const filteredScopeCategoryStats = useMemo(
    () =>
      aggregateStats(
        scopedCategoryItems.filter((item) =>
          filteredManagerIds.has(String(item.managerUid ?? "")),
        ),
        "type",
        "type",
      ).slice(0, 12),
    [filteredManagerIds, scopedCategoryItems],
  );

  const filteredScopeProductStats = useMemo(
    () =>
      aggregateStats(
        scopedProductItems.filter((item) =>
          filteredManagerIds.has(String(item.managerUid ?? "")),
        ),
        "modelCode",
        "productName",
      ).slice(0, 12),
    [filteredManagerIds, scopedProductItems],
  );

  const rankingLimit =
    dashboardStats?.scope === "team" || dashboardStats?.scope === "self"
      ? 5
      : 10;

  const topEstimateManagers = useMemo(
    () =>
      [...filteredManagers]
        .sort((a, b) => b.estimateCount - a.estimateCount)
        .slice(0, rankingLimit),
    [filteredManagers, rankingLimit],
  );

  const topShareManagers = useMemo(
    () =>
      [...filteredManagers]
        .sort((a, b) => b.shareCount - a.shareCount)
        .slice(0, rankingLimit),
    [filteredManagers, rankingLimit],
  );

  const groupRankingFields = useMemo(() => {
    if (dashboardStats?.scope === "national") return ["area", "region"] as const;
    if (dashboardStats?.scope === "area") return ["region", "office"] as const;
    if (dashboardStats?.scope === "region") return ["office", "team"] as const;
    if (dashboardStats?.scope === "office") return ["team"] as const;
    return [] as const;
  }, [dashboardStats?.scope]);

  const groupRankings = useMemo(
    () =>
      groupRankingFields.map((field) => {
        const groupMap = new Map<string, GroupRankingItem>();
        filteredManagers.forEach((manager) => {
          const key = getManagerFieldValue(manager, field);
          if (!key) return;
          const current = groupMap.get(key);
          const label = getManagerFieldLabel(
            manager,
            field,
            teamLeaderNameRegistry,
          );
          if (current) {
            current.estimateTotal += manager.estimateCount;
            current.shareTotal += manager.shareCount;
            current.total = current.estimateTotal + current.shareTotal;
          } else {
            groupMap.set(key, {
              key,
              label,
              estimateTotal: manager.estimateCount,
              shareTotal: manager.shareCount,
              total: manager.estimateCount + manager.shareCount,
            });
          }
        });

        return {
          field,
          label:
            filterOptions.find((option) => option.value === field)?.label ?? "",
          items: Array.from(groupMap.values())
            .sort((a, b) => b.total - a.total)
            .slice(0, 5),
        };
      }),
    [filterOptions, filteredManagers, groupRankingFields, teamLeaderNameRegistry],
  );

  const teamLeaderOptions = useMemo(() => {
    const map = new Map<string, string>();
    scopedManagers.forEach((manager) => {
      if (manager.position.includes("팀장") && manager.managerId) {
        map.set(manager.managerId, manager.name || manager.managerId);
      }
    });
    if (dashboardStats?.scope === "team" && requestPayload.managerId) {
      map.set(
        requestPayload.managerId,
        baseManagerLabel || requestPayload.managerId,
      );
    }
    return Array.from(map.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [baseManagerLabel, dashboardStats?.scope, requestPayload.managerId, scopedManagers]);

  const selectedTargetTitle = useMemo(() => {
    if (filterField === "all" || filterValue === "all") {
      return scopeLabel(dashboardStats?.scope ?? null);
    }

    const matchedManager = scopedManagers.find(
      (manager) => getManagerFieldValue(manager, filterField) === filterValue,
    );

    if (!matchedManager) {
      return scopeLabel(dashboardStats?.scope ?? null);
    }

    return getManagerFieldTitleLabel(
      matchedManager,
      filterField,
      teamLeaderNameRegistry,
    );
  }, [
    dashboardStats?.scope,
    filterField,
    filterValue,
    scopedManagers,
    teamLeaderNameRegistry,
  ]);

  const scopeDescription = useMemo(() => {
    const scope = dashboardStats?.scope;
    if (!scope) return "";
    if (scope === "national") return "전국 단위 조회";
    if (scope === "area") {
      const area = getAreaFromRegion(requestPayload.region);
      return `${area || requestPayload.region || "지역"} 단위 조회`;
    }
    if (scope === "region") return `${requestPayload.region || "권역"} 단위 조회`;
    if (scope === "office") return `${requestPayload.office || "사무소"} 단위 조회`;
    if (scope === "team")
      return `${baseManagerLabel || requestPayload.managerId || "팀장"} 단위 조회`;
    return "본인 활동내역 조회";
  }, [
    baseManagerLabel,
    dashboardStats?.scope,
    requestPayload.managerId,
    requestPayload.office,
    requestPayload.region,
  ]);

  const handleManagerClick = (manager: ManagerSummary) => {
    onManagerSelect?.(manager);
  };

  if (!dashboardStats) {
    return (
      <ExplorerSection>
        <ExplorerHeader>
          <ExplorerTitle>{title}</ExplorerTitle>
          <ExplorerSubTitle>{scopeDescription}</ExplorerSubTitle>
        </ExplorerHeader>
        {dashboardLoading && <InfoText>조직 통계를 불러오는 중입니다...</InfoText>}
        {dashboardError && <ErrorText>{dashboardError}</ErrorText>}
      </ExplorerSection>
    );
  }

  if (dashboardStats.scope === null || dashboardStats.scope === "self") {
    return (
      <ExplorerSection>
        <ExplorerHeader>
          <ExplorerTitle>{title}</ExplorerTitle>
          <ExplorerSubTitle>{scopeDescription}</ExplorerSubTitle>
        </ExplorerHeader>
        <InfoText>선택한 매니저는 조직 단위 조회 권한이 없습니다.</InfoText>
      </ExplorerSection>
    );
  }

  return (
    <ExplorerSection>
      <ExplorerHeader>
        <ExplorerTitle>{title}</ExplorerTitle>
        <ExplorerSubTitle>{scopeDescription}</ExplorerSubTitle>
      </ExplorerHeader>
      {dashboardLoading && <InfoText>조직 통계를 불러오는 중입니다...</InfoText>}
      {dashboardError && <ErrorText>{dashboardError}</ErrorText>}
      {!dashboardLoading && !dashboardError && (
        <StatsSection>
          <FilterPanel>
            <FilterIntro>
              <CardTitle>조직 조회 조건</CardTitle>
              <CardSubTitle>{scopeDescription}</CardSubTitle>
            </FilterIntro>
            <FilterControls>
              <FilterField>
                <FilterLabel>조건</FilterLabel>
                <FilterSelect
                  value={filterField}
                  onChange={(event) =>
                    setFilterField(event.target.value as DashboardFilterField)
                  }
                >
                  {filterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </FilterSelect>
              </FilterField>
              <FilterField>
                <FilterLabel>대상</FilterLabel>
                <FilterSelect
                  value={filterValue}
                  onChange={(event) => setFilterValue(event.target.value)}
                >
                  {filterValueOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </FilterSelect>
              </FilterField>
              <FilterField>
                <FilterLabel>검색</FilterLabel>
                <FilterInput
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="이름, 직급, 권역, 사무소, 업무등록번호 검색"
                />
              </FilterField>
            </FilterControls>
            <FilterSummary>
              조회 범위: {selectedTargetTitle} 단위
              {filterField !== "all" && filterValue !== "all"
                ? ` · 선택 조건: ${
                    filterOptions.find((option) => option.value === filterField)
                      ?.label ?? ""
                  }`
                : ""}
              {searchKeyword.trim()
                ? ` · 검색어: ${searchKeyword.trim()}`
                : ""}
            </FilterSummary>
          </FilterPanel>

          <RankingGrid>
            <RankingCard>
              <CardHeader>
                <CardTitle>
                  {selectedTargetTitle} 견적 순위 Top {rankingLimit}
                </CardTitle>
                <CardSubTitle>
                  매니저를 클릭하면 정보 수정과 활동내역을 확인할 수 있습니다.
                </CardSubTitle>
              </CardHeader>
              <RankList>
                {topEstimateManagers.length === 0 && (
                  <RankingRow>
                    <RankIndex>?</RankIndex>
                    <RankDetails>데이터가 없습니다.</RankDetails>
                  </RankingRow>
                )}
                {topEstimateManagers.map((row, index) => (
                  <ClickableRankingRow
                    key={row.id}
                    onClick={() => handleManagerClick(row)}
                  >
                    <RankIndex>{index + 1}</RankIndex>
                    <RankDetails>
                      <RankName>{row.name || row.managerId}</RankName>
                      <RankMeta>
                        {row.managerId} · {row.office || "사무소 미정"}
                      </RankMeta>
                    </RankDetails>
                    <RankValue>{row.estimateCount}</RankValue>
                  </ClickableRankingRow>
                ))}
              </RankList>
            </RankingCard>
            <RankingCard>
              <CardHeader>
                <CardTitle>
                  {selectedTargetTitle} 공유 순위 Top {rankingLimit}
                </CardTitle>
                <CardSubTitle>
                  매니저를 클릭하면 정보 수정과 활동내역을 확인할 수 있습니다.
                </CardSubTitle>
              </CardHeader>
              <RankList>
                {topShareManagers.length === 0 && (
                  <RankingRow>
                    <RankIndex>?</RankIndex>
                    <RankDetails>데이터가 없습니다.</RankDetails>
                  </RankingRow>
                )}
                {topShareManagers.map((row, index) => (
                  <ClickableRankingRow
                    key={row.id}
                    onClick={() => handleManagerClick(row)}
                  >
                    <RankIndex>{index + 1}</RankIndex>
                    <RankDetails>
                      <RankName>{row.name || row.managerId}</RankName>
                      <RankMeta>
                        {row.managerId} · {row.office || "사무소 미정"}
                      </RankMeta>
                    </RankDetails>
                    <RankValue>{row.shareCount}</RankValue>
                  </ClickableRankingRow>
                ))}
              </RankList>
            </RankingCard>
          </RankingGrid>

          {groupRankings.some((group) => group.items.length > 0) && (
            <TeamOfficeRankingGrid>
              {groupRankings.map((group) =>
                group.items.length > 0 ? (
                  <RankingCard key={group.field}>
                    <CardHeader>
                      <CardTitle>
                        {filterField !== "all" && filterValue !== "all"
                          ? `${selectedTargetTitle} ${group.label} 순위 Top5`
                          : `${group.label} 순위 Top5`}
                      </CardTitle>
                    </CardHeader>
                    <RankList>
                      {group.items.map((item, index) => (
                        <RankingRow key={`${group.field}-${item.key}`}>
                          <RankIndex>{index + 1}</RankIndex>
                          <RankDetails>
                            <RankName>{item.label}</RankName>
                            <RankMeta>
                              견적 {item.estimateTotal} · 공유 {item.shareTotal}
                            </RankMeta>
                          </RankDetails>
                          <RankValue>{item.total}</RankValue>
                        </RankingRow>
                      ))}
                    </RankList>
                  </RankingCard>
                ) : null,
              )}
            </TeamOfficeRankingGrid>
          )}

          <RegionStatsPanel>
            <RegionStatsCard>
              <CardHeader>
                <CardTitle>{selectedTargetTitle} 통계 (카테고리별)</CardTitle>
                <CardSubTitle>현재 조회 조건 기준 합산</CardSubTitle>
              </CardHeader>
              <RegionStatsTable>
                <thead>
                  <tr>
                    <th>카테고리</th>
                    <th>견적</th>
                    <th>공유</th>
                    <th>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScopeCategoryStats.length === 0 ? (
                    <tr>
                      <td colSpan={4}>통계 데이터가 없습니다.</td>
                    </tr>
                  ) : (
                    filteredScopeCategoryStats.map((row) => (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        <td>{row.estimateCount}</td>
                        <td>{row.shareCount}</td>
                        <td>{row.estimateCount + row.shareCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </RegionStatsTable>
            </RegionStatsCard>
            <RegionStatsCard>
              <CardHeader>
                <CardTitle>{selectedTargetTitle} 통계 (제품별)</CardTitle>
                <CardSubTitle>현재 조회 조건 기준 합산</CardSubTitle>
              </CardHeader>
              <RegionStatsTable>
                <thead>
                  <tr>
                    <th>제품</th>
                    <th>견적</th>
                    <th>공유</th>
                    <th>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScopeProductStats.length === 0 ? (
                    <tr>
                      <td colSpan={4}>통계 데이터가 없습니다.</td>
                    </tr>
                  ) : (
                    filteredScopeProductStats.map((row) => (
                      <tr key={row.key}>
                        <td>
                          <ProductName title={row.label || row.key}>
                            {row.label || row.key}
                          </ProductName>
                        </td>
                        <td>{row.estimateCount}</td>
                        <td>{row.shareCount}</td>
                        <td>{row.estimateCount + row.shareCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </RegionStatsTable>
            </RegionStatsCard>
          </RegionStatsPanel>

          <RankingCard>
            <CardHeader>
              <CardTitle>{selectedTargetTitle} 조회 결과 목록</CardTitle>
              <CardSubTitle>
                조건에 맞는 인원 {filteredManagers.length}명 · {resultPage}/
                {resultTotalPages} 페이지
              </CardSubTitle>
            </CardHeader>
            <StatsTable>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>직급</th>
                  <th>권역</th>
                  <th>사무소</th>
                  <th>팀장</th>
                  <th>견적</th>
                  <th>공유</th>
                </tr>
              </thead>
              <tbody>
                {filteredManagers.length === 0 ? (
                  <tr>
                    <td colSpan={7}>조회 결과가 없습니다.</td>
                  </tr>
                ) : (
                  paginatedManagers.map((manager) => (
                    <DashboardTableRow
                      key={manager.id}
                      onClick={() => handleManagerClick(manager)}
                    >
                      <td>{manager.name || manager.managerId}</td>
                      <td>{manager.position || "-"}</td>
                      <td>{manager.region || "-"}</td>
                      <td>{manager.office || "-"}</td>
                      <td>
                        {manager.teamLeaderId
                          ? teamLeaderNameRegistry.get(manager.teamLeaderId) ||
                            manager.teamLeaderId
                          : "-"}
                      </td>
                      <td>{manager.estimateCount}</td>
                      <td>{manager.shareCount}</td>
                    </DashboardTableRow>
                  ))
                )}
              </tbody>
            </StatsTable>
            {filteredManagers.length > 0 && (
              <PaginationBar>
                <PaginationButton
                  type="button"
                  onClick={() => setResultPage((prev) => Math.max(1, prev - 1))}
                  disabled={resultPage === 1}
                >
                  이전
                </PaginationButton>
                <PaginationPages>
                  {visiblePageNumbers.map((pageNumber) => (
                    <PaginationButton
                      key={pageNumber}
                      type="button"
                      $active={pageNumber === resultPage}
                      onClick={() => setResultPage(pageNumber)}
                    >
                      {pageNumber}
                    </PaginationButton>
                  ))}
                </PaginationPages>
                <PaginationButton
                  type="button"
                  onClick={() =>
                    setResultPage((prev) => Math.min(resultTotalPages, prev + 1))
                  }
                  disabled={resultPage === resultTotalPages}
                >
                  다음
                </PaginationButton>
                <PaginationButton
                  type="button"
                  onClick={() => setResultPage(resultTotalPages)}
                  disabled={resultPage === resultTotalPages}
                >
                  끝
                </PaginationButton>
              </PaginationBar>
            )}
          </RankingCard>
        </StatsSection>
      )}
    </ExplorerSection>
  );
};

export default OrganizationExplorer;

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

const ExplorerSection = styled.section`
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ExplorerHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const ExplorerTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  margin: 0;
`;

const ExplorerSubTitle = styled.span`
  font-size: 13px;
  color: #6b7280;
`;

const StatsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const FilterPanel = styled.div`
  background: #fff;
  border-radius: 16px;
  border: 1px solid #e3e8ef;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const Card = styled.div`
  background: #ffffff;
  border-radius: 16px;
  padding: 16px 18px 14px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(226, 232, 240, 0.8);
  display: flex;
  flex-direction: column;
  min-height: 180px;
`;

const CardHeader = styled.div`
  margin-bottom: 10px;
`;

const CardTitle = styled.h3`
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 2px;
  color: #1f2933;
`;

const CardSubTitle = styled.p`
  font-size: 12px;
  color: #9aa5b1;
  margin: 0;
`;

const FilterIntro = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FilterControls = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const FilterField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 140px;
  flex: 1;
`;

const FilterLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: #52606d;
`;

const FilterSelect = styled.select`
  height: 40px;
  border-radius: 10px;
  border: 1px solid #d9e2ec;
  background: #fff;
  padding: 0 12px;
  font-size: 13px;
  color: #1f2933;
  width: 100%;
`;

const FilterInput = styled.input`
  height: 40px;
  border-radius: 10px;
  border: 1px solid #d9e2ec;
  background: #fff;
  padding: 0 12px;
  font-size: 13px;
  color: #1f2933;

  &::placeholder {
    color: #9aa5b1;
  }
`;

const FilterSummary = styled.div`
  font-size: 12px;
  color: #7b8794;
`;

const RankingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
`;

const RankingCard = styled(Card)`
  min-height: auto;
  box-shadow: none;
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

const ClickableRankingRow = styled(RankingRow)`
  cursor: pointer;
  border-radius: 10px;
  transition:
    background 0.2s,
    transform 0.2s;

  &:hover {
    background: #f8fbff;
    transform: translateY(-1px);
  }
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

const TeamOfficeRankingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
`;

const RegionStatsPanel = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
`;

const RegionStatsCard = styled(Card)`
  min-height: auto;
  box-shadow: none;
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

const DashboardTableRow = styled.tr`
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #f8fbff;
  }
`;

const PaginationBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
  flex-wrap: wrap;
`;

const PaginationPages = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
`;

const PaginationButton = styled.button<{ $active?: boolean }>`
  min-width: 36px;
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid ${({ $active }) => ($active ? "#1f2933" : "#d1d5db")};
  background: ${({ $active }) => ($active ? "#1f2933" : "#fff")};
  color: ${({ $active }) => ($active ? "#fff" : "#1f2933")};
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s,
    border-color 0.2s;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

