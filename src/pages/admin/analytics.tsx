"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styled, { css } from "styled-components";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import OrganizationExplorer from "@/components/OrganizationExplorer";
import ManagerEditModal, { type StatRow } from "@/components/ManagerEditModal";
import type { ManagerDashboardRequest } from "@/pages/api/manager/dashboard";
import {
  fetchManagerLearningDetails,
  type LearningActivityRow,
} from "@/lib/learning";
import {
  getAnalyticsCategoryData,
  getAnalyticsSummaryData,
  type ActivitySummaryDetail,
  type DashboardCategoryResponse,
  type TopManagerRow,
} from "@/lib/admin/adminDataService";
import { scaleCountByMode, type AdminDataMode } from "@/lib/admin/adminDataMode";

type QuickRangeKey = "today" | "week" | "month" | "quarter" | "custom";

type CategoryBarRow = {
  name: string;
  estimate: number;
  share: number;
};

type EditableManager = {
  id: string;
  managerId: string;
  name: string;
  position: string;
  office: string;
  region: string;
  teamLeaderId: string;
  estimateCount: number;
  shareCount: number;
};

const padDate = (value: number) => String(value).padStart(2, "0");

const toIsoDateInput = (date: Date) =>
  `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(
    date.getDate(),
  )}`;

const getQuickRange = (
  key: Exclude<QuickRangeKey, "custom">,
  baseDate: Date,
) => {
  const end = new Date(baseDate);
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  if (key === "today") {
    // no-op
  } else if (key === "week") {
    start.setDate(start.getDate() - 6);
  } else if (key === "month") {
    start.setMonth(start.getMonth() - 1);
  } else {
    start.setMonth(start.getMonth() - 3);
  }

  return {
    start: toIsoDateInput(start),
    end: toIsoDateInput(end),
  };
};

const formatRangeLabel = (start: string, end: string) => {
  if (!start && !end) return "조회 기간 미지정";
  if (start === end) return start;
  return `${start} ~ ${end}`;
};

type AggregateItem = {
  estimateCount?: number;
  shareCount?: number;
  [key: string]: unknown;
};

const aggregateStats = (
  items: AggregateItem[],
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
    (a, b) => b.estimateCount + b.shareCount - (a.estimateCount + a.shareCount),
  );
};

const toDisplayStatRows = (rows: StatRow[], dataMode: AdminDataMode): StatRow[] =>
  rows.map((row) => ({
    ...row,
    estimateCount: scaleCountByMode(row.estimateCount, dataMode),
    shareCount: scaleCountByMode(row.shareCount, dataMode),
  }));

const toDisplayLearningRows = (
  rows: LearningActivityRow[],
  dataMode: AdminDataMode,
): LearningActivityRow[] =>
  rows.map((row) => ({
    ...row,
    viewCount: scaleCountByMode(row.viewCount, dataMode),
    shareCount: scaleCountByMode(row.shareCount, dataMode),
  }));

const toDisplayLearningTotals = (
  totals: { views: number; shares: number },
  dataMode: AdminDataMode,
) => ({
  views: scaleCountByMode(totals.views, dataMode),
  shares: scaleCountByMode(totals.shares, dataMode),
});

const shortCategoryLabel = (value: string) => {
  if (!value) return "-";
  if (value.length <= 8) return value;
  return `${value.slice(0, 8)}…`;
};

const resolveBranchMeta = (name: string) => {
  if (name.includes("office-mapping-error") || name.includes("매핑오류")) {
    return { label: "사무소명 매핑오류", tag: "매핑오류", muted: true };
  }
  if (name.includes("office-unassigned")) {
    return {
      label: name.replace("(office-unassigned)", "(사무소 미지정)"),
      tag: "원본누락",
      muted: true,
    };
  }
  if (
    name.includes("office-missing-source") ||
    name.includes("원본없음") ||
    name.includes("미지정")
  ) {
    return { label: "사무소 미지정(원본없음)", tag: "원본누락", muted: true };
  }
  return { label: name, tag: "", muted: false };
};

type AdminAnalyticsPageProps = {
  dataMode?: AdminDataMode;
};

export function AdminAnalyticsPage({ dataMode = "demo" }: AdminAnalyticsPageProps) {
  const today = useMemo(() => {
    const next = new Date();
    next.setHours(0, 0, 0, 0);
    return next;
  }, []);

  const initialRange = useMemo(() => getQuickRange("month", today), [today]);

  const [rangeStart, setRangeStart] = useState(initialRange.start);
  const [rangeEnd, setRangeEnd] = useState(initialRange.end);
  const [quickRange, setQuickRange] = useState<QuickRangeKey>("month");

  const [categoryRows, setCategoryRows] = useState<CategoryBarRow[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [summary, setSummary] = useState<ActivitySummaryDetail | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [officeOptions, setOfficeOptions] = useState<string[]>([]);
  const [regionOptions, setRegionOptions] = useState<string[]>([]);
  const [teamLeaderOptions, setTeamLeaderOptions] = useState<string[]>([]);

  const [explorerMode, setExplorerMode] = useState<"all" | "office">("all");
  const [explorerOffice, setExplorerOffice] = useState("");
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [explorerPayload, setExplorerPayload] =
    useState<ManagerDashboardRequest | null>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editManager, setEditManager] = useState<EditableManager | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    password: "",
    region: "",
    office: "",
    teamLeaderId: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editFeedback, setEditFeedback] = useState<string | null>(null);
  const [editFeedbackError, setEditFeedbackError] = useState<string | null>(null);

  const [editCategoryActivity, setEditCategoryActivity] = useState<StatRow[]>([]);
  const [editProductActivity, setEditProductActivity] = useState<StatRow[]>([]);
  const [editActivityLoading, setEditActivityLoading] = useState(false);
  const [editActivityError, setEditActivityError] = useState<string | null>(null);

  const [editLearningTotals, setEditLearningTotals] = useState({
    views: 0,
    shares: 0,
  });
  const [editLearningLoading, setEditLearningLoading] = useState(false);
  const [editLearningError, setEditLearningError] = useState<string | null>(null);
  const [editLearningDetails, setEditLearningDetails] = useState<
    LearningActivityRow[]
  >([]);

  const [managerDetailsLoading, setManagerDetailsLoading] = useState(false);
  const [managerDetailsError, setManagerDetailsError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    const fetchCategoryData = async () => {
      setCategoryLoading(true);
      setCategoryError(null);
      try {
        const data = (await getAnalyticsCategoryData(
          dataMode,
        )) as DashboardCategoryResponse;
        if (cancelled) return;

        const mapped = (data.estimateTypes ?? [])
          .map((row) => ({
            name: String(row.type ?? "unknown"),
            estimate: Number(row.estimateCount ?? 0),
            share: Number(row.shareCount ?? 0),
          }))
          .filter((row) => row.estimate > 0 || row.share > 0)
          .slice(0, 10);

        setCategoryRows(mapped);
      } catch (error) {
        console.error("category analytics load error:", error);
        if (!cancelled) {
          setCategoryError("인기 카테고리 데이터를 불러오는 중 오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) {
          setCategoryLoading(false);
        }
      }
    };

    fetchCategoryData();
    return () => {
      cancelled = true;
    };
  }, [dataMode]);

  useEffect(() => {
    let cancelled = false;

    const fetchSummary = async () => {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const data = await getAnalyticsSummaryData(
          { rangeStart, rangeEnd },
          dataMode,
        );
        if (cancelled) return;
        setSummary(data);
      } catch (error) {
        console.error("detailed summary load error:", error);
        if (!cancelled) {
          setSummaryError("상세 통계를 불러오는 중 오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) {
          setSummaryLoading(false);
        }
      }
    };

    fetchSummary();
    return () => {
      cancelled = true;
    };
  }, [dataMode, rangeEnd, rangeStart]);

  useEffect(() => {
    let cancelled = false;

    const fetchOfficeAndMeta = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "users"), where("role", "==", "manager")),
        );
        if (cancelled) return;

        const offices = new Set<string>();
        const regions = new Set<string>();
        const teamLeaders = new Set<string>();

        snap.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const office = String(data.office ?? data.branch ?? "").trim();
          const region = String(data.region ?? "").trim();
          const teamLeaderId = String(data.teamLeaderId ?? "").trim();

          if (office) offices.add(office);
          if (region) regions.add(region);
          if (teamLeaderId) teamLeaders.add(teamLeaderId);
        });

        setOfficeOptions(Array.from(offices).sort((a, b) => a.localeCompare(b, "ko")));
        setRegionOptions(Array.from(regions).sort((a, b) => a.localeCompare(b, "ko")));
        setTeamLeaderOptions(
          Array.from(teamLeaders).sort((a, b) => a.localeCompare(b, "ko")),
        );
      } catch (error) {
        console.error("office options load error:", error);
      }
    };

    fetchOfficeAndMeta();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (officeOptions.length === 0) {
      setExplorerOffice("");
      return;
    }

    if (!officeOptions.includes(explorerOffice)) {
      setExplorerOffice(officeOptions[0]);
    }
  }, [officeOptions, explorerOffice]);

  useEffect(() => {
    setExplorerError(null);

    const basePayload: ManagerDashboardRequest = {
      managerUid: "admin-global",
      managerId: "admin-global",
      position: "지역담당",
      startDate: rangeStart,
      endDate: rangeEnd,
    };

    if (explorerMode === "office") {
      if (!explorerOffice) {
        setExplorerError("조회할 사무소를 선택해 주세요.");
        setExplorerPayload(null);
        return;
      }

      setExplorerPayload({
        ...basePayload,
        office: explorerOffice,
        position: "사무소장",
      });
      return;
    }

    setExplorerPayload(basePayload);
  }, [explorerMode, explorerOffice, rangeStart, rangeEnd]);

  useEffect(() => {
    if (!editManager) {
      setEditCategoryActivity([]);
      setEditProductActivity([]);
      setEditActivityError(null);
      setEditActivityLoading(false);
      return;
    }

    let cancelled = false;

    const fetchEditActivity = async () => {
      try {
        setEditActivityLoading(true);
        setEditActivityError(null);

        const [categorySnap, productSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "managerCategoryStats"),
              where("managerUid", "==", editManager.id),
            ),
          ),
          getDocs(
            query(
              collection(db, "managerProductStats"),
              where("managerUid", "==", editManager.id),
            ),
          ),
        ]);

        if (cancelled) return;

        setEditCategoryActivity(
          toDisplayStatRows(
            aggregateStats(
              categorySnap.docs.map((docSnap) => docSnap.data()),
              "type",
              "type",
            ),
            dataMode,
          ),
        );
        setEditProductActivity(
          toDisplayStatRows(
            aggregateStats(
              productSnap.docs.map((docSnap) => docSnap.data()),
              "modelCode",
              "productName",
            ),
            dataMode,
          ),
        );
      } catch (error) {
        console.error("매니저 활동내역 조회 오류:", error);
        if (!cancelled) {
          setEditCategoryActivity([]);
          setEditProductActivity([]);
          setEditActivityError("활동내역을 불러오는 중 오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) {
          setEditActivityLoading(false);
        }
      }
    };

    fetchEditActivity();
    return () => {
      cancelled = true;
    };
  }, [dataMode, editManager]);

  useEffect(() => {
    let cancelled = false;
    if (!editManager) {
      setEditLearningTotals({ views: 0, shares: 0 });
      setEditLearningDetails([]);
      setEditLearningError(null);
      setEditLearningLoading(false);
      return;
    }

    const fetchLearningDetails = async () => {
      setEditLearningLoading(true);
      setEditLearningError(null);
      try {
        const { totals, details } = await fetchManagerLearningDetails(editManager.id);
        if (cancelled) return;
        setEditLearningTotals(toDisplayLearningTotals(totals, dataMode));
        setEditLearningDetails(toDisplayLearningRows(details, dataMode));
      } catch (error) {
        console.error("학습 통계 로딩 오류:", error);
        if (!cancelled) {
          setEditLearningError("학습 활동을 불러오는 중 오류가 발생했습니다.");
          setEditLearningTotals({ views: 0, shares: 0 });
          setEditLearningDetails([]);
        }
      } finally {
        if (!cancelled) {
          setEditLearningLoading(false);
        }
      }
    };

    fetchLearningDetails();
    return () => {
      cancelled = true;
    };
  }, [dataMode, editManager]);

  const handleQuickRange = (key: Exclude<QuickRangeKey, "custom">) => {
    const nextRange = getQuickRange(key, today);
    setQuickRange(key);
    setRangeStart(nextRange.start);
    setRangeEnd(nextRange.end);
  };

  const handleRangeStartChange = (value: string) => {
    if (!value) return;
    setQuickRange("custom");
    if (rangeEnd && value > rangeEnd) {
      setRangeEnd(value);
    }
    setRangeStart(value);
  };

  const handleRangeEndChange = (value: string) => {
    if (!value) return;
    setQuickRange("custom");
    if (rangeStart && value < rangeStart) {
      setRangeStart(value);
    }
    setRangeEnd(value);
  };

  const summaryRangeLabel = useMemo(() => {
    const start = summary?.rangeStart ?? rangeStart;
    const end = summary?.rangeEnd ?? rangeEnd;
    return formatRangeLabel(start, end);
  }, [rangeEnd, rangeStart, summary?.rangeEnd, summary?.rangeStart]);
  const dashboardHref = dataMode === "real" ? "/admin/dashboard-real" : "/admin";

  const topManagers = useMemo(
    () => (summary?.topManagers ?? []).slice(0, 10),
    [summary?.topManagers],
  );

  const topBranches = useMemo(
    () => (summary?.topBranches ?? []).slice(0, 10),
    [summary?.topBranches],
  );

  const handleEditModalFormChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { name, value } = event.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const closeEditModal = () => {
    if (editSaving) return;
    setEditModalOpen(false);
    setEditManager(null);
    setEditFeedback(null);
    setEditFeedbackError(null);
  };

  const openManagerEditModal = async (manager: TopManagerRow) => {
    setManagerDetailsError(null);
    setManagerDetailsLoading(true);

    try {
      const candidateIds = Array.from(
        new Set([manager.id, manager.managerId].filter(Boolean)),
      ) as string[];

      let resolvedDocId = "";
      let resolvedData: Record<string, unknown> | null = null;

      for (const candidateId of candidateIds) {
        const userSnap = await getDoc(doc(db, "users", candidateId));
        if (userSnap.exists()) {
          resolvedDocId = userSnap.id;
          resolvedData = userSnap.data() as Record<string, unknown>;
          break;
        }
      }

      if (!resolvedData && manager.managerId) {
        const byManagerIdSnap = await getDocs(
          query(collection(db, "users"), where("managerId", "==", manager.managerId)),
        );
        if (!byManagerIdSnap.empty) {
          resolvedDocId = byManagerIdSnap.docs[0].id;
          resolvedData = byManagerIdSnap.docs[0].data() as Record<string, unknown>;
        }
      }

      if (!resolvedData && manager.id) {
        const byFallbackManagerIdSnap = await getDocs(
          query(collection(db, "users"), where("managerId", "==", manager.id)),
        );
        if (!byFallbackManagerIdSnap.empty) {
          resolvedDocId = byFallbackManagerIdSnap.docs[0].id;
          resolvedData = byFallbackManagerIdSnap.docs[0].data() as Record<string, unknown>;
        }
      }

      if (!resolvedData || !resolvedDocId) {
        throw new Error("매니저 정보를 찾을 수 없습니다.");
      }

      const summaryData: EditableManager = {
        id: resolvedDocId,
        managerId:
          String(resolvedData.managerId ?? "").trim() ||
          manager.managerId ||
          manager.id,
        name: String(resolvedData.name ?? manager.name ?? "").trim(),
        position: String(resolvedData.position ?? "").trim(),
        office: String(resolvedData.office ?? resolvedData.branch ?? "").trim(),
        region: String(resolvedData.region ?? "").trim(),
        teamLeaderId: String(resolvedData.teamLeaderId ?? "").trim(),
        estimateCount: manager.estimateCount,
        shareCount: 0,
      };

      setEditManager(summaryData);
      setEditForm({
        name: summaryData.name,
        password: "",
        region: summaryData.region,
        office: summaryData.office,
        teamLeaderId: summaryData.teamLeaderId,
      });
      setEditFeedback(null);
      setEditFeedbackError(null);
      setEditModalOpen(true);
    } catch (error) {
      console.error("매니저 상세 정보 로딩 오류:", error);
      setManagerDetailsError("매니저 정보를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setManagerDetailsLoading(false);
    }
  };

  const handleEditModalSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editManager) return;

    const trimmedName = editForm.name.trim();
    if (!trimmedName) {
      setEditFeedbackError("이름을 입력해 주세요.");
      return;
    }

    const updates: Partial<EditableManager> & { password?: string } = {};
    if (trimmedName !== editManager.name) {
      updates.name = trimmedName;
    }
    if (editForm.password.trim()) {
      updates.password = editForm.password.trim();
    }
    if (editForm.region.trim() !== editManager.region) {
      updates.region = editForm.region.trim();
    }
    if (editForm.office.trim() !== editManager.office) {
      updates.office = editForm.office.trim();
    }
    if (editForm.teamLeaderId.trim() !== editManager.teamLeaderId) {
      updates.teamLeaderId = editForm.teamLeaderId.trim();
    }

    if (Object.keys(updates).length === 0) {
      setEditFeedback("변경된 내용이 없습니다.");
      return;
    }

    setEditSaving(true);
    setEditFeedback(null);
    setEditFeedbackError(null);

    try {
      await updateDoc(doc(db, "users", editManager.id), {
        ...(updates.password !== undefined ? { password: updates.password } : {}),
        ...(updates.region !== undefined ? { region: updates.region } : {}),
        ...(updates.office !== undefined ? { office: updates.office } : {}),
        ...(updates.teamLeaderId !== undefined
          ? { teamLeaderId: updates.teamLeaderId }
          : {}),
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        updatedAt: serverTimestamp(),
      });

      const summaryUpdates: Partial<EditableManager> = {};
      if (updates.name !== undefined) summaryUpdates.name = updates.name;
      if (updates.region !== undefined) summaryUpdates.region = updates.region;
      if (updates.office !== undefined) summaryUpdates.office = updates.office;
      if (updates.teamLeaderId !== undefined) {
        summaryUpdates.teamLeaderId = updates.teamLeaderId;
      }

      setEditManager((prev) => (prev ? { ...prev, ...summaryUpdates } : prev));
      setSummary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          topManagers: prev.topManagers.map((item) =>
            item.id === editManager.id || item.managerId === editManager.managerId
              ? {
                  ...item,
                  name: summaryUpdates.name ?? item.name,
                  branch: summaryUpdates.office ?? item.branch,
                }
              : item,
          ),
        };
      });

      setEditForm((prev) => ({ ...prev, password: "" }));
      setEditFeedback("저장되었습니다.");
    } catch (error) {
      console.error("매니저 저장 오류:", error);
      setEditFeedbackError("저장 중 오류가 발생했습니다.");
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <Page>
      <PageHeader>
        <TitleBlock>
          <PageTitle>상세 분석</PageTitle>
          <PageSubTitle>
            메인 대시보드에서 분리한 고비용 조회 영역입니다.
          </PageSubTitle>
        </TitleBlock>
        <BackLink href={dashboardHref}>메인 대시보드로 돌아가기</BackLink>
      </PageHeader>

      <FilterCard>
        <FilterHeader>
          <FilterTitle>조회 기간</FilterTitle>
          <FilterHint>
            {summaryLoading
              ? "상세 통계를 불러오는 중입니다..."
              : `현재 조회 기준: ${summaryRangeLabel}`}
          </FilterHint>
        </FilterHeader>

        <FilterRow>
          <DateInputs>
            <DateInput
              type="date"
              value={rangeStart}
              onChange={(event) => handleRangeStartChange(event.target.value)}
            />
            <RangeSeparator>~</RangeSeparator>
            <DateInput
              type="date"
              value={rangeEnd}
              onChange={(event) => handleRangeEndChange(event.target.value)}
            />
          </DateInputs>

          <QuickButtonGroup>
            <QuickButton
              type="button"
              $active={quickRange === "today"}
              onClick={() => handleQuickRange("today")}
            >
              오늘
            </QuickButton>
            <QuickButton
              type="button"
              $active={quickRange === "week"}
              onClick={() => handleQuickRange("week")}
            >
              1주일
            </QuickButton>
            <QuickButton
              type="button"
              $active={quickRange === "month"}
              onClick={() => handleQuickRange("month")}
            >
              1개월
            </QuickButton>
            <QuickButton
              type="button"
              $active={quickRange === "quarter"}
              onClick={() => handleQuickRange("quarter")}
            >
              3개월
            </QuickButton>
          </QuickButtonGroup>
        </FilterRow>

        {summaryError && <ErrorText>{summaryError}</ErrorText>}
      </FilterCard>

      <SectionCard>
        <SectionHeader>
          <SectionTitle>인기 카테고리</SectionTitle>
          <SectionMeta>누적 기준 상위 10개 카테고리</SectionMeta>
        </SectionHeader>
        <ChartWrap>
          {categoryLoading ? (
            <InfoText>인기 카테고리 데이터를 불러오는 중입니다...</InfoText>
          ) : categoryRows.length === 0 ? (
            <InfoText>표시할 카테고리 데이터가 없습니다.</InfoText>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryRows}
                margin={{ top: 10, right: 18, left: 0, bottom: 8 }}
                barCategoryGap="56%"
                barGap={2}
              >
                <CartesianGrid strokeDasharray="2 2" stroke="#edf2f7" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  interval={0}
                  minTickGap={24}
                  tickFormatter={shortCategoryLabel}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip
                  cursor={{ fill: "rgba(15, 23, 42, 0.03)" }}
                  formatter={(value: number, label: string) => [
                    `${formatNumber(Number(value ?? 0))}건`,
                    label,
                  ]}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #dbe3f1",
                    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.08)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "#475569" }} />
                <Bar
                  dataKey="estimate"
                  name="견적내기"
                  stackId="total"
                  fill="#3157d5"
                  radius={[4, 4, 0, 0]}
                  barSize={10}
                />
                <Bar
                  dataKey="share"
                  name="공유하기"
                  stackId="total"
                  fill="#14b8a6"
                  radius={[4, 4, 0, 0]}
                  barSize={10}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartWrap>
        {categoryError && <ErrorText>{categoryError}</ErrorText>}
      </SectionCard>

      <RankingGrid>
        <SectionCard>
          <SectionHeader>
            <SectionTitle>지난달 상위 지점 TOP 10</SectionTitle>
            <SectionMeta>집계 기준: 기간 내 견적 건수 합산</SectionMeta>
          </SectionHeader>
          {summaryLoading ? (
            <InfoText>상위 지점 데이터를 불러오는 중입니다...</InfoText>
          ) : (
            <RankingTable>
              <tbody>
                {topBranches.map((row, index) => {
                  const branch = resolveBranchMeta(row.name);
                  return (
                    <tr key={`${row.name}-${index}`}>
                      <td>
                        <RankingLeft>
                          <RankBadge>{index + 1}</RankBadge>
                          <BranchLabel $muted={branch.muted}>{branch.label}</BranchLabel>
                          {branch.tag && <WarnTag>{branch.tag}</WarnTag>}
                        </RankingLeft>
                      </td>
                      <td>{formatNumber(row.estimateCount)}건</td>
                    </tr>
                  );
                })}
              </tbody>
            </RankingTable>
          )}
        </SectionCard>

        <SectionCard>
          <SectionHeader>
            <SectionTitle>지난달 상위 매니저 TOP 10</SectionTitle>
            <SectionMeta>매니저명을 클릭하면 정보 수정 모달이 열립니다.</SectionMeta>
          </SectionHeader>
          {managerDetailsLoading && (
            <InlineInfoText>매니저 정보를 불러오는 중입니다...</InlineInfoText>
          )}
          {managerDetailsError && <ErrorText>{managerDetailsError}</ErrorText>}
          {summaryLoading ? (
            <InfoText>상위 매니저 데이터를 불러오는 중입니다...</InfoText>
          ) : (
            <RankingTable>
              <tbody>
                {topManagers.map((row, index) => (
                  <ClickableRow
                    key={`${row.id}-${index}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openManagerEditModal(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openManagerEditModal(row);
                      }
                    }}
                  >
                    <td>
                      <RankingLeft>
                        <RankBadge>{index + 1}</RankBadge>
                        <span>{row.branch}</span>
                        <ManagerNameButton type="button">{row.name}</ManagerNameButton>
                      </RankingLeft>
                    </td>
                    <td>{formatNumber(row.estimateCount)}건</td>
                  </ClickableRow>
                ))}
              </tbody>
            </RankingTable>
          )}
        </SectionCard>
      </RankingGrid>

      <SectionCard>
        <SectionHeader>
          <SectionTitle>조직 조회</SectionTitle>
          <ExplorerControls>
            <Field>
              <FieldLabel htmlFor="explorer-mode">조회 범위</FieldLabel>
              <Select
                id="explorer-mode"
                value={explorerMode}
                onChange={(event) =>
                  setExplorerMode(event.target.value as "all" | "office")
                }
              >
                <option value="all">전체</option>
                <option value="office">사무소</option>
              </Select>
            </Field>

            {explorerMode === "office" && (
              <Field>
                <FieldLabel htmlFor="explorer-office">사무소</FieldLabel>
                <Select
                  id="explorer-office"
                  value={explorerOffice}
                  onChange={(event) => setExplorerOffice(event.target.value)}
                >
                  {officeOptions.length === 0 ? (
                    <option value="">등록된 사무소가 없습니다</option>
                  ) : (
                    officeOptions.map((office) => (
                      <option key={office} value={office}>
                        {office}
                      </option>
                    ))
                  )}
                </Select>
              </Field>
            )}
          </ExplorerControls>
        </SectionHeader>

        {explorerError && <ErrorText>{explorerError}</ErrorText>}

        {explorerPayload ? (
          <OrganizationExplorer
            requestPayload={explorerPayload}
            baseManagerLabel={explorerMode === "office" ? explorerOffice : "전체"}
            title="조직 조회"
            dataMode={dataMode}
          />
        ) : (
          <InfoText>조직 조회 조건을 설정하는 중입니다...</InfoText>
        )}
      </SectionCard>

      {editModalOpen && editManager && (
        <>
          <datalist id="analytics-region-options">
            {regionOptions.map((region) => (
              <option key={region} value={region} />
            ))}
          </datalist>
          <datalist id="analytics-office-options">
            {officeOptions.map((office) => (
              <option key={office} value={office} />
            ))}
          </datalist>
          <datalist id="analytics-teamleader-options">
            {teamLeaderOptions.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>

          <ManagerEditModal
            manager={editManager}
            form={editForm}
            onFormChange={handleEditModalFormChange}
            onSubmit={handleEditModalSave}
            onClose={closeEditModal}
            saving={editSaving}
            feedback={editFeedback}
            feedbackError={editFeedbackError}
            activityLoading={editActivityLoading}
            activityError={editActivityError}
            activityTotals={{
              estimateCount: editManager.estimateCount,
              shareCount: editManager.shareCount,
            }}
            categoryActivity={editCategoryActivity}
            productActivity={editProductActivity}
            regionListId="analytics-region-options"
            officeListId="analytics-office-options"
            teamLeaderListId="analytics-teamleader-options"
            learningTotals={editLearningTotals}
            learningLoading={editLearningLoading}
            learningError={editLearningError}
            learningDetails={editLearningDetails}
          />
        </>
      )}
    </Page>
  );
}

export default function AdminAnalyticsDemoPage() {
  return <AdminAnalyticsPage dataMode="demo" />;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

const Page = styled.div`
  padding: 28px 32px 36px;
  background: #f6f8fb;
  min-height: calc(100vh - 93px);
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
`;

const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const PageTitle = styled.h1`
  font-size: 30px;
  font-weight: 700;
  color: #111827;
`;

const PageSubTitle = styled.p`
  font-size: 14px;
  color: #64748b;
`;

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #1e293b;
  font-size: 13px;
  font-weight: 600;
`;

const FilterCard = styled.section`
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const FilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const FilterTitle = styled.h2`
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
`;

const FilterHint = styled.span`
  font-size: 12px;
  color: #64748b;
`;

const FilterRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const DateInputs = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const DateInput = styled.input`
  height: 38px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  padding: 0 10px;
  font-size: 13px;
  color: #0f172a;
`;

const RangeSeparator = styled.span`
  font-size: 13px;
  color: #64748b;
`;

const QuickButtonGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const QuickButton = styled.button<{ $active: boolean }>`
  height: 34px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #fff;
  padding: 0 14px;
  font-size: 12px;
  color: #334155;
  cursor: pointer;

  ${(props) =>
    props.$active &&
    css`
      border-color: #3157d5;
      background: #e9efff;
      color: #1e3a8a;
      font-weight: 700;
    `}
`;

const SectionCard = styled.section`
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const SectionTitle = styled.h2`
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
`;

const SectionMeta = styled.span`
  font-size: 12px;
  color: #64748b;
`;

const ChartWrap = styled.div`
  width: 100%;
  height: 290px;
`;

const RankingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 1140px) {
    grid-template-columns: 1fr;
  }
`;

const RankingTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  tr {
    border-bottom: 1px solid #e2e8f0;
  }

  tr:last-child {
    border-bottom: none;
  }

  td {
    min-height: 44px;
    padding: 9px 0;
    font-size: 13px;
    color: #334155;
    vertical-align: middle;
  }

  td:last-child {
    text-align: right;
    font-weight: 700;
    color: #0f172a;
    white-space: nowrap;
  }
`;

const ClickableRow = styled.tr`
  cursor: pointer;

  &:hover {
    background: #f8fafc;
  }

  &:focus-visible {
    outline: 2px solid #3157d5;
    outline-offset: -2px;
  }
`;

const RankingLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
`;

const RankBadge = styled.span`
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const BranchLabel = styled.span<{ $muted: boolean }>`
  color: ${(props) => (props.$muted ? "#64748b" : "#1f2937")};
`;

const WarnTag = styled.span`
  height: 20px;
  border-radius: 999px;
  border: 1px solid #f0d0a1;
  background: #fff8ec;
  color: #9a5f00;
  font-size: 10px;
  font-weight: 700;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
`;

const ManagerNameButton = styled.button`
  border: none;
  background: transparent;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
`;

const ExplorerControls = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FieldLabel = styled.label`
  font-size: 12px;
  color: #64748b;
`;

const Select = styled.select`
  min-width: 220px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  padding: 0 10px;
  font-size: 13px;
  color: #0f172a;
`;

const InfoText = styled.div`
  width: 100%;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #64748b;
`;

const InlineInfoText = styled.div`
  font-size: 13px;
  color: #64748b;
`;

const ErrorText = styled.div`
  font-size: 13px;
  color: #dc2626;
`;
