import type { VoucherModel, VoucherRules } from "@/lib/voucherMaster";

export const PRODUCT_CATEGORIES = [
  "정수기",
  "TV",
  "의류건조기",
  "세탁기",
  "신발관리기",
  "냉장고",
  "김치냉장고",
  "식기세척기",
  "전기레인지",
  "광파오븐",
  "워시타워",
  "의류관리기",
  "청소기",
  "가습기",
  "바스에어시스템",
  "워시콤보",
  "에어컨",
  "제습기",
  "공기청정기",
  "안마의자",
  "마이컵",
] as const;
export const PRODUCT_FIELDS = [
  "대분류",
  "중분류",
  "소분류",
  "모델 상세 분류",
  "상품명",
  "모델코드",
  "동일모델기준",
  "제품색상",
  "계약기간",
  "서비스유형",
  "서비스주기/월",
  "할인전금액",
  "프로모션명",
  "프로모션 대분류",
  "프로모션유형",
  "지급 수단",
  "금액적용 유형",
  "전회차 할인 값(% | 원)",
  "할인금액",
  "선입금여부",
  "선입금 할인금액",
  "할인후금액",
  "제품기능",
] as const;
export type ProductRow = Record<string, string>;
export type ImportSection = "products" | "disclaimers" | "vouchers";
export type ImportIssue = {
  section: ImportSection;
  level: "error" | "warning";
  sheet: string;
  row?: number;
  model?: string;
  message: string;
};
export type VoucherBundle = {
  rules: VoucherRules;
  models: Record<string, VoucherModel>;
};
export type ParsedCatalog = {
  products: Record<string, ProductRow[]>;
  disclaimers: Record<string, string>;
  vouchers: VoucherBundle;
  issues: ImportIssue[];
  issueCounts: Record<ImportSection, { errors: number; warnings: number }>;
  sheets: string[];
  statistics: {
    productRows: number;
    productModels: number;
    disclaimers: number;
    vouchers: number;
    categories: Array<{ name: string; rows: number; models: number }>;
  };
};
export type ArtifactRef = { path: string; sha256: string; bytes: number };
export type CategoryRelease = {
  rows: ArtifactRef;
  summary: ArtifactRef;
  models: Record<string, ArtifactRef>;
  rowCount: number;
};
export type CatalogRelease = {
  schema: 1;
  id: string;
  parentId: string | null;
  createdAt: string;
  createdBy: string;
  source: { name: string; sha256: string };
  categories: Record<string, CategoryRelease>;
  disclaimers?: ArtifactRef;
  vouchers?: ArtifactRef;
};
export type CatalogPointer = {
  id: string | null;
  generation: string;
  manifest?: ArtifactRef;
  previousId?: string | null;
};
export type ImportSelection = {
  products: boolean;
  disclaimers: boolean;
  vouchers: boolean;
  categories: string[];
  mode: "merge" | "replace";
};
export type ImportDiff = {
  added: number;
  changed: number;
  unchanged: number;
  removed: number;
};
export type ChangeItem = {
  section: ImportSection;
  category?: string;
  model: string;
  change: "added" | "changed" | "removed";
};
export type ImportPreview = {
  baseGeneration: string;
  selection: ImportSelection;
  differences: Record<string, ImportDiff>;
  warnings: string[];
  changes?: ArtifactRef;
};
export type ImportJob = {
  id: string;
  owner: string;
  fileName: string;
  sourceHash: string;
  createdAt: string;
  updatedAt: string;
  state:
    | "uploaded"
    | "analyzing"
    | "analyzed"
    | "preparing"
    | "ready"
    | "published"
    | "failed";
  phase?: string;
  error?: string;
  leaseUntil?: number;
  leaseToken?: string;
  source: ArtifactRef;
  parsed?: ArtifactRef;
  prepared?: ArtifactRef;
  manifest?: ArtifactRef;
  analysis?: Pick<
    ParsedCatalog,
    "issues" | "issueCounts" | "statistics" | "sheets"
  >;
  preview?: ImportPreview;
  preparedKeys?: string[];
  releaseId?: string;
  warmup?: { completed: string[]; failed: string[] };
};
export const isSafeModel = (value: string) =>
  typeof value === "string" &&
  /^[A-Za-z0-9()_.-]{1,100}$/.test(value) &&
  !["__proto__", "prototype"].includes(value) &&
  !Object.prototype.hasOwnProperty.call(Object.prototype, value);
export const isSafeId = (value: string) =>
  typeof value === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(value);
