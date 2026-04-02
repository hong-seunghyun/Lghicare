/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/admin/managers.tsx

"use client";

import React, { useEffect, useMemo, useState } from "react";
import ManagerEditModal from "@/components/ManagerEditModal";
import OrganizationExplorer from "@/components/OrganizationExplorer";
import styled from "styled-components";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  fetchManagerLearningDetails,
  LearningActivityRow,
} from "@/lib/learning";
import {
  getBoardCategoryFullLabel,
  getSalesIndexedCategoryIds,
} from "@/config/boardCategories";
import type {
  ManagerDashboardRequest,
  ManagerSummary,
} from "@/pages/api/manager/dashboard";

type Manager = {
  id: string; // Firestore 문서 ID (== Auth uid)
  managerId: string;
  email: string;
  password?: string;
  name: string;
  position: string;
  region: string;
  office: string;
  teamLeaderId: string;
  memo: string;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
};

type StatRow = {
  key: string;
  label: string;
  estimateCount: number;
  shareCount: number;
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

const ManagerManagementPage: React.FC = () => {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [explorerTargetId, setExplorerTargetId] = useState<string | null>(null);
  useEffect(() => {
    if (managers.length === 0) {
      setExplorerTargetId(null);
      return;
    }
    setExplorerTargetId((prev) =>
      prev && managers.some((manager) => manager.id === prev)
        ? prev
        : managers[0].id,
    );
  }, [managers]);

  const explorerManager = useMemo(
    () => managers.find((manager) => manager.id === explorerTargetId) ?? null,
    [managers, explorerTargetId],
  );

  const organizationRequestPayload = useMemo<ManagerDashboardRequest | null>(
    () => {
      if (!explorerManager) return null;
      return {
        managerUid: explorerManager.id,
        managerId: explorerManager.managerId,
        position: explorerManager.position,
        region: explorerManager.region,
        office: explorerManager.office,
      };
    },
    [explorerManager],
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingManager, setEditingManager] = useState<Manager | null>(null);
  const [saving, setSaving] = useState(false);

  const DEFAULT_MANAGER_PASSWORD = "123456";

  const [form, setForm] = useState({
    managerId: "",
    email: "",
    password: DEFAULT_MANAGER_PASSWORD,
    name: "",
    position: "",
    region: "",
    office: "",
    teamLeaderId: "",
    memo: "",
  });

  const [searchField, setSearchField] = useState<
    "region" | "office" | "teamLeaderId" | "managerId" | "name"
  >("name");
  const [searchValue, setSearchValue] = useState("");
  const [importing, setImporting] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;

  const [statsManager, setStatsManager] = useState<Manager | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsSummary, setStatsSummary] = useState({
    totalViews: 0,
    totalShares: 0,
  });
  const [statsRows, setStatsRows] = useState<
    {
      postId: string;
      title: string;
      categoryId: string;
      viewCount: number;
      shareCount: number;
    }[]
  >([]);
  const [activityTotals, setActivityTotals] = useState({
    estimateCount: 0,
    shareCount: 0,
    totalActivity: 0,
  });
  const [activityError, setActivityError] = useState<string | null>(null);
  const [learningTotals, setLearningTotals] = useState({
    views: 0,
    shares: 0,
  });
  const [learningLoading, setLearningLoading] = useState(false);
  const [learningError, setLearningError] = useState<string | null>(null);
  const [learningDetails, setLearningDetails] = useState<LearningActivityRow[]>(
    [],
  );
  const [editCategoryActivity, setEditCategoryActivity] = useState<StatRow[]>(
    [],
  );
  const [editProductActivity, setEditProductActivity] = useState<StatRow[]>([]);
  const [activityDetailsLoading, setActivityDetailsLoading] = useState(false);
  const [activityDetailsError, setActivityDetailsError] = useState<
    string | null
  >(null);
  const STATS_PAGE_SIZE = 10;
  const [statsPage, setStatsPage] = useState(1);
  useEffect(() => {
    setStatsPage(1);
  }, [statsRows]);

  const statsPageCount = Math.max(
    1,
    Math.ceil(statsRows.length / STATS_PAGE_SIZE),
  );
  const statsPageItems = statsRows.slice(
    (statsPage - 1) * STATS_PAGE_SIZE,
    statsPage * STATS_PAGE_SIZE,
  );

  useEffect(() => {
    const fetchManagers = async () => {
      try {
        setLoading(true);
        setError(null);

        const q = query(
          collection(db, "users"),
          where("role", "==", "manager"),
          orderBy("createdAt", "desc"),
        );

        const snap = await getDocs(q);
        const list: Manager[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            managerId: data.managerId ?? "",
            email: data.email ?? "",
            password: data.password ?? "",
            name: data.name ?? "",
            position: data.position ?? "",
            region: data.region ?? "",
            office: data.office ?? data.branch ?? "",
            teamLeaderId: data.teamLeaderId ?? "",
            memo: data.memo ?? "",
            isActive: data.isActive ?? true,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });

        setManagers(list);
      } catch (err: any) {
        console.error("매니저 목록 불러오기 오류:", err);
        setError("매니저 목록을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchManagers();
  }, []);

  const openCreateModal = () => {
    setEditingManager(null);
    setForm({
      managerId: "",
      email: "",
      password: DEFAULT_MANAGER_PASSWORD,
      name: "",
      position: "",
      region: "",
      office: "",
      teamLeaderId: "",
      memo: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (manager: Manager) => {
    setEditingManager(manager);
    setForm({
      managerId: manager.managerId,
      email: manager.email,
      password: manager.password ?? DEFAULT_MANAGER_PASSWORD,
      name: manager.name,
      position: manager.position,
      region: manager.region,
      office: manager.office,
      teamLeaderId: manager.teamLeaderId,
      memo: manager.memo,
    });
    setIsModalOpen(true);
  };

  const handleExplorerManagerSelect = (summary: ManagerSummary) => {
    const target = managers.find((manager) => manager.id === summary.id);
    if (target) {
      openEditModal(target);
    }
  };

  const closeModal = () => {
    if (saving) return;
    setIsModalOpen(false);
  };

  const fetchActivityTotalsForManager = async (managerUid: string) => {
    const estimateQuery = query(
      collection(db, "estimatesCount"),
      where("managerUid", "==", managerUid),
    );
    const estimateSnap = await getDocs(estimateQuery);
    let estimateCount = 0;
    estimateSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as any;
      estimateCount += Number(
        data.managerCount ?? data.totalCount ?? data.count ?? 0,
      );
    });

    const shareQuery = query(
      collection(db, "shareCountByManager"),
      where("managerUid", "==", managerUid),
    );
    const shareSnap = await getDocs(shareQuery);
    let shareCount = 0;
    shareSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as any;
      shareCount += Number(data.totalCount ?? data.shareCount ?? 0);
    });

    return {
      estimateCount,
      shareCount,
      totalActivity: estimateCount + shareCount,
    };
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isEdit = !!editingManager;

    if (!form.managerId || !form.name) {
      alert("업무등록번호/사용자명은 필수입니다.");
      return;
    }

    if (!form.password) {
      alert("로그인 비밀번호는 필수입니다.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        uid: isEdit ? editingManager?.id : null,
        managerId: form.managerId.trim(),
        password: form.password.trim(),
        name: form.name.trim(),
        position: form.position.trim(),
        region: form.region.trim(),
        office: form.office.trim(),
        teamLeaderId: form.teamLeaderId.trim(),
        memo: form.memo.trim(),
        isActive: editingManager?.isActive ?? true,
      };

      const response = await fetch("/api/admin/managers/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "upsert failed");
      }

      const result = await response.json();
      const saved = result?.manager as Manager | undefined;
      if (!saved) {
        throw new Error("manager save response missing");
      }

      if (isEdit && editingManager) {
        setManagers((prev) =>
          prev.map((m) => (m.id === saved.id ? { ...m, ...saved } : m)),
        );
      } else {
        setManagers((prev) => [saved, ...prev]);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error("매니저 저장 중 오류:", err);
      alert("매니저 정보를 저장하는 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!editingManager) {
      setActivityTotals({ estimateCount: 0, shareCount: 0, totalActivity: 0 });
      setActivityError(null);
      return;
    }

    const loadActivityStats = async () => {
      setActivityError(null);
      try {
        const activity = await fetchActivityTotalsForManager(editingManager.id);
        if (cancelled) return;
        setActivityTotals(activity);
      } catch (err) {
        console.error("활동 통계 로딩 오류:", err);
        if (!cancelled) {
          setActivityError("활동 통계를 불러오는 중 오류가 발생했습니다.");
        }
      }
    };

    loadActivityStats();
    return () => {
      cancelled = true;
    };
  }, [editingManager]);

  useEffect(() => {
    let cancelled = false;
    if (!editingManager) {
      setLearningTotals({ views: 0, shares: 0 });
      setLearningDetails([]);
      setLearningError(null);
      setLearningLoading(false);
      return;
    }

    const loadLearningDetails = async () => {
      setLearningLoading(true);
      setLearningError(null);
      try {
        const { totals, details } = await fetchManagerLearningDetails(
          editingManager.id,
        );
        if (cancelled) return;
        setLearningTotals(totals);
        setLearningDetails(details);
      } catch (err) {
        console.error("학습 통계 로딩 오류:", err);
        if (!cancelled) {
          setLearningError("학습 활동을 불러오는 중 오류가 발생했습니다.");
          setLearningTotals({ views: 0, shares: 0 });
          setLearningDetails([]);
        }
      } finally {
        if (!cancelled) {
          setLearningLoading(false);
        }
      }
    };

    loadLearningDetails();
    return () => {
      cancelled = true;
    };
  }, [editingManager]);

  useEffect(() => {
    if (!editingManager) {
      setEditCategoryActivity([]);
      setEditProductActivity([]);
      setActivityDetailsError(null);
      setActivityDetailsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchDetailActivity = async () => {
      try {
        setActivityDetailsLoading(true);
        setActivityDetailsError(null);

        const [categorySnap, productSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "managerCategoryStats"),
              where("managerUid", "==", editingManager.id),
            ),
          ),
          getDocs(
            query(
              collection(db, "managerProductStats"),
              where("managerUid", "==", editingManager.id),
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
          setActivityDetailsError(
            "활동내역을 불러오는 중 오류가 발생했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setActivityDetailsLoading(false);
        }
      }
    };

    fetchDetailActivity();
    return () => {
      cancelled = true;
    };
  }, [editingManager]);

  const handleToggleActive = async (manager: Manager) => {
    const nextActive = !manager.isActive;

    setManagers((prev) =>
      prev.map((m) =>
        m.id === manager.id ? { ...m, isActive: nextActive } : m,
      ),
    );

    try {
      const ref = doc(db, "users", manager.id);
      await updateDoc(ref, {
        isActive: nextActive,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error("활성 상태 변경 오류:", err);
      alert("활성 상태 변경 중 오류가 발생했습니다.");

      setManagers((prev) =>
        prev.map((m) =>
          m.id === manager.id ? { ...m, isActive: manager.isActive } : m,
        ),
      );
    }
  };

  const handleImportManagers = async () => {
    if (importing) return;
    if (!confirm("managerList.json 파일 기준으로 일괄등록을 진행할까요?"))
      return;

    try {
      setImporting(true);
      const response = await fetch("/api/admin/managers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultPassword: DEFAULT_MANAGER_PASSWORD }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "import failed");
      }

      alert(
        `일괄등록 완료\n신규: ${result.created}\n업데이트: ${result.updated}\n스킵: ${result.skipped}\n오류: ${result.errors}`,
      );

      setLoading(true);
      const q = query(
        collection(db, "users"),
        where("role", "==", "manager"),
        orderBy("createdAt", "desc"),
      );
      const snap = await getDocs(q);
      const list: Manager[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          managerId: data.managerId ?? "",
          email: data.email ?? "",
          password: data.password ?? "",
          name: data.name ?? "",
          position: data.position ?? "",
          region: data.region ?? "",
          office: data.office ?? data.branch ?? "",
          teamLeaderId: data.teamLeaderId ?? "",
          memo: data.memo ?? "",
          isActive: data.isActive ?? true,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });
      setManagers(list);
    } catch (err: any) {
      console.error("일괄등록 오류:", err);
      alert("일괄등록 중 오류가 발생했습니다.");
    } finally {
      setImporting(false);
      setLoading(false);
    }
  };

  const handleDeduplicateManagers = async () => {
    if (deduping) return;
    if (!confirm("업무등록번호 기준으로 중복 계정을 점검/삭제할까요?")) return;

    try {
      setDeduping(true);
      const response = await fetch("/api/admin/managers/dedupe", {
        method: "POST",
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "dedupe failed");
      }

      alert(
        `점검 완료\n스캔: ${result.scanned}\n중복: ${result.duplicates}\n삭제: ${result.removed}`,
      );

      setLoading(true);
      const q = query(
        collection(db, "users"),
        where("role", "==", "manager"),
        orderBy("createdAt", "desc"),
      );
      const snap = await getDocs(q);
      const list: Manager[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          managerId: data.managerId ?? "",
          email: data.email ?? "",
          password: data.password ?? "",
          name: data.name ?? "",
          position: data.position ?? "",
          region: data.region ?? "",
          office: data.office ?? data.branch ?? "",
          teamLeaderId: data.teamLeaderId ?? "",
          memo: data.memo ?? "",
          isActive: data.isActive ?? true,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });
      setManagers(list);
    } catch (err: any) {
      console.error("중복 점검 오류:", err);
      alert("중복 점검 중 오류가 발생했습니다.");
    } finally {
      setDeduping(false);
      setLoading(false);
    }
  };

  const handleOpenStats = async (manager: Manager) => {
    setStatsManager(manager);
    setStatsLoading(true);
    setStatsError(null);
    setStatsSummary({ totalViews: 0, totalShares: 0 });
    setStatsRows([]);

    try {
      const salesCategoryIds = Array.from(
        new Set(getSalesIndexedCategoryIds()),
      );
      if (salesCategoryIds.length === 0) {
        setStatsSummary({ totalViews: 0, totalShares: 0 });
        setStatsRows([]);
        setStatsLoading(false);
        return;
      }

      const chunkSize = 10;
      const postSnaps = [];
      for (let i = 0; i < salesCategoryIds.length; i += chunkSize) {
        const chunk = salesCategoryIds.slice(i, i + chunkSize);
        const postsQuery = query(
          collection(db, "boardPosts"),
          where("categoryId", "in", chunk),
        );
        const postsSnap = await getDocs(postsQuery);
        postSnaps.push(postsSnap);
      }

      const posts = postSnaps.flatMap((postsSnap) =>
        postsSnap.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            title: data.title ?? "(제목 없음)",
            categoryId: data.categoryId ?? "",
          };
        }),
      );

      const activityQuery = query(
        collection(db, "boardPostActivity"),
        where("managerUid", "==", manager.id),
      );
      const activitySnap = await getDocs(activityQuery);
      const activityMap = new Map<
        string,
        { viewCount: number; shareCount: number }
      >();
      activitySnap.docs.forEach((docSnap) => {
        const data = docSnap.data() as any;
        if (!data.postId) return;
        activityMap.set(data.postId, {
          viewCount: Number(data.viewCount ?? 0),
          shareCount: Number(data.shareCount ?? 0),
        });
      });

      let totalViews = 0;
      let totalShares = 0;
      const rows = posts.map((post) => {
        const activity = activityMap.get(post.id) ?? {
          viewCount: 0,
          shareCount: 0,
        };
        totalViews += activity.viewCount;
        totalShares += activity.shareCount;
        return {
          postId: post.id,
          title: post.title,
          categoryId: post.categoryId,
          viewCount: activity.viewCount,
          shareCount: activity.shareCount,
        };
      });

      setStatsSummary({ totalViews, totalShares });
      setStatsRows(rows);
    } catch (err: any) {
      console.error("학습현황 조회 오류:", err);
      setStatsError("학습현황을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setStatsLoading(false);
    }
  };

  const filteredManagers = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();
    if (!keyword) return managers;

    return managers.filter((manager) => {
      const valueMap = {
        region: manager.region,
        office: manager.office,
        teamLeaderId: manager.teamLeaderId,
        managerId: manager.managerId,
        name: manager.name,
      };
      const target = (valueMap[searchField] ?? "").toLowerCase();
      return target.includes(keyword);
    });
  }, [managers, searchField, searchValue]);

  const totalPages = useMemo(() => {
    if (searchValue.trim()) return 1;
    return Math.max(1, Math.ceil(managers.length / PAGE_SIZE));
  }, [managers.length, searchValue]);

  const pagedManagers = useMemo(() => {
    if (searchValue.trim()) return filteredManagers;
    const start = (page - 1) * PAGE_SIZE;
    return managers.slice(start, start + PAGE_SIZE);
  }, [filteredManagers, managers, page, searchValue]);

  useEffect(() => {
    setPage(1);
  }, [searchField, searchValue, managers.length]);

  const regionOptions = useMemo(
    () =>
      Array.from(new Set(managers.map((m) => m.region).filter(Boolean))).sort(),
    [managers],
  );
  const officeOptions = useMemo(
    () =>
      Array.from(new Set(managers.map((m) => m.office).filter(Boolean))).sort(),
    [managers],
  );
  const teamLeaderOptions = useMemo(
    () =>
      Array.from(
        new Set(managers.map((m) => m.teamLeaderId).filter(Boolean)),
      ).sort(),
    [managers],
  );

  return (
    <PageWrapper>
      <HeaderRow>
        <Title>매니저 관리</Title>
        <HeaderActions>
          <CreateButton
            type="button"
            onClick={handleImportManagers}
            disabled={importing}
          >
            {importing ? "일괄등록 중..." : "일괄등록"}
          </CreateButton>
          <CreateButton
            type="button"
            onClick={handleDeduplicateManagers}
            disabled={deduping}
          >
            {deduping ? "점검 중..." : "점검"}
          </CreateButton>
          <CreateButton type="button" onClick={openCreateModal}>
            + 개별등록
          </CreateButton>
        </HeaderActions>
      </HeaderRow>

      <SearchRow>
        <SearchSelect
          value={searchField}
          onChange={(e) => setSearchField(e.target.value as typeof searchField)}
        >
          <option value="name">사용자</option>
          <option value="managerId">업무등록번호</option>
          <option value="region">권역</option>
          <option value="office">사무소</option>
          <option value="teamLeaderId">담당팀장</option>
        </SearchSelect>
        <SearchInput
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="검색어를 입력하세요."
          list={
            searchField === "region"
              ? "regionOptions"
              : searchField === "office"
                ? "officeOptions"
                : searchField === "teamLeaderId"
                  ? "teamLeaderOptions"
                  : undefined
          }
        />
        <SearchHint>카테고리별로 검색할 수 있습니다.</SearchHint>
        <datalist id="regionOptions">
          {regionOptions.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        <datalist id="officeOptions">
          {officeOptions.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        <datalist id="teamLeaderOptions">
          {teamLeaderOptions.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </SearchRow>

      {loading && <InfoText>매니저 목록을 불러오는 중입니다...</InfoText>}
      {error && <ErrorText>{error}</ErrorText>}

      {!loading && !error && filteredManagers.length === 0 && (
        <InfoText>등록된 매니저 계정이 없습니다.</InfoText>
      )}

      {!loading && !error && filteredManagers.length > 0 && (
        <TableWrapper>
          <StyledTable>
            <thead>
              <tr>
                <th>활성</th>
                <th>업무등록번호</th>
                <th>사용자</th>
                <th>직급</th>
                <th>권역</th>
                <th>사무소</th>
                <th>담당팀장</th>
                <th>메모</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {pagedManagers.map((m) => (
                <tr key={m.id}>
                  <td>
                    <StatusBadge $active={m.isActive}>
                      {m.isActive ? "활성" : "비활성"}
                    </StatusBadge>
                  </td>
                  <td>{m.managerId}</td>
                  <td>{m.name}</td>
                  <td>{m.position}</td>
                  <td>{m.region}</td>
                  <td>{m.office}</td>
                  <td>{m.teamLeaderId || "-"}</td>
                  <td>
                    <MemoText title={m.memo}>{m.memo}</MemoText>
                  </td>
                  <td>
                    <RowActions>
                      <SmallButton
                        type="button"
                        onClick={() => openEditModal(m)}
                      >
                        수정
                      </SmallButton>
                      <SmallButton
                        type="button"
                        onClick={() => handleOpenStats(m)}
                      >
                        학습현황
                      </SmallButton>
                      <SmallButton
                        type="button"
                        $danger={!m.isActive}
                        onClick={() => handleToggleActive(m)}
                      >
                        {m.isActive ? "비활성" : "활성"}
                      </SmallButton>
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </StyledTable>
        </TableWrapper>
      )}

      {!loading && !error && !searchValue.trim() && managers.length > 0 && (
        <PaginationRow>
          <PaginationInfo>
            전체 {managers.length}명 · {page}/{totalPages} 페이지
          </PaginationInfo>
          <PaginationControls>
            <PageButton
              type="button"
              onClick={() => setPage(1)}
              disabled={page === 1}
            >
              처음
            </PageButton>
            <PageButton
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
            >
              이전
            </PageButton>
            <PageButton
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
            >
              다음
            </PageButton>
            <PageButton
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
            >
              마지막
            </PageButton>
          </PaginationControls>
        </PaginationRow>
      )}

      {isModalOpen && editingManager && (
        <ManagerEditModal
          manager={{
            managerId: editingManager.managerId,
            name: editingManager.name,
            position: editingManager.position,
            office: editingManager.office,
            teamLeaderId: editingManager.teamLeaderId,
            estimateCount: activityTotals.estimateCount,
            shareCount: activityTotals.shareCount,
          }}
          form={{
            name: form.name,
            password: form.password,
            region: form.region,
            office: form.office,
            teamLeaderId: form.teamLeaderId,
          }}
          onFormChange={handleChange}
          onSubmit={handleSubmit}
          onClose={closeModal}
          saving={saving}
          activityLoading={activityDetailsLoading}
          activityError={activityDetailsError}
          activityTotals={{
            estimateCount: activityTotals.estimateCount,
            shareCount: activityTotals.shareCount,
          }}
          categoryActivity={editCategoryActivity}
          productActivity={editProductActivity}
          regionListId="regionOptions"
          officeListId="officeOptions"
          teamLeaderListId="teamLeaderOptions"
          learningTotals={learningTotals}
          learningLoading={learningLoading}
          learningError={learningError}
          learningDetails={learningDetails}
        />
      )}

      {isModalOpen && !editingManager && (
        <ModalOverlay>
          <ModalContent>
            <ModalHeader>
              <ModalTitle>매니저 계정 생성</ModalTitle>
            </ModalHeader>
            <form style={{ overflowY: "auto" }} onSubmit={handleSubmit}>
              <ModalBody>
                <FieldRow>
                  <Field>
                    <FieldLabel>업무등록번호*</FieldLabel>
                    <FieldInput
                      name="managerId"
                      value={form.managerId}
                      onChange={handleChange}
                      placeholder="예: H12345"
                    />
                  </Field>
                </FieldRow>

                <FieldRow>
                  <Field>
                    <FieldLabel>비밀번호(생년월일 6자리)*</FieldLabel>
                    <FieldInput
                      type="password"
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      placeholder="기본값 123456"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>사용자*</FieldLabel>
                    <FieldInput
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="예: 홍길동"
                    />
                  </Field>
                </FieldRow>

                <FieldRow>
                  <Field>
                    <FieldLabel>직급</FieldLabel>
                    <FieldInput
                      name="position"
                      value={form.position}
                      onChange={handleChange}
                      placeholder="예: 파트장"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>권역</FieldLabel>
                    <FieldInput
                      name="region"
                      value={form.region}
                      onChange={handleChange}
                      placeholder="예: B2B_B"
                    />
                  </Field>
                </FieldRow>

                <FieldRow>
                  <Field>
                    <FieldLabel>사무소</FieldLabel>
                    <FieldInput
                      name="office"
                      value={form.office}
                      onChange={handleChange}
                      placeholder="예: 강남사무소"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>담당팀장</FieldLabel>
                    <FieldInput
                      name="teamLeaderId"
                      value={form.teamLeaderId}
                      onChange={handleChange}
                      placeholder="예: H01064"
                    />
                  </Field>
                </FieldRow>

                <FieldRow>
                  <FieldFull>
                    <FieldLabel>메모</FieldLabel>
                    <FieldTextArea
                      name="memo"
                      value={form.memo}
                      onChange={handleChange}
                      rows={3}
                      placeholder="참고용 메모를 입력하세요."
                    />
                  </FieldFull>
                </FieldRow>
              </ModalBody>
              <ModalFooter>
                <ModalButton
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                >
                  취소
                </ModalButton>
                <ModalButtonPrimary type="submit" disabled={saving}>
                  {saving ? "저장 중.." : "생성"}
                </ModalButtonPrimary>
              </ModalFooter>
            </form>
          </ModalContent>
        </ModalOverlay>
      )}

      {statsManager && (
        <ModalOverlay>
          <StatsModalContent>
            <ModalHeader>
              <ModalTitle>{statsManager.name} 학습현황</ModalTitle>
            </ModalHeader>
            <ModalBody>
              {statsLoading && (
                <InfoText>학습현황을 불러오는 중입니다...</InfoText>
              )}
              {statsError && <ErrorText>{statsError}</ErrorText>}
              {!statsLoading && !statsError && (
                <>
                  <StatsSummary>
                    <StatsCard>
                      <StatsLabel>페이지 열람 횟수</StatsLabel>
                      <StatsValue>{statsSummary.totalViews}</StatsValue>
                    </StatsCard>
                    <StatsCard>
                      <StatsLabel>페이지 공유 횟수</StatsLabel>
                      <StatsValue>{statsSummary.totalShares}</StatsValue>
                    </StatsCard>
                  </StatsSummary>

                  <StatsTableContainer>
                    <StatsTable>
                      <thead>
                        <tr>
                          <th>카테고리</th>
                          <th>게시글</th>
                          <th>열람</th>
                          <th>공유</th>
                          <th>열람여부</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsPageItems.map((row) => (
                          <tr key={row.postId}>
                            <td>{getBoardCategoryFullLabel(row.categoryId)}</td>
                            <td>{row.title}</td>
                            <td>{row.viewCount}</td>
                            <td>{row.shareCount}</td>
                            <td>{row.viewCount > 0 ? "열람" : "미열람"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </StatsTable>
                  </StatsTableContainer>

                  <StatsPagination>
                    <PageButton
                      type="button"
                      onClick={() =>
                        setStatsPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={statsPage === 1}
                    >
                      이전
                    </PageButton>
                    <span>
                      {statsPage} / {statsPageCount} 페이지
                    </span>
                    <PageButton
                      type="button"
                      onClick={() =>
                        setStatsPage((prev) =>
                          Math.min(statsPageCount, prev + 1),
                        )
                      }
                      disabled={statsPage === statsPageCount}
                    >
                      다음
                    </PageButton>
                  </StatsPagination>
                </>
              )}
            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" onClick={() => setStatsManager(null)}>
                닫기
              </ModalButton>
            </ModalFooter>
          </StatsModalContent>
        </ModalOverlay>
      )}

      <OrganizationExplorerSection>
        <OrganizationExplorerHeader>
          <OrganizationExplorerTitle>조직 조회</OrganizationExplorerTitle>
          <OrganizationExplorerSelect
            value={explorerTargetId ?? ""}
            onChange={(event) =>
              setExplorerTargetId(event.target.value || null)
            }
          >
            <option value="">매니저 선택</option>
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.name || manager.managerId} ({manager.managerId})
              </option>
            ))}
          </OrganizationExplorerSelect>
        </OrganizationExplorerHeader>
        {organizationRequestPayload ? (
          <OrganizationExplorer
            requestPayload={organizationRequestPayload}
            baseManagerLabel={explorerManager?.name}
            onManagerSelect={handleExplorerManagerSelect}
          />
        ) : (
          <InfoText>
            {managers.length === 0
              ? "매니저를 먼저 등록한 후 조직 조회를 이용하세요."
              : "조직 조회를 볼 매니저를 선택하세요."}
          </InfoText>
        )}
      </OrganizationExplorerSection>
    </PageWrapper>
  );
};

export default ManagerManagementPage;

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  padding: 25px;
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
`;

const Title = styled.h1`
  font-size: 22px;
  font-weight: 700;
`;

const CreateButton = styled.button`
  padding: 8px 14px;
  border-radius: 6px;
  background: #333;
  color: #fff;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: #111;
  }

  &:disabled {
    background: #aaa;
    cursor: default;
  }
`;

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
`;

const SearchSelect = styled.select`
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 13px;
`;

const SearchInput = styled.input`
  min-width: 220px;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 13px;
`;

const SearchHint = styled.span`
  font-size: 12px;
  color: #777;
`;

const OrganizationExplorerSection = styled.div`
  margin-top: 32px;
  padding: 18px;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const OrganizationExplorerHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const OrganizationExplorerTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  margin: 0;
`;

const OrganizationExplorerSelect = styled.select`
  max-width: 220px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  font-size: 13px;
  background: #fff;
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

const TableWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
`;

const PaginationRow = styled.div`
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const PaginationInfo = styled.div`
  font-size: 12px;
  color: #666;
`;

const PaginationControls = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const PageButton = styled.button`
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  background: #fff;
  font-size: 12px;
  cursor: pointer;

  &:disabled {
    background: #f5f5f5;
    color: #aaa;
    cursor: default;
  }
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);

  thead {
    background: #f5f5f5;
  }

  th,
  td {
    padding: 10px 12px;
    font-size: 13px;
    text-align: left;
    border-bottom: 1px solid #eee;
    vertical-align: middle;
  }

  th {
    font-weight: 600;
    color: #555;
  }

  tbody tr:last-child td {
    border-bottom: none;
  }
`;

const StatusBadge = styled.span<{ $active: boolean }>`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: ${({ $active }) => ($active ? "#0b9150" : "#a94442")};
  background: ${({ $active }) =>
    $active ? "rgba(11,145,80,0.08)" : "rgba(169,68,66,0.08)"};
`;

const MemoText = styled.span`
  display: inline-block;
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RowActions = styled.div`
  display: flex;
  gap: 6px;
`;

const SmallButton = styled.button<{ $danger?: boolean }>`
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid ${({ $danger }) => ($danger ? "#999" : "#333")};
  background: #fff;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: ${({ $danger }) => ($danger ? "#f7f7f7" : "#f0f0f0")};
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
`;

const ModalContent = styled.div`
  width: 100%;
  max-width: 760px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.16);
`;

const StatsModalContent = styled(ModalContent)`
  max-width: 520px;
  max-height: 80vh;
  overflow: hidden;
`;

const ModalHeader = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
`;

const ModalTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
`;

const ModalBody = styled.div`
  padding: 16px 20px 8px;
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
`;

const ModalFooter = styled.div`
  padding: 12px 20px 16px;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`;

const ModalButton = styled.button`
  min-width: 80px;
  padding: 7px 12px;
  border-radius: 6px;
  border: 1px solid #ccc;
  background: #fff;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: #f7f7f7;
  }

  &:disabled {
    background: #f5f5f5;
    cursor: default;
  }
`;

const ModalButtonPrimary = styled.button`
  min-width: 90px;
  padding: 7px 12px;
  border-radius: 6px;
  border: none;
  background: #333;
  color: #fff;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: #111;
  }

  &:disabled {
    background: #aaa;
    cursor: default;
  }
`;

const FieldRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
`;

const Field = styled.div`
  flex: 1;
  min-width: 0;
`;

const FieldFull = styled.div`
  flex: 1;
  min-width: 0;
`;

const FieldLabel = styled.div`
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
`;

const FieldInput = styled.input`
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 13px;
`;

const FieldTextArea = styled.textarea`
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 13px;
  resize: vertical;
`;

const StatsSummary = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
`;

const StatsCard = styled.div`
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 12px 14px;
  background: #fafafa;
`;

const StatsLabel = styled.div`
  font-size: 12px;
  color: #777;
  margin-bottom: 6px;
`;

const StatsValue = styled.div`
  font-size: 18px;
  font-weight: 700;
`;

const StatsTableContainer = styled.div`
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 12px;
`;

const StatsPagination = styled.div`
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
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
