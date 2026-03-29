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
  doc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import type {
  ManagerDashboardScope,
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

type ManagementTier =
  | "areaAdmin"
  | "regionLeader"
  | "officeHead"
  | "teamLeader"
  | "member";

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

const getAreaFromRegion = (region: string) => {
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

const getDashboardScopeFromPosition = (
  position: string,
): ManagerDashboardScope => {
  if (position.includes("지역담당") || position.includes("CSA")) {
    return "national";
  }
  if (position.includes("지역행정")) {
    return "area";
  }
  if (position.includes("리더사무소장")) {
    return "region";
  }
  if (position.includes("사무소장")) {
    return "office";
  }
  if (position.includes("팀장")) {
    return "team";
  }
  return "self";
};

const getManagementTier = (position?: string): ManagementTier => {
  if (!position) return "member";
  if (
    position.includes("지역행정") ||
    position.includes("지역담당") ||
    position.includes("CSA")
  ) {
    return "areaAdmin";
  }
  if (position.includes("리더사무소장")) return "regionLeader";
  if (position.includes("사무소장")) return "officeHead";
  if (position.includes("팀장")) return "teamLeader";
  return "member";
};

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

  const [scopedCategoryItems, setScopedCategoryItems] = useState<any[]>([]);
  const [scopedProductItems, setScopedProductItems] = useState<any[]>([]);

  const [dashboardStats, setDashboardStats] =
    useState<ManagerDashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [filterField, setFilterField] = useState<DashboardFilterField>("all");
  const [filterValue, setFilterValue] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [resultPage, setResultPage] = useState(1);
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
  const [editFeedbackError, setEditFeedbackError] = useState<string | null>(null);
  const [editActivityLoading, setEditActivityLoading] = useState(false);
  const [editActivityError, setEditActivityError] = useState<string | null>(null);
  const [editCategoryActivity, setEditCategoryActivity] = useState<StatRow[]>([]);
  const [editProductActivity, setEditProductActivity] = useState<StatRow[]>([]);

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

  const dashboardScope = useMemo<ManagerDashboardScope | null>(() => {
    if (!session?.position) return null;
    return getDashboardScopeFromPosition(session.position);
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
      } catch (err: any) {
        console.error("매니저 대시보드 오류:", err);
        setError("대시보드 데이터를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [session]);

  useEffect(() => {
    if (!session || !dashboardScope || dashboardScope === "self") {
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
            position: session.position,
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
          setDashboardError("대시보드 통계를 불러오지 못했습니다.");
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
  }, [session, dashboardScope]);

  const topCategoryStats = useMemo(
    () => categoryStats.slice(0, 8),
    [categoryStats],
  );
  const topProductStats = useMemo(
    () => productStats.slice(0, 8),
    [productStats],
  );
  useEffect(() => {
    if (!dashboardStats || dashboardStats.managers.length === 0) {
      setScopedCategoryItems([]);
      setScopedProductItems([]);
      return;
    }

    let cancelled = false;

    const fetchScopedStats = async () => {
      try {
        const managerIds = new Set(dashboardStats.managers.map((item) => item.id));
        const [categorySnap, productSnap] = await Promise.all([
          getDocs(collection(db, "managerCategoryStats")),
          getDocs(collection(db, "managerProductStats")),
        ]);

        if (cancelled) return;

        const nextCategoryItems = categorySnap.docs
          .map((docSnap) => docSnap.data())
          .filter((item: any) => managerIds.has(String(item.managerUid ?? "")));
        const nextProductItems = productSnap.docs
          .map((docSnap) => docSnap.data())
          .filter((item: any) => managerIds.has(String(item.managerUid ?? "")));

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

  const scopeLabel = (scope: ManagerDashboardScope | null) => {
    if (scope === "national") return "전국";
    if (scope === "area") return "지역";
    if (scope === "region") return "권역";
    if (scope === "office") return "사무소";
    if (scope === "team") return "팀";
    if (scope === "self") return "본인";
    return "전체";
  };

  const scopeDescription = useMemo(() => {
    if (!session || !dashboardScope) return "";
    if (dashboardScope === "national") return "전국 단위 조회";
    if (dashboardScope === "area") {
      return `${getAreaFromRegion(session.region) || session.region} 지역 단위 조회`;
    }
    if (dashboardScope === "region") return `${session.region} 권역 단위 조회`;
    if (dashboardScope === "office") return `${session.office} 사무소 단위 조회`;
    if (dashboardScope === "team") return `${session.managerId} 팀장 단위 조회`;
    return "본인 활동내역 조회";
  }, [dashboardScope, session]);

  const filterOptions = useMemo<ScopeOption[]>(() => {
    if (!dashboardScope || dashboardScope === "self") return [];
    if (dashboardScope === "national") {
      return [
        { value: "all", label: "전체" },
        { value: "area", label: "지역" },
        { value: "region", label: "권역" },
        { value: "office", label: "사무소" },
        { value: "team", label: "팀장" },
        { value: "manager", label: "매니저" },
      ];
    }
    if (dashboardScope === "area") {
      return [
        { value: "all", label: "전체" },
        { value: "region", label: "권역" },
        { value: "office", label: "사무소" },
        { value: "team", label: "팀장" },
        { value: "manager", label: "매니저" },
      ];
    }
    if (dashboardScope === "region") {
      return [
        { value: "all", label: "전체" },
        { value: "office", label: "사무소" },
        { value: "team", label: "팀장" },
        { value: "manager", label: "매니저" },
      ];
    }
    if (dashboardScope === "office") {
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
  }, [dashboardScope]);

  useEffect(() => {
    if (filterOptions.length === 0) {
      setFilterField("all");
      return;
    }
    if (!filterOptions.some((option) => option.value === filterField)) {
      setFilterField(filterOptions[0].value);
    }
  }, [filterField, filterOptions]);

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

  const regionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          scopedManagers.map((manager) => manager.region).filter((value) => Boolean(value)),
        ),
      ),
    [scopedManagers],
  );

  const officeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          scopedManagers.map((manager) => manager.office).filter((value) => Boolean(value)),
        ),
      ),
    [scopedManagers],
  );

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

  const getManagerFieldLabel = React.useCallback(
    (manager: ManagerSummary, field: DashboardFilterField) => {
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
    },
    [teamLeaderNameRegistry],
  );

  const getManagerFieldTitleLabel = React.useCallback(
    (manager: ManagerSummary, field: DashboardFilterField) => {
      if (field === "team") {
        const teamLeaderId = manager.teamLeaderId || "";
        return teamLeaderNameRegistry.get(teamLeaderId) || teamLeaderId || "팀장";
      }
      if (field === "manager") {
        return manager.name || manager.managerId || "매니저";
      }
      return getManagerFieldLabel(manager, field);
    },
    [getManagerFieldLabel, teamLeaderNameRegistry],
  );

  const filterValueOptions = useMemo(() => {
    if (filterField === "all") {
      return [{ value: "all", label: "전체" }];
    }

    const optionMap = new Map<string, string>();
    scopedManagers.forEach((manager) => {
      const value = getManagerFieldValue(manager, filterField);
      if (!value) return;
      optionMap.set(value, getManagerFieldLabel(manager, filterField));
    });

    return [
      { value: "all", label: "전체" },
      ...Array.from(optionMap.entries())
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "ko")),
    ];
  }, [filterField, scopedManagers, getManagerFieldLabel]);

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
            b.estimateCount + b.shareCount - (a.estimateCount + a.shareCount),
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
    dashboardScope === "team" || dashboardScope === "self" ? 5 : 10;

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
    if (dashboardScope === "national") return ["area", "region"] as const;
    if (dashboardScope === "area") return ["region", "office"] as const;
    if (dashboardScope === "region") return ["office", "team"] as const;
    if (dashboardScope === "office") return ["team"] as const;
    return [] as const;
  }, [dashboardScope]);

  const groupRankings = useMemo(
    () =>
      groupRankingFields.map((field) => {
        const groupMap = new Map<string, GroupRankingItem>();
        filteredManagers.forEach((manager) => {
          const key = getManagerFieldValue(manager, field);
          if (!key) return;
          const current = groupMap.get(key) ?? {
            key,
            label: getManagerFieldLabel(manager, field),
            estimateTotal: 0,
            shareTotal: 0,
            total: 0,
          };
          current.estimateTotal += manager.estimateCount;
          current.shareTotal += manager.shareCount;
          current.total = current.estimateTotal + current.shareTotal;
          groupMap.set(key, current);
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
    [filterOptions, filteredManagers, getManagerFieldLabel, groupRankingFields],
  );

  const teamLeaderOptions = useMemo(() => {
    const map = new Map<string, string>();
    scopedManagers.forEach((manager) => {
      if (getManagementTier(manager.position) === "teamLeader" && manager.managerId) {
        map.set(manager.managerId, manager.name || manager.managerId);
      }
    });
    if (dashboardScope === "team" && session?.managerId) {
      map.set(session.managerId, session.name);
    }
    return Array.from(map.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [dashboardScope, scopedManagers, session?.managerId, session?.name]);

  const selectedTargetTitle = useMemo(() => {
    if (filterField === "all" || filterValue === "all") {
      return scopeLabel(dashboardScope);
    }

    const matchedManager = scopedManagers.find(
      (manager) => getManagerFieldValue(manager, filterField) === filterValue,
    );

    if (!matchedManager) {
      return scopeLabel(dashboardScope);
    }

    return getManagerFieldTitleLabel(matchedManager, filterField);
  }, [
    dashboardScope,
    filterField,
    filterValue,
    getManagerFieldTitleLabel,
    scopedManagers,
  ]);

  const handleEditModalFormChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { name, value } = event.target;
    setEditForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const openEditModal = (manager: ManagerSummary) => {
    setEditManager(manager);
    setEditForm({
      name: manager.name,
      password: "",
      region: manager.region,
      office: manager.office,
      teamLeaderId: manager.teamLeaderId,
    });
    setEditFeedback(null);
    setEditFeedbackError(null);
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    if (editSaving) return;
    setEditModalOpen(false);
    setEditManager(null);
  };

  useEffect(() => {
    if (!editManager) {
      setEditCategoryActivity([]);
      setEditProductActivity([]);
      setEditActivityError(null);
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

  const handleEditModalSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editManager || !session) return;

    const trimmedName = editForm.name.trim();
    if (!trimmedName) {
      setEditFeedbackError("이름을 입력해 주세요.");
      return;
    }

    const actorTier = getManagementTier(session.position);
    const targetTier = getManagementTier(editManager.position);
    const allowRegionEdit =
      (actorTier === "areaAdmin" && targetTier !== "areaAdmin") ||
      (actorTier === "regionLeader" && targetTier !== "regionLeader");
    const allowOfficeEdit =
      (actorTier === "areaAdmin" && targetTier !== "areaAdmin") ||
      ((actorTier === "regionLeader" || actorTier === "officeHead") &&
        targetTier !== "regionLeader");
    const allowTeamLeaderEdit =
      actorTier !== "teamLeader" && targetTier === "member";

    const updates: Partial<ManagerSummary> & { password?: string } = {};
    if (trimmedName !== editManager.name) updates.name = trimmedName;
    if (editForm.password.trim()) updates.password = editForm.password.trim();
    if (allowRegionEdit && editForm.region.trim() !== editManager.region) {
      updates.region = editForm.region.trim();
    }
    if (allowOfficeEdit && editForm.office.trim() !== editManager.office) {
      updates.office = editForm.office.trim();
    }
    if (
      allowTeamLeaderEdit &&
      editForm.teamLeaderId.trim() !== editManager.teamLeaderId
    ) {
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
        ...updates,
        updatedAt: serverTimestamp(),
      });

      const summaryUpdates: Partial<ManagerSummary> = {};
      if (updates.name !== undefined) summaryUpdates.name = updates.name;
      if (updates.region !== undefined) summaryUpdates.region = updates.region;
      if (updates.office !== undefined) summaryUpdates.office = updates.office;
      if (updates.teamLeaderId !== undefined) {
        summaryUpdates.teamLeaderId = updates.teamLeaderId;
      }

      setDashboardStats((prev) =>
        prev
          ? {
              ...prev,
              managers: prev.managers.map((manager) =>
                manager.id === editManager.id
                  ? { ...manager, ...summaryUpdates }
                  : manager,
              ),
            }
          : prev,
      );
      setEditManager((prev) => (prev ? { ...prev, ...summaryUpdates } : prev));
      setEditForm((prev) => ({ ...prev, password: "" }));
      setEditFeedback("저장되었습니다.");
    } catch (error) {
      console.error("대시보드 매니저 저장 오류:", error);
      setEditFeedbackError("저장 중 오류가 발생했습니다.");
    } finally {
      setEditSaving(false);
    }
  };

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

          </Grid>
          {dashboardScope && dashboardScope !== "self" && (
            <StatsSection>
              {dashboardLoading && (
                <InfoText>조직 통계를 불러오는 중입니다...</InfoText>
              )}
              {dashboardError && <ErrorText>{dashboardError}</ErrorText>}
              {!dashboardLoading && !dashboardError && dashboardStats && (
                <>
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
                          onChange={(e) =>
                            setFilterField(e.target.value as DashboardFilterField)
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
                          onChange={(e) => setFilterValue(e.target.value)}
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
                          onChange={(e) => setSearchKeyword(e.target.value)}
                          placeholder="이름, 직급, 권역, 사무소, 업무등록번호 검색"
                        />
                      </FilterField>
                    </FilterControls>
                    <FilterSummary>
                      조회 범위: {scopeLabel(dashboardScope)} 단위
                      {filterField !== "all" && filterValue !== "all"
                        ? ` · 선택 조건: ${
                            filterOptions.find((option) => option.value === filterField)
                              ?.label ?? ""
                          }`
                        : ""}
                      {searchKeyword.trim() ? ` · 검색어: ${searchKeyword.trim()}` : ""}
                    </FilterSummary>
                  </FilterPanel>

                  <RankingGrid>
                    <RankingCard>
                      <CardHeader>
                        <CardTitle>
                          {selectedTargetTitle} 견적 순위 Top {rankingLimit}
                        </CardTitle>
                        <CardSubTitle>매니저를 클릭하면 정보 수정과 활동내역을 확인할 수 있습니다.</CardSubTitle>
                      </CardHeader>
                      <RankList>
                        {topEstimateManagers.map((row, index) => (
                            <ClickableRankingRow
                              key={row.id}
                              onClick={() => openEditModal(row)}
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
                        {topEstimateManagers.length === 0 && (
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
                          {selectedTargetTitle} 공유 순위 Top {rankingLimit}
                        </CardTitle>
                        <CardSubTitle>매니저를 클릭하면 정보 수정과 활동내역을 확인할 수 있습니다.</CardSubTitle>
                      </CardHeader>
                      <RankList>
                        {topShareManagers.map((row, index) => (
                            <ClickableRankingRow
                              key={row.id}
                              onClick={() => openEditModal(row)}
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
                        {topShareManagers.length === 0 && (
                          <RankingRow>
                            <RankIndex>–</RankIndex>
                            <RankDetails>데이터가 없습니다.</RankDetails>
                          </RankingRow>
                        )}
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
                                      견적 {item.estimateTotal} · 공유{" "}
                                      {item.shareTotal}
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
                              onClick={() => openEditModal(manager)}
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
                            setResultPage((prev) =>
                              Math.min(resultTotalPages, prev + 1),
                            )
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
                </>
              )}
            </StatsSection>
          )}
          {editModalOpen && editManager && (
            <ModalOverlay onClick={closeEditModal}>
              <ModalContent
                onSubmit={handleEditModalSave}
                onClick={(event) => event.stopPropagation()}
              >
                <ModalHeader>
                  <ModalTitle>
                    {editManager.name} ({editManager.managerId}) 편집
                  </ModalTitle>
                  <ModalCloseButton type="button" onClick={closeEditModal}>
                    ×
                  </ModalCloseButton>
                </ModalHeader>
                <EditorInfo>
                  <span>직급: {editManager.position || "-"}</span>
                  <span>사무소: {editManager.office || "-"}</span>
                  <span>담당 팀장: {editManager.teamLeaderId || "-"}</span>
                </EditorInfo>

                <ActivityHero>
                  <ActivityHeroCard>
                    <ActivityHeroLabel>견적 활동</ActivityHeroLabel>
                    <ActivityHeroValue>{editManager.estimateCount}</ActivityHeroValue>
                  </ActivityHeroCard>
                  <ActivityHeroCard>
                    <ActivityHeroLabel>공유 활동</ActivityHeroLabel>
                    <ActivityHeroValue>{editManager.shareCount}</ActivityHeroValue>
                  </ActivityHeroCard>
                  <ActivityHeroCard>
                    <ActivityHeroLabel>전체 활동</ActivityHeroLabel>
                    <ActivityHeroValue>
                      {editManager.estimateCount + editManager.shareCount}
                    </ActivityHeroValue>
                  </ActivityHeroCard>
                </ActivityHero>

                <Fields>
                  <Field>
                    <FieldLabel>이름</FieldLabel>
                    <FieldInput
                      name="name"
                      value={editForm.name}
                      onChange={handleEditModalFormChange}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>비밀번호</FieldLabel>
                    <FieldInput
                      name="password"
                      type="password"
                      value={editForm.password}
                      onChange={handleEditModalFormChange}
                      placeholder="변경할 비밀번호를 입력하세요"
                    />
                  </Field>
                </Fields>

                <Divider />

                <Fields>
                  <Field>
                    <FieldLabel>지역</FieldLabel>
                    <FieldInput
                      name="region"
                      value={editForm.region}
                      onChange={handleEditModalFormChange}
                      placeholder="지역명을 입력하세요"
                      list="dashboard-region-options"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>사무소</FieldLabel>
                    <FieldInput
                      name="office"
                      value={editForm.office}
                      onChange={handleEditModalFormChange}
                      placeholder="사무소명을 입력하세요"
                      list="dashboard-office-options"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>담당 팀장</FieldLabel>
                    <FieldInput
                      name="teamLeaderId"
                      value={editForm.teamLeaderId}
                      onChange={handleEditModalFormChange}
                      placeholder="할당할 팀장 ID를 입력하세요"
                      list="dashboard-teamleader-options"
                    />
                  </Field>
                </Fields>

                <ButtonRow>
                  <SaveButton type="submit" disabled={editSaving}>
                    {editSaving ? "저장 중..." : "변경사항 저장"}
                  </SaveButton>
                  {editFeedback && <FeedbackSuccess>{editFeedback}</FeedbackSuccess>}
                  {editFeedbackError && (
                    <FeedbackError>{editFeedbackError}</FeedbackError>
                  )}
                </ButtonRow>

                <ActivitySection>
                  <ActivitySectionHeader>
                    <ActivitySectionTitle>활동내역</ActivitySectionTitle>
                    <ActivitySectionSubTitle>
                      카테고리별, 제품별 활동 현황을 함께 확인할 수 있습니다.
                    </ActivitySectionSubTitle>
                  </ActivitySectionHeader>
                  {editActivityLoading && (
                    <InfoText>활동내역을 불러오는 중입니다...</InfoText>
                  )}
                  {editActivityError && <ErrorText>{editActivityError}</ErrorText>}
                  {!editActivityLoading && !editActivityError && (
                    <ActivityGrid>
                      <ActivityCard>
                        <ActivityCardTitle>카테고리별 활동</ActivityCardTitle>
                        <ActivityTableWrapper>
                        <ActivityTable>
                          <thead>
                            <tr>
                              <th>카테고리</th>
                              <th>견적</th>
                              <th>공유</th>
                              <th>합계</th>
                            </tr>
                          </thead>
                          <tbody>
                            {editCategoryActivity.length === 0 ? (
                              <tr>
                                <td colSpan={4}>활동내역이 없습니다.</td>
                              </tr>
                            ) : (
                              editCategoryActivity.slice(0, 8).map((row) => (
                                <tr key={`edit-category-${row.key}`}>
                                  <td>{row.label}</td>
                                  <td>{row.estimateCount}</td>
                                  <td>{row.shareCount}</td>
                                  <td>{row.estimateCount + row.shareCount}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </ActivityTable>
                        </ActivityTableWrapper>
                      </ActivityCard>
                      <ActivityCard>
                        <ActivityCardTitle>제품별 활동</ActivityCardTitle>
                        <ActivityTableWrapper>
                        <ActivityTable>
                          <thead>
                            <tr>
                              <th>제품</th>
                              <th>견적</th>
                              <th>공유</th>
                              <th>합계</th>
                            </tr>
                          </thead>
                          <tbody>
                            {editProductActivity.length === 0 ? (
                              <tr>
                                <td colSpan={4}>활동내역이 없습니다.</td>
                              </tr>
                            ) : (
                              editProductActivity.slice(0, 8).map((row) => (
                                <tr key={`edit-product-${row.key}`}>
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
                        </ActivityTable>
                        </ActivityTableWrapper>
                      </ActivityCard>
                    </ActivityGrid>
                  )}
                </ActivitySection>
              </ModalContent>
            </ModalOverlay>
          )}
        </>
      )}
      <datalist id="dashboard-region-options">
        {regionOptions.map((value) => (
          <option key={`dashboard-region-${value}`} value={value} />
        ))}
      </datalist>
      <datalist id="dashboard-office-options">
        {officeOptions.map((value) => (
          <option key={`dashboard-office-${value}`} value={value} />
        ))}
      </datalist>
      <datalist id="dashboard-teamleader-options">
        {teamLeaderOptions.map((option) => (
          <option
            key={`dashboard-teamleader-${option.value}`}
            value={option.value}
            label={option.label}
          />
        ))}
      </datalist>
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

const DashboardTableRow = styled.tr`
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #f8fbff;
  }
`;

const StatsSection = styled.div`
  margin-top: 24px;
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

const FilterIntro = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FilterControls = styled.div`
display:flex;
align-items:center;
  gap: 12px;
`;

const FilterField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;

	min-width:100px;
	max-width:250px;
	width:33.33%;
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
	max-width:250px;
  color: #1f2933;
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

const TeamOfficeRankingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
`;

const PaginationBar = styled.div`
  display: flex;
  align-items: center;
  justify-content:center;
  gap: 12px;
  margin-top: 16px;

  @media (max-width: 720px) {
    flex-direction: column;
    align-items: stretch;
  }
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
