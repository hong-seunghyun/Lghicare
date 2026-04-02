/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import ManagerEditModal, { StatRow } from "@/components/ManagerEditModal";
import {
  fetchManagerLearningDetails,
  LearningActivityRow,
} from "@/lib/learning";

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

type Tier =
  | "areaAdmin"
  | "regionLeader"
  | "officeHead"
  | "teamLeader"
  | "member";

type ManagerRecord = {
  id: string;
  managerId: string;
  name: string;
  position: string;
  region: string;
  office: string;
  teamLeaderId: string;
  password?: string;
  isActive: boolean;
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

const getTier = (position?: string): Tier => {
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

const tierLabelMap: Record<Tier, string> = {
  areaAdmin: "지역 관리자",
  regionLeader: "리더사무소장",
  officeHead: "사무소장",
  teamLeader: "팀장",
  member: "팀원",
};

const ManagerManagementPage: React.FC = () => {
  const [session, setSession] = useState<ManagerSession | null>(null);
  const [tier, setTier] = useState<Tier>("member");
  const [loading, setLoading] = useState(false);
  const [managedManagers, setManagedManagers] = useState<ManagerRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");

  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalManager, setModalManager] = useState<ManagerRecord | null>(null);
  const [modalForm, setModalForm] = useState({
    name: "",
    password: "",
    region: "",
    office: "",
    teamLeaderId: "",
  });
  const [modalSaving, setModalSaving] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<string | null>(null);
  const [modalFeedbackError, setModalFeedbackError] = useState<string | null>(null);
  const [modalCategoryActivity, setModalCategoryActivity] =
    useState<StatRow[]>([]);
  const [modalProductActivity, setModalProductActivity] =
    useState<StatRow[]>([]);
  const [modalActivityTotals, setModalActivityTotals] = useState({
    estimateCount: 0,
    shareCount: 0,
  });
  const [modalActivityLoading, setModalActivityLoading] = useState(false);
  const [modalActivityError, setModalActivityError] = useState<string | null>(
    null,
  );
  const [modalLearningTotals, setModalLearningTotals] = useState({
    views: 0,
    shares: 0,
  });
  const [modalLearningLoading, setModalLearningLoading] = useState(false);
  const [modalLearningError, setModalLearningError] = useState<string | null>(
    null,
  );
  const [modalLearningDetails, setModalLearningDetails] = useState<
    LearningActivityRow[]
  >([]);
  const PAGE_SIZE = 10;
  const [pageByTier, setPageByTier] = useState<Record<Tier, number>>({
    areaAdmin: 1,
    regionLeader: 1,
    officeHead: 1,
    teamLeader: 1,
    member: 1,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("managerSession");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as ManagerSession;
      setSession(parsed);
      setTier(getTier(parsed.position));
    } catch {
      setError("세션 정보를 불러오는 중 오류가 발생했습니다.");
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    if (tier === "member") {
      setManagedManagers([]);
      setError("현재 권한으로는 매니저 관리 페이지를 사용할 수 없습니다.");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        let list: ManagerRecord[] = [];

        if (tier === "areaAdmin") {
          const area = getAreaFromRegion(session.region);
          if (!area) {
            throw new Error("지역 정보가 없어 매니저를 불러올 수 없습니다.");
          }
          const managerQuery = query(
            collection(db, "users"),
            where("role", "==", "manager"),
          );
          const snap = await getDocs(managerQuery);
          list = snap.docs
            .map((docSnap) => {
              const data = docSnap.data() as any;
              return {
                id: docSnap.id,
                managerId: data.managerId ?? "",
                name: data.name ?? "",
                position: data.position ?? "",
                region: data.region ?? "",
                office: data.office ?? data.branch ?? "",
                teamLeaderId: data.teamLeaderId ?? "",
                password: data.password ?? "",
                isActive: data.isActive ?? true,
              };
            })
            .filter(
              (item) =>
                item.id !== session.id &&
                getAreaFromRegion(item.region) === area,
            );
        } else {
          let managerQuery;
          if (tier === "regionLeader") {
            if (!session.region) {
              throw new Error("지역 정보가 없어 매니저를 불러올 수 없습니다.");
            }
            managerQuery = query(
              collection(db, "users"),
              where("role", "==", "manager"),
              where("region", "==", session.region),
            );
          } else if (tier === "officeHead") {
            if (!session.office) {
              throw new Error("사무소 정보가 없어 매니저를 불러올 수 없습니다.");
            }
            managerQuery = query(
              collection(db, "users"),
              where("role", "==", "manager"),
              where("office", "==", session.office),
            );
          } else {
            if (!session.managerId) {
              throw new Error("팀장 아이디가 없어 매니저를 불러올 수 없습니다.");
            }
            managerQuery = query(
              collection(db, "users"),
              where("role", "==", "manager"),
              where("teamLeaderId", "==", session.managerId),
            );
          }

          const snap = await getDocs(managerQuery);
          list = snap.docs
            .map((docSnap) => {
              const data = docSnap.data() as any;
              return {
                id: docSnap.id,
                managerId: data.managerId ?? "",
                name: data.name ?? "",
                position: data.position ?? "",
                region: data.region ?? "",
                office: data.office ?? data.branch ?? "",
                teamLeaderId: data.teamLeaderId ?? "",
                password: data.password ?? "",
                isActive: data.isActive ?? true,
              };
            })
            .filter((item) => item.id !== session.id);
        }

        setManagedManagers(list);
      } catch (err: any) {
        setManagedManagers([]);
        setError(
          err instanceof Error
            ? err.message
            : "매니저 목록을 불러오는 중 오류가 발생했습니다.",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [session, tier]);

  const filteredManagedManagers = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return managedManagers;

    return managedManagers.filter((manager) =>
      [
        manager.managerId,
        manager.name,
        manager.position,
        manager.region,
        manager.office,
        manager.teamLeaderId,
      ].some((value) => String(value ?? "").toLowerCase().includes(keyword)),
    );
  }, [managedManagers, searchKeyword]);

  useEffect(() => {
    setPageByTier({
      areaAdmin: 1,
      regionLeader: 1,
      officeHead: 1,
      teamLeader: 1,
      member: 1,
    });
  }, [searchKeyword]);

  const regionLeaderManagers = useMemo(
    () =>
      filteredManagedManagers.filter(
        (manager) => getTier(manager.position) === "regionLeader",
      ),
    [filteredManagedManagers],
  );

  const officeHeadManagers = useMemo(
    () =>
      filteredManagedManagers.filter(
        (manager) => getTier(manager.position) === "officeHead",
      ),
    [filteredManagedManagers],
  );

  const teamLeaderManagers = useMemo(
    () =>
      filteredManagedManagers.filter(
        (manager) => getTier(manager.position) === "teamLeader",
      ),
    [filteredManagedManagers],
  );

  const teamMemberManagers = useMemo(
    () =>
      filteredManagedManagers.filter(
        (manager) => getTier(manager.position) === "member",
      ),
    [filteredManagedManagers],
  );

  const regionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          managedManagers
            .map((manager) => manager.region)
            .filter((value) => Boolean(value)),
        ),
      ),
    [managedManagers],
  );

  const officeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          managedManagers
            .map((manager) => manager.office)
            .filter((value) => Boolean(value)),
        ),
      ),
    [managedManagers],
  );

  const teamLeaderOptions = useMemo(() => {
    const map = new Map<string, string>();
    teamLeaderManagers.forEach((leader) => {
      if (leader.managerId) {
        map.set(leader.managerId, leader.name);
      }
    });
    if (tier === "teamLeader" && session?.managerId) {
      map.set(session.managerId, session.name);
    }
    return Array.from(map.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [session, teamLeaderManagers, tier]);

  const teamLeaderNameMap = useMemo(() => {
    const map = new Map<string, string>();
    teamLeaderManagers.forEach((leader) => {
      if (leader.managerId) {
        map.set(leader.managerId, leader.name);
      }
    });
    if (tier === "teamLeader" && session?.managerId) {
      map.set(session.managerId, session.name);
    }
    return map;
  }, [session, teamLeaderManagers, tier]);

  const handleRowClick = (managerId: string) => {
    setSelectedManagerId((prev) => (prev === managerId ? null : managerId));
  };

  const handlePageChange = (section: Tier, nextPage: number, totalPages: number) => {
    setPageByTier((prev) => ({
      ...prev,
      [section]: Math.min(Math.max(nextPage, 1), totalPages),
    }));
  };

  const openModal = (manager: ManagerRecord) => {
    setSelectedManagerId(manager.id);
    setModalManager(manager);
    setModalForm({
      name: manager.name,
      password: "",
      region: manager.region,
      office: manager.office,
      teamLeaderId: manager.teamLeaderId,
    });
    setModalFeedback(null);
    setModalFeedbackError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (modalSaving) return;
    setModalOpen(false);
    setModalManager(null);
  };

  useEffect(() => {
    if (!modalManager) {
      setModalCategoryActivity([]);
      setModalProductActivity([]);
      setModalActivityTotals({ estimateCount: 0, shareCount: 0 });
      setModalActivityError(null);
      setModalActivityLoading(false);
      setModalLearningTotals({ views: 0, shares: 0 });
      setModalLearningError(null);
      setModalLearningLoading(false);
      setModalLearningDetails([]);
      return;
    }

    let cancelled = false;

    const fetchModalActivity = async () => {
      try {
        setModalActivityLoading(true);
        setModalLearningLoading(true);
        setModalActivityError(null);
        setModalLearningError(null);

        const [categorySnap, productSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "managerCategoryStats"),
              where("managerUid", "==", modalManager.id),
            ),
          ),
          getDocs(
            query(
              collection(db, "managerProductStats"),
              where("managerUid", "==", modalManager.id),
            ),
          ),
        ]);

        if (cancelled) return;

        const categories = aggregateStats(
          categorySnap.docs.map((docSnap) => docSnap.data()),
          "type",
          "type",
        );
        const products = aggregateStats(
          productSnap.docs.map((docSnap) => docSnap.data()),
          "modelCode",
          "productName",
        );

        const estimateTotal = categories.reduce(
          (sum, row) => sum + row.estimateCount,
          0,
        );
        const shareTotal = categories.reduce(
          (sum, row) => sum + row.shareCount,
          0,
        );

        setModalCategoryActivity(categories);
        setModalProductActivity(products);
        setModalActivityTotals({
          estimateCount: estimateTotal,
          shareCount: shareTotal,
        });

        try {
          const { totals, details } = await fetchManagerLearningDetails(
            modalManager.id,
          );

          if (cancelled) return;

          setModalLearningDetails(details);
          setModalLearningTotals(totals);
        } catch (learningError) {
          console.error("학습현황 조회 오류:", learningError);
          if (!cancelled) {
            setModalLearningError("학습 활동을 불러오는 중 오류가 발생했습니다.");
            setModalLearningTotals({ views: 0, shares: 0 });
            setModalLearningDetails([]);
          }
        }
      } catch (error) {
        console.error("매니저 활동내역 조회 오류:", error);
        if (!cancelled) {
          setModalActivityError("활동내역을 불러오는 중 오류가 발생했습니다.");
          setModalLearningError("학습 활동을 불러오는 중 오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) {
          setModalActivityLoading(false);
          setModalLearningLoading(false);
        }
      }
    };

    fetchModalActivity();
    return () => {
      cancelled = true;
    };
  }, [modalManager]);

  const handleModalFormChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setModalForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleModalSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!modalManager) return;

    const trimmedName = modalForm.name.trim();
    if (!trimmedName) {
      setModalFeedbackError("이름을 입력해 주세요.");
      return;
    }

    const currentTier = getTier(modalManager.position);
    const allowRegionEdit =
      (tier === "areaAdmin" && currentTier !== "areaAdmin") ||
      (tier === "regionLeader" && currentTier !== "regionLeader");
    const allowOfficeEdit =
      (tier === "areaAdmin" && currentTier !== "areaAdmin") ||
      ((tier === "regionLeader" || tier === "officeHead") &&
        currentTier !== "regionLeader");
    const allowTeamLeaderEdit = tier !== "teamLeader" && currentTier === "member";

    const updates: Partial<ManagerRecord> = {};
    if (trimmedName !== modalManager.name) updates.name = trimmedName;
    if (modalForm.password.trim()) updates.password = modalForm.password.trim();
    if (allowRegionEdit && modalForm.region.trim() !== modalManager.region) {
      updates.region = modalForm.region.trim();
    }
    if (allowOfficeEdit && modalForm.office.trim() !== modalManager.office) {
      updates.office = modalForm.office.trim();
    }
    if (
      allowTeamLeaderEdit &&
      modalForm.teamLeaderId.trim() !== modalManager.teamLeaderId
    ) {
      updates.teamLeaderId = modalForm.teamLeaderId.trim();
    }

    if (Object.keys(updates).length === 0) {
      setModalFeedback("변경된 내용이 없습니다.");
      return;
    }

    setModalSaving(true);
    setModalFeedback(null);
    setModalFeedbackError(null);

    try {
      const payload = {
        ...updates,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, "users", modalManager.id), payload);
      setManagedManagers((prev) =>
        prev.map((manager) =>
          manager.id === modalManager.id ? { ...manager, ...updates } : manager,
        ),
      );
      setModalManager((prev) => (prev ? { ...prev, ...updates } : prev));
      setModalFeedback("저장되었습니다.");
      setModalForm((prev) => ({ ...prev, password: "" }));
    } catch (err) {
      console.error("매니저 관리 저장 오류:", err);
      setModalFeedbackError("저장 중 오류가 발생했습니다.");
    } finally {
      setModalSaving(false);
    }
  };

  const renderSection = (
    title: string,
    description: string,
    list: ManagerRecord[],
    sectionTier: Tier,
  ) => {
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const currentPage = pageByTier[sectionTier] ?? 1;
    const paginatedList = list.slice(
      (currentPage - 1) * PAGE_SIZE,
      currentPage * PAGE_SIZE,
    );

    return (
      <SectionWrapper key={sectionTier}>
        <SectionHeader>
          <SectionTitle>{title}</SectionTitle>
          <SectionDescription>{description}</SectionDescription>
        </SectionHeader>

        {list.length === 0 ? (
          <EmptyState>해당 범위의 하위 매니저가 없습니다.</EmptyState>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>매니저ID</TableHeaderCell>
                  <TableHeaderCell>이름</TableHeaderCell>
                  <TableHeaderCell>직급</TableHeaderCell>
                  <TableHeaderCell>지역</TableHeaderCell>
                  <TableHeaderCell>사무소</TableHeaderCell>
                  <TableHeaderCell>담당 팀장</TableHeaderCell>
                  <TableHeaderCell>상태</TableHeaderCell>
                  <TableHeaderCell>작업</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedList.map((manager) => {
                  const tierLabel = tierLabelMap[getTier(manager.position)];
                  const teamLeaderLabel =
                    manager.teamLeaderId && teamLeaderNameMap.get(manager.teamLeaderId)
                      ? `${teamLeaderNameMap.get(manager.teamLeaderId)} (${manager.teamLeaderId})`
                      : manager.teamLeaderId || "-";
                  return (
                    <TableRow
                      key={manager.id}
                      $selected={selectedManagerId === manager.id}
                      onClick={() => handleRowClick(manager.id)}
                    >
                      <TableCell>{manager.managerId || "-"}</TableCell>
                      <TableCell>
                        {manager.name || "-"}
                        <TierBadge>{tierLabel}</TierBadge>
                      </TableCell>
                      <TableCell>{manager.position || "-"}</TableCell>
                      <TableCell>{manager.region || "-"}</TableCell>
                      <TableCell>{manager.office || "-"}</TableCell>
                      <TableCell>{teamLeaderLabel}</TableCell>
                      <TableCell>{manager.isActive ? "활성" : "비활성"}</TableCell>
                      <TableCell>
                        <ActionButton type="button" onClick={() => openModal(manager)}>
                          편집
                        </ActionButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <PaginationRow>
              <PageButton
                type="button"
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(sectionTier, currentPage - 1, totalPages)}
              >
                이전
              </PageButton>
              <PageInfo>
                {currentPage} / {totalPages}
              </PageInfo>
              <PageButton
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => handlePageChange(sectionTier, currentPage + 1, totalPages)}
              >
                다음
              </PageButton>
            </PaginationRow>
          </>
        )}
      </SectionWrapper>
    );
  };

  return (
    <PageWrapper>
      <Heading>
        <PageTitle>매니저 관리</PageTitle>
        <PageSubtitle>
          본 페이지에서는 리더 사무소장, 사무소장, 팀장님께서 담당 범위 내 매니저의
          이름·비밀번호·소속을 변경하실 수 있습니다.
        </PageSubtitle>
      </Heading>

      <SearchPanel>
        <SearchLabel htmlFor="manager-management-search">검색</SearchLabel>
        <SearchInput
          id="manager-management-search"
          value={searchKeyword}
          onChange={(event) => setSearchKeyword(event.target.value)}
          placeholder="이름, 직급, 권역, 사무소, 업무등록번호, 담당팀장 검색"
        />
      </SearchPanel>

      {error && <ErrorText>{error}</ErrorText>}
      {loading && !error && (
        <InfoText>하위 매니저 정보를 불러오는 중입니다.</InfoText>
      )}

      {!loading && !error && (
        <>
          {tier === "areaAdmin" && (
            <>
              {renderSection(
                "리더사무소장",
                "담당 지역에 속한 권역 리더를 관리합니다.",
                regionLeaderManagers,
                "regionLeader",
              )}
              {renderSection(
                "사무소장",
                "담당 지역 전체의 사무소장을 관리합니다.",
                officeHeadManagers,
                "officeHead",
              )}
              {renderSection(
                "팀장",
                "담당 지역 전체의 팀장을 관리합니다.",
                teamLeaderManagers,
                "teamLeader",
              )}
              {renderSection(
                "팀원",
                "담당 지역 전체의 일반 매니저를 관리합니다.",
                teamMemberManagers,
                "member",
              )}
            </>
          )}
          {tier === "regionLeader" && (
            <>
              {renderSection(
                "사무소장",
                "권역 내 사무소장(리더 아래)을 관리합니다.",
                officeHeadManagers,
                "officeHead",
              )}
              {renderSection(
                "팀장",
                "전체 사무소의 팀장을 관리합니다.",
                teamLeaderManagers,
                "teamLeader",
              )}
            </>
          )}
          {(tier === "regionLeader" || tier === "officeHead") &&
            renderSection(
              "팀원",
              "팀장의 팀원(일반 매니저)을 확인하고 소속을 조정합니다.",
              teamMemberManagers,
              "member",
            )}
          {tier === "teamLeader" &&
            renderSection(
              "팀원",
              "현재 팀에 속한 매니저만 표시됩니다.",
              teamMemberManagers,
              "member",
            )}
        </>
      )}

      {modalOpen && modalManager && (
        <ManagerEditModal
          manager={modalManager}
          form={modalForm}
          onFormChange={handleModalFormChange}
          onSubmit={handleModalSave}
          onClose={closeModal}
          saving={modalSaving}
          feedback={modalFeedback}
          feedbackError={modalFeedbackError}
          activityLoading={modalActivityLoading}
          activityError={modalActivityError}
          activityTotals={modalActivityTotals}
          categoryActivity={modalCategoryActivity}
          productActivity={modalProductActivity}
          regionListId="manager-management-region-options"
          officeListId="manager-management-office-options"
          teamLeaderListId="manager-management-teamleader-options"
          learningTotals={modalLearningTotals}
          learningLoading={modalLearningLoading}
          learningError={modalLearningError}
          learningDetails={modalLearningDetails}
        />
      )}

      <datalist id="manager-management-region-options">
        {regionOptions.map((value) => (
          <option value={value} key={`region-${value}`} />
        ))}
      </datalist>
      <datalist id="manager-management-office-options">
        {officeOptions.map((value) => (
          <option value={value} key={`office-${value}`} />
        ))}
      </datalist>
      <datalist id="manager-management-teamleader-options">
        {teamLeaderOptions.map((option) => (
          <option
            value={option.value}
            key={`teamleader-${option.value}`}
            label={option.label}
          />
        ))}
      </datalist>
    </PageWrapper>
  );
};

export default ManagerManagementPage;

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const Heading = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const PageTitle = styled.h1`
  font-size: 24px;
  font-weight: 700;
`;

const PageSubtitle = styled.p`
  font-size: 14px;
  color: #555;
`;

const SearchPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e1e1e1;
  padding: 16px;
`;

const SearchLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: #555;
`;

const SearchInput = styled.input`
  width: 100%;
  max-width: 420px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #dcdcdc;
  font-size: 14px;
`;

const InfoText = styled.div`
  font-size: 14px;
  color: #555;
`;

const ErrorText = styled.div`
  font-size: 13px;
  color: #e74c3c;
`;

const SectionWrapper = styled.section`
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e1e1e1;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SectionHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const SectionTitle = styled.div`
  font-size: 18px;
  font-weight: 600;
`;

const SectionDescription = styled.div`
  font-size: 13px;
  color: #777;
`;

const EmptyState = styled.div`
  font-size: 13px;
  color: #777;
  padding: 10px 0;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHead = styled.thead`
  background: #f9fafc;
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr<{ $selected?: boolean }>`
  background: ${({ $selected }) => ($selected ? "#f4f7ff" : "#fff")};
  &:hover {
    background: #f4f7ff;
  }
`;

const TableCell = styled.td`
  padding: 12px 10px;
  font-size: 13px;
  border-bottom: 1px solid #ececec;
  &:first-child {
    font-weight: 600;
  }
`;

const TableHeaderCell = styled.th`
  padding: 12px 10px;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  color: #555;
  border-bottom: 2px solid #e5e5e5;
`;

const TierBadge = styled.span`
  display: inline-flex;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: #e9ecff;
  color: #2f7ff9;
`;

const ActionButton = styled.button`
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #2c8fff;
  background: #fff;
  color: #2c8fff;
  font-size: 13px;
  cursor: pointer;
  &:hover {
    background: #2c8fff;
    color: #fff;
  }
`;

const PaginationRow = styled.div`
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
`;

const PageButton = styled.button`
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #d3d3d3;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  &:disabled {
    color: #aaa;
    border-color: #eee;
    cursor: default;
  }
`;

const PageInfo = styled.span`
  font-size: 12px;
  color: #666;
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
  &:disabled {
    background: #f7f7f7;
    border-color: #e0e0e0;
  }
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

const ProductName = styled.span`
  display: inline-block;
  max-width: 160px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;
