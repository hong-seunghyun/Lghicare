/* eslint-disable @next/next/no-img-element */
import { PreviewLine, lineTotals, money, textValue } from "@/lib/renewalTest";
import { Icon } from "./TestLayout";
import s from "./renewal.module.css";

export default function QuoteRow({ line, onEdit, onCompare, onDetails, onRemove }: {
  line: PreviewLine; onEdit: () => void; onCompare: () => void;
  onDetails: () => void; onRemove: () => void;
}) {
  const t = lineTotals(line);
  return (
    <article className={s.compactQuoteRow} aria-label={`${line.product.name} 견적`}>
      <div className={s.compactIdentity}>
        {line.product.image && <img src={line.product.image} alt="" />}
        <div><span>{line.product.category}</span><h3 title={line.product.name}>{line.product.name}</h3><small>{line.product.id}</small></div>
      </div>
      <div className={s.compactContract}><span>계약·관리</span><b>{line.term / 12}년 · {line.care}</b><small>{textValue(line.selectedVariant["서비스주기/월"]) || "관리 주기 없음"}</small></div>
      <div className={s.compactBase}><span>기본 월 요금</span><b>{money(t.normal)}</b></div>
      <div className={s.compactDiscount}><span>월 할인</span><b>{t.normal > t.monthly ? `−${money(t.normal - t.monthly)}` : "—"}</b><small>{line.prepay ? "프로모션·선납" : "프로모션"}</small></div>
      <div className={s.compactMonthly}><span>월 구독료</span><strong>{money(t.monthly)}</strong>{line.card && <small>혜택 후 {money(t.effective)}</small>}</div>
      <div className={s.compactActions}>
        <button onClick={onEdit}>조건 수정</button>
        <div><button onClick={onCompare}>비교</button><button onClick={onDetails}>요금 상세</button></div>
        <button className={s.compactRemove} aria-label={`${line.product.id} 제품 삭제`} onClick={onRemove}><Icon name="trash" size={15} /></button>
      </div>
    </article>
  );
}
