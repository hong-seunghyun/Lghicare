import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_FIELDS,
  type ImportIssue,
  type ImportSection,
  type ParsedCatalog,
  type ProductRow,
} from "./types";
import { isSafeModel } from "./types";
import type { VoucherModel } from "@/lib/voucherMaster";

export const importText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const cell = value as {
      result?: unknown;
      error?: string;
      text?: string;
      richText?: Array<{ text: string }>;
    };
    if ("result" in cell) return importText(cell.result);
    if (cell.error) return cell.error;
    if (cell.richText)
      return cell.richText
        .map((part) => part.text)
        .join("")
        .trim();
    return cell.text?.trim() ?? "";
  }
  return String(value).trim();
};
const key = (value: string) => value.replace(/\s+/g, "");
const moneyValue = (value: string) =>
  /^\d+(?:\.0+)?$/.test(value.replace(/,/g, ""))
    ? Number(value.replace(/,/g, ""))
    : NaN;
export function importDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  const text = importText(value);
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial < 1 || serial > 100000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  const match = text.match(/^(20\d{2})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  const iso = date.toISOString().slice(0, 10);
  return iso ===
    `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
    ? iso
    : null;
}

// A deterministic converter: workbook prose is business data, never executable instructions.
export class CatalogParser {
  readonly result: ParsedCatalog = {
    products: {},
    disclaimers: {},
    vouchers: {
      rules: {
        version: 3,
        baseDefaultKeyword: "기본",
        baseResubscribeKeyword: "재구독",
        combineKeywords: ["신규결합", "기존결합"],
        normalPromoTypeKeyword: "일반(N)",
        promoNameKeywordMap: {
          케어십전환: ["케어십"],
          미사용전환: ["미사용"],
          듀얼전환: ["듀얼"],
          타사보상: ["타사"],
          자사보상: ["자사보상", "자사", "중고"],
          제안타겟: ["제안타겟"],
        },
        multiProductRule: { tiers: [], rounding: "floor" },
        themePromo: { events: [] },
      },
      models: {},
    },
    issues: [],
    issueCounts: {
      products: { errors: 0, warnings: 0 },
      disclaimers: { errors: 0, warnings: 0 },
      vouchers: { errors: 0, warnings: 0 },
    },
    sheets: [],
    statistics: {
      productRows: 0,
      productModels: 0,
      disclaimers: 0,
      vouchers: 0,
      categories: [],
    },
  };
  private headers = new Map<string, number>();
  private duplicates = new Map<string, string>();
  private productModels = new Set<string>();
  private categoryModels = new Map<string, Set<string>>();
  private themeExclusions: string[] = [];
  private voucherHeaderSeen = false;
  private voucherDefaultColumn = false;
  constructor(
    private today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
    }).format(new Date()),
  ) {}
  issue(
    section: ImportSection,
    level: ImportIssue["level"],
    sheet: string,
    row: number | undefined,
    message: string,
    model?: string,
  ) {
    this.result.issueCounts[section][
      level === "error" ? "errors" : "warnings"
    ]++;
    if (this.result.issues.length < 400)
      this.result.issues.push({
        section,
        level,
        sheet,
        ...(row ? { row } : {}),
        ...(model ? { model } : {}),
        message,
      });
  }
  accept(sheet: string, row: number, values: unknown[]) {
    if (!this.result.sheets.includes(sheet)) this.result.sheets.push(sheet);
    if (sheet === "제품등록리스트") this.product(row, values);
    if (sheet === "디스클라이머" || sheet === "디스클레이머")
      this.disclaimer(sheet, row, values);
    if (sheet === "상품권마스터") this.voucher(row, values);
  }
  private product(row: number, values: unknown[]) {
    if (row === 1) {
      values.forEach((value, index) =>
        this.headers.set(key(importText(value)), index),
      );
      for (const name of PRODUCT_FIELDS)
        if (!this.headers.has(key(name)))
          this.issue(
            "products",
            "error",
            "제품등록리스트",
            row,
            `필수 열이 없습니다: ${name}`,
          );
      return;
    }
    const record: ProductRow = {};
    for (const field of PRODUCT_FIELDS)
      record[field] = importText(values[this.headers.get(key(field)) ?? -1]);
    if (Object.values(record).every((value) => !value)) return;
    const model = record.모델코드,
      category = record.중분류;
    if (!isSafeModel(model)) {
      this.issue(
        "products",
        "error",
        "제품등록리스트",
        row,
        "모델코드가 비었거나 지원하지 않는 문자입니다.",
        model,
      );
      return;
    }
    if (!(PRODUCT_CATEGORIES as readonly string[]).includes(category)) {
      this.issue(
        "products",
        "error",
        "제품등록리스트",
        row,
        `지원하지 않는 중분류: ${category}`,
        model,
      );
      return;
    }
    for (const field of [
      "상품명",
      "계약기간",
      "서비스유형",
      "서비스주기/월",
      "할인전금액",
      "할인후금액",
    ]) {
      if (!record[field])
        this.issue(
          "products",
          "error",
          "제품등록리스트",
          row,
          `${field}이 비어 있습니다.`,
          model,
        );
    }
    for (const field of ["할인전금액", "할인후금액"]) {
      if (
        record[field] &&
        (!Number.isSafeInteger(moneyValue(record[field])) ||
          moneyValue(record[field]) < 0)
      )
        this.issue(
          "products",
          "error",
          "제품등록리스트",
          row,
          `${field}이 올바른 원 단위 금액이 아닙니다.`,
          model,
        );
    }
    if (
      record.계약기간 &&
      (!/^\d+$/.test(record.계약기간) || Number(record.계약기간) <= 0)
    )
      this.issue(
        "products",
        "error",
        "제품등록리스트",
        row,
        "계약기간은 0보다 큰 개월 수여야 합니다.",
        model,
      );
    const condition = createHash("sha256")
      .update(
        JSON.stringify([
          category,
          model,
          ...[
            "계약기간",
            "서비스유형",
            "서비스주기/월",
            "프로모션 대분류",
            "프로모션유형",
            "프로모션명",
          ].map((field) => record[field]),
        ]),
      )
      .digest("hex");
    const price = `${record.할인전금액.replace(/,/g, "")}|${record.할인후금액.replace(/,/g, "")}`;
    const previous = this.duplicates.get(condition);
    if (previous !== undefined && previous !== price)
      this.issue(
        "products",
        "error",
        "제품등록리스트",
        row,
        "같은 구독 조건에 서로 다른 가격이 있습니다.",
        model,
      );
    this.duplicates.set(condition, price);
    (this.result.products[category] ??= []).push(record);
    this.productModels.add(model);
    if (!this.categoryModels.has(category))
      this.categoryModels.set(category, new Set());
    this.categoryModels.get(category)!.add(model);
  }
  private disclaimer(sheet: string, row: number, values: unknown[]) {
    if (row === 1) {
      if (
        key(importText(values[5])) !== "모델코드" ||
        !["디스클라이머", "디스클레이머"].includes(key(importText(values[6])))
      )
        this.issue(
          "disclaimers",
          "error",
          sheet,
          row,
          "디스클레이머 열 구성이 다릅니다.",
        );
      return;
    }
    const model = importText(values[5]),
      text = importText(values[6]);
    if (!model && !text) return;
    if (!isSafeModel(model) || !text) {
      this.issue(
        "disclaimers",
        "error",
        sheet,
        row,
        "모델코드 또는 디스클레이머 문구가 비어 있습니다.",
        model,
      );
      return;
    }
    const previous = this.result.disclaimers[model];
    if (previous !== undefined && previous !== text)
      this.issue(
        "disclaimers",
        "error",
        sheet,
        row,
        "같은 모델에 서로 다른 문구가 있습니다.",
        model,
      );
    this.result.disclaimers[model] = text;
  }
  private voucher(row: number, values: unknown[]) {
    const sheet = "상품권마스터";
    if (row === 8) {
      const heading = key(importText(values[20]));
      if (heading.includes("소상공인")) this.themeExclusions = ["소상공인"];
      if (heading.includes("제외") && !heading.includes("(소상공인타입제외)"))
        this.issue(
          "vouchers",
          "error",
          sheet,
          row,
          "새 테마판촉 제외 조건이 있습니다. 변환 규칙을 확인해 주세요.",
        );
    }
    if (row === 9) {
      this.voucherHeaderSeen = true;
      const defaultHeading = key(importText(values[2]));
      this.voucherDefaultColumn = ["기본", "기본상품권"].includes(
        defaultHeading,
      );
      if (defaultHeading === "공란")
        this.issue(
          "vouchers",
          "warning",
          sheet,
          row,
          "B열은 ‘공란’ 항목입니다. 일반 기본 상품권으로 해석하지 않고 기존 기본 금액을 유지합니다.",
        );
      else if (!this.voucherDefaultColumn)
        this.issue(
          "vouchers",
          "error",
          sheet,
          row,
          "B열의 상품권 적용 기준을 확인해 주세요. ‘공란’ 또는 ‘기본’ 제목이 필요합니다.",
        );
      for (const [index, title] of [
        [1, "모델코드"],
        [3, "기존결합/신규결합"],
        [4, "재구독"],
        [6, "적용기준"],
        [7, "금액"],
        [11, "적용기준"],
        [12, "금액"],
        [20, "금액"],
        [21, "적용시작일"],
        [22, "적용종료일"],
        [24, "인정대수"],
        [25, "비고"],
      ] as const)
        if (key(importText(values[index])) !== key(title))
          this.issue(
            "vouchers",
            "error",
            sheet,
            row,
            `상품권 ${index}열의 제목을 확인해 주세요: ${title}`,
          );
    }
    if (row >= 3 && row <= 7) {
      const units = importText(values[24]).match(/합산\s*(\d+)\s*대/);
      const amount = importText(values[25]).match(/대당\s*([\d.]+)\s*만/);
      if (units && amount) {
        const count = Number(units[1]);
        this.result.vouchers.rules.multiProductRule!.tiers!.push({
          minUnits: count,
          maxUnits: count === 6 ? null : count,
          rewardPerUnit: Number(amount[1]) * 10000,
        });
      }
      return;
    }
    if (row < 10) return;
    const model = importText(values[1]);
    if (!model) return;
    if (!isSafeModel(model)) {
      this.issue(
        "vouchers",
        "error",
        sheet,
        row,
        "지원하지 않는 모델코드입니다.",
        model,
      );
      return;
    }
    const amount = (index: number) => {
      const value = importText(values[index]);
      if (!value || value === "-") return 0;
      const parsed = moneyValue(value);
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        this.issue(
          "vouchers",
          "error",
          sheet,
          row,
          `${index}열의 금액이 올바르지 않습니다.`,
          model,
        );
        return 0;
      }
      return parsed;
    };
    const pairs = (indices: number[]) => {
      const map: Record<string, number> = {};
      for (const index of indices) {
        const name = importText(values[index]),
          value = amount(index + 1);
        if (!name && value)
          this.issue(
            "vouchers",
            "error",
            sheet,
            row,
            "금액에 대응하는 적용기준이 없습니다.",
            model,
          );
        if (name) {
          if (map[name] !== undefined && map[name] !== value)
            this.issue(
              "vouchers",
              "error",
              sheet,
              row,
              `같은 적용기준의 금액이 다릅니다: ${name}`,
              model,
            );
          map[name] = value;
        }
      }
      return map;
    };
    const countText = importText(values[24]),
      count = countText ? Number(countText) : 0;
    if (!Number.isFinite(count) || count < 0 || count > 1)
      this.issue(
        "vouchers",
        "error",
        sheet,
        row,
        "다품목 인정대수는 0~1 사이여야 합니다. 금액과 구분해 주세요.",
        model,
      );
    const note = importText(values[25]);
    const value: VoucherModel = {
      modelCode: model,
      base: {
        ...(this.voucherDefaultColumn ? { default: amount(2) } : {}),
        combine_new_existing: amount(3),
        resubscribe: amount(4),
      },
      serviceCycle: pairs([6, 8]),
      promo: pairs([11, 13, 15, 17]),
      themePromo: [],
      multiProductCount: count,
      multiProductNote: note,
      multiProductExcludeVoucher: /대수만|상품권\s*미적용/.test(note),
      excludeWhenPromoTypeIsNormalN: false,
    };
    const theme = amount(20),
      startText = importText(values[21]),
      endText = importText(values[22]);
    if (theme || startText || endText) {
      const start = importDate(values[21]),
        end = importDate(values[22]);
      if (!theme || !start || !end || start > end)
        this.issue(
          "vouchers",
          "error",
          sheet,
          row,
          "테마판촉의 금액·시작일·종료일을 확인해 주세요.",
          model,
        );
      else {
        value.themePromo = [
          { name: "테마판촉", amount: theme, startDate: start, endDate: end },
        ];
        if (this.themeExclusions.length)
          value.themePromoExcludePromoNameKeywords = [...this.themeExclusions];
        if (end < this.today)
          this.issue(
            "vouchers",
            "warning",
            sheet,
            row,
            `종료된 테마판촉입니다: ${start}~${end}`,
            model,
          );
      }
    }
    const previous = this.result.vouchers.models[model];
    for (const criterion of Object.keys(value.promo))
      this.result.vouchers.rules.promoNameKeywordMap![criterion] ??= [
        criterion,
      ];
    if (previous)
      this.issue(
        "vouchers",
        JSON.stringify(previous) === JSON.stringify(value)
          ? "warning"
          : "error",
        sheet,
        row,
        JSON.stringify(previous) === JSON.stringify(value)
          ? "같은 내용의 중복 모델을 한 건으로 정리했습니다."
          : "중복 모델의 상품권 조건이 서로 다릅니다.",
        model,
      );
    this.result.vouchers.models[model] = value;
  }
  finish() {
    const r = this.result;
    for (const [section, sheet] of [
      ["products", "제품등록리스트"],
      ["disclaimers", "디스클라이머"],
      ["vouchers", "상품권마스터"],
    ] as const) {
      if (
        !r.sheets.includes(sheet) &&
        !(section === "disclaimers" && r.sheets.includes("디스클레이머"))
      )
        this.issue(
          section,
          "error",
          sheet,
          undefined,
          "필수 시트를 찾지 못했습니다.",
        );
    }
    if (!this.voucherHeaderSeen)
      this.issue(
        "vouchers",
        "error",
        "상품권마스터",
        undefined,
        "상품권 열 제목을 찾지 못했습니다.",
      );
    if (
      r.vouchers.rules
        .multiProductRule!.tiers!.map((tier) => tier.minUnits)
        .join(",") !== "2,3,4,5,6"
    )
      this.issue(
        "vouchers",
        "error",
        "상품권마스터",
        undefined,
        "다품목 지급 구간을 모두 읽지 못했습니다.",
      );
    r.statistics.categories = Object.entries(r.products).map(
      ([name, records]) => ({
        name,
        rows: records.length,
        models: this.categoryModels.get(name)?.size ?? 0,
      }),
    );
    r.statistics.productRows = r.statistics.categories.reduce(
      (sum, c) => sum + c.rows,
      0,
    );
    r.statistics.productModels = this.productModels.size;
    r.statistics.disclaimers = Object.keys(r.disclaimers).length;
    r.statistics.vouchers = Object.keys(r.vouchers.models).length;
    return r;
  }
}

export async function parseCatalogWorkbook(
  buffer: Buffer,
  fileName: string,
  today?: string,
): Promise<ParsedCatalog> {
  const parser = new CatalogParser(today);
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), {
    entries: "ignore",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "cache",
    worksheets: "emit",
  });
  let cells = 0;
  for await (const sheet of reader) {
    const name = (sheet as typeof sheet & { name: string }).name;
    if (
      ![
        "제품등록리스트",
        "디스클라이머",
        "디스클레이머",
        "상품권마스터",
      ].includes(name)
    )
      continue;
    for await (const row of sheet) {
      cells += row.cellCount;
      if (row.number > 300000 || cells > 7_000_000)
        throw new Error("엑셀 데이터 범위가 처리 한도를 초과했습니다.");
      parser.accept(name, row.number, row.values as unknown[]);
    }
  }
  const parsed = parser.finish();
  parsed.vouchers.rules.generatedFrom = fileName;
  return parsed;
}

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    if (typeof (value as { toJSON?: unknown }).toJSON === "function")
      return stableValue((value as { toJSON: () => unknown }).toJSON());
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
};
export const contentHash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
