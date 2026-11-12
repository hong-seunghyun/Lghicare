/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PRODUCT_CATEGORIES,
  PreviewLine,
  PreviewProduct,
  PreviewQuote,
  VariantField,
  VARIANT_FIELDS,
  promotionTypeLabel,
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
  loadRenewalProductOptions,
} from "@/hooks/useRenewalData";
import type { PrepayRate } from "@/utils/prepay/classifyPrepayRate";
import { resolveRenewalVoucher } from "@/lib/renewalVoucher";
import { SelectField, RadioField, ListField, Accordion, CategoryRail } from "./Controls";
import { Icon, Modal } from "./TestLayout";
import baseStyles from "./renewal.module.css";
import presentationStyles from "./quotePresentation.module.css";
import { ConditionTags } from "./QuoteDetails";
const s = { ...baseStyles, ...presentationStyles };

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
          <div className={s.currentQuoteItem} key={line.id}>
            {line.product.image ? <img src={line.product.image} alt="" /> : <div className={s.currentQuotePlaceholder}>이미지<br />준비 중</div>}
            <div>
              <b>{line.product.name}</b>
              <small>{line.product.id}</small>
              <ConditionTags line={line} confirmed={4} />
              <div className={s.currentQuoteItemPrice}><span>월 구독료</span><strong>{money(lineTotals(line).monthly)}</strong></div>
            </div>
          </div>
        ))
      ) : (
        <div className={s.currentQuoteEmpty}><Icon name="document" size={28} /><b>첫 제품을 선택해 주세요</b><p>구독 조건을 정하면 이곳에 추가됩니다.</p></div>
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
  const [choosing, setChoosing] = useState<string | null>(null);
  const [chooseError, setChooseError] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const choose = async (product: PreviewProduct) => {
    if (choosing) return;
    setChoosing(product.id); setChooseError("");
    try { const full = await loadRenewalProductOptions(product); if (alive.current) onChoose(full); }
    catch (error) { if (alive.current) setChooseError(error instanceof Error ? error.message : "구독 조건을 확인하지 못했습니다."); }
    finally { if (alive.current) setChoosing(null); }
  };
  useEffect(() => {
    const timer = setTimeout(() => setKeyword(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => setLimit(12), [category, keyword]);
  const totals = quoteTotals(lines);
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
              title={`현재 견적 ${lines.length}개 · 월 ${money(totals.monthly)}`}
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
          {chooseError && <p className={s.errorNotice} role="alert">{chooseError}</p>}
          {choosing && <p role="status">전체 구독 조건을 확인하고 있습니다.</p>}
          <div className={s.pickerCards}>
            {products.slice(0, limit).map((p) => (
              <button
                className={s.pickerCard}
                key={p.id}
                aria-label={`${p.name} 구독 조건 선택`}
                onClick={() => choose(p)}
                disabled={choosing !== null}
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
        <aside className={s.currentQuoteSummary} aria-label="현재 견적 요약">
          <div className={s.currentQuoteHeading}><h3>현재 견적</h3><span>{lines.length}개 제품</span></div>
          <CurrentQuoteLines lines={lines} />
          <div className={s.currentQuoteTotal}>
            <span>월 구독료 합계</span>
            <strong>{money(totals.monthly)}</strong>
            <small>카드·교원 할인 전</small>
          </div>
          {totals.deposit > 0 && <p className={s.currentQuoteExtra}>선납금 합계 <b>{money(totals.deposit)}</b></p>}
          {totals.voucher > 0 && <p className={s.currentQuoteExtra}>상품권 합계 <b>{money(totals.voucher)}</b></p>}
          <p className={s.currentQuoteHint}>조건을 확정한 제품이 견적에 반영됩니다.</p>
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
  title,
  applyLabel,
}: {
  initial: PreviewLine;
  lines: PreviewLine[];
  editing: boolean;
  onApply: (l: PreviewLine) => void;
  onClose: () => void;
  title?: string;
  applyLabel?: string;
}) {
  const [line, setLine] = useState({ ...initial }),
    [confirmed, setConfirmed] = useState(editing ? VARIANT_FIELDS.length : 0),
    [rate, setRate] = useState<PrepayRate>(null),
    [rateLoading, setRateLoading] = useState(true),
    [rateError, setRateError] = useState(""),
    [rateRevision, setRateRevision] = useState(0),
    [voucherLoading, setVoucherLoading] = useState(true),
    [voucherError, setVoucherError] = useState("");
  const [editingField, setEditingField] = useState<number | null>(null);
  const { product, selectedVariant } = line;
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
    resolveRenewalVoucher({ product, selectedVariant })
      .then((voucher) => {
        if (cancelled) return;
        setLine((l) => ({
          ...l,
          ...voucher,
        }));
      })
      .catch(() => {
        if (!cancelled)
          setVoucherError(
            "상품권 내역을 불러오지 못했습니다. 다시 확인해 주세요.",
          );
      })
      .finally(() => {
        if (!cancelled) setVoucherLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [product, selectedVariant]);
  const totals = lineTotals(line),
    others = lines.filter((l) => l.id !== initial.id),
    overall = quoteTotals([...others, line]);
  const options = (field: VariantField) =>
    variantOptions(line, field).map((value) => ({
      value,
      label:
        field === "계약기간"
          ? `${Number(value) / 12}년 (${value}개월)`
          : field === "프로모션유형" ? promotionTypeLabel(value) || "없음" : value || "없음",
    }));
  const viewport = useRef<HTMLDivElement>(null);
  const scrollRequested = useRef(false);
  useEffect(() => {
    if (!scrollRequested.current) return;
    scrollRequested.current = false;
    const node = viewport.current;
    const next = node?.querySelector<HTMLElement>(editingField === null ? '[data-next-option="true"]' : `[data-option-index="${editingField}"]`);
    if (!node || !next) return;
    const frame = requestAnimationFrame(() => node.scrollTo({
      top: node.scrollTop + next.getBoundingClientRect().top - node.getBoundingClientRect().top - 12,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    }));
    return () => cancelAnimationFrame(frame);
  }, [confirmed, editingField]);
  const choose = (field: VariantField, value: string) => {
    setLine((l) => textValue(l.selectedVariant[field]) === value ? l : changeLineVariant(l, field, value));
    scrollRequested.current = true;
    setEditingField(null);
    setConfirmed(VARIANT_FIELDS.indexOf(field) + 1);
  };
  const labels = ["가입 유형", "계약 기간", "관리 방식", "관리 주기", "프로모션 유형", "프로모션 상세"];
  const complete = confirmed === VARIANT_FIELDS.length;
  return (
    <Modal
      className={s.optionDialog}
      title={title || (editing ? "제품 조건 수정" : "제품 구독 조건 선택")}
      onClose={onClose}
      wide
    >
      <div className={s.optionLayout}>
        <aside className={s.optionProduct}>
          {line.product.image ? <img src={line.product.image} alt={line.product.name} /> : <div className={s.imageMissing}>이미지 준비 중</div>}
          <div className={s.optionProductInfo}>
            <span>{line.product.category}</span>
            <h3>{line.product.name}</h3>
            <p>{line.product.id}</p>
          </div>
        </aside>
        <div className={s.optionForm}>
          <div className={s.optionFlowHeading}>
            <h3>계약 조건</h3>
            <span aria-live="polite">{complete ? "선택 완료" : `${confirmed} / ${VARIANT_FIELDS.length}`}</span>
          </div>
          <div className={s.optionScroll} ref={viewport} tabIndex={0} role="region" aria-label="구독 조건 선택 목록">
            {VARIANT_FIELDS.slice(0, Math.min(confirmed + 1, VARIANT_FIELDS.length)).map((field, index) => {
              const open = editingField === index || (editingField === null && index === confirmed);
              const selected = options(field).find((option) => option.value === textValue(line.selectedVariant[field]));
              const Field = field === "프로모션유형" || field === "프로모션명" ? ListField : RadioField;
              return (
                <section className={s.optionSection} key={field} data-next-option={index === confirmed} data-option-index={index}>
                  {index < confirmed && (
                    <button className={s.optionCompleted} onClick={() => { scrollRequested.current = !open; setEditingField(open ? null : index); }} aria-expanded={open}>
                      <span>{labels[index]}</span>
                      <b title={selected?.label}>{selected?.label || "없음"}</b>
                      <small>{open ? "접기" : "변경"}</small>
                    </button>
                  )}
                  {open && (
                    <Field label={labels[index]} value={index < confirmed ? textValue(line.selectedVariant[field]) : "__unselected__"}
                      options={options(field)} onChange={(value) => choose(field, value)} />
                  )}
                </section>
              );
            })}
            {complete && editingField === null && (
              <section className={`${s.optionSection} ${s.optionBenefits}`} data-next-option="true" aria-label="선납 및 제공 혜택">
                <div className={s.optionPrepay}>
                {rateError ? (
                  <div className={s.errorNotice} role="alert">
                    {rateError}
                    <button className={s.secondary} onClick={() => setRateRevision((n) => n + 1)}>다시 확인</button>
                  </div>
                ) : line.term === 72 && (rate || rateLoading) ? (
                  <RadioField
                    label={rateLoading ? "선납 가능 여부 확인 중" : "선납"}
                    value={String(line.prepay)}
                    options={[
                      { value: "0", label: "선납 없음" },
                      ...(!rateLoading && rate ? [{ value: "30", label: "30% 선납" }] : []),
                      ...(!rateLoading && rate === "30_50" ? [{ value: "50", label: "50% 선납" }] : []),
                    ]}
                    onChange={(v) => setLine((l) => ({ ...l, prepay: Number(v) }))}
                  />
                ) : <div className={s.prepayUnavailable}><b>선납</b><p>이 조건은 선납 없이 이용합니다.</p></div>}
                </div>
                <div className={s.optionBenefitDetails}>
                <Accordion title="선납금·상품권 내역">
                  <dl className={s.detailList}>
                    <div><dt>선납금</dt><dd>{money(totals.deposit)}</dd></div>
                    <div><dt>제품 상품권</dt><dd>{voucherLoading ? "확인 중" : money(totals.voucher)}</dd></div>
                  </dl>
                </Accordion>
                </div>
                {voucherError && <div className={s.errorNotice} role="alert"><p>{voucherError}</p><button className={s.secondary} onClick={() => setLine((current) => ({ ...current, selectedVariant: { ...current.selectedVariant } }))}>상품권 다시 확인</button></div>}
              </section>
            )}
          </div>
          <div className={s.optionFlowFooter}>
            <p aria-live="polite">{complete ? "선택한 조건으로 요금이 계산됩니다." : labels[confirmed] + "을 선택해 주세요."}</p>
            <div className={s.wizardButtons}>
              <button className={s.secondary} onClick={onClose}>취소</button>
              <button
                className={s.primary}
                disabled={!complete || editingField !== null || rateLoading || voucherLoading || Boolean(voucherError) || Boolean(rateError)}
                onClick={() => onApply(line)}
              >
                {applyLabel || (editing ? "수정한 조건 반영" : "견적에 추가")}<Icon name="arrow" size={20} />
              </button>
            </div>
          </div>
        </div>
        <aside className={s.optionSummary}>
          <span>선택 제품 월 구독료</span>
          <strong>{money(totals.monthly)}</strong>
          <small>{complete ? "선택 조건 기준 · 카드·교원 할인 전" : "조건 선택 중 · 최종 선택에 따라 변경"}</small>
          <div className={s.conditionSummary}>
            <h4>선택 조건</h4>
            {confirmed ? (
              <ConditionTags line={line} confirmed={confirmed} />
            ) : <p className={s.caption}>가입 유형부터 선택해 주세요.</p>}
            {complete && (
              <Accordion title="프로모션 내용">
                <p className={s.promotionTypeText}>{promotionTypeLabel(line.selectedVariant.프로모션유형)}</p>
                <p className={s.selectedPromotion}>{textValue(line.selectedVariant.프로모션명) || "적용 프로모션 없음"}</p>
                <p className={s.promotionDiscount}>월 프로모션 할인 −{money(totals.discount)}</p>
              </Accordion>
            )}
          </div>
          <div className={s.optionOverall}>
            <span>반영 후 전체 월 구독료</span>
            <strong>{money(overall.monthly)}</strong>
            <small>{complete ? "선택한 계약 조건 기준" : "조건 선택 중 예상 금액"}</small>
            {overall.multiProductVoucher > 0 && <p className={s.currentQuoteExtra}>견적 다품목 상품권 <b>{money(overall.multiProductVoucher)}</b></p>}
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
  const [mode, setMode] = useState<"condition" | "product">("condition");
  const [conditionCandidate, setConditionCandidate] = useState({ ...line });
  const [productCandidate, setProductCandidate] = useState({ ...line });
  const [editingCandidate, setEditingCandidate] = useState(false);
  const { products, loading, error } = useRenewalProducts(line.product.category);
  const choices = [line.product, ...products.filter((product) => product.id !== line.product.id)];
  const candidate = mode === "condition" ? conditionCandidate : productCandidate;
  const setCandidate = mode === "condition" ? setConditionCandidate : setProductCandidate;
  const baseline = lines.find((item) => item.id === line.id) ?? line;
  const before = lineTotals(baseline), after = lineTotals(candidate);
  const total = quoteTotals(lines).monthly;
  const next = total - before.monthly + after.monthly;
  const [choiceLoading, setChoiceLoading] = useState(false);
  const [choiceError, setChoiceError] = useState("");
  const choiceRequest = useRef(0);
  useEffect(() => () => { choiceRequest.current++; }, []);
  const chooseProduct = async (id: string) => {
    const product = choices.find((item) => item.id === id);
    if (!product || product.id === productCandidate.product.id) return;
    const request = ++choiceRequest.current;
    setChoiceLoading(true); setChoiceError("");
    try {
      const full = await loadRenewalProductOptions(product);
      if (request === choiceRequest.current) setProductCandidate({ ...createLine(full), id: line.id, quantity: line.quantity });
    } catch { if (request === choiceRequest.current) setChoiceError("제품 조건을 불러오지 못했습니다. 다시 선택해 주세요."); }
    finally { if (request === choiceRequest.current) setChoiceLoading(false); }
  };
  if (editingCandidate) {
    return <OptionWizard
      initial={candidate} lines={lines} editing
      title="비교할 제품의 구독 조건" applyLabel="비교 조건 반영"
      onApply={(updated) => { setCandidate(updated); setEditingCandidate(false); }}
      onClose={() => setEditingCandidate(false)}
    />;
  }
  return (
    <Modal className={s.comparisonDialog} title="제품·계약 조건 비교"
      description="비교할 제품과 구독 조건을 바꿔 월 요금 차이를 확인하세요." onClose={onClose} wide>
      {choiceLoading && <p role="status">제품의 전체 구독 조건을 확인하고 있습니다.</p>}
      {choiceError && <p role="alert">{choiceError}</p>}
      <div className={s.modalContent}>
        <div className={s.tabs}>
          <button className={mode === "condition" ? s.tabActive : ""} onClick={() => setMode("condition")}>같은 제품의 조건</button>
          <button className={mode === "product" ? s.tabActive : ""} onClick={() => setMode("product")}>다른 제품</button>
        </div>
        {mode === "product" && <SelectField
          label={loading ? "비교 제품을 불러오는 중" : "비교할 제품"}
          value={productCandidate.product.id}
          options={choices.map((product) => ({ value: product.id, label: product.name + " · " + product.id }))}
          onChange={chooseProduct}
        />}
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={s.comparisonGrid}>
          {[{ label: "현재 조건", value: baseline, price: before }, { label: "비교 조건", value: candidate, price: after }].map((item, index) => (
            <article key={item.label} className={s.comparisonCard} data-candidate={index === 1}>
              <div className={s.comparisonCardHeading}>
                <h3>{item.label}</h3>
                {index === 1 && <button className={s.comparisonEdit} disabled={choiceLoading} onClick={() => setEditingCandidate(true)}>세부 조건 변경</button>}
              </div>
              {item.value.product.image && <img src={item.value.product.image} alt="" />}
              <b>{item.value.product.name}</b>
              <small>{item.value.product.id}</small>
              <ConditionTags line={item.value} />
              <details>
                <summary>프로모션 내용</summary>
                <p>{promotionTypeLabel(item.value.selectedVariant.프로모션유형)}</p>
                <p>{textValue(item.value.selectedVariant.프로모션명) || "프로모션 미적용"}</p>
              </details>
              <dl className={s.detailList}>
                <div><dt>월 구독료</dt><dd className={s.comparisonMonthly}>{money(item.price.monthly)}</dd></div>
                <div><dt>선납금</dt><dd>{item.price.deposit > 0 ? money(item.price.deposit) : "없음"}</dd></div>
                <div><dt>예상 총비용</dt><dd>{money(item.price.total)}</dd></div>
              </dl>
            </article>
          ))}
        </div>
        <div className={s.comparisonImpact} data-change={next < total ? "lower" : next > total ? "higher" : "same"}>
          <span>전체 월 구독료<b>{money(total)} → {money(next)}</b></span>
          <strong>{next - total > 0 ? "+" : ""}{money(next - total)} / 월</strong>
        </div>
        <p className={s.caption}>
          비교 조건은 ‘선택 항목에 반영’을 눌러야 견적에 저장됩니다. 다른 제품으로 바꾸면 카드·교원 혜택을 다시 선택해 주세요.
          예상 총비용은 선택한 월 요금이 계약 기간 동안 유지되는 기준입니다.
        </p>
        <div className={s.buttonRow}>
          <button className={s.secondary} onClick={onClose}>취소</button>
          <button className={s.primary} disabled={choiceLoading || Boolean(choiceError)} onClick={() => onApply(candidate)}>선택 항목에 반영</button>
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
            <span>제품 구독 안내</span>
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
            {quote.lines.map((line, index) => {
              const price = lineTotals(line);
              const promotion = textValue(line.selectedVariant.프로모션명);
              const type = promotionTypeLabel(line.selectedVariant.프로모션유형);
              return (
                <li className={s.paperProduct} key={line.id} data-images={images && Boolean(line.product.image)}>
                  {images && line.product.image && <img className={s.paperProductImage} src={line.product.image} alt="" />}
                  <div className={s.paperProductInfo}>
                    <span className={s.paperProductCategory}>{String(index + 1).padStart(2, "0")} / {line.product.category}</span>
                    <h2>{line.product.name}</h2>
                    <p className={s.paperModel}>{line.product.id}</p>
                    <ConditionTags line={line} />
                    {(promotion || type.length > 22) && <div className={s.paperPromotion}>
                      {type.length > 22 && <p><span>프로모션 유형</span> {type}</p>}
                      {promotion && <p><span>적용 혜택</span> {promotion}</p>}
                    </div>}
                    {cards && price.teacher > 0 && <p className={s.paperBenefitTerms}>구독교원 {line.teachers.map((plan) => `${plan.type} ${plan.seats}구좌`).join(" · ")}</p>}
                  </div>
                  <div className={s.paperProductPrice}>
                    <span>월 구독료</span>
                    <strong>{money(price.monthly)}</strong>
                    {discounts && price.normal > price.monthly && <div className={s.paperPriceDetail}>
                      <p><span>기본 요금</span><s>{money(price.normal)}</s></p>
                      {price.discount > 0 && <p><span>프로모션 할인</span><b>-{money(price.discount)}</b></p>}
                      {price.deposit > 0 && <p><span>선납 월 차감</span><b>-{money(price.contract - price.monthly)}</b></p>}
                    </div>}
                    {cards && (line.card || price.teacher > 0) && <div className={s.paperBenefitPrice}>
                      {line.card && <p>{line.card.issuer} -{money(price.card)}</p>}
                      {price.teacher > 0 && <p>구독교원 -{money(price.teacher)}</p>}
                      <b>혜택 후 {money(price.effective)}</b>
                    </div>}
                  </div>
                  <div className={s.paperProductMeta}>
                    {price.deposit > 0 && <span>선납금 <b>{money(price.deposit)}</b></span>}
                    <span>계약 총비용 <b>{money(price.total)}</b></span>
                    {line.voucherTotal !== undefined && price.voucher > 0 && <span>상품권 <b>{money(price.voucher)}</b></span>}
                  </div>
                </li>
              );
            })}
          </ul>
          {quote.lines.length > 0 && (
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
              <div className={s.paperVoucherTotals}>
                <div><span>제품별 상품권 합계</span><b>{money(totals.productVoucher)}</b></div>
                {totals.multiProductVoucher > 0 && <div><span>다품목 상품권</span><b>{money(totals.multiProductVoucher)}</b></div>}
                <div className={s.paperVoucherGrandTotal}><span>총 지급 상품권</span><b>{money(totals.voucher)}</b></div>
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
            계약 총비용은 월 구독료 × 계약 개월 수 + 선납금의 합계이며 카드·교원 할인은 제외합니다.
            <br />
            기간별 프로모션·청구 할인 실적·적용 기간은 선택 상품의 계약 조건에
            따라 확인해 주세요. 예상 총액은 선택한 월 요금이 유지되는
            기준입니다.
          </div>
        </section>
        <aside className={s.printSettings}>
          <h3>출력 설정</h3>
          <p>A4 · 세로 · 제품별 요약 리스트</p>
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
