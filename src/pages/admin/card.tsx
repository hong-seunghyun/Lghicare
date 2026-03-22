/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query as fsQuery,
  orderBy as fsOrderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type CardDiscount = {
  id: string;
  cardName: string;
  amount: number;
  allowTeacher: boolean;
  isActive: boolean;
  order: number;
};

export default function CardDiscountAdminPage() {
  const [cards, setCards] = useState<CardDiscount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 신규 생성용 폼
  const [newCardName, setNewCardName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newAllowTeacher, setNewAllowTeacher] = useState(false);
  const [newIsActive, setNewIsActive] = useState(true);

  // 수정용 타겟
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editCardName, setEditCardName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editAllowTeacher, setEditAllowTeacher] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);

  // 정렬된 카드 목록 (order → cardName fallback)
  const sortedCards = useMemo(() => {
    return [...cards].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.cardName.localeCompare(b.cardName);
    });
  }, [cards]);

  // 제휴카드 목록 로딩
  useEffect(() => {
    const fetchCards = async () => {
      try {
        setLoading(true);
        const colRef = collection(db, "cardDiscounts");
        const q = fsQuery(colRef, fsOrderBy("order"));
        const snap = await getDocs(q);

        const list: CardDiscount[] = snap.docs.map((d, idx) => {
          const data = d.data() as any;
          return {
            id: d.id,
            cardName: data.cardName || "",
            amount: Number(data.amount ?? 0),
            allowTeacher: !!data.allowTeacher,
            isActive: data.isActive !== false,
            order: typeof data.order === "number" ? data.order : idx + 1, // order 없으면 임시 순번
          };
        });

        setCards(list);
      } catch (err) {
        console.error("❌ 제휴카드 할인 데이터 불러오기 오류:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCards();
  }, []);

  // 신규 카드 추가
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardName.trim()) {
      alert("카드사 이름을 입력해주세요.");
      return;
    }

    const amountNum = Number(newAmount.replace(/[^0-9]/g, "") || "0");
    if (Number.isNaN(amountNum) || amountNum < 0) {
      alert("할인 금액은 0 이상의 숫자로 입력해주세요.");
      return;
    }

    try {
      setSaving(true);

      const maxOrder =
        cards.length > 0 ? Math.max(...cards.map((c) => c.order)) : 0;

      const docRef = await addDoc(collection(db, "cardDiscounts"), {
        cardName: newCardName.trim(),
        amount: amountNum,
        allowTeacher: newAllowTeacher,
        isActive: newIsActive,
        order: maxOrder + 1,
      });

      const newCard: CardDiscount = {
        id: docRef.id,
        cardName: newCardName.trim(),
        amount: amountNum,
        allowTeacher: newAllowTeacher,
        isActive: newIsActive,
        order: maxOrder + 1,
      };

      setCards((prev) => [...prev, newCard]);

      // 폼 리셋
      setNewCardName("");
      setNewAmount("");
      setNewAllowTeacher(false);
      setNewIsActive(true);
    } catch (err) {
      console.error("❌ 제휴카드 생성 오류:", err);
      alert("제휴카드 생성 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // 수정 모드 진입
  const startEdit = (card: CardDiscount) => {
    setEditTargetId(card.id);
    setEditCardName(card.cardName);
    setEditAmount(card.amount.toString());
    setEditAllowTeacher(card.allowTeacher);
    setEditIsActive(card.isActive);
  };

  // 수정 취소
  const cancelEdit = () => {
    setEditTargetId(null);
    setEditCardName("");
    setEditAmount("");
    setEditAllowTeacher(false);
    setEditIsActive(true);
  };

  // 카드 정보 수정 저장
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTargetId) return;

    if (!editCardName.trim()) {
      alert("카드사 이름을 입력해주세요.");
      return;
    }

    const amountNum = Number(editAmount.replace(/[^0-9]/g, "") || "0");
    if (Number.isNaN(amountNum) || amountNum < 0) {
      alert("할인 금액은 0 이상의 숫자로 입력해주세요.");
      return;
    }

    try {
      setSaving(true);

      const ref = doc(db, "cardDiscounts", editTargetId);
      await updateDoc(ref, {
        cardName: editCardName.trim(),
        amount: amountNum,
        allowTeacher: editAllowTeacher,
        isActive: editIsActive,
      });

      setCards((prev) =>
        prev.map((c) =>
          c.id === editTargetId
            ? {
                ...c,
                cardName: editCardName.trim(),
                amount: amountNum,
                allowTeacher: editAllowTeacher,
                isActive: editIsActive,
              }
            : c,
        ),
      );

      cancelEdit();
    } catch (err) {
      console.error("❌ 제휴카드 수정 오류:", err);
      alert("제휴카드 수정 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // isActive 토글 (빠른 on/off)
  const toggleActive = async (card: CardDiscount) => {
    try {
      setSaving(true);
      const ref = doc(db, "cardDiscounts", card.id);
      await updateDoc(ref, { isActive: !card.isActive });

      setCards((prev) =>
        prev.map((c) =>
          c.id === card.id ? { ...c, isActive: !card.isActive } : c,
        ),
      );
    } catch (err) {
      console.error("❌ 활성/비활성 토글 오류:", err);
      alert("활성/비활성 변경 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // allowTeacher 토글 (빠른 on/off)
  const toggleAllowTeacher = async (card: CardDiscount) => {
    try {
      setSaving(true);
      const ref = doc(db, "cardDiscounts", card.id);
      await updateDoc(ref, { allowTeacher: !card.allowTeacher });

      setCards((prev) =>
        prev.map((c) =>
          c.id === card.id ? { ...c, allowTeacher: !card.allowTeacher } : c,
        ),
      );
    } catch (err) {
      console.error("❌ 구독교원 허용 토글 오류:", err);
      alert("구독교원 허용 여부 변경 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Wrapper>
      <Header>
        <h1>제휴카드 할인 관리</h1>
        {saving && <SavingBadge>저장 중...</SavingBadge>}
      </Header>

      {/* 생성/수정 폼 */}
      <Card>
        <FormTitle>
          {editTargetId ? "제휴카드 수정" : "제휴카드 추가"}
        </FormTitle>
        <form onSubmit={editTargetId ? handleUpdate : handleCreate}>
          <FormRow>
            <label>카드사</label>
            <input
              type="text"
              value={editTargetId ? editCardName : newCardName}
              onChange={(e) =>
                editTargetId
                  ? setEditCardName(e.target.value)
                  : setNewCardName(e.target.value)
              }
              placeholder="예: 신한카드 / 우리카드"
            />
          </FormRow>

          <FormRow>
            <label>월 할인 금액</label>
            <input
              type="text"
              value={editTargetId ? editAmount : newAmount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, "");
                editTargetId ? setEditAmount(v) : setNewAmount(v);
              }}
              placeholder="예: 13000"
            />
          </FormRow>

          <FormRowInline>
            <label>
              <input
                type="checkbox"
                checked={editTargetId ? editAllowTeacher : newAllowTeacher}
                onChange={(e) =>
                  editTargetId
                    ? setEditAllowTeacher(e.target.checked)
                    : setNewAllowTeacher(e.target.checked)
                }
              />
              &nbsp;이 카드에서만 구독교원 사용 가능
            </label>
          </FormRowInline>

          <FormRowInline>
            <label>
              <input
                type="checkbox"
                checked={editTargetId ? editIsActive : newIsActive}
                onChange={(e) =>
                  editTargetId
                    ? setEditIsActive(e.target.checked)
                    : setNewIsActive(e.target.checked)
                }
              />
              &nbsp;노출 (isActive)
            </label>
          </FormRowInline>

          <FormButtons>
            <button type="submit" disabled={saving}>
              {editTargetId ? "수정 저장" : "추가"}
            </button>
            {editTargetId && (
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                style={{ marginLeft: "8px", background: "#eee", color: "#333" }}
              >
                수정 취소
              </button>
            )}
          </FormButtons>
        </form>
      </Card>

      {/* 리스트 */}
      <Card>
        <FormTitle>제휴카드 리스트</FormTitle>
        {loading ? (
          <p>불러오는 중...</p>
        ) : sortedCards.length === 0 ? (
          <p>등록된 제휴카드가 없습니다.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>순서(order)</th>
                <th>카드사</th>
                <th>월 할인 금액</th>
                <th>구독교원 허용</th>
                <th>노출</th>
                <th>수정</th>
              </tr>
            </thead>
            <tbody>
              {sortedCards.map((card) => (
                <tr key={card.id}>
                  <td>{card.order}</td>
                  <td>{card.cardName}</td>
                  <td>{card.amount.toLocaleString()}원</td>
                  <td>
                    <ToggleButton
                      type="button"
                      onClick={() => toggleAllowTeacher(card)}
                      $active={card.allowTeacher}
                      disabled={saving}
                    >
                      {card.allowTeacher ? "허용" : "미허용"}
                    </ToggleButton>
                  </td>
                  <td>
                    <ToggleButton
                      type="button"
                      onClick={() => toggleActive(card)}
                      $active={card.isActive}
                      disabled={saving}
                    >
                      {card.isActive ? "ON" : "OFF"}
                    </ToggleButton>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => startEdit(card)}
                      disabled={saving}
                    >
                      수정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Wrapper>
  );
}

/* ----------------- styled-components ----------------- */

const Wrapper = styled.div`
  margin: 40px auto;
  padding: 0 16px 40px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;

  h1 {
    font-size: 24px;
    font-weight: 700;
  }
`;

const SavingBadge = styled.span`
  font-size: 13px;
  color: #555;
`;

const Card = styled.div`
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  margin-bottom: 24px;
`;

const FormTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
`;

const FormRow = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;

  label {
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 4px;
  }

  input[type="text"] {
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 14px;
  }
`;

const FormRowInline = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 8px;

  label {
    font-size: 14px;
    cursor: pointer;
  }

  input[type="checkbox"] {
    cursor: pointer;
  }
`;

const FormButtons = styled.div`
  margin-top: 12px;

  button {
    border-radius: 6px;
    border: none;
    padding: 8px 14px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    background: #111;
    color: #fff;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;

  th,
  td {
    border-bottom: 1px solid #eee;
    padding: 8px 6px;
    text-align: left;
    vertical-align: middle;
  }

  th {
    font-weight: 600;
    background: #fafafa;
  }

  td button {
    border-radius: 4px;
    border: none;
    padding: 4px 8px;
    font-size: 13px;
    cursor: pointer;
    background: #f1f1f1;
  }

  td button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ToggleButton = styled.button<{ $active: boolean }>`
  border-radius: 4px;
  border: none;
  padding: 4px 10px;
  font-size: 13px;
  cursor: pointer;
  background: ${({ $active }) => ($active ? "#111" : "#eee")};
  color: ${({ $active }) => ($active ? "#fff" : "#333")};

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
