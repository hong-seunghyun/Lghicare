type VoucherMaster = {
  version: number;
  rules: {
    basePromoTypeKeywords?: string[];
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
      multiProductNote?: string;
      multiProductExcludeVoucher?: boolean;
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

type MultiProductVoucherDetail = { type: string; amount: number; reason: string };

export type MultiProductVoucherResult = {
  total: number;
  details: MultiProductVoucherDetail[];
  perUnitReward: number;
  totalUnits: number;
  eligibleUnits: number;
};

const normalizeText = (value: string) =>
  value.replace(/\s+/g, "").replace(/[()]/g, "");

const includesAny = (text: string, keywords: string[]) => {
  const normText = normalizeText(text);
  return keywords.some((k) => normText.includes(normalizeText(k)));
};

const expandKeywordTokens = (keywords: string[]) =>
  keywords
    .flatMap((word) => word.split(/[|,/]/))
    .map((token) => token.trim())
    .filter(Boolean);

const PROMO_KEY_ALIASES: Record<string, string[]> = {
  중고: ["자사보상", "자사"],
  자사보상: ["중고", "자사"],
  자사: ["자사보상", "중고"],
};

const withPromoAliases = (keywords: string[]) => {
  const merged = new Set<string>();
  keywords.forEach((keyword) => {
    const clean = keyword.trim();
    if (!clean) return;
    merged.add(clean);
    Object.entries(PROMO_KEY_ALIASES).forEach(([key, aliases]) => {
      if (normalizeText(clean) === normalizeText(key)) {
        aliases.forEach((alias) => {
          if (alias?.trim()) merged.add(alias.trim());
        });
      }
    });
  });
  return Array.from(merged);
};

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
  // 항목 내 중복은 프로모션 상품권만 허용한다.
  // (기본/서비스주기/테마판촉/다품목은 항목당 단일 적용)
  void rules;
  void category;
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

  const resubscribeKeywords = expandKeywordTokens([resubscribeKeyword]);
  const combineKeywordTokens = expandKeywordTokens(combineKeywords);
  const defaultKeywordTokens = expandKeywordTokens([baseDefaultKeyword]);
  const configuredBaseKeywords = expandKeywordTokens(
    voucherMaster.rules.basePromoTypeKeywords ?? [],
  );
  const baseEligibilityKeywords = Array.from(
    new Set([
      ...configuredBaseKeywords,
      ...resubscribeKeywords,
      ...combineKeywordTokens,
      ...defaultKeywordTokens,
    ]),
  );

  const hasBaseCondition =
    promoType.length > 0 &&
    includesAny(promoType, baseEligibilityKeywords);
  const isResubscribe =
    hasBaseCondition && includesAny(promoType, resubscribeKeywords);
  const isCombine =
    hasBaseCondition && includesAny(promoType, combineKeywordTokens);
  const isDefault =
    hasBaseCondition &&
    !isResubscribe &&
    !isCombine &&
    (defaultKeywordTokens.length === 0 ||
      includesAny(promoType, defaultKeywordTokens) ||
      configuredBaseKeywords.length > 0);

  if (hasBaseCondition) {
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
            ([key]) => {
              if (key.replace(/[^0-9]/g, "") !== target) return false;
              // 숫자 기반 fallback은 "4개월"처럼 순수 주기 키에서만 허용.
              // "4개월 신규, 결합" 같은 조건 키는 promoType 매칭을 통과해야만 적용.
              const metadata = parseServiceCycleMetadata(key);
              return metadata.targetKeywords.length === 0;
            },
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
  const promoSource = promoName.trim();
  if (promoSource) {
    const matches: Array<{ key: string; amount: number }> = [];

    const legacyMap = voucherMaster.rules.promoNameKeywordMap;
    const expandKeywords = (keywords: string[]) =>
      keywords
        .flatMap((word) => word.split(/[|,/]/))
        .map((token) => token.trim())
        .filter(Boolean);
    const buildKeywordVariants = (keywords: string[]) =>
      withPromoAliases(expandKeywords(keywords)).flatMap((value) =>
        value.endsWith("전환")
          ? [value, value.replace(/전환$/, "")]
          : [value],
      );

    const promoEntries = Object.entries(model.promo || {})
      .map(([key, amount]) => ({ key, amount: Number(amount) || 0 }))
      .filter((entry) => entry.amount > 0);
    const usedPromoKeys = new Set<string>();

    const resolvePromoEntry = (label: string, keywords: string[]) => {
      const preferredKeys = withPromoAliases([label, ...expandKeywords(keywords)]);
      const exact = promoEntries.find((entry) =>
        preferredKeys.some(
          (candidate) =>
            normalizeText(candidate) === normalizeText(entry.key),
        ),
      );
      if (exact) return exact;

      return (
        promoEntries.find((entry) =>
          preferredKeys.some(
            (candidate) =>
              includesAny(entry.key, [candidate]) ||
              includesAny(candidate, [entry.key]),
          ),
        ) ?? null
      );
    };

    if (legacyMap && Object.keys(legacyMap).length > 0) {
      Object.entries(legacyMap).forEach(([label, keywords]) => {
        const triggerKeywords = buildKeywordVariants([label, ...keywords]);
        if (!includesAny(promoSource, triggerKeywords)) return;

        const resolved = resolvePromoEntry(label, keywords);
        if (!resolved || resolved.amount <= 0) return;

        const dedupeKey = normalizeText(resolved.key);
        if (usedPromoKeys.has(dedupeKey)) return;
        usedPromoKeys.add(dedupeKey);

        matches.push({ key: label, amount: resolved.amount });
      });
    } else {
      promoEntries.forEach((entry) => {
        const keywordVariants = buildKeywordVariants([entry.key]);
        if (!includesAny(promoSource, keywordVariants)) return;
        const dedupeKey = normalizeText(entry.key);
        if (usedPromoKeys.has(dedupeKey)) return;
        usedPromoKeys.add(dedupeKey);
        matches.push({ key: entry.key, amount: entry.amount });
      });
    }

    if (matches.length === 0) {
      promoEntries.forEach((entry) => {
        const keywordVariants = buildKeywordVariants([entry.key]);
        if (!includesAny(promoSource, keywordVariants)) return;
        const dedupeKey = normalizeText(entry.key);
        if (usedPromoKeys.has(dedupeKey)) return;
        usedPromoKeys.add(dedupeKey);
        matches.push({ key: entry.key, amount: entry.amount });
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
    const hasThemeContext = uniqueNames.length > 0;

    if (Array.isArray(themePromoRaw)) {
      themePromoRaw.forEach((item) => {
        const name = (item?.name || "테마판촉").toString();
        const amount = Number(item?.amount) || 0;
        if (amount <= 0) return;
        const hasDates = item?.startDate || item?.endDate;
        if (!hasDates) {
          if (!hasThemeContext) return;
          if (!uniqueNames.some((n) => matchByName(n, name))) return;
          addMatch(name, amount);
          return;
        }
        const start = item?.startDate ? new Date(item.startDate) : null;
        const end = item?.endDate ? new Date(item.endDate) : null;
        const inRange =
          (!start || themeDate >= start) && (!end || themeDate <= end);
        if (!inRange) return;
        if (hasThemeContext && !uniqueNames.some((n) => matchByName(n, name)))
          return;
        addMatch(name, amount, "기간");
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
          if (hasThemeContext && uniqueNames.some((n) => matchByName(n, name))) {
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
            (!hasThemeContext || uniqueNames.some((n) => matchByName(n, name)))
          ) {
            addMatch(name, amount, "기간");
          }
        }
      }
    } else {
      const themePromoMap = (themePromoRaw as Record<string, number>) || {};
      if (Object.keys(themePromoMap).length > 0) {
        if (hasThemeContext) {
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
  products: Array<{
    modelCode: string;
    multiProductCount?: number;
    multiProductCountOnly?: boolean;
    multiProductNote?: string;
  }>;
}): MultiProductVoucherResult {
  const { voucherRules, products } = params;
  const tiers = voucherRules.multiProductRule?.tiers ?? [];
  if (tiers.length === 0) {
    return {
      total: 0,
      details: [],
      perUnitReward: 0,
      totalUnits: 0,
      eligibleUnits: 0,
    };
  }

  const totalUnitsRaw = products.reduce(
    (sum, item) => sum + (Number(item.multiProductCount) || 0),
    0,
  );
  const eligibleUnitsRaw = products.reduce(
    (sum, item) =>
      sum + (item.multiProductCountOnly ? 0 : Number(item.multiProductCount) || 0),
    0,
  );
  const rounding = voucherRules.multiProductRule?.rounding ?? "floor";
  const totalUnits = applyRounding(totalUnitsRaw, rounding);
  const eligibleUnits = applyRounding(eligibleUnitsRaw, rounding);
  const exceptionUnits = Math.max(totalUnits - eligibleUnits, 0);
  const exceptionNotes = new Set<string>();
  products.forEach((item) => {
    if (
      item.multiProductCount &&
      item.multiProductCountOnly &&
      item.multiProductNote
    ) {
      exceptionNotes.add(item.multiProductNote);
    }
  });
  const exceptionReason =
    exceptionNotes.size > 0
      ? Array.from(exceptionNotes).join(", ")
      : "상품권 미적용";

  const createExceptionDetail = () =>
    exceptionUnits
      ? [
          {
            type: "다품목 상품권 예외",
            amount: 0,
            reason: `총 ${exceptionUnits}대는 ${exceptionReason}`,
          },
        ]
      : [];

  if (totalUnits <= 0) {
    return {
      total: 0,
      details: createExceptionDetail(),
      perUnitReward: 0,
      totalUnits,
      eligibleUnits,
    };
  }

  const tier = tiers.find((t) => {
    const minOk = totalUnits >= t.minUnits;
    const maxOk = t.maxUnits == null ? true : totalUnits <= Number(t.maxUnits);
    return minOk && maxOk;
  });

  if (!tier || eligibleUnits <= 0) {
    return {
      total: 0,
      details: createExceptionDetail(),
      perUnitReward: tier?.rewardPerUnit ?? 0,
      totalUnits,
      eligibleUnits,
    };
  }

  const perUnitReward = Number(tier.rewardPerUnit) || 0;
  const total = Math.max(perUnitReward * eligibleUnits, 0);
  if (total <= 0) {
    return {
      total: 0,
      details: createExceptionDetail(),
      perUnitReward,
      totalUnits,
      eligibleUnits,
    };
  }

  return {
    total,
    details: [
      {
        type: "다품목 상품권",
        amount: total,
        reason: exceptionUnits
          ? `총 ${eligibleUnits}대 지급 (${perUnitReward.toLocaleString()}원/대, ${exceptionUnits}대 예외)`
          : `총 ${eligibleUnits}대 적용 (${perUnitReward.toLocaleString()}원/대)`,
      },
      ...createExceptionDetail(),
    ],
    perUnitReward,
    totalUnits,
    eligibleUnits,
  };
}
