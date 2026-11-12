import type { VoucherModel, VoucherRules } from "@/lib/voucherMaster";
import type { VoucherBundle } from "./types";
import { isSafeModel } from "./types";
import { importDate } from "./parse";

const number = (value: unknown) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value !== "string" && typeof value !== "number")
    throw new Error("상품권 금액은 숫자여야 합니다.");
  const amount = Number(String(value).replace(/,/g, ""));
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error("상품권 금액은 0 이상의 정수여야 합니다.");
  return amount;
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const amounts = (value: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(object(value)).map(([key, value]) => [key, number(value)]),
  );
export function normalizedVoucherModel(
  code: string,
  raw: unknown,
): VoucherModel {
  if (!isSafeModel(code)) throw new Error("모델코드를 확인해 주세요.");
  const data = object(raw),
    base = object(data.base),
    multi = object(data.multiProduct);
  const count = data.multiProductCount ?? multi.recognizedUnits ?? 0;
  if (
    (typeof count !== "number" && typeof count !== "string") ||
    String(count).trim() === "" ||
    !Number.isFinite(Number(count)) ||
    Number(count) < 0 ||
    Number(count) > 1
  )
    throw new Error(`${code}: 다품목 인정대수는 0~1 사이여야 합니다.`);
  const note = String(data.multiProductNote ?? multi.note ?? "").trim();
  for (const name of [
    "multiProductExcludeVoucher",
    "excludeWhenPromoTypeIsNormalN",
  ])
    if (data[name] !== undefined && typeof data[name] !== "boolean")
      throw new Error(`${code}: ${name}은 true 또는 false여야 합니다.`);
  let themePromo = data.themePromo ?? {};
  if (Array.isArray(themePromo))
    themePromo = themePromo.map((item) => ({
      ...object(item),
      amount: number(object(item).amount),
    }));
  else if ("amount" in object(themePromo))
    themePromo = [
      {
        ...object(themePromo),
        name: object(themePromo).name ?? "테마판촉",
        amount: number(object(themePromo).amount),
      },
    ];
  else themePromo = amounts(themePromo);
  const periods = Array.isArray(themePromo)
    ? themePromo
    : "amount" in object(themePromo)
      ? [themePromo]
      : [];
  if (Array.isArray(themePromo) && !themePromo.length) themePromo = {};
  for (const raw of periods) {
    const period = object(raw),
      start = period.startDate ? importDate(period.startDate) : null,
      end = period.endDate ? importDate(period.endDate) : null;
    if (
      (period.startDate && !start) ||
      (period.endDate && !end) ||
      (start && end && start > end)
    )
      throw new Error(`${code}: 테마판촉 기간을 확인해 주세요.`);
  }
  const promo = Array.isArray(data.promo)
    ? Object.fromEntries(
        data.promo
          .map((item) => [
            String(object(item).criterion ?? object(item).name ?? ""),
            number(object(item).amount),
          ])
          .filter(([key]) => key),
      )
    : amounts(data.promo);
  const baseValues = {
    default: number(base.default),
    combine_new_existing: number(base.combine_new_existing),
    resubscribe: number(base.resubscribe),
  };
  for (const [name, amount] of Object.entries(base)) {
    if (name.includes("기존결합") || name.includes("신규결합"))
      baseValues.combine_new_existing = number(amount);
    else if (name.includes("재구독")) baseValues.resubscribe = number(amount);
    else if (name.includes("기본") && name !== "priority")
      baseValues.default = number(amount);
  }
  return {
    modelCode: code,
    base: {
      ...baseValues,
      ...(Array.isArray(base.priority)
        ? {
            priority: base.priority.filter(
              (item): item is string => typeof item === "string",
            ),
          }
        : {}),
    },
    serviceCycle: amounts(data.serviceCycle),
    promo,
    themePromo: themePromo as VoucherModel["themePromo"],
    multiProductCount: Number(count),
    multiProductNote: note,
    multiProductExcludeVoucher:
      typeof data.multiProductExcludeVoucher === "boolean"
        ? data.multiProductExcludeVoucher
        : multi.excludeVoucher === true ||
          multi.countOnly === true ||
          /대수만|상품권\s*미적용/.test(note),
    excludeWhenPromoTypeIsNormalN: data.excludeWhenPromoTypeIsNormalN === true,
    ...(Array.isArray(data.themePromoExcludePromoNameKeywords)
      ? {
          themePromoExcludePromoNameKeywords:
            data.themePromoExcludePromoNameKeywords.filter(
              (s): s is string => typeof s === "string" && Boolean(s.trim()),
            ),
        }
      : {}),
  };
}
export function validateVoucherRules(raw: unknown): VoucherRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("상품권 규칙 형식을 확인해 주세요.");
  const rules = { ...raw } as VoucherRules & {
    createdAt?: unknown;
    updatedAt?: unknown;
  };
  delete rules.createdAt;
  delete rules.updatedAt;
  const tiers = rules.multiProductRule?.tiers;
  if (tiers) {
    if (!Array.isArray(tiers))
      throw new Error("다품목 지급 구간을 확인해 주세요.");
    let last = 0;
    for (const tier of tiers) {
      if (
        !Number.isInteger(tier.minUnits) ||
        tier.minUnits < 1 ||
        tier.minUnits <= last ||
        (tier.maxUnits != null &&
          (!Number.isInteger(tier.maxUnits) || tier.maxUnits < tier.minUnits))
      )
        throw new Error("다품목 지급 구간이 겹치거나 올바르지 않습니다.");
      number(tier.rewardPerUnit);
      last = tier.maxUnits ?? Number.MAX_SAFE_INTEGER;
    }
  }
  return rules;
}
// Settings absent from the workbook remain administrator-controlled.
export function mergeWorkbookVouchers(
  before: VoucherBundle,
  incoming: VoucherBundle,
  replace: boolean,
): VoucherBundle {
  const models = replace
    ? ({} as Record<string, VoucherModel>)
    : { ...before.models };
  for (const [id, model] of Object.entries(incoming.models))
    models[id] = {
      ...before.models[id],
      ...model,
      base: {
        ...model.base,
        ...(model.base.default === undefined
          ? { default: before.models[id]?.base?.default ?? 0 }
          : {}),
        ...(before.models[id]?.base?.priority
          ? { priority: before.models[id].base.priority }
          : {}),
      },
      excludeWhenPromoTypeIsNormalN:
        before.models[id]?.excludeWhenPromoTypeIsNormalN ?? false,
    };
  return {
    models,
    rules: {
      ...incoming.rules,
      ...before.rules,
      version: incoming.rules.version,
      generatedFrom: incoming.rules.generatedFrom,
      multiProductRule: incoming.rules.multiProductRule,
      promoNameKeywordMap: {
        ...incoming.rules.promoNameKeywordMap,
        ...before.rules.promoNameKeywordMap,
      },
    },
  };
}
export function voucherJsonBundle(
  raw: unknown,
  current: VoucherBundle,
): VoucherBundle {
  const data = object(raw);
  const entries = object(data.products ?? data.models);
  if (!Object.keys(entries).length)
    throw new Error("상품권 모델이 없는 파일입니다.");
  const ruleSource =
    data.rules ??
    Object.fromEntries(
      Object.entries(data).filter(
        ([key]) => !["models", "products", "meta"].includes(key),
      ),
    );
  const rules = validateVoucherRules({
    ...current.rules,
    ...object(ruleSource),
  });
  const models = { ...current.models };
  for (const [key, value] of Object.entries(entries)) {
    const code = String(object(value).modelCode ?? key).trim();
    models[code] = normalizedVoucherModel(code, value);
  }
  return { rules, models };
}
