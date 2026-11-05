/** Renewal UI data uses the existing products API and Firebase settings. */
export type ProductVariant = Record<string, unknown>;
export type PreviewProduct = {
  id: string;
  name: string;
  category: string;
  subCategory: string;
  image: string;
  monthly: number;
  description: string;
  terms: number[];
  care: string[];
  cycles: number[];
  variants: ProductVariant[];
  tag?: string;
};
export type ThemeProductSummary = Pick<
  PreviewProduct,
  "id" | "name" | "category" | "image"
> & {
  monthly: number;
  minimumVariant: ProductVariant;
};
export const PREVIEW_CATEGORIES = [
  "전체",
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
];
export const PRODUCT_CATEGORIES = PREVIEW_CATEGORIES.filter(
  (category) => category !== "전체",
);
export const featuredBenefitPrice = (monthly: number) =>
  Math.max(0, monthly - 10000);
export const VARIANT_FIELDS = [
  "프로모션 대분류",
  "계약기간",
  "서비스유형",
  "서비스주기/월",
  "프로모션유형",
  "프로모션명",
] as const;
export type VariantField = (typeof VARIANT_FIELDS)[number];
// Old mock quotes are never restored. Each authenticated owner has separate storage.
export const DRAFT_KEY = "lgcare-renewal-test:draft:live-v2";
export const SAVED_KEY = "lgcare-renewal-test:saved:live-v2";
export const ownerStorageKey = (key: string, uid: string) => `${key}:${uid}`;
export type CardBenefit = {
  id: string;
  issuer: string;
  discount: number;
  allowTeacher: boolean;
  conditions?: string;
};
export type TeacherPlan = {
  id: string;
  type: string;
  maxSeats: number;
  discountPerSeat: number;
};
export type TeacherSelection = TeacherPlan & { seats: number };
export type PreviewLine = {
  id: string;
  product: PreviewProduct;
  quantity: number;
  term: number;
  care: string;
  cycle: number;
  signup: string;
  promotion: boolean;
  prepay: number;
  card?: CardBenefit;
  selectedVariant: ProductVariant;
  teachers: TeacherSelection[];
  voucherTotal?: number;
  voucherDetails?: Array<{ type: string; amount: number; reason: string }>;
};
export type PreviewQuote = {
  id: string;
  title: string;
  customer: string;
  manager: string;
  validity: number;
  note: string;
  lines: PreviewLine[];
  savedAt?: string;
  ownerUid: string;
  source: "live-v2";
};
export const textValue = (value: unknown) => String(value ?? "").trim();
export function parseMoney(value: unknown) {
  if (typeof value === "number")
    return Number.isFinite(value) ? Math.max(value, 0) : 0;
  const number = Number(textValue(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? Math.max(number, 0) : 0;
}
export const money = (value: number) =>
  `${Math.round(value).toLocaleString("ko-KR")}원`;
export function canUseRenewalEstimate(
  user: { role?: string | null; profile?: { isActive?: boolean } } | null,
) {
  return Boolean(
    user &&
      (user.role === "admin" ||
        (user.role === "manager" && user.profile?.isActive !== false)),
  );
}
export function getManagerLoginDestination(next: unknown): string {
  return typeof next === "string" &&
    /^\/renewal-test\/estimate(?:[?#]|$)/.test(next)
    ? next
    : "/manager";
}
const fieldNumber = (value: unknown) =>
  Number(textValue(value).replace(/[^0-9]/g, "")) || 0;
export const variantBefore = (v: ProductVariant) =>
  parseMoney(v.할인전금액 || v.정상가 || v.할인후금액);
export const variantMonthly = (v: ProductVariant) =>
  textValue(v.프로모션명) && v.할인후금액 !== undefined && v.할인후금액 !== ""
    ? parseMoney(v.할인후금액)
    : variantBefore(v);
export function defaultVariant(product: PreviewProduct): ProductVariant {
  const score = (v: ProductVariant) =>
    (textValue(v["프로모션 대분류"]) === "신규" ? 20 : 0) +
    (fieldNumber(v.계약기간) === 72 ? 10 : 0) +
    (/^일반\(기본N\)$/.test(textValue(v.프로모션유형)) ? 5 : 0) -
    textValue(v.프로모션명).length / 1000;
  return [...product.variants].sort((a, b) => score(b) - score(a))[0] ?? {};
}
export function lowestVariant(product: PreviewProduct): ProductVariant {
  const priced = product.variants.filter((v) =>
    [v.할인전금액, v.정상가, v.할인후금액].some(
      (amount) => amount !== undefined && amount !== null && amount !== "",
    ),
  );
  return (
    [...priced].sort((a, b) => variantMonthly(a) - variantMonthly(b))[0] ??
    defaultVariant(product)
  );
}
export const normalizeModelCode = (value: string) =>
  value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
export function matchPrepayRules(
  rules: Array<{
    middle?: string;
    sub?: string;
    model?: string;
    rate30?: boolean;
    rate50?: boolean;
  }>,
  product: { category: string; subCategory: string; id: string },
): "30" | "30_50" | null {
  let byModel: "30" | "30_50" | null = null;
  let bySub: "30" | "30_50" | null = null;
  let byMiddle: "30" | "30_50" | null = null;
  for (const rule of rules) {
    if (rule.middle !== product.category) continue;
    const rate = rule.rate50 ? "30_50" : rule.rate30 ? "30" : null;
    if (!rate) continue;
    const model = (rule.model || "").trim();
    const sub = (rule.sub || "").trim();
    if (product.id && model && model === product.id) byModel = rate;
    if (!byModel && product.subCategory && sub && sub === product.subCategory)
      bySub = rate;
    if (!model && !sub && !byModel && !bySub) byMiddle = rate;
  }
  return byModel || bySub || byMiddle || null;
}
export function selectThemeProducts<T extends { id: string }>(
  products: T[],
  models: string[],
) {
  return models.slice(0, 3).flatMap((model, index) => {
    const product = products.find(
      (p) => normalizeModelCode(p.id) === normalizeModelCode(model),
    );
    return product ? [{ product, rank: index + 1 }] : [];
  });
}
export function themeProductSummary(
  product: PreviewProduct,
): ThemeProductSummary {
  const variant = lowestVariant(product);
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    image: product.image,
    monthly: variantMonthly(variant),
    minimumVariant: Object.fromEntries(
      [...VARIANT_FIELDS, "할인전금액", "할인후금액", "정상가"].map((field) => [
        field,
        variant[field] ?? "",
      ]),
    ),
  };
}
// Previously saved quantities become individual, editable product entries.
export function individualizeQuote(quote: PreviewQuote): PreviewQuote {
  return {
    ...quote,
    lines: quote.lines.flatMap((line) =>
      Array.from({ length: line.quantity }, (_, index) => ({
        ...line,
        id: index === 0 ? line.id : `${line.id}-unit-${index + 1}`,
        quantity: 1,
      })),
    ),
  };
}
export function normalizeProduct(
  raw: Record<string, unknown>,
): PreviewProduct | null {
  const variants = Array.isArray(raw.variants)
    ? raw.variants.filter((v): v is ProductVariant =>
        Boolean(v && typeof v === "object"),
      )
    : [];
  const id = textValue(raw.모델코드);
  if (!id || !variants.length) return null;
  const product: PreviewProduct = {
    id,
    name: textValue(raw.상품명) || id,
    category: textValue(raw.중분류),
    subCategory: textValue(raw.소분류),
    image: textValue(raw.thumbnailUrl),
    description: textValue(raw.제품기능 || raw.상품기능),
    monthly: 0,
    variants,
    terms: [...new Set(variants.map((v) => fieldNumber(v.계약기간)))].filter(
      Boolean,
    ),
    care: [...new Set(variants.map((v) => textValue(v.서비스유형)))],
    cycles: [
      ...new Set(variants.map((v) => fieldNumber(v["서비스주기/월"]))),
    ].filter(Boolean),
  };
  product.monthly = variantBefore(defaultVariant(product));
  return product;
}
export function createLine(
  product: PreviewProduct,
  variant = defaultVariant(product),
): PreviewLine {
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    product,
    quantity: 1,
    term: fieldNumber(variant.계약기간),
    care: textValue(variant.서비스유형),
    cycle: fieldNumber(variant["서비스주기/월"]),
    signup: textValue(variant["프로모션 대분류"]),
    promotion: Boolean(textValue(variant.프로모션명)),
    prepay: 0,
    selectedVariant: variant,
    teachers: [],
  };
}
export function variantOptions(line: PreviewLine, field: VariantField) {
  const preceding = VARIANT_FIELDS.slice(0, VARIANT_FIELDS.indexOf(field));
  const candidates = line.product.variants.filter((v) =>
    preceding.every(
      (k) => textValue(v[k]) === textValue(line.selectedVariant[k]),
    ),
  );
  return [...new Set(candidates.map((v) => textValue(v[field])))];
}
export function changeLineVariant(
  line: PreviewLine,
  field: VariantField,
  value: string,
): PreviewLine {
  const index = VARIANT_FIELDS.indexOf(field);
  const preceding = VARIANT_FIELDS.slice(0, index);
  const candidates = line.product.variants.filter(
    (v) =>
      Boolean(v && typeof v === "object") &&
      textValue(v[field]) === value &&
      preceding.every(
        (k) => textValue(v[k]) === textValue(line.selectedVariant[k]),
      ),
  );
  const score = (v: ProductVariant) =>
    VARIANT_FIELDS.slice(index + 1).reduce(
      (n, k) =>
        n + (textValue(v[k]) === textValue(line.selectedVariant[k]) ? 1 : 0),
      0,
    );
  const variant = [...candidates].sort((a, b) => score(b) - score(a))[0];
  if (!variant) return line;
  const next = createLine(line.product, variant);
  return {
    ...line,
    ...next,
    id: line.id,
    quantity: line.quantity,
    card: line.card,
    teachers: line.teachers,
    prepay: 0,
    voucherTotal: undefined,
    voucherDetails: undefined,
  };
}
export const emptyQuote = (ownerUid = "", manager = ""): PreviewQuote => ({
  id: "",
  title: "우리 집 가전 구독 견적",
  customer: "",
  manager,
  validity: 15,
  note: "",
  lines: [],
  ownerUid,
  source: "live-v2",
});
export function lineTotals(line: PreviewLine) {
  const normal = variantBefore(line.selectedVariant);
  const usage = variantMonthly(line.selectedVariant);
  // Same rounding and prepayment formula as the existing ProductCard.
  const deposit =
    line.term === 72 && line.prepay
      ? Math.floor((normal * 72 * line.prepay) / 100 / 100) * 100
      : 0;
  const monthly = deposit
    ? Math.max(0, Math.floor((usage * 72 - deposit * 1.135) / 72 / 100) * 100)
    : usage;
  const card = Math.min(line.card?.discount ?? 0, monthly);
  const teacher = line.card?.allowTeacher
    ? Math.min(
        line.teachers.reduce((sum, p) => sum + p.seats * p.discountPerSeat, 0),
        Math.max(monthly - card, 0),
      )
    : 0;
  const q = line.quantity;
  return {
    normal: normal * q,
    discount: Math.max(normal - usage, 0) * q,
    contract: usage * q,
    deposit: deposit * q,
    monthly: monthly * q,
    card: card * q,
    teacher: teacher * q,
    effective: Math.max(monthly - card - teacher, 0) * q,
    total: (deposit + monthly * line.term) * q,
    voucher: (line.voucherTotal ?? 0) * q,
  };
}
export function quoteTotals(lines: PreviewLine[]) {
  return lines.reduce(
    (acc, l) => {
      const t = lineTotals(l);
      return {
        normal: acc.normal + t.normal,
        discount: acc.discount + t.discount,
        monthly: acc.monthly + t.monthly,
        deposit: acc.deposit + t.deposit,
        card: acc.card + t.card,
        teacher: acc.teacher + t.teacher,
        effective: acc.effective + t.effective,
        total: acc.total + t.total,
        voucher: acc.voucher + t.voucher,
        units: acc.units + l.quantity,
      };
    },
    {
      normal: 0,
      discount: 0,
      monthly: 0,
      deposit: 0,
      card: 0,
      teacher: 0,
      effective: 0,
      total: 0,
      voucher: 0,
      units: 0,
    },
  );
}
export function validateLine(line: PreviewLine): boolean {
  if (
    !line ||
    !line.product ||
    !Array.isArray(line.product.variants) ||
    !line.selectedVariant ||
    !Array.isArray(line.teachers)
  )
    return false;
  const matches = line.product.variants.some(
    (v) =>
      Boolean(v && typeof v === "object") &&
      VARIANT_FIELDS.every(
        (k) => textValue(v[k]) === textValue(line.selectedVariant[k]),
      ) &&
      variantMonthly(v) === variantMonthly(line.selectedVariant) &&
      variantBefore(v) === variantBefore(line.selectedVariant),
  );
  return (
    matches &&
    typeof line.id === "string" &&
    typeof line.product.id === "string" &&
    typeof line.product.image === "string" &&
    Number.isInteger(line.quantity) &&
    line.quantity >= 1 &&
    line.quantity <= 99 &&
    line.term === fieldNumber(line.selectedVariant.계약기간) &&
    line.term > 0 &&
    line.care === textValue(line.selectedVariant.서비스유형) &&
    line.cycle === fieldNumber(line.selectedVariant["서비스주기/월"]) &&
    [0, 30, 50].includes(line.prepay) &&
    (!line.prepay || line.term === 72) &&
    line.teachers.every(
      (p) =>
        Boolean(p && typeof p === "object") &&
        Number.isInteger(p.seats) &&
        p.seats >= 0 &&
        p.seats <= p.maxSeats &&
        Number.isFinite(p.discountPerSeat) &&
        p.discountPerSeat >= 0,
    ) &&
    line.teachers.reduce((sum, p) => sum + p.seats, 0) <= 4 &&
    (!line.card ||
      (typeof line.card.id === "string" &&
        Number.isFinite(line.card.discount) &&
        line.card.discount >= 0))
  );
}
export function isPreviewQuote(value: unknown): value is PreviewQuote {
  if (!value || typeof value !== "object") return false;
  const q = value as PreviewQuote;
  return (
    q.source === "live-v2" &&
    typeof q.ownerUid === "string" &&
    typeof q.id === "string" &&
    typeof q.title === "string" &&
    typeof q.customer === "string" &&
    typeof q.manager === "string" &&
    typeof q.note === "string" &&
    [7, 15, 30].includes(q.validity) &&
    (q.savedAt === undefined ||
      (typeof q.savedAt === "string" &&
        Number.isFinite(Date.parse(q.savedAt)))) &&
    Array.isArray(q.lines) &&
    q.lines.every(validateLine) &&
    new Set(q.lines.map((l) => l.id)).size === q.lines.length
  );
}
export const koreaDate = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export function validUntil(quote: PreviewQuote) {
  const d = quote.savedAt ? new Date(quote.savedAt) : new Date();
  d.setUTCDate(d.getUTCDate() + quote.validity);
  return koreaDate(d);
}
