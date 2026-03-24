type VoucherMaster = {
  version: number;
  rules: {
    baseDefaultKeyword?: string; // "기본"
    baseResubscribeKeyword?: string; // "재구독"
    combineKeywords?: string[]; // ["신규결합","기존결합"]
    normalPromoTypeKeyword?: string; // "일반(N)"
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
  products: Record<
    string,
    {
      modelCode: string;
      excludeWhenPromoTypeIsNormalN?: boolean;
      base: {
        default?: number;
        combine_new_existing: number; // 기존/신규결합
        resubscribe: number; // 재구독
        priority?: string[];
      };
      serviceCycle: Record<string, number>; // "4개월": 50000
      promo: Record<string, number>; // "케어십": 50000, "...": 0
      themePromo?:
        | Record<string, number>
        | { name?: string; amount?: number; startDate?: string; endDate?: string }
        | Array<{ name?: string; amount?: number; startDate?: string; endDate?: string }>;
      multiProductCount?: number;
    }
  >;
};

export type VoucherBreakdown = {
  base: number;
  serviceCycle: number;
  promotion: number;
  themePromo: number;
  multiProduct: number;
  total: number;
  details: Array<{ type: string; amount: number; reason: string }>;
};

const normalizeText = (value: string) =>
  value.replace(/\s+/g, "").replace(/[()]/g, "");

const includesAny = (text: string, keywords: string[]) => {
  const normText = normalizeText(text);
  return keywords.some((k) => normText.includes(normalizeText(k)));
};

const getStackingPolicy = (rules: VoucherMaster["rules"]) =>
  rules.stackingPolicy?.categories ?? {};

type StackingCategory =
  | "base"
  | "serviceCycle"
  | "promo"
  | "themePromo"
  | "multiProduct";

const getAllowMultiple = (
  rules: VoucherMaster["rules"],
  category: StackingCategory,
) => {
  const policy = getStackingPolicy(rules);
  if (policy?.[category]?.allowMultiple != null) {
    return policy[category]?.allowMultiple ?? false;
  }
  return category === "promo";
};

const applyRounding = (value: number, mode?: "floor" | "round" | "ceil") => {
  if (mode === "round") return Math.round(value);
  if (mode === "ceil") return Math.ceil(value);
  return Math.floor(value);
};

type ServiceCycleMetadata = {
  key: string;
  cycleText: string;
  targetKeywords: string[];
};

const parseServiceCycleMetadata = (key: string): ServiceCycleMetadata => {
  const cycleMatch = key.match(/(\d+\s*개월)/);
  const cycleText = cycleMatch?.[1]?.replace(/\s+/g, "") || key;
  const remainder = key.replace(cycleMatch?.[0] ?? "", "").trim();
  const targetKeywords = remainder
    ? remainder
        .replace(/[/,]+/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
    : [];
  return {
    key,
    cycleText,
    targetKeywords,
  };
};

const matchesServiceCycleMetadata = (
  metadata: ServiceCycleMetadata,
  serviceCycleInput: string,
  promoTypeInput: string,
) => {
  const normalizedServiceCycle = serviceCycleInput.trim();
  if (!normalizedServiceCycle) return false;
  const cycleDigits = metadata.cycleText.replace(/[^0-9]/g, "");
  const serviceDigits = normalizedServiceCycle.replace(/[^0-9]/g, "");

  const cycleMatches =
    (metadata.cycleText &&
      includesAny(normalizedServiceCycle, [metadata.cycleText])) ||
    (cycleDigits &&
      serviceDigits &&
      cycleDigits.length > 0 &&
      cycleDigits === serviceDigits) ||
    includesAny(normalizedServiceCycle, [metadata.key]);

  if (!cycleMatches) return false;

  if (metadata.targetKeywords.length === 0) return true;
  if (!promoTypeInput) return false;
  return includesAny(promoTypeInput, metadata.targetKeywords);
};

export function calcVoucher(params: {
  voucherMaster: VoucherMaster;
  modelCode: string;
  promoType?: string; // 프로모션유형
  serviceCycle?: string; // 방문주기
  promoName?: string; // 프로모션명
  themePromoName?: string; // 테마판촉명
  themeDate?: Date; // 테마판촉 기준일
}): VoucherBreakdown {
  const { voucherMaster, modelCode } = params;
  const promoType = (params.promoType ?? "").toString();
  const serviceCycle = (params.serviceCycle ?? "").toString();
  const promoName = (params.promoName ?? "").toString();
  const themePromoName = (params.themePromoName ?? "").toString();
  const themeDate = params.themeDate ?? new Date();

  const model = voucherMaster.products[modelCode];
  if (!model) {
    return {
      base: 0,
      serviceCycle: 0,
      promotion: 0,
      themePromo: 0,
      multiProduct: 0,
      total: 0,
      details: [],
    };
  }

  const details: VoucherBreakdown["details"] = [];

  const normalKeyword = voucherMaster.rules.normalPromoTypeKeyword ?? "일반(N)";
  if (
    includesAny(promoType, [normalKeyword]) &&
    model.excludeWhenPromoTypeIsNormalN
  ) {
    return {
      base: 0,
      serviceCycle: 0,
      promotion: 0,
      themePromo: 0,
      multiProduct: 0,
      total: 0,
      details: [],
    };
  }

  // 1) 기본 상품권
  let base = 0;
  const resubscribeKeyword =
    voucherMaster.rules.baseResubscribeKeyword ?? "재구독";
  const combineKeywords =
    voucherMaster.rules.combineKeywords ?? [
      "신규결합",
      "기존결합",
      "기존결합/신규결합",
    ];
  const baseDefaultKeyword = voucherMaster.rules.baseDefaultKeyword ?? "기본";

  const isResubscribe = includesAny(promoType, [resubscribeKeyword]);
  const isCombine = includesAny(promoType, combineKeywords);
  const isDefault =
    (!isResubscribe && !isCombine) ||
    (promoType && includesAny(promoType, [baseDefaultKeyword]));

  if (isResubscribe) {
    base = model.base.resubscribe || 0;
    if (base > 0)
      details.push({ type: "기본 상품권", amount: base, reason: "재구독" });
  } else if (isCombine) {
    base = model.base.combine_new_existing || 0;
    if (base > 0)
      details.push({
        type: "기본 상품권",
        amount: base,
        reason: "기존/신규결합",
      });
  } else if (isDefault) {
    base = model.base.default || 0;
    if (base > 0)
      details.push({ type: "기본 상품권", amount: base, reason: "기본" });
  }

  // 2) 서비스주기 상품권
  let cycleAmt = 0;
  if (serviceCycle) {
    const matches = Object.entries(model.serviceCycle || {})
      .map(([key, value]) => ({
        metadata: parseServiceCycleMetadata(key),
        amount: Number(value) || 0,
      }))
      .filter(
        (entry) =>
          entry.amount > 0 &&
          matchesServiceCycleMetadata(entry.metadata, serviceCycle, promoType),
      );

    if (matches.length > 0) {
      const best = matches.reduce((max, entry) =>
        entry.amount > max.amount ? entry : max,
      );
      cycleAmt = best.amount;
    }
    if (!cycleAmt) {
      cycleAmt = model.serviceCycle[serviceCycle] || 0;
      if (!cycleAmt) {
        const target = serviceCycle.replace(/[^0-9]/g, "");
        if (target) {
          const matched = Object.entries(model.serviceCycle || {}).find(
            ([key]) => key.replace(/[^0-9]/g, "") === target,
          );
          cycleAmt = matched ? Number(matched[1]) || 0 : 0;
        }
      }
    }
  }
  if (cycleAmt > 0)
    details.push({
      type: "서비스주기 상품권",
      amount: cycleAmt,
      reason: serviceCycle,
    });

  // 3) 프로모션별 상품권(부분 포함 매칭)
  let promotion = 0;
  if (promoName) {
    const matches: Array<{ key: string; amount: number }> = [];

    const legacyMap = voucherMaster.rules.promoNameKeywordMap;
    if (legacyMap && Object.keys(legacyMap).length > 0) {
      Object.entries(legacyMap).forEach(([label, keywords]) => {
        if (!promoName) return;
        if (!includesAny(promoName, keywords)) return;
        const key = keywords[0];
        const amt = Number(model.promo?.[key]) || 0;
        if (amt <= 0) return;
        matches.push({ key: label, amount: amt });
      });
    } else {
      Object.entries(model.promo || {}).forEach(([key, amount]) => {
        if (!includesAny(promoName, [key])) return;
        const amt = Number(amount) || 0;
        if (amt <= 0) return;
        matches.push({ key, amount: amt });
      });
    }

    if (matches.length > 0) {
      if (getAllowMultiple(voucherMaster.rules, "promo")) {
        matches.forEach((match) => {
          promotion += match.amount;
          details.push({
            type: "프로모션 상품권",
            amount: match.amount,
            reason: `${match.key} 포함`,
          });
        });
      } else {
        const best = matches.reduce((max, item) =>
          item.amount > max.amount ? item : max,
        );
        promotion += best.amount;
        details.push({
          type: "프로모션 상품권",
          amount: best.amount,
          reason: `${best.key} 포함`,
        });
      }
    }
  }

  // 4) 테마판촉 상품권
  let themePromo = 0;
  const themePromoRaw = model.themePromo;
  if (themePromoRaw) {
    const matches: Array<{ key: string; amount: number }> = [];
    const themeNames: string[] = [];

    if (themePromoName) {
      themeNames.push(themePromoName);
    }

    const events = voucherMaster.rules.themePromo?.events ?? [];
    events.forEach((event) => {
      if (!event?.name) return;
      if (!event.startDate || !event.endDate) return;
      const start = new Date(event.startDate);
      const end = new Date(event.endDate);
      if (themeDate >= start && themeDate <= end) {
        themeNames.push(event.name);
      }
    });

    const matchByName = (name: string, key: string) =>
      name.includes(key) || key.includes(name);

    const addMatch = (key: string, amount: number, reason?: string) => {
      const amt = Number(amount) || 0;
      if (amt <= 0) return;
      matches.push({ key: reason ? `${key} ${reason}` : key, amount: amt });
    };

    const uniqueNames = Array.from(new Set(themeNames));

    if (Array.isArray(themePromoRaw)) {
      themePromoRaw.forEach((item) => {
        const name = (item?.name || "테마판촉").toString();
        const amount = Number(item?.amount) || 0;
        if (amount <= 0) return;
        const hasDates = item?.startDate || item?.endDate;
        if (!hasDates) {
          // 날짜 미지정: 상시 노출
          if (
            uniqueNames.length === 0 ||
            uniqueNames.some((n) => matchByName(n, name))
          ) {
            addMatch(name, amount);
          }
          return;
        }
        const start = item?.startDate ? new Date(item.startDate) : null;
        const end = item?.endDate ? new Date(item.endDate) : null;
        const inRange =
          (!start || themeDate >= start) && (!end || themeDate <= end);
        if (!inRange) return;
        if (
          uniqueNames.length === 0 ||
          uniqueNames.some((n) => matchByName(n, name))
        ) {
          addMatch(name, amount, "기간");
        }
      });
    } else if (
      typeof themePromoRaw === "object" &&
      ("amount" in themePromoRaw ||
        "startDate" in themePromoRaw ||
        "endDate" in themePromoRaw)
    ) {
      const name = (themePromoRaw?.name || "테마판촉").toString();
      const amount = Number(themePromoRaw?.amount) || 0;
      const hasDates = themePromoRaw?.startDate || themePromoRaw?.endDate;
      if (amount > 0) {
        if (!hasDates) {
          if (
            uniqueNames.length === 0 ||
            uniqueNames.some((n) => matchByName(n, name))
          ) {
            addMatch(name, amount);
          }
        } else {
          const start = themePromoRaw?.startDate
            ? new Date(themePromoRaw.startDate)
            : null;
          const end = themePromoRaw?.endDate
            ? new Date(themePromoRaw.endDate)
            : null;
          const inRange =
            (!start || themeDate >= start) && (!end || themeDate <= end);
          if (
            inRange &&
            (uniqueNames.length === 0 ||
              uniqueNames.some((n) => matchByName(n, name)))
          ) {
            addMatch(name, amount, "기간");
          }
        }
      }
    } else {
      const themePromoMap = (themePromoRaw as Record<string, number>) || {};
      if (Object.keys(themePromoMap).length > 0) {
        if (uniqueNames.length === 0) {
          // 상시 노출: 테마명이 없으면 등록된 테마판촉을 그대로 적용
          Object.entries(themePromoMap).forEach(([key, amount]) => {
            const amt = Number(amount) || 0;
            if (amt <= 0) return;
            matches.push({ key, amount: amt });
          });
        } else {
          uniqueNames.forEach((name) => {
            Object.entries(themePromoMap).forEach(([key, amount]) => {
              if (!name.includes(key)) return;
              const amt = Number(amount) || 0;
              if (amt <= 0) return;
              matches.push({ key, amount: amt });
            });
          });
        }
      }
    }

    if (matches.length > 0) {
      if (getAllowMultiple(voucherMaster.rules, "themePromo")) {
        matches.forEach((match) => {
          themePromo += match.amount;
          details.push({
            type: "테마판촉 상품권",
            amount: match.amount,
            reason: `${match.key} 포함`,
          });
        });
      } else {
        const best = matches.reduce((max, item) =>
          item.amount > max.amount ? item : max,
        );
        themePromo += best.amount;
        details.push({
          type: "테마판촉 상품권",
          amount: best.amount,
          reason: `${best.key} 포함`,
        });
      }
    }
  }

  const total = base + cycleAmt + promotion + themePromo;
  return {
    base,
    serviceCycle: cycleAmt,
    promotion,
    themePromo,
    multiProduct: 0,
    total,
    details,
  };
}

export function calcMultiProductVoucher(params: {
  voucherRules: VoucherMaster["rules"];
  products: Array<{ modelCode: string; multiProductCount?: number }>;
}): { total: number; details: Array<{ type: string; amount: number; reason: string }> } {
  const { voucherRules, products } = params;
  const tiers = voucherRules.multiProductRule?.tiers ?? [];
  if (tiers.length === 0) {
    return { total: 0, details: [] };
  }

  const totalUnitsRaw = products.reduce(
    (sum, item) => sum + (Number(item.multiProductCount) || 0),
    0,
  );
  const rounding = voucherRules.multiProductRule?.rounding ?? "floor";
  const totalUnits = applyRounding(totalUnitsRaw, rounding);
  if (totalUnits <= 0) {
    return { total: 0, details: [] };
  }

  const tier = tiers.find((t) => {
    const minOk = totalUnits >= t.minUnits;
    const maxOk = t.maxUnits == null ? true : totalUnits <= Number(t.maxUnits);
    return minOk && maxOk;
  });

  if (!tier) {
    return { total: 0, details: [] };
  }

  const total = Math.max(tier.rewardPerUnit * totalUnits, 0);
  if (total <= 0) {
    return { total: 0, details: [] };
  }

  return {
    total,
    details: [
      {
        type: "다품목 상품권",
        amount: total,
        reason: `총 ${totalUnits}대 적용 (${tier.rewardPerUnit.toLocaleString()}원/대)`,
      },
    ],
  };
}
