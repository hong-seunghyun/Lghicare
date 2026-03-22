/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/admin/teacher.tsx
import React, { useEffect, useState } from "react";
import styled from "styled-components";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

interface TeacherPlan {
  id: string;
  type: string; // LG구독교원 144 등
  maxSeats: number; // 신청 가능 최대 구좌 (0~4)
  discountPerSeat: number; // 구좌당 할인 금액
}

export default function TeacherPlanAdminPage() {
  const [plans, setPlans] = useState<TeacherPlan[]>([]);
  const [loading, setLoading] = useState(false);

  // 선택된 항목들
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        const colRef = collection(db, "teacherPlans");
        const q = query(colRef, orderBy("type"));
        const snap = await getDocs(q);

        const items: TeacherPlan[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            type: data.type || "",
            maxSeats: Number(data.maxSeats ?? 0),
            discountPerSeat: Number(data.discountPerSeat ?? 0),
          };
        });

        setPlans(items);
        // 로드 후, 존재하지 않는 id는 선택에서 제거
        setSelectedIds((prev) => {
          const next = new Set<string>();
          items.forEach((p) => {
            if (prev.has(p.id)) next.add(p.id);
          });
          return next;
        });
      } catch (err) {
        console.error("❌ teacherPlans 불러오기 오류:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const isAllSelected = plans.length > 0 && selectedIds.size === plans.length;

  const handleSelectToggle = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAllToggle = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    const next = new Set<string>();
    plans.forEach((p) => next.add(p.id));
    setSelectedIds(next);
  };

  // 신규 구독교원 유형 추가
  const handleAdd = async () => {
    const type = prompt("구독교원 유형을 입력하세요 (예: LG구독교원 144)");
    if (!type) return;

    const maxSeatsStr = prompt("신청 가능 최대 구좌를 입력하세요 (0~4, 예: 4)");
    if (!maxSeatsStr) return;

    const maxSeats = Number(maxSeatsStr);
    if (!Number.isInteger(maxSeats) || maxSeats < 0 || maxSeats > 4) {
      alert("신청 가능 구좌는 0 이상 4 이하의 정수만 가능합니다.");
      return;
    }

    const discountStr = prompt(
      "구좌당 할인 금액을 입력하세요 (쉼표 없이 숫자만, 예: 20000)",
    );
    if (!discountStr) return;

    const discount = Number(discountStr);
    if (!Number.isFinite(discount) || discount < 0) {
      alert("구좌당 할인 금액은 0 이상 숫자여야 합니다.");
      return;
    }

    try {
      const colRef = collection(db, "teacherPlans");
      const docRef = doc(colRef); // auto id
      const now = new Date();

      await setDoc(docRef, {
        type: type.trim(),
        maxSeats,
        discountPerSeat: discount,
        createdAt: now,
        updatedAt: now,
      });

      setPlans((prev) => [
        ...prev,
        {
          id: docRef.id,
          type: type.trim(),
          maxSeats,
          discountPerSeat: discount,
        },
      ]);
    } catch (err) {
      console.error("❌ 구독교원 추가 오류:", err);
      alert("구독교원 추가 중 오류가 발생했습니다.");
    }
  };

  // 기존 유형 수정
  const handleEdit = async (plan: TeacherPlan) => {
    const type = prompt(
      "구독교원 유형을 수정하세요",
      plan.type || "LG구독교원 144",
    );
    if (!type) return;

    const maxSeatsStr = prompt(
      "신청 가능 최대 구좌를 수정하세요 (0~4)",
      String(plan.maxSeats),
    );
    if (!maxSeatsStr) return;

    const maxSeats = Number(maxSeatsStr);
    if (!Number.isInteger(maxSeats) || maxSeats < 0 || maxSeats > 4) {
      alert("신청 가능 구좌는 0 이상 4 이하의 정수만 가능합니다.");
      return;
    }

    const discountStr = prompt(
      "구좌당 할인 금액을 수정하세요 (쉼표 없이 숫자만)",
      String(plan.discountPerSeat),
    );
    if (!discountStr) return;

    const discount = Number(discountStr);
    if (!Number.isFinite(discount) || discount < 0) {
      alert("구좌당 할인 금액은 0 이상 숫자여야 합니다.");
      return;
    }

    try {
      const docRef = doc(db, "teacherPlans", plan.id);
      const now = new Date();

      await updateDoc(docRef, {
        type: type.trim(),
        maxSeats,
        discountPerSeat: discount,
        updatedAt: now,
      });

      setPlans((prev) =>
        prev.map((p) =>
          p.id === plan.id
            ? {
                ...p,
                type: type.trim(),
                maxSeats,
                discountPerSeat: discount,
              }
            : p,
        ),
      );
    } catch (err) {
      console.error("❌ 구독교원 수정 오류:", err);
      alert("수정 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = async (id: string) => {
    const target = plans.find((p) => p.id === id);
    const label = target?.type || id;

    const confirmDelete = window.confirm(`정말 삭제하시겠어요?\n(${label})`);
    if (!confirmDelete) return;

    const prevPlans = plans;
    try {
      setPlans((prev) => prev.filter((p) => p.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      await deleteDoc(doc(db, "teacherPlans", id));
    } catch (err) {
      console.error("❌ 구독교원 삭제 오류:", err);
      alert("삭제 중 오류가 발생했습니다.");
      setPlans(prevPlans);
    }
  };

  const deleteByIdsBatch = async (ids: string[]) => {
    const chunkSize = 400;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      slice.forEach((id) => {
        batch.delete(doc(db, "teacherPlans", id));
      });
      await batch.commit();
    }
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      alert("삭제할 항목을 선택해주세요.");
      return;
    }

    const confirmDelete = window.confirm(
      `선택된 ${ids.length}개의 구독교원 유형을 삭제하시겠어요?`,
    );
    if (!confirmDelete) return;

    const prevPlans = plans;
    try {
      const idSet = new Set(ids);
      setPlans((prev) => prev.filter((p) => !idSet.has(p.id)));
      setSelectedIds(new Set());
      await deleteByIdsBatch(ids);
    } catch (err) {
      console.error("❌ 선택 삭제 오류:", err);
      alert("선택 삭제 중 오류가 발생했습니다.");
      setPlans(prevPlans);
    }
  };

  const handleDeleteAll = async () => {
    if (!plans.length) {
      alert("삭제할 데이터가 없습니다.");
      return;
    }

    const confirmDelete = window.confirm(
      `teacherPlans 컬렉션의 모든 ${plans.length}개 항목을 삭제하시겠어요?\n되돌릴 수 없습니다.`,
    );
    if (!confirmDelete) return;

    const prevPlans = plans;
    try {
      const ids = plans.map((p) => p.id);
      setPlans([]);
      setSelectedIds(new Set());
      await deleteByIdsBatch(ids);
    } catch (err) {
      console.error("❌ 전체 삭제 오류:", err);
      alert("전체 삭제 중 오류가 발생했습니다.");
      setPlans(prevPlans);
    }
  };

  return (
    <Wrapper>
      <Header>
        <h1>구독교원 설정 관리</h1>
        <HeaderRight>
          <button onClick={handleDeleteSelected}>선택 삭제</button>
          <button onClick={handleDeleteAll}>전체 삭제</button>
          <button onClick={handleAdd}>신규 구좌 추가</button>
        </HeaderRight>
      </Header>

      <Description>
        LG 구독교원 유형별로 <strong>신청 가능 최대 구좌(최대 4)</strong>와{" "}
        <strong>구좌당 할인 금액</strong>을 관리합니다.
        <br />
        예시: LG구독교원 144 → maxSeats: 4, discountPerSeat: 20000
      </Description>

      {loading ? (
        <div>불러오는 중...</div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={(e) => handleSelectAllToggle(e.target.checked)}
                />
              </th>
              <th>유형</th>
              <th>신청 가능 최대 구좌</th>
              <th>구좌당 할인 금액</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(plan.id)}
                    onChange={(e) =>
                      handleSelectToggle(plan.id, e.target.checked)
                    }
                  />
                </td>
                <td>{plan.type}</td>
                <td>{plan.maxSeats}</td>
                <td>{plan.discountPerSeat.toLocaleString()}원</td>
                <td>
                  <ActionButton onClick={() => handleEdit(plan)}>
                    수정
                  </ActionButton>
                  <DeleteButton onClick={() => handleDelete(plan.id)}>
                    삭제
                  </DeleteButton>
                </td>
              </tr>
            ))}
            {!plans.length && (
              <tr>
                <td colSpan={5} style={{ padding: "16px" }}>
                  등록된 구독교원 유형이 없습니다. 오른쪽 상단의{" "}
                  <strong>신규 구좌 추가</strong> 버튼으로 추가해주세요.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      )}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  margin: 40px auto;
  padding: 0 16px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;

  h1 {
    font-size: 22px;
    font-weight: 600;
  }
`;

const HeaderRight = styled.div`
  display: flex;
  gap: 8px;

  button {
    padding: 8px 12px;
    border-radius: 4px;
    border: none;
    background: #111;
    color: #fff;
    cursor: pointer;
    font-size: 13px;
  }
`;

const Description = styled.p`
  font-size: 12px;
  color: #666;
  margin-bottom: 16px;
  line-height: 1.5;

  strong {
    font-weight: 600;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    border: 1px solid #eee;
    padding: 8px;
    text-align: center;
    font-size: 13px;
  }

  th {
    background: #fafafa;
    font-weight: 600;
  }
`;

const ActionButton = styled.button`
  padding: 4px 8px;
  border-radius: 4px;
  border: none;
  background: #3498db;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  margin-right: 4px;

  &:hover {
    background: #2980b9;
  }
`;

const DeleteButton = styled.button`
  padding: 4px 8px;
  border-radius: 4px;
  border: none;
  background: #e74c3c;
  color: #fff;
  cursor: pointer;
  font-size: 12px;

  &:hover {
    background: #c0392b;
  }
`;
