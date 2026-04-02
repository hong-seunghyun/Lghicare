/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import styled, { keyframes, css } from "styled-components";
import { db } from "@/lib/firebase";
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
import type {
  ManagerDashboardRequest,
  ManagerSummary,
} from "@/pages/api/manager/dashboard";
import ManagerEditModal from "@/components/ManagerEditModal";
import OrganizationExplorer from "@/components/OrganizationExplorer";
import {
  fetchManagerLearningDetails,
  LearningActivityRow,
} from "@/lib/learning";

type BarDatum = {
  label: string;
  estimate: number;
  share: number;
};

type DashboardResponse = {
  estimateTypes?: Array<{
    type?: string;
    estimateCount?: number;
    shareCount?: number;
  }>;
  topManagers?: Array<{
    id?: string;
    name?: string;
    branchName?: string;
    estimateCount?: number;
    shareCount?: number;
  }>;
  topBranches?: Array<{
    id?: string;
    name?: string;
    estimateCount?: number;
    shareCount?: number;
  }>;
};

type StatRow = {
  key: string;
  label: string;
  estimateCount: number;
  shareCount: number;
};

type TopManagerItem = {
  id: string;
  branch: string;
  name: string;
  estimateCount: number;
  shareCount: number;
};

type ActivitySummaryManager = {
  id: string;
  name: string;
  branch: string;
  estimateCount: number;
};

type ActivitySummaryBranch = {
  name: string;
  estimateCount: number;
};

type ActivitySummaryType = {
  name: string;
  count: number;
};

type ShareSummary = {
  today: number;
  range: number;
};

type ActivitySummary = {
  totalEstimates: number;
  topManagers: ActivitySummaryManager[];
  topBranches: ActivitySummaryBranch[];
  typeCounts: ActivitySummaryType[];
  dailyCounts: Array<{ date: string; count: number }>;
  rangeStart: string;
  rangeEnd: string;
  shareSummary: ShareSummary;
  todayEstimates: number;
};

const toIsoDateInput = (date: Date) => date.toISOString().slice(0, 10);

const offsetIsoDate = (input: string, offset: number) => {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  parsed.setDate(parsed.getDate() + offset);
  parsed.setHours(0, 0, 0, 0);
  return toIsoDateInput(parsed);
};

const formatRangeLabel = (start: string, end: string) => {
  if (!start && !end) return "조회 기간 미지정";
  if (start === end) return start;
  return `${start} ~ ${end}`;
};

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

export default function AdminDashboardPage() {
  // =========================
  // 1) 더미 데이터
  // =========================
  const [topStats, setTopStats] = useState({
    totalProducts: 0,
    managers: 0,
  });
  const [bestOrders, setBestOrders] = useState<
    Array<{ name: string; count: number }>
  >([]);

  const [bestInquiries, setBestInquiries] = useState<
    Array<{ name: string; count: number }>
  >([]);

  const [topBranches, setTopBranches] = useState<
    Array<{ region: string; name: string; count: number }>
  >([]);
  const [topManagers, setTopManagers] = useState<TopManagerItem[]>([]);
  const topManagersDisplay = useMemo(
    () => topManagers.slice(0, 10),
    [topManagers],
  );
  const today = useMemo(() => new Date(), []);
  const initialStart = useMemo(() => {
    const start = new Date(today);
    start.setMonth(start.getMonth() - 1);
    start.setHours(0, 0, 0, 0);
    return start;
  }, [today]);
  const [rangeStart, setRangeStart] = useState(toIsoDateInput(initialStart));
  const [rangeEnd, setRangeEnd] = useState(toIsoDateInput(today));
  const [activitySummary, setActivitySummary] =
    useState<ActivitySummary | null>(null);
  const [activitySummaryLoading, setActivitySummaryLoading] = useState(true);
  const [activitySummaryError, setActivitySummaryError] = useState<
    string | null
  >(null);
  const [officeOptions, setOfficeOptions] = useState<string[]>([]);
  const [explorerMode, setExplorerMode] = useState<"all" | "office">("all");
  const [explorerOffice, setExplorerOffice] = useState("");
  const [explorerRequestPayload, setExplorerRequestPayload] =
    useState<ManagerDashboardRequest | null>(null);
  const [explorerScopeLabel, setExplorerScopeLabel] = useState<string>("전체");
  const [explorerInfoLoading, setExplorerInfoLoading] = useState(false);
  const [explorerInfoError, setExplorerInfoError] = useState<string | null>(
    null,
  );
  const [orgRangeStart, setOrgRangeStart] = useState(rangeStart);
  const [orgRangeEnd, setOrgRangeEnd] = useState(rangeEnd);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editManager, setEditManager] = useState<ManagerSummary | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    password: "",
    region: "",
    office: "",
    teamLeaderId: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editFeedback, setEditFeedback] = useState<string | null>(null);
  const [editFeedbackError, setEditFeedbackError] = useState<string | null>(
    null,
  );
  const [editActivityLoading, setEditActivityLoading] = useState(false);
  const [editActivityError, setEditActivityError] = useState<string | null>(
    null,
  );
  const [editCategoryActivity, setEditCategoryActivity] = useState<StatRow[]>(
    [],
  );
  const [editProductActivity, setEditProductActivity] = useState<StatRow[]>([]);
  const [editLearningTotals, setEditLearningTotals] = useState({
    views: 0,
    shares: 0,
  });
  const [editLearningLoading, setEditLearningLoading] = useState(false);
  const [editLearningError, setEditLearningError] = useState<string | null>(
    null,
  );
  const [editLearningDetails, setEditLearningDetails] = useState<
    LearningActivityRow[]
  >([]);
  const [managerDetailsLoading, setManagerDetailsLoading] = useState(false);
  const [managerDetailsError, setManagerDetailsError] = useState<string | null>(
    null,
  );
  const [barData, setBarData] = useState<BarDatum[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchSummary = async () => {
      setActivitySummaryLoading(true);
      setActivitySummaryError(null);
      setActivitySummary(null);
      try {
        const fallbackStart = toIsoDateInput(initialStart);
        const fallbackEnd = toIsoDateInput(today);
        const startParam = rangeStart || fallbackStart;
        const endParam = rangeEnd || fallbackEnd;
        const response = await fetch(
          `/api/admin/activity-summary?start=${encodeURIComponent(
            startParam,
          )}&end=${encodeURIComponent(endParam)}`,
        );
        if (!response.ok) {
          throw new Error("activity summary load failed");
        }
        const data = (await response.json()) as ActivitySummary;
        if (cancelled) return;
        setActivitySummary(data);
        setBestOrders(
          data.typeCounts.slice(0, 5).map((row) => ({
            name: row.name,
            count: row.count,
          })),
        );
        setTopManagers(
          data.topManagers.map((manager) => ({
            id: manager.id,
            branch: manager.branch || "지점",
            name: manager.name,
            estimateCount: manager.estimateCount,
            shareCount: 0,
          })),
        );
        setTopBranches(
          data.topBranches.slice(0, 10).map((branch) => ({
            region: "지점",
            name: branch.name,
            count: branch.estimateCount,
          })),
        );
      } catch (error) {
        console.error("activity summary load error:", error);
        if (cancelled) return;
        setActivitySummaryError(
          "활동 데이터를 불러오는 중 오류가 발생했습니다.",
        );
      } finally {
        if (!cancelled) {
          setActivitySummaryLoading(false);
        }
      }
    };

    fetchSummary();

    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEnd, initialStart, today]);

  useEffect(() => {
    let cancelled = false;
    const fetchOffices = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "users"), where("role", "==", "manager")),
        );
        if (cancelled) return;
        const offices = Array.from(
          new Set(
            snap.docs
              .map((docSnap) => {
                const data = docSnap.data() as any;
                return String(data.office ?? data.branch ?? "").trim();
              })
              .filter((office) => office),
          ),
        ).sort();
        setOfficeOptions(offices);
      } catch (error) {
        console.error("사무소 옵션 로딩 오류:", error);
      }
    };
    fetchOffices();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setExplorerInfoError(null);
    setExplorerInfoLoading(true);
    setExplorerRequestPayload(null);

    const fallbackStart = toIsoDateInput(initialStart);
    const fallbackEnd = toIsoDateInput(today);
    const startParam = orgRangeStart || fallbackStart;
    const endParam = orgRangeEnd || fallbackEnd;
    const basePayload: ManagerDashboardRequest = {
      managerUid: "admin-global",
      managerId: "admin-global",
      position: "지역담당",
      startDate: startParam,
      endDate: endParam,
    };

    if (explorerMode === "office") {
      if (!officeOptions.length) {
        setExplorerInfoError("사무소 목록을 불러오는 중입니다.");
        setExplorerInfoLoading(false);
        return;
      }
      if (!explorerOffice) {
        setExplorerInfoError("조회할 사무소를 선택해 주세요.");
        setExplorerInfoLoading(false);
        return;
      }
      setExplorerScopeLabel(explorerOffice);
      setExplorerRequestPayload({
        ...basePayload,
        office: explorerOffice,
        position: "사무소장",
      });
      setExplorerInfoLoading(false);
      return;
    }

    setExplorerScopeLabel("전체");
    setExplorerRequestPayload(basePayload);
    setExplorerInfoLoading(false);
  }, [
    explorerMode,
    explorerOffice,
    officeOptions,
    orgRangeStart,
    orgRangeEnd,
    initialStart,
    today,
  ]);

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
    if (officeOptions.length === 0) {
      setExplorerOffice("");
      return;
    }
    if (!officeOptions.includes(explorerOffice)) {
      setExplorerOffice(officeOptions[0]);
    }
  }, [officeOptions, explorerOffice]);
  useEffect(() => {
    let cancelled = false;

    const fetchAnalytics = async () => {
      try {
        setAnalyticsLoading(true);
        setAnalyticsError(null);

        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) {
          throw new Error(`Failed to load dashboard analytics (${res.status})`);
        }

        const data = (await res.json()) as DashboardResponse;
        if (cancelled) return;

        const estimateTypes = Array.isArray(data.estimateTypes)
          ? data.estimateTypes
          : [];
        const mappedBars: BarDatum[] = estimateTypes
          .map((row) => ({
            label: String(row.type ?? "unknown"),
            estimate: Number(row.estimateCount ?? 0),
            share: Number(row.shareCount ?? 0),
          }))
          .filter((row) => row.estimate > 0 || row.share > 0)
          .slice(0, 10);

        const mappedBestInquiries = mappedBars
          .map((row) => ({ name: row.label, count: row.share }))
          .filter((row) => row.count > 0)
          .slice(0, 5);

        setBarData(mappedBars);
        setBestInquiries(mappedBestInquiries);
      } catch (err) {
        console.error("Admin dashboard analytics error:", err);
        if (!cancelled) {
          setAnalyticsError("애널리틱스 데이터를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    };

    fetchAnalytics();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleEditModalFormChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { name, value } = event.target;
    setEditForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const openManagerEditModal = async (manager: TopManagerItem) => {
    setManagerDetailsError(null);
    setManagerDetailsLoading(true);
    try {
      if (!manager.id) {
        throw new Error("매니저 ID가 없습니다.");
      }
      const userSnap = await getDoc(doc(db, "users", manager.id));
      if (!userSnap.exists()) {
        throw new Error("매니저 정보를 찾을 수 없습니다.");
      }
      const data = userSnap.data() as any;
      const summary: ManagerSummary = {
        id: manager.id,
        managerId: String(data.managerId ?? ""),
        name: String(data.name ?? manager.name ?? ""),
        position: String(data.position ?? ""),
        office: String(data.office ?? data.branch ?? ""),
        region: String(data.region ?? ""),
        teamLeaderId: String(data.teamLeaderId ?? ""),
        estimateCount: manager.estimateCount,
        shareCount: manager.shareCount,
      };
      setEditManager(summary);
      setEditForm({
        name: summary.name,
        password: "",
        region: summary.region,
        office: summary.office,
        teamLeaderId: summary.teamLeaderId,
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

  const handleExplorerManagerSelect = (manager: ManagerSummary) => {
    openManagerEditModal({
      id: manager.id,
      branch:
        manager.office ||
        manager.region ||
        manager.teamLeaderId ||
        "사무소 미정",
      name: manager.name,
      estimateCount: manager.estimateCount,
      shareCount: manager.shareCount,
    });
  };

  const handleRangeStartInputChange = (value: string) => {
    if (!value) return;
    if (rangeEnd && new Date(value) > new Date(rangeEnd)) {
      setRangeEnd(value);
    }
    setRangeStart(value);
  };

  const handleRangeEndInputChange = (value: string) => {
    if (!value) return;
    if (rangeStart && new Date(value) < new Date(rangeStart)) {
      setRangeStart(value);
    }
    setRangeEnd(value);
  };

  const handleOrgRangeStartChange = (value: string) => {
    if (!value) return;
    if (orgRangeEnd && new Date(value) > new Date(orgRangeEnd)) {
      setOrgRangeEnd(value);
    }
    setOrgRangeStart(value);
  };

  const handleOrgRangeEndChange = (value: string) => {
    if (!value) return;
    if (orgRangeStart && new Date(value) < new Date(orgRangeStart)) {
      setOrgRangeStart(value);
    }
    setOrgRangeEnd(value);
  };

  const todayCount = activitySummary?.todayEstimates ?? 0;
  const shareSummary = activitySummary?.shareSummary;
  const shareTodayCount = shareSummary?.today ?? 0;
  const shareRangeCount = shareSummary?.range ?? 0;
  const summaryRangeLabel = formatRangeLabel(rangeStart, rangeEnd);
  const orgRangeLabel = formatRangeLabel(orgRangeStart, orgRangeEnd);

  const closeEditModal = () => {
    if (editSaving) return;
    setEditModalOpen(false);
    setEditManager(null);
    setEditFeedback(null);
    setEditFeedbackError(null);
  };

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
          aggregateStats(
            categorySnap.docs.map((docSnap) => docSnap.data()),
            "type",
            "type",
          ),
        );
        setEditProductActivity(
          aggregateStats(
            productSnap.docs.map((docSnap) => docSnap.data()),
            "modelCode",
            "productName",
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
  }, [editManager]);

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
        const { totals, details } = await fetchManagerLearningDetails(
          editManager.id,
        );
        if (cancelled) return;
        setEditLearningTotals(totals);
        setEditLearningDetails(details);
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
  }, [editManager]);

  const handleEditModalSave = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!editManager) return;

    const trimmedName = editForm.name.trim();
    if (!trimmedName) {
      setEditFeedbackError("이름을 입력해 주세요.");
      return;
    }

    const updates: Partial<ManagerSummary> & { password?: string } = {};
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
        ...("password" in updates ? { password: updates.password } : {}),
        ...(updates.region !== undefined ? { region: updates.region } : {}),
        ...(updates.office !== undefined ? { office: updates.office } : {}),
        ...(updates.teamLeaderId !== undefined
          ? { teamLeaderId: updates.teamLeaderId }
          : {}),
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        updatedAt: serverTimestamp(),
      });

      const summaryUpdates: Partial<ManagerSummary> = {};
      if (updates.name !== undefined) summaryUpdates.name = updates.name;
      if (updates.region !== undefined) summaryUpdates.region = updates.region;
      if (updates.office !== undefined) summaryUpdates.office = updates.office;
      if (updates.teamLeaderId !== undefined) {
        summaryUpdates.teamLeaderId = updates.teamLeaderId;
      }

      setEditManager((prev) => (prev ? { ...prev, ...summaryUpdates } : prev));

      setTopManagers((prev) =>
        prev.map((item) =>
          item.id === editManager.id
            ? { ...item, name: summaryUpdates.name ?? item.name }
            : item,
        ),
      );
      setEditForm((prev) => ({ ...prev, password: "" }));
      setEditFeedback("저장되었습니다.");
    } catch (error) {
      console.error("매니저 저장 오류:", error);
      setEditFeedbackError("저장 중 오류가 발생했습니다.");
    } finally {
      setEditSaving(false);
    }
  };

  // =========================
  useEffect(() => {
    let cancelled = false;

    const fetchOverview = async () => {
      try {
        const res = await fetch("/api/admin/overview");
        if (!res.ok) {
          throw new Error(`Failed to load overview (${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;

        setTopStats({
          totalProducts: Number(data?.topStats?.totalProducts ?? 0),
          managers: Number(data?.topStats?.managers ?? 0),
        });
      } catch (err) {
        console.error("Admin overview error:", err);
      }
    };

    fetchOverview();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2) 그래프 애니메이션 + 툴팁
  // =========================
  const [chartMounted, setChartMounted] = useState(false);

  useEffect(() => {
    // 첫 진입시에만 "위로 올라오는" 애니메이션 트리거
    const t = requestAnimationFrame(() => setChartMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const maxValue = useMemo(() => {
    let m = 1;
    for (const d of barData) m = Math.max(m, d.estimate + d.share);
    return m;
  }, [barData]);

  const maxTick = useMemo(() => {
    const step = 1000;
    return Math.max(step, Math.ceil(maxValue / step) * step);
  }, [maxValue]);

  const yTicks = useMemo(() => {
    const step = 1000;
    const arr: number[] = [];
    for (let v = 0; v <= maxTick; v += step) arr.push(v);
    return arr;
  }, [maxTick]);

  type TooltipState =
    | {
        visible: true;
        x: number;
        y: number;
        label: string;
        estimate: number;
        share: number;
        total: number;
      }
    | { visible: false };

  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false });
  const rafRef = useRef<number | null>(null);
  const chartWrapRef = useRef<HTMLDivElement | null>(null);

  const showTooltip = useCallback((e: React.MouseEvent, d: BarDatum) => {
    const clientX = e.clientX;
    const clientY = e.clientY;

    const update = () => {
      const wrapEl = chartWrapRef.current;
      if (!wrapEl) {
        rafRef.current = null;
        return;
      }

      const wrapRect = wrapEl.getBoundingClientRect();
      const x = clientX - wrapRect.left;
      const y = clientY - wrapRect.top;

      setTooltip({
        visible: true,
        x,
        y,
        label: d.label,
        estimate: d.estimate,
        share: d.share,
        total: d.estimate + d.share,
      });

      rafRef.current = null;
    };

    if (rafRef.current == null) rafRef.current = requestAnimationFrame(update);
  }, []);

  const hideTooltip = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setTooltip({ visible: false });
  }, []);

  // =========================
  // 3) 렌더
  // =========================
  return (
    <Page>
      <TopHero>
        <HeroTitle>
          대시보드
          <p
            style={{
              fontSize: "10px",
              fontWeight: "normal",
              marginTop: "8px",
              color: "#ddd",
            }}
          >
            해당 대시보드 값은 측정 중인 부분이 있어 부정확할 수 있습니다.
          </p>
        </HeroTitle>

        <HeroRow>
          <HeroStatCard>
            <HeroStatLabel>총 제품 수</HeroStatLabel>
            <HeroFlex>
              <HeroStatValue>
                {formatNumber(topStats.totalProducts)}
              </HeroStatValue>
              <HeroStatUnit>개</HeroStatUnit>
            </HeroFlex>
          </HeroStatCard>

          <HeroStatCard>
            <HeroStatLabel>총 매니저 수</HeroStatLabel>
            <HeroFlex>
              <HeroStatValue>{formatNumber(topStats.managers)}</HeroStatValue>
              <HeroStatUnit>명</HeroStatUnit>
            </HeroFlex>
          </HeroStatCard>
        </HeroRow>
      </TopHero>

      <Content>
        <DateRangeSection>
          <DateRangeLabel>조회 기간</DateRangeLabel>
          <DateRangeControls>
            <DateInput
              type="date"
              value={rangeStart}
              onChange={(event) =>
                handleRangeStartInputChange(event.target.value)
              }
            />
            <span>~</span>
            <DateInput
              type="date"
              value={rangeEnd}
              onChange={(event) =>
                handleRangeEndInputChange(event.target.value)
              }
            />
          </DateRangeControls>
          <DateRangeHint>
            {activitySummaryLoading
              ? "범위 데이터를 불러오는 중입니다..."
              : `현재 조회 기준: ${summaryRangeLabel}`}
          </DateRangeHint>
          {activitySummaryError && (
            <ErrorText>{activitySummaryError}</ErrorText>
          )}
        </DateRangeSection>
        <CardHeader>
          <CardTitle>견적내기 / 공유하기</CardTitle>
        </CardHeader>

        <Grid4>
          <SmallCard>
            <SmallKpi>
              <SmallKpiLabel>오늘 견적 수</SmallKpiLabel>
              <HeroFlex>
                <SmallKpiValue>
                  {activitySummaryLoading ? "..." : formatNumber(todayCount)}
                </SmallKpiValue>
                <SmallKpiUnit>건</SmallKpiUnit>
              </HeroFlex>
              <SmallKpiMeta>견적 수는 실시간 집계 기준입니다.</SmallKpiMeta>
            </SmallKpi>
          </SmallCard>

          <SmallCard>
            <SmallKpi>
              <SmallKpiLabel>기간 내 견적 수</SmallKpiLabel>
              <HeroFlex>
                <SmallKpiValue>
                  {activitySummaryLoading
                    ? "..."
                    : formatNumber(activitySummary?.totalEstimates ?? 0)}
                </SmallKpiValue>
                <SmallKpiUnit>건</SmallKpiUnit>
              </HeroFlex>
              <SmallKpiMeta>{`기간: ${summaryRangeLabel}`}</SmallKpiMeta>
            </SmallKpi>
          </SmallCard>

          <SmallCard>
            <SmallKpi>
              <SmallKpiLabel>오늘 공유 수</SmallKpiLabel>
              <HeroFlex>
                <SmallKpiValue>
                  {activitySummaryLoading ? "..." : formatNumber(shareTodayCount)}
                </SmallKpiValue>
                <SmallKpiUnit>건</SmallKpiUnit>
              </HeroFlex>
              <SmallKpiMeta>공유 수는 Firebase shareCount 기준입니다.</SmallKpiMeta>
            </SmallKpi>
          </SmallCard>

          <SmallCard>
            <SmallKpi>
              <SmallKpiLabel>기간 내 공유 수</SmallKpiLabel>
              <HeroFlex>
                <SmallKpiValue>
                  {activitySummaryLoading ? "..." : formatNumber(shareRangeCount)}
                </SmallKpiValue>
                <SmallKpiUnit>건</SmallKpiUnit>
              </HeroFlex>
              <SmallKpiMeta>{`기간: ${summaryRangeLabel}`}</SmallKpiMeta>
            </SmallKpi>
          </SmallCard>
        </Grid4>

        <Grid2>
          <Card>
            <CardHeader>
              <CardTitle>견적내기 BEST 5 상품</CardTitle>
              <CardRight>
                {activitySummaryLoading
                  ? "집계 기준 로딩 중..."
                  : `집계 기준: ${summaryRangeLabel}`}
              </CardRight>
            </CardHeader>

            <Table>
              <TBody>
                {bestOrders.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{formatNumber(r.count)}건</td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>공유하기 BEST 5 상품</CardTitle>
              <CardRight>
                {activitySummaryLoading
                  ? "집계 기준 로딩 중..."
                  : `집계 기준: ${summaryRangeLabel}`}
              </CardRight>
            </CardHeader>

            <Table>
              <TBody>
                {bestInquiries.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{formatNumber(r.count)}건</td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </Card>
        </Grid2>
        {editModalOpen && editManager && (
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
            learningTotals={editLearningTotals}
            learningLoading={editLearningLoading}
            learningError={editLearningError}
            learningDetails={editLearningDetails}
            regionListId="dashboard-region-options"
            officeListId="dashboard-office-options"
            teamLeaderListId="dashboard-teamleader-options"
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              인기 카테고리
              <ChartDesc>
                2026년 기준 가장 많은 카테고리 기준으로 비율이 표시됩니다.
              </ChartDesc>
            </CardTitle>

            <Legend>
              <LegendItem>
                <LegendDot $variant="estimate" />
                <span>견적내기</span>
              </LegendItem>
              <LegendItem>
                <LegendDot $variant="share" />
                <span>공유하기</span>
              </LegendItem>
            </Legend>
          </CardHeader>

          {analyticsLoading && (
            <CardFootNote>애널리틱스 로딩 중...</CardFootNote>
          )}
          {analyticsError && !analyticsLoading && (
            <CardFootNote>{analyticsError}</CardFootNote>
          )}

          <ChartWrap
            ref={chartWrapRef}
            $mounted={chartMounted}
            onMouseLeave={hideTooltip}
            role="figure"
            aria-label="인기 카테고리 스택 차트"
          >
            {/* ✅ Y축 + 플롯 영역(그리드/막대) */}
            <ChartGrid>
              <YAxis>
                {yTicks
                  .slice()
                  .reverse()
                  .map((t) => (
                    <YAxisTick key={t}>{formatNumber(t)}</YAxisTick>
                  ))}
              </YAxis>

              <Plot>
                {/* ✅ 막대가 시작하는 영역(0라인 포함) */}
                <BarStage>
                  {/* ✅ 가로 그리드 */}
                  <GridLines aria-hidden>
                    {yTicks
                      .slice()
                      .reverse()
                      .map((t) => {
                        const pct = maxTick === 0 ? 0 : (t / maxTick) * 100;
                        return (
                          <GridLine key={t} style={{ bottom: `${pct}%` }} />
                        );
                      })}
                  </GridLines>

                  {/* ✅ 막대들 (0라인=BarStage 바닥에서 시작) */}
                  <BarsRow>
                    {barData.map((d) => {
                      const total = d.estimate + d.share;

                      // ✅ 3) 막대 끝 비율 정확히 맞추기 (maxTick 기준)
                      const totalH =
                        maxTick === 0 ? 0 : (total / maxTick) * 100;

                      // ✅ 스택 내부 비율(합=100)
                      const estimatePct =
                        total === 0 ? 0 : (d.estimate / total) * 100;
                      const sharePct = Math.max(0, 100 - estimatePct);

                      return (
                        <BarGroup
                          key={d.label}
                          onMouseMove={(e) => showTooltip(e, d)}
                          onMouseEnter={(e) => showTooltip(e, d)}
                        >
                          {/* ✅ 막대 래퍼 자체가 0라인에서 시작 */}
                          <BarWrap style={{ height: `${totalH}%` }}>
                            {/* ✅ 4) 수치값은 막대 끝(상단)에 붙이기 */}
                            <BarTopValue>{formatNumber(total)}</BarTopValue>

                            <StackBar $mounted={chartMounted}>
                              {/* ✅ 2) 아래=견적 / 위=공유 유지 */}
                              <Segment
                                $variant="estimate"
                                $mounted={chartMounted}
                                style={{ height: `${estimatePct}%` }}
                              />
                              <Segment
                                $variant="share"
                                $mounted={chartMounted}
                                style={{ height: `${sharePct}%` }}
                              />
                            </StackBar>
                          </BarWrap>
                        </BarGroup>
                      );
                    })}
                  </BarsRow>
                </BarStage>

                {/* ✅ 1) X 라벨은 0라인(BarStage 바닥) 아래로 */}
                <XAxis>
                  {barData.map((d) => (
                    <XAxisLabel key={d.label} title={d.label}>
                      {d.label}
                    </XAxisLabel>
                  ))}
                </XAxis>
              </Plot>
            </ChartGrid>

            {tooltip.visible && (
              <Tooltip style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>
                <TooltipTitle>{tooltip.label}</TooltipTitle>

                <TooltipRow>
                  <TooltipKey>
                    <LegendDot $variant="estimate" />
                    견적내기
                  </TooltipKey>
                  <b>{formatNumber(tooltip.estimate)}</b>
                </TooltipRow>

                <TooltipRow>
                  <TooltipKey>
                    <LegendDot $variant="share" />
                    공유하기
                  </TooltipKey>
                  <b>{formatNumber(tooltip.share)}</b>
                </TooltipRow>

                <TooltipDivider />

                <TooltipRow>
                  <TooltipKey>합계</TooltipKey>
                  <b>{formatNumber(tooltip.total)}</b>
                </TooltipRow>
              </Tooltip>
            )}
          </ChartWrap>
        </Card>

        <Grid2>
          <Card>
            <CardHeader>
              <CardTitle>지난 달 상위 지점 TOP 10</CardTitle>
              <CardRight>
                {activitySummaryLoading
                  ? "집계 기준 로딩 중..."
                  : `집계 기준: ${summaryRangeLabel}`}
              </CardRight>
            </CardHeader>

            <Table>
              <TBody>
                {topBranches.map((r, idx) => (
                  <tr key={`${r.region}-${r.name}-${idx}`}>
                    <td>
                      <Top10Left>
                        <Tag>{r.region}</Tag>
                        <span>{r.name}</span>
                      </Top10Left>
                    </td>
                    <td>{formatNumber(r.count)}건</td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>지난 달 상위 매니저 TOP 10</CardTitle>
              <CardRight>
                {activitySummaryLoading
                  ? "집계 기준 로딩 중..."
                  : `집계 기준: ${summaryRangeLabel}`}
              </CardRight>
            </CardHeader>

            {managerDetailsLoading && (
              <InfoText>매니저 정보를 불러오는 중입니다...</InfoText>
            )}
            {managerDetailsError && (
              <ErrorText>{managerDetailsError}</ErrorText>
            )}

            <Table>
              <TBody>
                {topManagersDisplay.map((r, idx) => (
                  <ClickableRow
                    key={`${r.branch}-${r.name}-${idx}`}
                    role="button"
                    onClick={() => openManagerEditModal(r)}
                  >
                    <td>
                      <Top10Left>
                        <span>{r.branch}</span>
                        <b>{r.name}</b>
                      </Top10Left>
                    </td>
                    <td>{formatNumber(r.estimateCount + r.shareCount)}건</td>
                  </ClickableRow>
                ))}
              </TBody>
            </Table>
          </Card>
        </Grid2>
        <ExplorerPanel>
          <ExplorerPanelHeader>
            <ExplorerPanelTitle>조직 조회</ExplorerPanelTitle>
            <ExplorerPanelControls>
              <ExplorerPanelField>
                <ExplorerPanelLabel htmlFor="explorer-mode">
                  조회 범위
                </ExplorerPanelLabel>
                <ExplorerPanelSelect
                  id="explorer-mode"
                  value={explorerMode}
                  onChange={(event) =>
                    setExplorerMode(event.target.value as "all" | "office")
                  }
                >
                  <option value="all">전체</option>
                  <option value="office">사무소</option>
                </ExplorerPanelSelect>
              </ExplorerPanelField>
              {explorerMode === "office" && (
                <ExplorerPanelField>
                  <ExplorerPanelLabel htmlFor="explorer-office">
                    사무소
                  </ExplorerPanelLabel>
                  <ExplorerPanelSelect
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
                  </ExplorerPanelSelect>
                </ExplorerPanelField>
              )}
            </ExplorerPanelControls>
          </ExplorerPanelHeader>
          {explorerInfoError && <ErrorText>{explorerInfoError}</ErrorText>}
          <ExplorerDateSection>
            <ExplorerDateControls>
              <ExplorerDateInput
                type="date"
                value={orgRangeStart}
                onChange={(event) =>
                  handleOrgRangeStartChange(event.target.value)
                }
              />
              <span>~</span>
              <ExplorerDateInput
                type="date"
                value={orgRangeEnd}
                onChange={(event) =>
                  handleOrgRangeEndChange(event.target.value)
                }
              />
            </ExplorerDateControls>
            <ExplorerDateHint>{`조회 기준: ${orgRangeLabel}`}</ExplorerDateHint>
          </ExplorerDateSection>
          {explorerRequestPayload ? (
            <OrganizationExplorer
              requestPayload={explorerRequestPayload}
              onManagerSelect={handleExplorerManagerSelect}
              baseManagerLabel={explorerScopeLabel}
              title="조직 조회"
            />
          ) : (
            <InfoText>
              {explorerInfoLoading
                ? "조직 조건을 정리하는 중입니다..."
                : "조회 조건을 선택하면 조직 정보를 확인할 수 있습니다."}
            </InfoText>
          )}
        </ExplorerPanel>
      </Content>
    </Page>
  );
}

// =========================
// Utils
// =========================
function formatNumber(n: number) {
  return new Intl.NumberFormat("ko-KR").format(n);
}

// =========================
// Styled Components (신규 페이지 전용)
// =========================

const Page = styled.div`
  width: 100%;
`;

const TopHero = styled.div`
  background: #6162bf;
  color: #fff;
  padding: 40px 35px;
`;

const HeroTitle = styled.div`
  font-size: 34px;
  font-weight: bold;
  margin-bottom: 75px;
  color: #fff;
`;

const HeroRow = styled.div`
  display: flex;
  align-items: center;
  gap: 35px;
  @media (max-width: 1400px) {
    flex-wrap: wrap;
  }
`;

const HeroStatCard = styled.div`
  background: rgba(255, 255, 255, 0.15);
  border-radius: 25px;
  color: #fff;
  padding: 15px 20px 30px;
  color: #fff;
  min-width: 330px;
  @media (max-width: 1400px) {
    width: calc(50% - 17.5px);
    min-width: initial;
  }
`;

const HeroStatLabel = styled.div`
  font-size: 22px;
  color: #fff;
`;

const HeroStatValue = styled.div`
  font-size: 80px;
  font-weight: bold;
  color: #fff;
  line-height: 1;
`;

const HeroStatUnit = styled.div`
  font-size: 22px;
  font-weight: bold;
  color: #fff;
`;

const HeroFlex = styled.div`
  display: flex;
  align-items: end;
  gap: 5px;
  justify-content: start;
  margin-top: 30px;
  margin-bottom: 10px;
`;

const Content = styled.div`
  padding: 0px 35px 40px;
`;

const Grid2 = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 55px;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`;

const Grid4 = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 55px;

  @media (max-width: 960px) {
    grid-template-columns: 1fr 1fr;
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.div`
  background: #fff;
  border-radius: 10px;
`;

const SmallCard = styled(Card)``;

const CardHeader = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 22px;
  margin-top: 75px;
`;

const DateRangeSection = styled.div`
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 40px 0px 20px;
`;

const DateRangeLabel = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #1f2933;
`;

const DateRangeControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const DateInput = styled.input`
  border-radius: 10px;
  border: 1px solid #d9e2ec;
  padding: 6px 10px;
  font-size: 13px;
  background: #fff;
  color: #1f2933;
  height: 36px;
`;

const DateRangeHint = styled.div`
  font-size: 12px;
  color: #6b7280;
`;

const CardTitle = styled.div`
  font-size: 22px;
  font-weight: 500;
  color: #000;
`;

const CardRight = styled.div`
  font-size: 14px;
  color: #7b7b7b;
  white-space: nowrap;
`;

const Split2 = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 35px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const SmallKpi = styled.div`
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 18px;
`;

const SmallKpiMeta = styled.span`
  font-size: 11px;
  color: #9aa5b1;
  margin-top: 6px;
`;

const SmallKpiLabel = styled.div`
  font-size: 22px;
  color: #000;
`;

const SmallKpiValue = styled.div`
  font-size: 60px;
  font-weight: bold;
  line-height: 1.05;
`;

const SmallKpiUnit = styled.div`
  font-size: 22px;
  font-weight: bold;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  border-spacing: 12px;

  tr {
    border: 1px solid #ddd;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    height: 50px;
  }
`;

const THead = styled.thead`
  th {
    text-align: left;
    font-size: 11px;
    color: #7a8296;
    padding: 10px 8px;
    border-bottom: 1px solid #ddd;
    font-weight: 800;
  }

  th:last-child {
    text-align: right;
  }
`;

const TBody = styled.tbody`
  td {
    font-size: 12px;
    color: #151922;
    padding: 10px 8px;
    border-bottom: 1px solid #f2f4f8;
    display: flex;
    align-items: center;
  }

  td:last-child {
    text-align: right;
    font-weight: 900;
  }

  tr:last-child td {
    border-bottom: none;
  }
`;

const Legend = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const LegendItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #7a8296;
  font-weight: 800;
`;

const LegendDot = styled.span<{ $variant: "estimate" | "share" }>`
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-block;

  ${(p) =>
    p.$variant === "estimate" &&
    css`
      background: #5c5cc8; /* 아래(견적내기) */
    `}
  ${(p) =>
    p.$variant === "share" &&
    css`
      background: #b8b8ff; /* 위(공유하기) */
    `}
`;

const StackBar = styled.div<{ $mounted: boolean }>`
  width: 45px;
  height: 100%;
  border-radius: 0px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  transform-origin: bottom;
  transition: transform 420ms ease;
  will-change: transform;

  ${(p) =>
    !p.$mounted &&
    css`
      transform: translateY(10px);
    `}
`;

const Segment = styled.div<{
  $variant: "estimate" | "share";
  $mounted: boolean;
}>`
  width: 100%;
  transform-origin: bottom;
  transition: height 420ms ease;
  will-change: height;

  ${(p) =>
    p.$variant === "estimate" &&
    css`
      background: #5c5cc8; /* 아래(견적내기) */
    `}
  ${(p) =>
    p.$variant === "share" &&
    css`
      background: #b8b8ff; /* 위(공유하기) */
    `}

  /* 첫 진입 시 살짝 올라오는 느낌 */
  ${(p) =>
    !p.$mounted &&
    css`
      height: 2%;
    `}
`;

const riseIn = keyframes`
  from {
    transform: translateY(16px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

const ChartWrap = styled.div<{ $mounted: boolean }>`
  position: relative;
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 40px 20px 20px;
  min-height: 260px;
  background: #fff;

  ${(p) =>
    p.$mounted &&
    css`
      animation: ${riseIn} 420ms ease both;
    `}
`;

const TooltipDivider = styled.div`
  height: 1px;
  background: rgba(255, 255, 255, 0.14);
  margin: 8px 0 4px;
`;

const ChartDesc = styled.div`
  margin-bottom: 10px;
  font-size: 12px;
  color: #7a8296;
`;

const ChartGrid = styled.div`
  display: grid;
  grid-template-columns: 46px 1fr;
  gap: 10px;
  align-items: stretch;
`;

const YAxis = styled.div`
  height: 220px; /* ✅ BarStage와 동일 */
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const YAxisTick = styled.div`
  font-size: 11px;
  color: #7a8296;
  text-align: right;
  line-height: 1;
`;

const GridLine = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: #eceff6;
`;

const BarLabel = styled.div`
  font-size: 12px;
  color: #7a8296;
  font-weight: 800;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Bars = styled.div`
  height: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  align-items: end;
`;

const Bar = styled.div<{ $variant: "desktop" | "mobile"; $mounted: boolean }>`
  width: 100%;
  border-radius: 8px 8px 4px 4px;
  transform-origin: bottom;
  transition:
    transform 420ms ease,
    height 420ms ease;
  will-change: transform, height;

  ${(p) =>
    p.$variant === "desktop" &&
    css`
      background: #5c5cc8;
    `}
  ${(p) =>
    p.$variant === "mobile" &&
    css`
      background: #b8b8ff;
    `}

  ${(p) =>
    !p.$mounted &&
    css`
      transform: scaleY(0.08);
    `}
`;

const Tooltip = styled.div`
  position: absolute;
  z-index: 10;
  min-width: 150px;
  border-radius: 10px;
  padding: 10px 10px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
  pointer-events: none;
`;

const TooltipTitle = styled.div`
  font-size: 12px;
  font-weight: 900;
  margin-bottom: 8px;
`;

const TooltipRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  margin-top: 6px;

  b {
    font-weight: 900;
  }
`;

const TooltipKey = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0.92;
`;

const CardFootNote = styled.div`
  margin-top: 10px;
  font-size: 11px;
  color: #7a8296;
`;

const PlotArea = styled.div`
  position: relative;
`;

const BarArea = styled.div`
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  align-items: end;
  gap: 6px;
`;

const BarTotal = styled.div`
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-height: 0;
`;

const Plot = styled.div`
  display: grid;
  grid-template-rows: 220px 26px; /* ✅ 위=막대(0라인 포함), 아래=X라벨 */
`;

const BarStage = styled.div`
  position: relative;
  height: 220px;
`;

const GridLines = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
`;
/* ✅ 막대들을 0라인(바닥) 기준으로 깔기 */
const BarsRow = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 22px;
  align-items: end; /* ✅ 각 막대가 바닥(0라인)에서 시작 */
  z-index: 1;
`;

const BarGroup = styled.div`
  position: relative;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
`;

/* ✅ 실제 막대 컨테이너: 높이는 %로 들어오고, 바닥에 붙음 */
const BarWrap = styled.div`
  position: absolute;
  bottom: 0; /* ✅ 2) 막대 시작은 0라인 */
  width: 44px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
`;

/* ✅ 4) 숫자는 막대 끝(상단)에 붙이기 */
const BarTopValue = styled.div`
  position: absolute;
  top: -25px; /* 막대 끝 위로 살짝 */
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  font-weight: 800;
  color: #7a8296;
  white-space: nowrap;
`;

const XAxis = styled.div`
  border-top: 1px solid #eceff6; /* ✅ 0라인 느낌 강화 */
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 22px;
  align-items: center;
  padding-top: 6px;
`;

const XAxisLabel = styled.div`
  font-size: 12px;
  color: #7a8296;
  font-weight: 800;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Top10Left = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  b {
    font-weight: 900;
  }
`;

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #e6e9f2;
  background: #f7f8fb;
  font-size: 12px;
  font-weight: 900;
  color: #151922;
  flex: 0 0 auto;
`;

const ExplorerPanel = styled.div`
  margin-top: 55px;
  background: #fff;
  border-radius: 16px;
  border: 1px solid #e3e8ef;
  padding: 24px;
`;

const ExplorerPanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 20px;
`;

const ExplorerPanelTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin: 0;
`;

const ExplorerPanelControls = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const ExplorerPanelLabel = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: #475569;
`;

const ExplorerPanelSelect = styled.select`
  min-width: 220px;
  border-radius: 10px;
  border: 1px solid #d9e2ec;
  height: 40px;
  padding: 0 12px;
  font-size: 13px;
  background: #fff;
  color: #1f2933;
`;

const ExplorerPanelField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const ExplorerDateSection = styled.div`
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e3e8ef;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const ExplorerDateLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: #475569;
`;

const ExplorerDateControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ExplorerDateInput = styled.input`
  border-radius: 10px;
  border: 1px solid #d9e2ec;
  padding: 6px 10px;
  font-size: 13px;
  background: #fff;
  color: #1f2933;
  height: 34px;
`;

const ExplorerDateHint = styled.span`
  font-size: 12px;
  color: #6b7280;
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

const ClickableRow = styled.tr`
  cursor: pointer;

  &:hover {
    background: #f5f5f5;
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.form`
  width: min(520px, 100%);
  max-height: 80vh;
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ModalTitle = styled.div`
  font-size: 18px;
  font-weight: 600;
`;

const ModalCloseButton = styled.button`
  background: transparent;
  border: none;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
`;

const EditorInfo = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: #555;
`;

const ActivityHero = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
`;

const ActivityHeroCard = styled.div`
  border-radius: 14px;
  padding: 14px;
  background: linear-gradient(135deg, #f8fbff 0%, #eef4ff 100%);
  border: 1px solid #d9e7ff;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const ActivityHeroLabel = styled.span`
  font-size: 12px;
  color: #52606d;
`;

const ActivityHeroValue = styled.strong`
  font-size: 24px;
  color: #1f2933;
`;

const Fields = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FieldLabel = styled.label`
  font-size: 12px;
  color: #555;
`;

const FieldInput = styled.input`
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #dcdcdc;
  font-size: 14px;
`;

const Divider = styled.div`
  height: 1px;
  background: #f0f0f0;
  margin: 6px 0 10px;
`;

const ButtonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const SaveButton = styled.button`
  padding: 10px 18px;
  border-radius: 10px;
  border: none;
  background: #111;
  color: #fff;
  font-size: 14px;
  cursor: pointer;

  &:disabled {
    background: #999;
    cursor: default;
  }
`;

const FeedbackSuccess = styled.div`
  font-size: 13px;
  color: #0b9150;
`;

const FeedbackError = styled.div`
  font-size: 13px;
  color: #e74c3c;
`;

const ActivitySection = styled.div`
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ActivitySectionHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ActivitySectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #1f2933;
`;

const ActivitySectionSubTitle = styled.p`
  font-size: 12px;
  color: #7b8794;
`;

const ActivityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
`;

const ActivityCard = styled.div`
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  padding: 14px;
`;

const ActivityCardTitle = styled.h4`
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
  color: #1f2933;
`;

const ActivityTableWrapper = styled.div`
  max-height: 228px;
  overflow-y: auto;
  border-radius: 10px;
`;

const ActivityTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th,
  td {
    padding: 8px 6px;
    border-bottom: 1px solid #e5e7eb;
    text-align: left;
  }

  th {
    color: #52606d;
    font-weight: 700;
    background: transparent;
  }
`;

const ProductName = styled.span`
  display: inline-block;
  max-width: 160px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;
