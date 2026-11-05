import { PreviewLine, lineTotals, money, textValue } from "@/lib/renewalTest";
import s from "./renewal.module.css";

export function ContractDetails({ line }: { line: PreviewLine }) {
  const v = line.selectedVariant;
  const items = [
    ["가입 유형", line.signup || "기본 가입"],
    ["계약 기간", `${line.term / 12}년 · ${line.term}개월`],
    ["관리 방식", line.care || "관리 없음"],
    ["관리 주기", textValue(v["서비스주기/월"]) || "해당 없음"],
    ["프로모션 유형", textValue(v.프로모션유형) || "일반 요금"],
    ["적용 프로모션", textValue(v.프로모션명) || "미적용"],
  ];
  return (
    <dl className={s.contractDetails} aria-label={`${line.product.id} 선택 조건`}>
      {items.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

export function RateBreakdown({
  line, discounts = true, benefits = true,
}: { line: PreviewLine; discounts?: boolean; benefits?: boolean }) {
  const t = lineTotals(line);
  const hasBenefits = Boolean(line.card || t.teacher);
  return (
    <div className={s.rateBreakdown}>
      <dl className={s.rateSteps} aria-label={`${line.product.id} 요금 상세`}>
        {discounts && <>
          <div><dt>기본 월 구독료</dt><dd>{money(t.normal)}</dd></div>
          <div><dt>프로모션 할인</dt><dd>{t.discount ? `−${money(t.discount)}` : "미적용"}</dd></div>
          {t.deposit > 0 && <div><dt>선납 반영 월 차감액</dt><dd>−{money(t.contract - t.monthly)}</dd></div>}
        </>}
        <div className={s.rateContract}><dt>계약 월 구독료<small>카드·교원 할인 전</small></dt><dd>{money(t.monthly)}<small>/ 월</small></dd></div>
        {benefits && hasBenefits && <>
          <div><dt>제휴카드 청구 할인<small>{line.card?.issuer || "미적용"}</small></dt><dd>{t.card ? `−${money(t.card)}` : "미적용"}</dd></div>
          <div><dt>구독교원 할인<small>{t.teacher ? line.teachers.map((p) => `${p.type} ${p.seats}구좌`).join(" · ") : "미적용"}</small></dt><dd>{t.teacher ? `−${money(t.teacher)}` : "미적용"}</dd></div>
          <div className={s.rateEffective}><dt>혜택 적용 후 월 예상 부담금</dt><dd>{money(t.effective)}<small>/ 월</small></dd></div>
        </>}
      </dl>
      <dl className={s.rateExtras}>
        {t.deposit > 0 && <div><dt>선납금 · {line.prepay}%<small>계약 시 1회 납부</small></dt><dd>{money(t.deposit)}</dd></div>}
        <div><dt>예상 계약 총비용<small>{line.term}개월 월 요금{t.deposit ? " + 선납금" : ""} · 카드·교원 제외</small></dt><dd>{money(t.total)}</dd></div>
        {line.voucherTotal !== undefined && <div><dt>제품 상품권<small>월 요금과 별도 제공</small></dt><dd>{money(t.voucher)}</dd></div>}
      </dl>
      {benefits && hasBenefits && <p className={s.rateNote}>카드 실적과 구독교원 유지 등 해당 혜택 조건 충족 시 예상 금액입니다.</p>}
      <p className={s.rateNote}>예상 계약 총비용은 선택한 월 요금이 계약 기간 동안 유지되는 기준입니다.</p>
    </div>
  );
}
