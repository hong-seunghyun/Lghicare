/* eslint-disable @next/next/no-img-element */
import { PreviewLine, lineTotals, money, textValue } from "@/lib/renewalTest";
import { ConditionTags } from "./QuoteDetails";
import { Icon } from "./TestLayout";
import baseStyles from "./renewal.module.css";
import presentationStyles from "./quotePresentation.module.css";
const s = { ...baseStyles, ...presentationStyles };

export default function QuoteRow({ line, onEdit, onCompare, onDetails, onRemove }: {
  line: PreviewLine; onEdit: () => void; onCompare: () => void;
  onDetails: () => void; onRemove: () => void;
}) {
  const t = lineTotals(line);
  const promotion = textValue(line.selectedVariant.프로모션명);
  return (
    <article className={s.compactQuoteRow} aria-label={line.product.name + " 견적"}>
      <div className={s.compactIdentity}>
        {line.product.image && <img src={line.product.image} alt="" />}
        <div>
          <span>{line.product.category}</span>
          <h3 title={line.product.name}>{line.product.name}</h3>
          <small>{line.product.id}</small>
          <ConditionTags line={line} />
          {promotion && <p className={s.rowPromotion} title={promotion}><span>프로모션</span> {promotion}</p>}
        </div>
      </div>
      <div className={s.compactMonthly}>
        <span>월 구독료</span>
        <strong>{money(t.monthly)}</strong>
        {t.normal > t.monthly && <small className={s.rowPriceBefore}>기본 <s>{money(t.normal)}</s></small>}
        {(line.card || t.teacher > 0) && <small>혜택 후 {money(t.effective)}</small>}
      </div>
      <div className={s.compactActions}>
        <button onClick={onEdit}>조건 수정</button>
        <div><button onClick={onCompare}>비교</button><button onClick={onDetails}>요금 상세</button></div>
        <button className={s.compactRemove} aria-label={line.product.id + " 제품 삭제"} onClick={onRemove}><Icon name="trash" size={15} /></button>
      </div>
    </article>
  );
}
