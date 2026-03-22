import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

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
  excludeWhenPromoTypeIsNormalN?: boolean;
};

const RULES_DOC_ID = "current";
const RULES_COLLECTION = "voucherRules";
const MODELS_COLLECTION = "voucherModels";

let cachedRules: VoucherRules | null = null;
let cachedRulesPromise: Promise<VoucherRules | null> | null = null;

const modelCache = new Map<string, VoucherModel | null>();
const modelPromiseCache = new Map<string, Promise<VoucherModel | null>>();

export async function fetchVoucherRules(): Promise<VoucherRules | null> {
  if (cachedRules) return cachedRules;
  if (cachedRulesPromise) return cachedRulesPromise;

  cachedRulesPromise = (async () => {
    const snap = await getDoc(doc(db, RULES_COLLECTION, RULES_DOC_ID));
    if (!snap.exists()) return null;
    const data = snap.data() as VoucherRules;
    cachedRules = data;
    return data;
  })();

  return cachedRulesPromise;
}

export async function fetchVoucherModel(
  modelCode: string,
): Promise<VoucherModel | null> {
  const trimmed = (modelCode || "").toString().trim();
  if (!trimmed) return null;

  if (modelCache.has(trimmed)) return modelCache.get(trimmed) ?? null;
  if (modelPromiseCache.has(trimmed))
    return modelPromiseCache.get(trimmed) ?? null;

  const promise = (async () => {
    const snap = await getDoc(doc(db, MODELS_COLLECTION, trimmed));
    if (!snap.exists()) {
      modelCache.set(trimmed, null);
      return null;
    }
    const data = snap.data() as VoucherModel;
    modelCache.set(trimmed, data);
    return data;
  })();

  modelPromiseCache.set(trimmed, promise);
  return promise;
}

export async function getVoucherMasterForModel(modelCode: string) {
  const [rules, model] = await Promise.all([
    fetchVoucherRules(),
    fetchVoucherModel(modelCode),
  ]);

  if (!rules || !model) return null;

  return {
    version: rules.version ?? 1,
    generatedFrom: rules.generatedFrom ?? "",
    rules,
    products: { [modelCode]: model },
  };
}
