/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/admin/managers.tsx

"use client";

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { db, app } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc, // 👉 원본에 있던 import는 그대로 둠 (현재는 사용 X)
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
  query,
  where,
  setDoc,
} from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

type Manager = {
  id: string; // Firestore 문서 ID (== Auth uid)
  managerId: string;
  email: string;
  password?: string; // ⚠️ 실서비스에서는 해시 권장
  name: string;
  branch: string;
  uniqueCode: string;
  memo: string;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
};

const ManagerManagementPage: React.FC = () => {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 생성/수정 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingManager, setEditingManager] = useState<Manager | null>(null);
  const [saving, setSaving] = useState(false);

  const MANAGER_AUTH_EMAIL_SUFFIX = "@co.kr";
  const MANAGER_AUTH_COMMON_PASSWORD = "q1w2e3r4@@!!@@";

  // 폼 상태
  const [form, setForm] = useState({
    managerId: "",
    email: "",
    password: "",
    name: "",
    branch: "",
    uniqueCode: "",
    memo: "",
  });

  const auth = getAuth(app);

  // ✅ 매니저 리스트 불러오기 (users 컬렉션 + role === "manager")
  useEffect(() => {
    const fetchManagers = async () => {
      try {
        setLoading(true);
        setError(null);

        const q = query(
          collection(db, "users"),
          where("role", "==", "manager"),
          orderBy("createdAt", "desc")
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
            branch: data.branch ?? "",
            uniqueCode: data.uniqueCode ?? "",
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

  // ✅ 폼 열기 (생성 / 수정 공용)
  const openCreateModal = () => {
    setEditingManager(null);
    setForm({
      managerId: "",
      email: "",
      password: "",
      name: "",
      branch: "",
      uniqueCode: "",
      memo: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (manager: Manager) => {
    setEditingManager(manager);
    setForm({
      managerId: manager.managerId,
      email: manager.email,
      password: "", // 수정 시에는 비밀번호는 비워두고, Auth 비번은 변경하지 않음
      name: manager.name,
      branch: manager.branch,
      uniqueCode: manager.uniqueCode,
      memo: manager.memo,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setIsModalOpen(false);
  };

  // ✅ 폼 입력 변경
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // ✅ 생성/수정 저장
  // ✅ 생성/수정 저장
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isEdit = !!editingManager;

    if (!form.managerId || !form.name || !form.branch) {
      alert("매니저 아이디, 매니저명, 지점은 필수입니다.");
      return;
    }

    if (!isEdit) {
      // ✅ 신규 생성 시에는 "로그인용 비밀번호"만 필수
      if (!form.password) {
        alert("신규 매니저 생성 시 로그인 비밀번호는 필수입니다.");
        return;
      }
    }

    setSaving(true);

    try {
      if (isEdit && editingManager) {
        // ✏️ 수정: Auth 계정(email/password)은 건드리지 않고, Firestore 메타 정보만 수정
        const ref = doc(db, "users", editingManager.id);
        await updateDoc(ref, {
          managerId: form.managerId,
          // email은 여기서 변경하지 않음 (Auth와 동기화 필요하기 때문)
          name: form.name,
          branch: form.branch,
          uniqueCode: form.uniqueCode,
          memo: form.memo,
          updatedAt: serverTimestamp(),
        });

        setManagers((prev) =>
          prev.map((m) =>
            m.id === editingManager.id
              ? {
                  ...m,
                  managerId: form.managerId,
                  // email은 그대로 유지
                  name: form.name,
                  branch: form.branch,
                  uniqueCode: form.uniqueCode,
                  memo: form.memo,
                }
              : m
          )
        );
      } else {
        // ➕ 신규 생성
        const now = serverTimestamp();

        // ✅ 매니저 아이디 기반으로 Auth용 이메일/비밀번호 생성
        const authEmail = `${form.managerId}${MANAGER_AUTH_EMAIL_SUFFIX}`;
        const commonPassword = MANAGER_AUTH_COMMON_PASSWORD; // 공통 비밀번호

        // 1) Firebase Auth 계정 생성 (authEmail + 공통 비밀번호)
        const cred = await createUserWithEmailAndPassword(
          auth,
          authEmail,
          commonPassword
        );
        const uid = cred.user.uid;

        // 2) users/{uid} 문서 생성 (role: "manager")
        const ref = doc(db, "users", uid);
        await setDoc(ref, {
          managerId: form.managerId,
          // 🔹 Auth와 맞추기 위해 Firestore에도 authEmail을 저장
          email: authEmail,
          // 🔹 여기는 "매니저가 로그인할 때 입력하는 비밀번호" (예: 123123)
          //    로그인 페이지에서 managerId + password 검증 후
          //    Auth에는 공통 비밀번호로 로그인
          password: form.password,
          name: form.name,
          branch: form.branch,
          uniqueCode: form.uniqueCode,
          memo: form.memo,
          role: "manager",
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });

        setManagers((prev) => [
          {
            id: uid,
            managerId: form.managerId,
            email: authEmail,
            password: form.password,
            name: form.name,
            branch: form.branch,
            uniqueCode: form.uniqueCode,
            memo: form.memo,
            isActive: true,
          },
          ...prev,
        ]);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error("매니저 저장 중 오류:", err);
      alert("매니저 정보를 저장하는 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // ✅ 활동 정지/해제 토글
  const handleToggleActive = async (manager: Manager) => {
    const nextActive = !manager.isActive;

    // UI 반응성 위해 낙관적 업데이트
    setManagers((prev) =>
      prev.map((m) =>
        m.id === manager.id ? { ...m, isActive: nextActive } : m
      )
    );

    try {
      const ref = doc(db, "users", manager.id);
      await updateDoc(ref, {
        isActive: nextActive,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error("활동 상태 변경 오류:", err);
      alert("활동 상태 변경 중 오류가 발생했습니다.");

      // 실패 시 롤백
      setManagers((prev) =>
        prev.map((m) =>
          m.id === manager.id ? { ...m, isActive: manager.isActive } : m
        )
      );
    }
  };

  return (
    <PageWrapper>
      <HeaderRow>
        <Title>매니저 관리</Title>
        <CreateButton type="button" onClick={openCreateModal}>
          + 매니저 계정 생성
        </CreateButton>
      </HeaderRow>

      {loading && <InfoText>매니저 목록을 불러오는 중입니다...</InfoText>}
      {error && <ErrorText>{error}</ErrorText>}

      {!loading && !error && managers.length === 0 && (
        <InfoText>등록된 매니저 계정이 없습니다.</InfoText>
      )}

      {!loading && !error && managers.length > 0 && (
        <TableWrapper>
          <StyledTable>
            <thead>
              <tr>
                <th>활성</th>
                <th>매니저 아이디</th>
                <th>매니저명</th>
                <th>지점</th>
                <th>고유번호</th>
                <th>메모</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {managers.map((m) => (
                <tr key={m.id}>
                  <td>
                    <StatusBadge $active={m.isActive}>
                      {m.isActive ? "활성" : "정지"}
                    </StatusBadge>
                  </td>
                  <td>{m.managerId}</td>
                  <td>{m.email}</td>
                  <td>{m.name}</td>
                  <td>{m.branch}</td>
                  <td>{m.uniqueCode}</td>
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
                        $danger={!m.isActive}
                        onClick={() => handleToggleActive(m)}
                      >
                        {m.isActive ? "정지" : "활성화"}
                      </SmallButton>
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </StyledTable>
        </TableWrapper>
      )}

      {/* 생성/수정 모달 */}
      {isModalOpen && (
        <ModalOverlay>
          <ModalContent>
            <ModalHeader>
              <ModalTitle>
                {editingManager ? "매니저 계정 수정" : "매니저 계정 생성"}
              </ModalTitle>
            </ModalHeader>
            <form onSubmit={handleSubmit}>
              <ModalBody>
                <FieldRow>
                  <Field>
                    <FieldLabel>매니저 아이디 *</FieldLabel>
                    <FieldInput
                      name="managerId"
                      value={form.managerId}
                      onChange={handleChange}
                      placeholder="예: manager001"
                    />
                  </Field>
                </FieldRow>

                <FieldRow>
                  <Field>
                    <FieldLabel>
                      패스워드 {editingManager ? "(변경 불가)" : "*"}
                    </FieldLabel>
                    <FieldInput
                      type="text"
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      placeholder={
                        editingManager
                          ? "기존 비밀번호는 변경 화면에서 관리해주세요."
                          : "로그인에 사용할 패스워드"
                      }
                      disabled={!!editingManager} // 수정 시에는 비밀번호 변경 X
                    />
                  </Field>
                  <Field>
                    <FieldLabel>매니저명 *</FieldLabel>
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
                    <FieldLabel>지점 *</FieldLabel>
                    <FieldInput
                      name="branch"
                      value={form.branch}
                      onChange={handleChange}
                      placeholder="예: 서울지점"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>고유번호</FieldLabel>
                    <FieldInput
                      name="uniqueCode"
                      value={form.uniqueCode}
                      onChange={handleChange}
                      placeholder="내부용 고유번호"
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
                  {saving
                    ? "저장 중..."
                    : editingManager
                    ? "수정 완료"
                    : "생성"}
                </ModalButtonPrimary>
              </ModalFooter>
            </form>
          </ModalContent>
        </ModalOverlay>
      )}
    </PageWrapper>
  );
};

export default ManagerManagementPage;

// ===== styled-components 쪽은 원래 코드 그대로 사용 =====

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
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
  max-width: 640px;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.16);
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
