/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PRODUCT_CATEGORIES,
  PreviewLine,
  PreviewProduct,
  PreviewQuote,
  VariantField,
  changeLineVariant,
  createLine,
  koreaDate,
  lineTotals,
  money,
  quoteTotals,
  textValue,
  validUntil,
  variantOptions,
} from "@/lib/renewalTest";
import {
  useRenewalProducts,
  fetchRenewalPrepayRate,
} from "@/hooks/useRenewalData";
import type { PrepayRate } from "@/utils/prepay/classifyPrepayRate";
import { getVoucherMasterForModel } from "@/lib/voucherMaster";
import { calcVoucher } from "@/utils/voucher/calcVoucher";
import { SelectField, RadioField, Accordion, CategoryRail } from "./Controls";
import { Icon, Modal } from "./TestLayout";
import s from "./renewal.module.css";
import { ContractDetails, RateBreakdown } from "./QuoteDetails";

function CurrentQuoteLines({ lines }: { lines: PreviewLine[] }) {
  return (
    <div
      className={s.currentQuoteList}
      tabIndex={0}
      role="region"
      aria-label="현재 견적 제품 목록"
    >
      {lines.length ? (
        lines.map((line) => (
          <div className={s.miniLine} key={line.id}>
            {line.product.image && <img src={line.product.image} alt="" />}
            <div>
              <b>{line.product.name}</b>
              <small>{line.product.id}</small>
              <strong>{money(lineTotals(line).monthly)}</strong>
            </div>
          </div>
        ))
      ) : (
        <p className={s.caption}>아직 담은 제품이 없습니다.</p>
      )}
    </div>
  );
}

export function ProductPicker({
  lines,
  onChoose,
  onClose,
}: {
  lines: PreviewLine[];
  onChoose: (p: PreviewProduct) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState(""),
    [keyword, setKeyword] = useState(""),
    [category, setCategory] = useState("정수기"),
    [limit, setLimit] = useState(12);
  const { products, loading, error, retry } = useRenewalProducts(
    category,
    keyword,
  );
  useEffect(() => {
    const timer = setTimeout(() => setKeyword(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => setLimit(12), [category, keyword]);
  return (
    <Modal
      className={s.productPickerDialog}
      title="견적에 제품 추가"
      description="제품을 검색하고 원하는 구독 조건을 선택하세요."
      onClose={onClose}
      wide
    >
      <div className={s.pickerLayout}>
        <div>
          <label className={s.searchField}>
            <Icon name="search" />
            <input
              autoFocus
              placeholder="제품명 또는 모델명 검색"
              aria-label="추가할 제품 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <CategoryRail
            label="추가할 제품 카테고리"
            className={s.pickerCategoryRail}
          >
            {PRODUCT_CATEGORIES.map((name) => (
              <button
                key={name}
                aria-pressed={category === name}
                className={category === name ? s.chipActive : ""}
                onClick={() => setCategory(name)}
              >
                {name === "의류관리기" ? "스타일러" : name}
              </button>
            ))}
          </CategoryRail>
          <div className={s.pickerCurrentMobile}>
            <Accordion
              title={`현재 견적 ${lines.length}개 · 월 ${money(quoteTotals(lines).monthly)}`}
            >
              <CurrentQuoteLines lines={lines} />
            </Accordion>
          </div>
          <p className={s.muted}>
            {loading
              ? "상품을 불러오고 있습니다."
              : `검색 결과 ${products.length}개`}
          </p>
          {error && (
            <div className={s.errorNotice} role="alert">
              {error}
              <button className={s.secondary} onClick={retry}>
                다시 불러오기
              </button>
            </div>
          )}
          <div className={s.pickerCards}>
            {products.slice(0, limit).map((p) => (
              <button
                className={s.pickerCard}
                key={p.id}
                onClick={() => onChoose(p)}
              >
                {p.image ? (
                  <img src={p.image} alt="" />
                ) : (
                  <span className={s.imageMissing}>이미지 준비 중</span>
                )}
                <div>
                  <small>{p.category}</small>
                  <h3>{p.name}</h3>
                  <p>{p.id}</p>
                  <span>
                    구독 조건 선택
                    <Icon name="arrow" size={18} />
                  </span>
                </div>
              </button>
            ))}
          </div>
          {!loading && !error && !products.length && (
            <div className={s.empty}>검색된 제품이 없습니다.</div>
          )}
          {products.length > limit && (
            <button
              className={s.addProductButton}
              onClick={() => setLimit((n) => n + 12)}
            >
              제품 더 보기
              <Icon name="plus" />
            </button>
          )}
        </div>
        <aside className={s.pickerSummary}>
          <h3>
            현재 견적<span>{lines.length}개 항목</span>
          </h3>
          <CurrentQuoteLines lines={lines} />
          <div className={s.miniTotal}>
            <span>월 구독료 합계</span>
            <strong>{money(quoteTotals(lines).monthly)}</strong>
          </div>
          <p className={s.caption}>
            옵션 설정을 완료한 제품만 견적에 추가됩니다.
          </p>
        </aside>
      </div>
    </Modal>
  );
}

export function OptionWizard({
  initial,
  lines,
  editing,
  onApply,
  onClose,
}: {
  initial: PreviewLine;
  lines: PreviewLine[];
  editing: boolean;
  onApply: (l: PreviewLine) => void;
  onClose: () => void;
}) {
  const [line, setLine] = useState({ ...initial }),
    [step, setStep] = useState(0),
    [rate, setRate] = useState<PrepayRate>(null),
    [rateLoading, setRateLoading] = useState(true),
    [rateError, setRateError] = useState(""),
    [rateRevision, setRateRevision] = useState(0),
    [voucherLoading, setVoucherLoading] = useState(true),
    [voucherError, setVoucherError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setRateLoading(true);
    setRateError("");
    fetchRenewalPrepayRate(initial.product)
      .then((r) => {
        if (!cancelled) {
          setRate(r);
          setLine((l) => ({
            ...l,
            prepay:
              l.term === 72 &&
              (r === "30_50" || (r === "30" && l.prepay === 30))
                ? l.prepay
                : 0,
          }));
        }
      })
      .catch(() => {
        if (!cancelled)
          setRateError(
            "선납 가능 여부를 확인하지 못했습니다. 다시 확인해 주세요.",
          );
      })
      .finally(() => {
        if (!cancelled) setRateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initial.product, rateRevision]);
  useEffect(() => {
    let cancelled = false;
    setVoucherLoading(true);
    setVoucherError("");
    getVoucherMasterForModel(line.product.id)
      .then((master) => {
        if (cancelled) return;
        const voucher = master
          ? calcVoucher({
              voucherMaster: master,
              modelCode: line.product.id,
              promoType: textValue(line.selectedVariant.프로모션유형),
              serviceCycle: textValue(line.selectedVariant["서비스주기/월"]),
              promoName: textValue(line.selectedVariant.프로모션명),
            })
          : { total: 0, details: [] };
        setLine((l) => ({
          ...l,
          voucherTotal: voucher.total,
          voucherDetails: voucher.details,
        }));
      })
      .catch(() => {
        if (!cancelled)
          setVoucherError(
            "상품권 내역을 불러오지 못했습니다. 조건을 다시 선택해 주세요.",
          );
      })
      .finally(() => {
        if (!cancelled) setVoucherLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [line.product.id, line.selectedVariant]);
  const totals = lineTotals(line),
    others = lines.filter((l) => l.id !== initial.id),
    overall = quoteTotals([...others, line]);
  const options = (field: VariantField) =>
    variantOptions(line, field).map((value) => ({
      value,
      label:
        field === "계약기간"
          ? `${Number(value) / 12}년 (${value}개월)`
          : value || "없음",
    }));
  const choose = (field: VariantField, value: string) =>
    setLine((l) => changeLineVariant(l, field, value));
  return (
    <Modal
      className={s.optionDialog}
      title={editing ? "제품 조건 수정" : "제품 구독 조건 선택"}
      description="가입 유형과 계약 기간에 맞는 관리·프로모션 조건을 확인하세요."
      onClose={onClose}
      wide
    >
      <div className={s.stepper}>
        {["가입·계약", "관리 방식", "프로모션·선납"].map((label, i) => (
          <button
            key={label}
            disabled={i > step}
            className={i === step ? s.stepActive : ""}
            onClick={() => setStep(i)}
          >
            <span>{i + 1}</span>
            {label}
          </button>
        ))}
      </div>
      <div className={s.optionLayout}>
        <aside className={s.optionProduct}>
          {line.product.image ? (
            <img src={line.product.image} alt={line.product.name} />
          ) : (
            <div className={s.imageMissing}>이미지 준비 중</div>
          )}
          <span className={s.pill}>{line.product.category}</span>
          <h3>{line.product.name}</h3>
          <p>{line.product.id}</p>
        </aside>
        <div className={s.optionForm}>
          <span className={s.eyebrow}>STEP {step + 1}</span>
          <h3>
            {
              [
                "가입 유형과 계약 기간",
                "관리 방식과 주기",
                "프로모션과 선납 조건",
              ][step]
            }
          </h3>
          {step === 0 && (
            <>
              <SelectField
                label="가입 유형"
                value={textValue(line.selectedVariant["프로모션 대분류"])}
                options={options("프로모션 대분류")}
                onChange={(v) => choose("프로모션 대분류", v)}
              />
              <RadioField
                label="계약 기간"
                value={textValue(line.selectedVariant.계약기간)}
                options={options("계약기간")}
                onChange={(v) => choose("계약기간", v)}
              />
            </>
          )}
          {step === 1 && (
            <>
              <RadioField
                label="관리 방식"
                value={textValue(line.selectedVariant.서비스유형)}
                options={options("서비스유형")}
                onChange={(v) => choose("서비스유형", v)}
              />
              <RadioField
                label="관리 주기"
                value={textValue(line.selectedVariant["서비스주기/월"])}
                options={options("서비스주기/월")}
                onChange={(v) => choose("서비스주기/월", v)}
              />
              <p className={s.notice}>
                현재 모델과 가입·계약 조건에서 가능한 옵션만 표시합니다.
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <SelectField
                label="프로모션 유형"
                value={textValue(line.selectedVariant.프로모션유형)}
                options={options("프로모션유형")}
                onChange={(v) => choose("프로모션유형", v)}
              />
              <SelectField
                label="프로모션명"
                value={textValue(line.selectedVariant.프로모션명)}
                options={options("프로모션명")}
                onChange={(v) => choose("프로모션명", v)}
              />
              <Accordion title="프로모션 상세">
                <p className={s.selectedPromotion}>
                  {textValue(line.selectedVariant.프로모션명) ||
                    "선택한 프로모션이 없습니다."}
                </p>
              </Accordion>
              {rateError ? (
                <div className={s.errorNotice} role="alert">
                  {rateError}
                  <button
                    className={s.secondary}
                    onClick={() => setRateRevision((n) => n + 1)}
                  >
                    다시 확인
                  </button>
                </div>
              ) : line.term === 72 && (rate || rateLoading) ? (
                <RadioField
                  label={rateLoading ? "선납 가능 여부 확인 중" : "선납"}
                  value={String(line.prepay)}
                  options={[
                    { value: "0", label: "선납 없음" },
                    ...(!rateLoading && rate
                      ? [{ value: "30", label: "30% 선납" }]
                      : []),
                    ...(!rateLoading && rate === "30_50"
                      ? [{ value: "50", label: "50% 선납" }]
                      : []),
                  ]}
                  onChange={(v) =>
                    setLine((l) => ({ ...l, prepay: Number(v) }))
                  }
                />
              ) : (
                <p className={s.notice}>
                  선택한 모델·계약에는 선납 옵션이 없습니다.
                </p>
              )}
              <Accordion title="선납금·상품권 내역">
                <dl className={s.detailList}>
                  <div>
                    <dt>선납금</dt>
                    <dd>{money(totals.deposit)}</dd>
                  </div>
                  <div>
                    <dt>상품권</dt>
                    <dd>
                      {voucherLoading ? "확인 중" : money(totals.voucher)}
                    </dd>
                  </div>
                </dl>
              </Accordion>
              {voucherError && (
                <p className={s.error} role="alert">
                  {voucherError}
                </p>
              )}
            </>
          )}
          <div className={s.wizardButtons}>
            <button
              className={s.secondary}
              onClick={() => (step ? setStep(step - 1) : onClose())}
            >
              {step ? "이전" : "취소"}
            </button>
            <button
              className={s.primary}
              disabled={
                step === 2 &&
                (rateLoading ||
                  voucherLoading ||
                  Boolean(voucherError) ||
                  Boolean(rateError))
              }
              onClick={() => (step < 2 ? setStep(step + 1) : onApply(line))}
            >
              {step === 2
                ? editing
                  ? "수정한 조건 반영"
                  : "견적에 추가"
                : "다음"}
              <Icon name="arrow" size={20} />
            </button>
          </div>
        </div>
        <aside className={s.optionSummary}>
          <span>선택 제품 월 구독료</span>
          <strong>{money(totals.monthly)}</strong>
          <small>카드·교원 할인 전</small>
          <Accordion title={`선택 조건 · ${line.term / 12}년 · ${line.care}`}>
            <dl className={s.detailList}>
              <div>
                <dt>계약</dt>
                <dd>{line.term / 12}년</dd>
              </div>
              <div>
                <dt>관리</dt>
                <dd>
                  {line.care} · {line.cycle ? `${line.cycle}개월` : "상품 기준"}
                </dd>
              </div>
              <div>
                <dt>프로모션 할인</dt>
                <dd>-{money(totals.discount)}</dd>
              </div>
            </dl>
          </Accordion>
          <div className={s.optionOverall}>
            <span>반영 후 전체 월 구독료</span>
            <strong>{money(overall.monthly)}</strong>
            <small>선택한 계약 조건 기준</small>
          </div>
        </aside>
      </div>
    </Modal>
  );
}

export { CardDialog, BenefitDialog } from "./BenefitsDialog";

export function CompareDialog({
  line,
  lines,
  onApply,
  onClose,
}: {
  line: PreviewLine;
  lines: PreviewLine[];
  onApply: (l: PreviewLine) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState("condition"),
    [term, setTerm] = useState(String(line.term)),
    [productId, setProductId] = useState(line.product.id);
  const { products, loading, error } = useRenewalProducts(
    line.product.category,
  );
  const choices = [
    line.product,
    ...products.filter((p) => p.id !== line.product.id),
  ];
  const selected = choices.find((p) => p.id === productId) ?? line.product;
  const candidate = useMemo(
    () =>
      mode === "condition"
        ? term === String(line.term)
          ? line
          : changeLineVariant(line, "계약기간", term)
        : { ...createLine(selected), id: line.id, quantity: line.quantity },
    [mode, line, term, selected],
  );
  const baseline = lines.find((l) => l.id === line.id) ?? line;
  const before = lineTotals(baseline),
    after = lineTotals(candidate),
    total = quoteTotals(lines).monthly,
    next = total - before.monthly + after.monthly;
  return (
    <Modal
      title="제품·계약 조건 비교"
      description="실제 옵션의 월 구독료와 전체 견적 변화를 비교합니다."
      onClose={onClose}
      wide
    >
      <div className={s.modalContent}>
        <div className={s.tabs}>
          <button
            className={mode === "condition" ? s.tabActive : ""}
            onClick={() => setMode("condition")}
          >
            같은 제품의 조건
          </button>
          <button
            className={mode === "product" ? s.tabActive : ""}
            onClick={() => setMode("product")}
          >
            다른 제품
          </button>
        </div>
        {mode === "condition" ? (
          <RadioField
            label="비교할 계약 기간"
            value={term}
            options={variantOptions(line, "계약기간").map((v) => ({
              value: v,
              label: `${Number(v) / 12}년 (${v}개월)`,
            }))}
            onChange={setTerm}
          />
        ) : (
          <SelectField
            label={loading ? "비교 제품을 불러오는 중" : "비교할 제품"}
            value={productId}
            options={choices.map((p) => ({
              value: p.id,
              label: `${p.name} · ${p.id}`,
            }))}
            onChange={setProductId}
          />
        )}
        {error && <p className={s.error}>{error}</p>}
        <div className={s.comparisonGrid}>
          {[
            { label: "현재 조건", value: baseline, t: before },
            { label: "비교 조건", value: candidate, t: after },
          ].map((item) => (
            <article key={item.label} className={s.comparisonCard}>
              <h3>{item.label}</h3>
              {item.value.product.image && (
                <img src={item.value.product.image} alt="" />
              )}
              <b>{item.value.product.name}</b>
              <small>{item.value.product.id}</small>
              <details>
                <summary>프로모션 조건 확인</summary>
                <p>
                  {textValue(item.value.selectedVariant.프로모션명) ||
                    "프로모션 미적용"}
                </p>
              </details>
              <dl className={s.detailList}>
                <div>
                  <dt>계약·관리</dt>
                  <dd>
                    {item.value.term / 12}년 · {item.value.care} ·{" "}
                    {item.value.cycle}개월
                  </dd>
                </div>
                <div>
                  <dt>월 구독료</dt>
                  <dd>{money(item.t.monthly)}</dd>
                </div>
                <div>
                  <dt>예상 총비용</dt>
                  <dd>{money(item.t.total)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        <div className={s.comparisonImpact}>
          <span>
            전체 월 구독료
            <b>
              {money(total)} → {money(next)}
            </b>
          </span>
          <strong>
            {next - total > 0 ? "+" : ""}
            {money(next - total)} / 월
          </strong>
        </div>
        <p className={s.caption}>
          다른 제품은 기본 옵션으로 비교합니다. 제품 교체 시 선택 항목의
          카드·교원·선납은 초기화됩니다. 예상 총액은 선택한 월 요금이 유지된다는
          기준이며 기간별 프로모션은 별도 확인이 필요합니다.
        </p>
        <div className={s.buttonRow}>
          <button className={s.secondary} onClick={onClose}>
            취소
          </button>
          <button className={s.primary} onClick={() => onApply(candidate)}>
            선택 항목에 반영
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function SaveDialog({
  quote,
  onSave,
  onClose,
}: {
  quote: PreviewQuote;
  onSave: (quote: PreviewQuote, asNew: boolean) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ ...quote });
  const [asNew, setAsNew] = useState(!quote.id);
  return (
    <Modal
      title="견적 저장"
      description="로그인한 계정으로 이 브라우저에 견적을 저장합니다."
      onClose={onClose}
    >
      <form
        className={s.modalContent}
        onSubmit={(e) => {
          e.preventDefault();
          onSave(
            {
              ...draft,
              title: draft.title.trim(),
              customer: draft.customer.trim(),
              manager: draft.manager.trim(),
            },
            asNew,
          );
        }}
      >
        <label className={s.field}>
          견적명 <span>*</span>
          <input
            required
            maxLength={80}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <div className={s.twoColumns}>
          <label className={s.field}>
            고객명 <span>*</span>
            <input
              required
              maxLength={50}
              placeholder="예: 고객명"
              value={draft.customer}
              onChange={(e) => setDraft({ ...draft, customer: e.target.value })}
            />
          </label>
          <label className={s.field}>
            담당자
            <input
              maxLength={50}
              value={draft.manager}
              onChange={(e) => setDraft({ ...draft, manager: e.target.value })}
            />
          </label>
        </div>
        <label className={s.field}>
          유효기간
          <select
            value={draft.validity}
            onChange={(e) =>
              setDraft({ ...draft, validity: Number(e.target.value) })
            }
          >
            {[7, 15, 30].map((n) => (
              <option key={n} value={n}>
                저장일로부터 {n}일
              </option>
            ))}
          </select>
        </label>
        <label className={s.field}>
          내부 메모 (기본 출력 제외)
          <textarea
            rows={3}
            maxLength={1000}
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </label>
        <div className={s.saveRecap}>
          선택 제품 {draft.lines.length}개{" "}
          <b>월 {money(quoteTotals(draft.lines).monthly)}</b>
        </div>
        {quote.id && (
          <div className={s.choiceRow}>
            <label className={!asNew ? s.choiceSelected : ""}>
              <input
                type="radio"
                name="saveMode"
                checked={!asNew}
                onChange={() => setAsNew(false)}
              />
              현재 견적 업데이트
            </label>
            <label className={asNew ? s.choiceSelected : ""}>
              <input
                type="radio"
                name="saveMode"
                checked={asNew}
                onChange={() => setAsNew(true)}
              />
              새 견적으로 저장
            </label>
          </div>
        )}
        <div className={s.buttonRow}>
          <button type="button" className={s.secondary} onClick={onClose}>
            취소
          </button>
          <button
            type="submit"
            className={s.primary}
            disabled={!draft.title.trim() || !draft.customer.trim()}
          >
            브라우저에 저장
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PrintPreview({
  quote,
  onClose,
}: {
  quote: PreviewQuote;
  onClose: () => void;
}) {
  const [images, setImages] = useState(true),
    [discounts, setDiscounts] = useState(true),
    [cards, setCards] = useState(true),
    [notes, setNotes] = useState(false);
  const focusRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    focusRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const controls = focusRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled])",
      );
      if (!controls?.length) return;
      const first = controls[0],
        last = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === focusRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === focusRef.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, []);
  const totals = quoteTotals(quote.lines);
  return createPortal(
    <div
      className={`${s.root} ${s.printPortal}`}
      ref={focusRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="견적서 인쇄 미리보기"
    >
      <div className={s.printToolbar}>
        <div>
          <Icon name="document" />
          <h2>고객용 견적서 미리보기</h2>
        </div>
        <div>
          <button className={s.primary} onClick={() => window.print()}>
            <Icon name="print" size={17} />
            인쇄 / PDF 저장
          </button>
          <button
            className={s.iconButton}
            aria-label="미리보기 닫기"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div className={s.printLayout}>
        <section className={s.printSheet}>
          <div className={s.paperBrand}>
            <img src="/images/logo.png" alt="LG전자 하이케어솔루션" />
            <span>SUBSCRIPTION ESTIMATE</span>
          </div>
          <h1>가전 구독 견적서</h1>
          <p className={s.paperTitle}>{quote.title}</p>
          <div className={s.paperMeta}>
            <div>
              <p>
                고객명 <b>{quote.customer || "미입력"}</b>
              </p>
              <p>
                담당자 <b>{quote.manager || "미입력"}</b>
              </p>
            </div>
            <div>
              <p>
                견적번호 <b>{quote.id || "저장 전 견적"}</b>
              </p>
              <p>
                작성일{" "}
                <b>
                  {koreaDate(
                    quote.savedAt ? new Date(quote.savedAt) : new Date(),
                  )}
                </b>
              </p>
              <p>
                유효기간 <b>{validUntil(quote)}</b>
              </p>
            </div>
          </div>
          <ul className={s.paperProductList} aria-label="견적 제품 목록">
            {quote.lines.map((line) => (
              <li className={s.paperProduct} key={line.id}>
                <div className={s.paperProductHeading}>
                  {images && line.product.image && (
                    <img src={line.product.image} alt="" />
                  )}
                  <div>
                    <span>{line.product.category}</span>
                    <h2>{line.product.name}</h2>
                    <p>{line.product.id}</p>
                  </div>
                </div>
                <div className={s.paperProductDetails}>
                  <ContractDetails line={line} />
                  <RateBreakdown
                    line={line}
                    discounts={discounts}
                    benefits={cards}
                  />
                </div>
              </li>
            ))}
          </ul>
          {quote.lines.length > 1 && (
            <div className={s.paperTotals}>
              {discounts && (
                <>
                  <div>
                    <span>기본 월 요금 합계</span>
                    <b>{money(totals.normal)}</b>
                  </div>
                  <div>
                    <span>프로모션 할인 합계</span>
                    <b>-{money(totals.discount)}</b>
                  </div>
                </>
              )}
              <div className={s.paperTotalEmphasis}>
                <span>계약 월 구독료 합계</span>
                <b>{money(totals.monthly)}</b>
              </div>
              <div>
                <span>선납금 합계</span>
                <b>{money(totals.deposit)}</b>
              </div>
              <div>
                <span>예상 총비용 합계 (선납 포함·카드·교원 제외)</span>
                <b>{money(totals.total)}</b>
              </div>
              {cards && (
                <>
                  <div>
                    <span>구독교원 할인</span>
                    <b>-{money(totals.teacher)} / 월</b>
                  </div>
                  <div>
                    <span>카드 청구 할인 (실적 충족 조건)</span>
                    <b>-{money(totals.card)} / 월</b>
                  </div>
                  <div className={s.paperTotalEmphasis}>
                    <span>카드·교원 적용 후 월 예상 체감액</span>
                    <b>{money(totals.effective)}</b>
                  </div>
                </>
              )}
            </div>
          )}
          {notes && quote.note && (
            <div className={s.paperConditions}>
              <h3>내부 메모</h3>
              <p className={s.preserveWhitespace}>{quote.note}</p>
            </div>
          )}
          <div className={s.paperDisclaimer}>
            기간별 총비용은 제품별 월 구독료 × 계약 개월 수 + 선납금의 합계이며
            카드 할인은 제외합니다.
            <br />
            기간별 프로모션·청구 할인 실적·적용 기간은 선택 상품의 계약 조건에
            따라 확인해 주세요. 예상 총액은 선택한 월 요금이 유지되는
            기준입니다.
          </div>
        </section>
        <aside className={s.printSettings}>
          <h3>출력 설정</h3>
          <p>A4 · 세로 · 제품별 상세 리스트</p>
          {[
            { name: "제품 이미지 표시", value: images, set: setImages },
            { name: "할인 내역 표시", value: discounts, set: setDiscounts },
            { name: "카드 조건 표시", value: cards, set: setCards },
            { name: "내부 메모 포함", value: notes, set: setNotes },
          ].map((field) => (
            <label key={field.name} className={s.checkRow}>
              <input
                type="checkbox"
                checked={field.value}
                onChange={(e) => field.set(e.target.checked)}
              />
              {field.name}
            </label>
          ))}
          <div className={s.notice}>
            ‘인쇄 / PDF 저장’을 누른 뒤 대상 프린터에서 ‘PDF로 저장’을
            선택하세요. 브라우저의 머리글·바닥글 옵션을 끄면 견적서 내용만
            출력됩니다.
          </div>
          <button className={s.secondary} onClick={onClose}>
            견적으로 돌아가기
          </button>
        </aside>
      </div>
    </div>,
    document.body,
  );
}
