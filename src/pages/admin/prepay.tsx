/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/admin/prepay.tsx
import React, { useEffect, useState } from "react";
import styled from "styled-components";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  writeBatch,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase"; // 프로젝트에 맞는 경로 사용

interface PrepayRuleItem {
  id: string;
  middle: string;
  sub?: string | null;
  model?: string | null;
  rate30: boolean;
  rate50: boolean;
}

export default function PrepayAdminPage() {
  const [rules, setRules] = useState<PrepayRuleItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 🔥 일괄 등록용 상태 (중분류/소분류 입력 필드 제거, 텍스트만 사용)
  const [bulkText, setBulkText] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  // 🔍 중복 검수 결과
  const [duplicateModels, setDuplicateModels] = useState<string[]>([]);

  //  선택된 항목 관리
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchRules = async () => {
      try {
        setLoading(true);
        const colRef = collection(db, "prepayRules");
        const q = query(colRef, orderBy("middle"));
        const snap = await getDocs(q);

        const items: PrepayRuleItem[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            middle: data.middle || "",
            sub: data.sub ?? null,
            model: data.model ?? null,
            rate30: !!data.rate30,
            rate50: !!data.rate50,
          };
        });

        setRules(items);
        // 로드 후, 존재하지 않는 id는 선택에서 제거
        setSelectedIds((prev) => {
          const next = new Set<string>();
          items.forEach((r) => {
            if (prev.has(r.id)) next.add(r.id);
          });
          return next;
        });
      } catch (err) {
        console.error("❌ prepayRules 불러오기 오류:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRules();
  }, []);

  const handleToggle = async (
    id: string,
    field: "rate30" | "rate50",
    value: boolean,
  ) => {
    try {
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
      );
      await updateDoc(doc(db, "prepayRules", id), {
        [field]: value,
        updatedAt: new Date(),
      });
    } catch (err) {
      console.error("❌ 선납 rule 업데이트 오류:", err);
    }
  };

  const handleAdd = async () => {
    const id = prompt("새 모델 코드(doc id)를 입력하세요 (예: OLED83G5KW)");
    if (!id) return;

    const middle = prompt("중분류를 입력하세요 (예: TV, 정수기)") || "";
    const sub = prompt("소분류(없으면 빈칸)") || "";
    const rate30 = window.confirm("30% 선납 가능?");
    const rate50 = window.confirm("50% 선납 가능? (30%는 자동 포함)");

    // 50% true인데 30% false면 30%를 강제로 true로
    const finalRate30 = rate30 || rate50;
    const finalRate50 = rate50;

    try {
      const trimmedId = id.trim();
      const docRef = doc(collection(db, "prepayRules"), trimmedId);
      await setDoc(docRef, {
        middle: middle.trim(),
        sub: sub.trim() || null,
        model: trimmedId,
        rate30: finalRate30,
        rate50: finalRate50,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      setRules((prev) => [
        ...prev,
        {
          id: trimmedId,
          middle: middle.trim(),
          sub: sub.trim() || null,
          model: trimmedId,
          rate30: finalRate30,
          rate50: finalRate50,
        },
      ]);
    } catch (err) {
      console.error("❌ 선납 rule 추가 오류:", err);
    }
  };

  //  체크박스: 단일 선택 토글
  const handleSelectToggle = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  //  체크박스: 전체 선택 토글
  const handleSelectAllToggle = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    const next = new Set<string>();
    rules.forEach((r) => next.add(r.id));
    setSelectedIds(next);
  };

  const isAllSelected = rules.length > 0 && selectedIds.size === rules.length;

  // 🔥 단일 삭제
  const handleDelete = async (id: string) => {
    const confirmDelete = window.confirm(
      `정말 삭제하시겠어요?\n(doc id: ${id})`,
    );
    if (!confirmDelete) return;

    const prevRules = rules;
    try {
      setRules((prev) => prev.filter((r) => r.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await deleteDoc(doc(db, "prepayRules", id));
    } catch (err) {
      console.error("❌ 선납 rule 삭제 오류:", err);
      alert("삭제 중 오류가 발생했습니다. 다시 시도해주세요.");
      setRules(prevRules);
    }
  };

  // 공통: 주어진 id 목록을 batch로 삭제
  const deleteByIdsBatch = async (ids: string[]) => {
    const chunkSize = 400;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      slice.forEach((id) => {
        batch.delete(doc(db, "prepayRules", id));
      });
      await batch.commit();
    }
  };

  // 🔥 선택 항목 삭제
  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      alert("삭제할 항목을 선택해주세요.");
      return;
    }

    const confirmDelete = window.confirm(
      `선택된 ${ids.length}개의 항목을 삭제하시겠어요?`,
    );
    if (!confirmDelete) return;

    const prevRules = rules;
    try {
      const idSet = new Set(ids);
      setRules((prev) => prev.filter((r) => !idSet.has(r.id)));
      setSelectedIds(new Set());

      await deleteByIdsBatch(ids);
    } catch (err) {
      console.error("❌ 선택 삭제 중 오류:", err);
      alert("선택 삭제 중 오류가 발생했습니다. 다시 시도해주세요.");
      setRules(prevRules);
    }
  };

  // 🔥 전체 삭제
  const handleDeleteAll = async () => {
    if (!rules.length) {
      alert("삭제할 데이터가 없습니다.");
      return;
    }

    const confirmDelete = window.confirm(
      `prepayRules 전체 ${rules.length}개 항목을 모두 삭제하시겠어요?\n되돌릴 수 없습니다.`,
    );
    if (!confirmDelete) return;

    const prevRules = rules;
    try {
      const ids = rules.map((r) => r.id);
      setRules([]);
      setSelectedIds(new Set());

      await deleteByIdsBatch(ids);
    } catch (err) {
      console.error("❌ 전체 삭제 중 오류:", err);
      alert("전체 삭제 중 오류가 발생했습니다. 다시 시도해주세요.");
      setRules(prevRules);
    }
  };

  // 🔥 엑셀/텍스트 기반 일괄 등록 (형식: 중분류 모델 30% 50%)
  const handleBulkAdd = async () => {
    const lines = bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      alert(
        "등록할 데이터가 없습니다. 엑셀에서 복사한 내용을 붙여넣어 주세요.",
      );
      return;
    }

    try {
      setBulkSaving(true);

      const batch = writeBatch(db);
      const newItems: PrepayRuleItem[] = [];

      const seenInBulk = new Set<string>();
      const bulkDuplicateModels: string[] = [];
      const modelsForced30: string[] = []; // 50% 때문에 30%를 강제로 true로 만든 모델들

      for (const line of lines) {
        const parts = line.split(/[\s,]+/).filter(Boolean);
        if (parts.length < 4) {
          continue;
        }
        const middle = parts[0]?.trim();
        const model = parts[1]?.trim();
        const raw30 = (parts[parts.length - 2] || "").trim().toUpperCase();
        const raw50 = (parts[parts.length - 1] || "").trim().toUpperCase();

        if (!middle || !model) continue;

        // 일괄 입력 내 중복 모델 검수
        if (seenInBulk.has(model)) {
          if (!bulkDuplicateModels.includes(model)) {
            bulkDuplicateModels.push(model);
          }
          continue;
        }
        seenInBulk.add(model);

        const baseRate30 =
          raw30 === "O" || raw30 === "Y" || raw30 === "1" || raw30 === "TRUE";
        const baseRate50 =
          raw50 === "O" || raw50 === "Y" || raw50 === "1" || raw50 === "TRUE";

        let rate30 = baseRate30;
        const rate50 = baseRate50;

        // 🔥 50% true인데 30% false면 30%를 강제로 true
        if (rate50 && !rate30) {
          rate30 = true;
          modelsForced30.push(model);
        }

        const id = model;
        const docRef = doc(collection(db, "prepayRules"), id);

        batch.set(
          docRef,
          {
            middle,
            sub: null,
            model,
            rate30,
            rate50,
            updatedAt: new Date(),
            createdAt: new Date(),
          },
          { merge: true },
        );

        newItems.push({
          id,
          middle,
          sub: null,
          model,
          rate30,
          rate50,
        });
      }

      if (bulkDuplicateModels.length) {
        alert(
          `아래 모델 코드는 붙여넣기 데이터 내에서 중복되어 한 번만 반영되었습니다.\n\n${bulkDuplicateModels.join(
            ", ",
          )}`,
        );
      }

      if (modelsForced30.length) {
        alert(
          `아래 모델은 50%가 선택되어 30%도 자동으로 체크했습니다.\n\n${modelsForced30.join(
            ", ",
          )}`,
        );
      }

      if (!newItems.length) {
        alert(
          "유효한 데이터가 없습니다. 형식을 다시 확인해주세요.\n(예: TV OLED83G5KW X O)",
        );
        setBulkSaving(false);
        return;
      }

      await batch.commit();

      // 기존 rules와 병합하여 상태 업데이트
      setRules((prev) => {
        const map = new Map<string, PrepayRuleItem>();
        prev.forEach((r) => {
          map.set(r.id, r);
        });
        newItems.forEach((item) => {
          const existing = map.get(item.id);
          map.set(item.id, existing ? { ...existing, ...item } : item);
        });

        const merged = Array.from(map.values());
        merged.sort((a, b) => {
          const m = a.middle.localeCompare(b.middle);
          if (m !== 0) return m;
          const ma = (a.model || "").localeCompare(b.model || "");
          return ma;
        });

        return merged;
      });

      setBulkText("");
      alert(`${newItems.length}개의 선납 규칙이 저장되었습니다.`);
    } catch (err) {
      console.error("❌ 선납 rule 일괄 등록 오류:", err);
      alert("일괄 등록 중 오류가 발생했습니다. 콘솔 로그를 확인해주세요.");
    } finally {
      setBulkSaving(false);
    }
  };

  // 🔥 현재 rules 기준 중복 검수 (model 기준)
  const handleCheckDuplicates = () => {
    const map = new Map<string, number>();

    rules.forEach((r) => {
      const key = (r.model || r.id || "").trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });

    const dups: string[] = [];
    map.forEach((count, key) => {
      if (count > 1) dups.push(key);
    });

    setDuplicateModels(dups);

    if (dups.length === 0) {
      alert("중복된 모델이 없습니다.");
    } else {
      alert(
        `중복된 모델 코드가 발견되었습니다.\n\n${dups.join(
          ", ",
        )}\n\n아래 '중복 모델 목록'을 확인해주세요.`,
      );
    }
  };

  return (
    <Wrapper>
      <Header>
        <h1>선납 설정 관리</h1>
        <HeaderRight>
          <button onClick={handleCheckDuplicates}>중복 검수</button>
          <button onClick={handleDeleteSelected}>선택 삭제</button>
          <button onClick={handleDeleteAll}>전체 삭제</button>
          <button onClick={handleAdd}>새 모델 추가</button>
        </HeaderRight>
      </Header>

      {/* 🔥 엑셀 기반 일괄 등록 섹션 */}
      <BulkSection>
        <BulkTitle>엑셀 데이터 일괄 등록</BulkTitle>
        <BulkHelp>
          엑셀에서 <strong>중분류 / 모델 / 30% / 50%</strong> 열을 복사해서
          붙여넣어주세요.
          <br />
          예: <code>TV OLED83G5KW X O</code>
          <br />
          30%, 50% 칼럼은 <code>O / X</code>, <code>Y / N</code>,{" "}
          <code>1 / 0</code>, <code>TRUE / FALSE</code> 형태를 모두 인식합니다.
          <br />
          <strong>※ 50%를 선택할 때는 30%가 자동으로 함께 선택됩니다.</strong>
        </BulkHelp>
        <BulkTextarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={"예)\nTV OLED83G5KW X O\nTV OLED77G5KW O O\n..."}
        />
        <BulkButton onClick={handleBulkAdd} disabled={bulkSaving}>
          {bulkSaving ? "저장 중..." : "일괄 등록"}
        </BulkButton>
      </BulkSection>

      {/* 🔍 중복 모델 목록 표시 */}
      {duplicateModels.length > 0 && (
        <DuplicateBox>
          <DuplicateTitle>중복 모델 목록</DuplicateTitle>
          <DuplicateText>
            아래 모델 코드는 prepayRules 컬렉션 내에서 2회 이상 등장합니다.
          </DuplicateText>
          <DuplicateList>
            {duplicateModels.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </DuplicateList>
        </DuplicateBox>
      )}

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
              <th>중분류</th>
              <th>소분류</th>
              <th>모델</th>
              <th>30% 선납</th>
              <th>50% 선납</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(rule.id)}
                    onChange={(e) =>
                      handleSelectToggle(rule.id, e.target.checked)
                    }
                  />
                </td>
                <td>{rule.middle}</td>
                <td>{rule.sub || "-"}</td>
                <td>{rule.model || "-"}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={rule.rate30}
                    onChange={(e) =>
                      handleToggle(rule.id, "rate30", e.target.checked)
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={rule.rate50}
                    onChange={(e) =>
                      handleToggle(rule.id, "rate50", e.target.checked)
                    }
                  />
                </td>
                <td>
                  <DeleteButton onClick={() => handleDelete(rule.id)}>
                    삭제
                  </DeleteButton>
                </td>
              </tr>
            ))}
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
  margin-bottom: 24px;

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

const BulkSection = styled.section`
  border: 1px solid #eee;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 32px;
  background: #fafafa;
`;

const BulkTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
`;

const BulkHelp = styled.p`
  font-size: 12px;
  color: #666;
  margin: 4px 0 8px;

  code {
    background: #f0f0f0;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 11px;
  }

  strong {
    font-weight: 600;
  }
`;

const BulkTextarea = styled.textarea`
  width: 100%;
  min-height: 140px;
  padding: 8px;
  font-size: 13px;
  border-radius: 4px;
  border: 1px solid #ddd;
  resize: vertical;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
`;

const BulkButton = styled.button`
  margin-top: 10px;
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  background: #111;
  color: #fff;
  cursor: pointer;
  font-size: 13px;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const DuplicateBox = styled.section`
  border: 1px solid #f0caca;
  background: #fff7f7;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 24px;
`;

const DuplicateTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
`;

const DuplicateText = styled.p`
  font-size: 12px;
  color: #a33;
  margin-bottom: 4px;
`;

const DuplicateList = styled.ul`
  font-size: 12px;
  color: #a33;
  margin: 4px 0 0;
  padding-left: 18px;

  li + li {
    margin-top: 2px;
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
  }

  th {
    background: #fafafa;
    font-weight: 600;
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
