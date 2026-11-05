/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import {
  CardBenefit,
  PreviewLine,
  TeacherSelection,
  lineTotals,
  money,
  quoteTotals,
  textValue,
} from "@/lib/renewalTest";
import { useRenewalMeta } from "@/hooks/useRenewalData";
import { Accordion, CategoryRail, SelectField } from "./Controls";
import { Modal } from "./TestLayout";
import s from "./renewal.module.css";

type Props = {
  lines: PreviewLine[];
  onApply: (
    id: string,
    card?: CardBenefit,
    teachers?: TeacherSelection[],
  ) => void;
  onClose: () => void;
  initialTab?: "card" | "subscription";
};
const bankName = (card?: CardBenefit) =>
  card?.issuer.match(/^\[([^\]]+)\]/)?.[1] || card?.issuer || "";

function Specs({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table className={s.benefitSpecs}>
      <thead>
        <tr>
          <th>항목</th>
          <th>계약 내용</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SubscriptionPanel({
  lines,
  id,
  onSelect,
}: {
  lines: PreviewLine[];
  id: string;
  onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState("care");
  const line = lines.find((item) => item.id === id)!;
  const t = lineTotals(line);
  return (
    <div className={s.subscriptionLayout}>
      <nav
        className={s.benefitProductList}
        aria-label="혜택을 확인할 견적 제품"
      >
        {lines.map((item) => (
          <button
            key={item.id}
            className={item.id === id ? s.benefitProductActive : ""}
            aria-pressed={item.id === id}
            onClick={() => onSelect(item.id)}
          >
            {item.product.image && <img src={item.product.image} alt="" />}
            <span>
              <b>{item.product.name}</b>
              <small>{item.product.id}</small>
            </span>
          </button>
        ))}
      </nav>
      <div className={s.subscriptionContent}>
        <div
          className={s.benefitSubTabs}
          role="group"
          aria-label="구독혜택 항목"
        >
          {[
            ["care", "케어 서비스"],
            ["benefit", "구독 할인"],
            ["promotion", "프로모션"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={tab === value}
              className={tab === value ? s.tabActive : ""}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={s.selectedBenefitProduct}>
          {line.product.image && <img src={line.product.image} alt="" />}
          <div>
            <h3>{line.product.name}</h3>
            <p>{line.product.id}</p>
            <b>월 구독료 {money(t.monthly)}</b>
          </div>
        </div>
        {tab === "care" && (
          <>
            <Specs
              rows={[
                ["관리 방식", line.care || "해당 없음"],
                [
                  "관리 주기",
                  textValue(line.selectedVariant["서비스주기/월"]) ||
                    "해당 없음",
                ],
                ["계약 기간", `${line.term / 12}년 (${line.term}개월)`],
                ["가입 유형", line.signup || "기본 가입"],
              ]}
            />
            <Accordion title="적용 프로모션">
              <p>
                {textValue(line.selectedVariant.프로모션명) ||
                  "적용된 프로모션이 없습니다."}
              </p>
            </Accordion>
            <Accordion title={`제품 상품권 · ${money(t.voucher)}`}>
              <VoucherDetails line={line} />
            </Accordion>
          </>
        )}
        {tab === "benefit" && (
          <>
            <Specs
              rows={[
                ["기본 월 구독료", money(t.normal)],
                ["프로모션 할인", `−${money(t.discount)}`],
                [
                  "제휴카드 청구 할인",
                  `${line.card?.issuer || "미적용"} · −${money(t.card)}`,
                ],
                ["구독교원 할인", `−${money(t.teacher)}`],
                ["혜택 후 월 예상 부담금", money(t.effective)],
              ]}
            />
            <Accordion title="선납·예상 총비용">
              <Specs
                rows={[
                  ["선납금", money(t.deposit)],
                  ["계약 월 구독료", money(t.monthly)],
                  ["예상 계약 총비용", money(t.total)],
                ]}
              />
              <p className={s.caption}>
                선택한 월 요금이 계약 기간 동안 유지되는 기준이며, 총비용에
                카드·교원 할인은 포함하지 않습니다.
              </p>
            </Accordion>
            <Accordion title="카드·교원 적용 조건">
              <p>
                카드 실적과 구독교원 유지 등 해당 혜택 조건 충족 시 예상
                금액입니다. 할인은 월 구독료 한도 내에서 적용됩니다.
              </p>
            </Accordion>
          </>
        )}
        {tab === "promotion" && (
          <>
            <Accordion title={`프로모션 할인 · ${money(t.discount)} / 월`} open>
              <p>
                {textValue(line.selectedVariant.프로모션명) ||
                  "적용된 프로모션이 없습니다."}
              </p>
              <small>{textValue(line.selectedVariant.프로모션유형)}</small>
            </Accordion>
            <Accordion title={`제품 상품권 · ${money(t.voucher)}`} open>
              <VoucherDetails line={line} />
            </Accordion>
          </>
        )}
      </div>
    </div>
  );
}
function VoucherDetails({ line }: { line: PreviewLine }) {
  return line.voucherDetails?.length ? (
    <ul className={s.voucherDetails}>
      {line.voucherDetails.map((item, index) => (
        <li key={index}>
          <b>
            {item.type} · {money(item.amount)}
          </b>
          <p>{item.reason}</p>
        </li>
      ))}
    </ul>
  ) : (
    <p>
      {line.voucherTotal === undefined
        ? "저장된 상품권 조회 내역이 없습니다."
        : "선택한 조건에 적용된 상품권이 없습니다."}
    </p>
  );
}

export function CardDialog({
  lines,
  onApply,
  onClose,
  initialTab = "card",
}: Props) {
  const [tab, setTab] = useState(initialTab);
  const { cards, teachers, loading, error } = useRenewalMeta(tab === "card");
  const [id, setId] = useState(lines[0].id);
  const [cardId, setCardId] = useState(lines[0].card?.id ?? "");
  const [bankFilter, setBankFilter] = useState("");
  const [seats, setSeats] = useState<Record<string, number>>(
    Object.fromEntries(lines[0].teachers.map((p) => [p.id, p.seats])),
  );
  const selected = lines.find((line) => line.id === id)!;
  const card = cards.find((item) => item.id === cardId);
  const selections = card?.allowTeacher
    ? teachers
        .filter((plan) => (seats[plan.id] ?? 0) > 0)
        .map((plan) => ({ ...plan, seats: seats[plan.id] }))
    : [];
  const totalSeats = selections.reduce((sum, plan) => sum + plan.seats, 0);
  const draft = { ...selected, card, teachers: selections };
  const preview = lineTotals(draft);
  const previewLines = lines.map((line) => (line.id === id ? draft : line));
  const totals = quoteTotals(previewLines);
  const bank = bankFilter || bankName(card || cards[0]);
  const banks = [...new Set(cards.map(bankName))];
  const chooseProduct = (value: string) => {
    const line = lines.find((item) => item.id === value)!;
    setId(value);
    setCardId(line.card?.id ?? "");
    setBankFilter("");
    setSeats(
      Object.fromEntries(line.teachers.map((plan) => [plan.id, plan.seats])),
    );
  };
  return (
    <Modal
      title="혜택 조회 / 적용"
      onClose={onClose}
      wide
      className={s.benefitsDialog}
    >
      <div className={s.benefitTopTabs} role="group" aria-label="혜택 종류">
        <button
          className={tab === "card" ? s.tabActive : ""}
          aria-pressed={tab === "card"}
          onClick={() => setTab("card")}
        >
          카드혜택
        </button>
        <button
          className={tab === "subscription" ? s.tabActive : ""}
          aria-pressed={tab === "subscription"}
          onClick={() => setTab("subscription")}
        >
          구독혜택
        </button>
      </div>
      {tab === "card" ? (
        <>
          <div className={s.benefitCardLayout}>
            <div className={s.benefitEditor}>
              <div className={s.benefitTarget}>
                <SelectField
                  label="적용 대상 제품"
                  value={id}
                  options={lines.map((line) => ({
                    value: line.id,
                    label: `${line.product.category} · ${line.product.id}`,
                  }))}
                  onChange={chooseProduct}
                />
                {selected.product.image && (
                  <img
                    src={selected.product.image}
                    alt={selected.product.name}
                  />
                )}
              </div>
              {loading ? (
                <p role="status">할인 정보를 불러오고 있습니다.</p>
              ) : error ? (
                <p className={s.error} role="alert">
                  {error}
                </p>
              ) : (
                <>
                  <div>
                    <h3 className={s.benefitControlTitle}>제휴 카드사</h3>
                    <CategoryRail label="카드사" className={s.bankRail}>
                      {banks.map((name) => (
                        <button
                          key={name}
                          aria-pressed={bank === name}
                          className={bank === name ? s.chipActive : ""}
                          onClick={() => {
                            setBankFilter(name);
                            setCardId(
                              cards.find((item) => bankName(item) === name)
                                ?.id ?? "",
                            );
                            setSeats({});
                          }}
                        >
                          {name}
                        </button>
                      ))}
                    </CategoryRail>
                  </div>
                  <SelectField
                    label="카드 상품"
                    value={cardId}
                    options={[
                      { value: "", label: "혜택 적용 안 함" },
                      ...cards
                        .filter((item) => bankName(item) === bank)
                        .map((item) => ({
                          value: item.id,
                          label: item.issuer,
                        })),
                    ]}
                    onChange={(value) => {
                      setCardId(value);
                      setSeats({});
                    }}
                  />
                  <div className={s.cardPolicy}>
                    <div>
                      <span>등록 월 할인</span>
                      <strong>{card ? money(card.discount) : "미적용"}</strong>
                    </div>
                    <div>
                      <span>구독교원 중복</span>
                      <b>
                        {card
                          ? card.allowTeacher
                            ? "적용 가능"
                            : "적용 불가"
                          : "카드 선택 후 확인"}
                      </b>
                    </div>
                  </div>
                  {card?.allowTeacher && (
                    <Accordion title={`구독교원 추가 할인 · ${totalSeats}구좌`}>
                      <p className={s.caption}>
                        전체 최대 4구좌까지 선택할 수 있습니다.
                      </p>
                      <div className={s.teacherChoices}>
                        {teachers.map((plan) => (
                          <SelectField
                            key={plan.id}
                            label={`${plan.type} · 구좌당 월 ${money(plan.discountPerSeat)}`}
                            value={String(seats[plan.id] ?? 0)}
                            options={Array.from(
                              { length: Math.min(plan.maxSeats, 4) + 1 },
                              (_, n) => ({
                                value: String(n),
                                label: `${n}구좌`,
                              }),
                            )}
                            onChange={(value) => {
                              const count = Number(value);
                              if (
                                totalSeats - (seats[plan.id] ?? 0) + count <=
                                4
                              )
                                setSeats((old) => ({
                                  ...old,
                                  [plan.id]: count,
                                }));
                            }}
                          />
                        ))}
                      </div>
                    </Accordion>
                  )}
                  <Accordion title="전월 실적·할인 기간 및 적용 조건">
                    <p>
                      {card?.conditions ||
                        "전월 실적과 청구 할인 기간은 해당 카드사의 상품 조건을 확인해 주세요."}
                    </p>
                    <p>
                      선택 제품의 월 구독료 한도 내에서 혜택을 적용합니다.
                      구독교원은 중복 허용 카드에만 적용됩니다.
                    </p>
                  </Accordion>
                </>
              )}
            </div>
            <aside className={s.benefitApplied}>
              <h3>적용 내역</h3>
              <ul>
                {previewLines.map((line) => {
                  const t = lineTotals(line);
                  return (
                    <li key={line.id}>
                      <button
                        aria-pressed={line.id === id}
                        onClick={() => chooseProduct(line.id)}
                      >
                        {line.product.image && (
                          <img src={line.product.image} alt="" />
                        )}
                        <span>
                          <b>
                            {line.product.category}
                            {line.id === id ? " · 선택 중" : ""}
                          </b>
                          <small>{line.product.id}</small>
                        </span>
                        <strong>
                          {line.card
                            ? `−${money(t.card + t.teacher)}`
                            : "미적용"}
                        </strong>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <dl>
                <div>
                  <dt>선택 제품 월 구독료</dt>
                  <dd>{money(preview.monthly)}</dd>
                </div>
                <div>
                  <dt>카드·교원 할인</dt>
                  <dd>−{money(preview.card + preview.teacher)}</dd>
                </div>
                <div>
                  <dt>혜택 후 예상 부담금</dt>
                  <dd>{money(preview.effective)}</dd>
                </div>
              </dl>
            </aside>
          </div>
          <div className={s.benefitTotalsBar}>
            <div>
              <span>전체 계약 월 구독료</span>
              <b>{money(totals.monthly)}</b>
            </div>
            <div>
              <span>전체 카드·교원 할인</span>
              <b>−{money(totals.card + totals.teacher)}</b>
            </div>
            <div>
              <span>혜택 후 전체 예상 부담금</span>
              <strong>{money(totals.effective)}</strong>
            </div>
          </div>
          <div className={s.benefitFooter}>
            <p>적용 버튼을 누르면 선택한 제품의 혜택에 반영됩니다.</p>
            <button
              className={s.secondary}
              onClick={() => onApply(id, undefined, [])}
            >
              혜택 해제
            </button>
            <button
              className={s.primary}
              disabled={loading || Boolean(error) || totalSeats > 4}
              onClick={() => onApply(id, card, selections)}
            >
              혜택 적용
            </button>
          </div>
        </>
      ) : (
        <>
          <SubscriptionPanel lines={lines} id={id} onSelect={chooseProduct} />
          <div className={s.benefitFooter}>
            <button className={s.secondary} onClick={() => setTab("card")}>
              카드혜택 설정
            </button>
            <button className={s.primary} onClick={onClose}>
              닫기
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
export function BenefitDialog(props: Omit<Props, "initialTab">) {
  return <CardDialog {...props} initialTab="subscription" />;
}
