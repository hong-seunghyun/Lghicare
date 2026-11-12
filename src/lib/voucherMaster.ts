
export type VoucherRules = {
  version?: number;
  generatedFrom?: string;
  basePromoTypeKeywords?: string[];
  baseDefaultKeyword?: string;
  baseResubscribeKeyword?: string;
  combineKeywords?: string[];
  normalPromoTypeKeyword?: string;
  promoNameKeywordMap?: Record<string, string[]>;
  stackingPolicy?: {
    stackAcrossCategories?: boolean;
    categories?: {
      base?: { allowMultiple?: boolean };
      serviceCycle?: { allowMultiple?: boolean };
      promo?: { allowMultiple?: boolean };
      themePromo?: { allowMultiple?: boolean };
      multiProduct?: { allowMultiple?: boolean };
    };
  };
  multiProductRule?: {
    tiers?: Array<{
      minUnits: number;
      maxUnits?: number | null;
      rewardPerUnit: number;
    }>;
    rounding?: "floor" | "round" | "ceil";
  };
  themePromo?: {
    events?: Array<{
      name: string;
      startDate?: string;
      endDate?: string;
      reward?: number;
    }>;
  };
};

export type VoucherModel = {
  modelCode: string;
  base: {
    default?: number;
    combine_new_existing: number;
    resubscribe: number;
    priority?: string[]; 
  };
  serviceCycle: Record<string, number>;
  promo: Record<string, number>;
  themePromo?:
    | Record<string, number>
    | { name?: string; amount?: number; startDate?: string; endDate?: string }
    | Array<{ name?: string; amount?: number; startDate?: string; endDate?: string }>;
  multiProductCount?: number;
  multiProductNote?: string;
  multiProductExcludeVoucher?: boolean;
  excludeWhenPromoTypeIsNormalN?: boolean;
  themePromoExcludePromoNameKeywords?: string[];
};

const CACHE_TTL = 60_000;
const MISSING_TTL = 15_000;
type VoucherData = { rules: VoucherRules | null; model: VoucherModel | null; version: string };
const cache = new Map<string, { value: VoucherData; expiresAt: number }>();
const pending = new Map<string, Promise<VoucherData>>();
export async function fetchVoucherData(modelCode = "", version?: string): Promise<VoucherData> {
  const key = `${version ?? "current"}:${modelCode.trim()}`;
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  const waiting = pending.get(key);
  if (waiting) return waiting;
  const request = (async () => {
    const params = new URLSearchParams();
    if (modelCode.trim()) params.set("model", modelCode.trim());
    if (version) params.set("version", version);
    const response = await fetch(`/api/catalog/vouchers?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error("상품권 정보를 확인하지 못했습니다. 다시 시도해 주세요.");
    const data = await response.json() as VoucherData;
    if (!("rules" in data) || !("model" in data) || typeof data.version !== "string") throw new Error("상품권 응답 형식이 올바르지 않습니다.");
    if (cache.size >= 300 && !cache.has(key)) cache.delete(cache.keys().next().value!);
    cache.set(key, { value: data, expiresAt: Date.now() + (data.rules && (!modelCode || data.model) ? CACHE_TTL : MISSING_TTL) });
    return data;
  })();
  pending.set(key, request);
  try { return await request; } finally { if (pending.get(key) === request) pending.delete(key); }
}
export async function fetchVoucherRules(version?: string): Promise<VoucherRules | null> { return (await fetchVoucherData("", version)).rules; }
export async function fetchVoucherModel(modelCode: string, version?: string): Promise<VoucherModel | null> { return modelCode.trim() ? (await fetchVoucherData(modelCode, version)).model : null; }
export async function getVoucherMasterForModel(modelCode: string, version?: string) {
  const { rules, model } = await fetchVoucherData(modelCode, version);
  if (!rules || !model) return null;
  return { version: rules.version ?? 1, generatedFrom: rules.generatedFrom ?? "", rules, products: { [modelCode]: model } };
}
