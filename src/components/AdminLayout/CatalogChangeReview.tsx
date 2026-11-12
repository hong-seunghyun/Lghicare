import { useEffect, useState } from "react";
import { adminCatalogRequest } from "@/lib/admin/catalogClient";
import type { ChangeItem, ImportJob, ImportSection } from "@/lib/catalog/types";
import styles from "./productImport.module.css";

type ProductChange = {
  conditions: Record<string, string>;
  before: string | null;
  after: string | null;
  beforeNormal: string | null;
  afterNormal: string | null;
};
type Detail = {
  kind: string;
  before?: unknown;
  after?: unknown;
  rows?: ProductChange[];
  total?: number;
  offset?: number;
};
const labels: Record<string, string> = {
  base: "기본 상품권",
  default: "기본",
  combine_new_existing: "결합",
  resubscribe: "재구독",
  priority: "우선순위",
  serviceCycle: "관리 주기 상품권",
  promo: "프로모션 상품권",
  themePromo: "테마판촉",
  name: "판촉명",
  amount: "금액",
  startDate: "시작일",
  endDate: "종료일",
  multiProductCount: "다품목 인정대수",
  multiProductExcludeVoucher: "다품목 지급 제외",
  multiProductNote: "다품목 비고",
  excludeWhenPromoTypeIsNormalN: "일반(N) 상품권 제외",
  themePromoExcludePromoNameKeywords: "테마판촉 제외 문구",
  multiProductRule: "다품목 지급 규칙",
  tiers: "지급 구간",
  minUnits: "최소 대수",
  maxUnits: "최대 대수",
  rewardPerUnit: "대당 지급액",
  rounding: "대수 소수점 처리",
  promoNameKeywordMap: "프로모션 적용 문구",
  basePromoTypeKeywords: "기본 상품권 인정 문구",
  baseDefaultKeyword: "기본 유형 문구",
  baseResubscribeKeyword: "재구독 문구",
  combineKeywords: "결합 유형 문구",
  normalPromoTypeKeyword: "일반(N) 구분 문구",
  stackingPolicy: "중복 적용",
  categories: "항목",
  allowMultiple: "항목 내 중복 허용",
  stackAcrossCategories: "항목 간 중복 허용",
  events: "기간 판촉",
};
const money = (value: string | null) =>
  value === null
    ? "—"
    : value.trim() === ""
      ? "누락"
      : `${Number(value.replace(/,/g, "")).toLocaleString("ko-KR")}원`;
function leaves(value: unknown, prefix = ""): Record<string, string> {
  if (value === null || value === undefined)
    return prefix ? { [prefix]: "—" } : {};
  if (Array.isArray(value) && value.every((item) => typeof item !== "object"))
    return { [prefix]: value.join(" · ") || "없음" };
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              "modelCode",
              "createdAt",
              "updatedAt",
              "id",
              "version",
              "generatedFrom",
            ].includes(key),
        )
        .flatMap(([key, item]) =>
          Object.entries(
            leaves(
              item,
              [
                prefix,
                labels[key] ?? (/^\d+$/.test(key) ? `${Number(key) + 1}` : key),
              ]
                .filter(Boolean)
                .join(" / "),
            ),
          ),
        ),
    );
  return {
    [prefix || "문구"]:
      typeof value === "boolean"
        ? value
          ? "예"
          : "아니오"
        : typeof value === "number"
          ? value.toLocaleString("ko-KR")
          : String(value),
  };
}
export default function CatalogChangeReview({ job }: { job: ImportJob }) {
  const [section, setSection] = useState<ImportSection>(
    job.preview?.selection.products
      ? "products"
      : job.preview?.selection.vouchers
        ? "vouchers"
        : "disclaimers",
  );
  const [category, setCategory] = useState(
    job.preview?.selection.categories[0] ?? "정수기",
  );
  const [items, setItems] = useState<ChangeItem[]>([]),
    [offset, setOffset] = useState(0),
    [total, setTotal] = useState(0);
  const [chosen, setChosen] = useState<ChangeItem | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [detailOffset, setDetailOffset] = useState(0);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    setOffset(0);
    setChosen(null);
    setDetail(null);
    setItems([]);
    setTotal(0);
  }, [section, category, job.prepared]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      view: "changes",
      section,
      category,
      offset: String(offset),
    });
    adminCatalogRequest<{ items: ChangeItem[]; total: number }>(
      `/api/admin/product-import/${job.id}?${params}`,
    )
      .then((data) => {
        if (!cancelled) {
          setItems(data.items);
          setTotal(data.total);
        }
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job.id, job.prepared, section, category, offset]);
  useEffect(() => {
    if (!chosen) return;
    let cancelled = false;
    setDetail(null);
    setError("");
    const params = new URLSearchParams({
      view: "changes",
      section: chosen.section,
      category: chosen.category ?? "",
      model: chosen.model,
      offset: String(detailOffset),
    });
    adminCatalogRequest<Detail>(`/api/admin/product-import/${job.id}?${params}`)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [job.id, chosen, detailOffset]);
  const before = leaves(detail?.before),
    after = leaves(detail?.after);
  return (
    <details className={styles.issues}>
      <summary>모델별 변경 금액·문구 상세 확인</summary>
      <div className={styles.uploadRow}>
        <label>
          항목{" "}
          <select
            value={section}
            onChange={(event) =>
              setSection(event.target.value as ImportSection)
            }
          >
            {job.preview?.selection.products && (
              <option value="products">상품·구독 조건</option>
            )}
            {job.preview?.selection.vouchers && (
              <option value="vouchers">상품권</option>
            )}
            {job.preview?.selection.disclaimers && (
              <option value="disclaimers">디스클레이머</option>
            )}
          </select>
        </label>
        {section === "products" && (
          <label>
            분류{" "}
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {job.preview?.selection.categories.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">변경 목록을 확인하고 있습니다.</p>}
      <div className={styles.modelChanges}>
        {items.map((item) => (
          <button
            key={`${item.section}:${item.category}:${item.model}`}
            aria-pressed={
              chosen?.section === item.section && chosen?.model === item.model
            }
            onClick={() => {
              setChosen(item);
              setDetailOffset(0);
            }}
          >
            {item.model || "상품권 공통 규칙"}
            <small>
              {item.change === "added"
                ? "추가"
                : item.change === "removed"
                  ? "제외"
                  : "변경"}
            </small>
          </button>
        ))}
      </div>
      {!loading && !items.length && (
        <p className={styles.help}>이 항목에는 변경된 모델이 없습니다.</p>
      )}
      {total > 25 && (
        <div className={styles.actions}>
          <button
            disabled={offset === 0 || loading}
            onClick={() => setOffset((value) => Math.max(0, value - 25))}
          >
            이전 모델
          </button>
          <span>
            {offset + 1}~{Math.min(total, offset + 25)} / {total}
          </span>
          <button
            disabled={offset + 25 >= total || loading}
            onClick={() => setOffset((value) => value + 25)}
          >
            다음 모델
          </button>
        </div>
      )}
      {chosen && !detail && !error && (
        <p role="status">
          {chosen.model || "공통 규칙"}의 변경 내용을 불러오고 있습니다.
        </p>
      )}
      {detail && (
        <>
          <h3 className={styles.detailHeading}>
            {chosen?.model || "상품권 공통 규칙"}
          </h3>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>{detail.kind === "products" ? "구독 조건" : "항목"}</th>
                  <th>변경 전</th>
                  <th>변경 후</th>
                </tr>
              </thead>
              <tbody>
                {detail.kind === "products"
                  ? detail.rows?.map((row, index) => (
                      <tr key={index}>
                        <td>
                          <b>
                            {row.conditions["프로모션 대분류"]} ·{" "}
                            {Number(row.conditions.계약기간) % 12 === 0
                              ? `${Number(row.conditions.계약기간) / 12}년`
                              : `${row.conditions.계약기간}개월`}{" "}
                            · {row.conditions.서비스유형} ·{" "}
                            {row.conditions["서비스주기/월"]}
                          </b>
                          <details>
                            <summary>
                              {row.conditions.프로모션유형.replace(
                                /\|/g,
                                " · ",
                              )}
                            </summary>
                            <p className={styles.help}>
                              {row.conditions.프로모션명}
                            </p>
                          </details>
                        </td>
                        <td>
                          {money(row.before)}
                          <p className={styles.help}>
                            할인 전 {money(row.beforeNormal)}
                          </p>
                        </td>
                        <td
                          className={
                            row.before !== row.after ? styles.accent : undefined
                          }
                        >
                          {money(row.after)}
                          <p className={styles.help}>
                            할인 전 {money(row.afterNormal)}
                          </p>
                        </td>
                      </tr>
                    ))
                  : [
                      ...new Set([
                        ...Object.keys(before),
                        ...Object.keys(after),
                      ]),
                    ].map((key) => (
                      <tr key={key}>
                        <th>{key}</th>
                        <td>{before[key] ?? "—"}</td>
                        <td
                          className={
                            before[key] !== after[key]
                              ? styles.accent
                              : undefined
                          }
                        >
                          {after[key] ?? "—"}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {detail.kind === "products" && (detail.total ?? 0) > 25 && (
            <div className={styles.actions}>
              <button
                disabled={detailOffset === 0}
                onClick={() =>
                  setDetailOffset((value) => Math.max(0, value - 25))
                }
              >
                이전 조건
              </button>
              <span>
                {detailOffset + 1}~
                {Math.min(detail.total ?? 0, detailOffset + 25)} /{" "}
                {detail.total}
              </span>
              <button
                disabled={detailOffset + 25 >= (detail.total ?? 0)}
                onClick={() => setDetailOffset((value) => value + 25)}
              >
                다음 조건
              </button>
            </div>
          )}
        </>
      )}
    </details>
  );
}
