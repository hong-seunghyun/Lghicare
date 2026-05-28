/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";

type ActivityTypeCount = {
  name: string;
  count: number;
};

type ActivityManager = {
  id: string;
  managerId?: string;
  name: string;
  branch: string;
  estimateCount: number;
};

type ActivityBranch = {
  name: string;
  estimateCount: number;
};

type DailyTopStatRow = {
  date: string;
  estimateCount: number;
  shareCount: number;
  topBranchName: string;
  topBranchManagerId: string;
  topNationalManagerId: string;
  topCategoryName: string;
};

type DailyProductMixRow = {
  date: string;
  singleCount: number;
  multiCount: number;
};

type AffiliateCardStat = {
  cardName: string;
  count: number;
  ratio: number;
};

type EstimateCombinationProduct = {
  category: string;
  productName: string;
  modelName: string;
};

type MultiProductCombinationStat = {
  rank: number;
  productCount: number;
  combinationLabel: string;
  estimateCount: number;
  products: EstimateCombinationProduct[];
};

type ShareSummary = {
  today: number;
  range: number;
};

type VisitorSummary = {
  today: number;
  yesterday: number;
  last30Days: number;
};

type ActivitySummaryResponse = {
  totalEstimates: number;
  topManagers: ActivityManager[];
  topBranches: ActivityBranch[];
  typeCounts: ActivityTypeCount[];
  dailyCounts: Array<{ date: string; count: number }>;
  dailyShareCounts: Array<{ date: string; count: number }>;
  dailyTopRows: DailyTopStatRow[];
  rangeStart: string;
  rangeEnd: string;
  shareSummary: ShareSummary;
  todayEstimates: number;
  visitorSummary: VisitorSummary;
  affiliateCardStats: AffiliateCardStat[];
  dailyProductMixCounts: DailyProductMixRow[];
  topMultiProductCombinations: MultiProductCombinationStat[];
};

type ManagerProfile = {
  uid: string;
  managerId: string;
  name: string;
  office: string;
  branch: string;
  region: string;
};

const padDate = (value: number) => String(value).padStart(2, "0");

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(
    date.getDate(),
  )}`;

const parseDateInput = (value?: string, fallback?: Date) => {
  if (!value) return fallback ?? new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback ?? new Date();
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const isPlaceholderValue = (value: string) => {
  const normalized = value.toLowerCase();
  return (
    normalized === "undefined" ||
    normalized === "null" ||
    normalized === "-" ||
    normalized === "n/a"
  );
};

const pickMeaningfulText = (...candidates: unknown[]) => {
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (!normalized || isPlaceholderValue(normalized)) continue;
    return normalized;
  }
  return "";
};

const normalizeCount = (value: unknown, fallback = 1) => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^0-9]/g, ""))
        : NaN;
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
};

const extractEstimateProducts = (data: any): EstimateCombinationProduct[] => {
  const source = Array.isArray(data.estimateProducts)
    ? data.estimateProducts
    : Array.isArray(data.products)
      ? data.products
      : [];

  return source
    .map((product: any) => {
      const variant = product?.selectedVariant ?? {};
      const category =
        pickMeaningfulText(
          product?.category,
          product?.categoryName,
          product?.중분류,
          product?.type,
          variant?.category,
          variant?.categoryName,
          variant?.중분류,
          variant?.type,
        ) || "unknown";
      const productName =
        pickMeaningfulText(
          product?.productName,
          product?.상품명,
          product?.name,
          variant?.productName,
          variant?.상품명,
        ) || "상품명 미상";
      const modelName =
        pickMeaningfulText(
          product?.modelName,
          product?.modelCode,
          product?.모델명,
          product?.모델코드,
          variant?.modelName,
          variant?.modelCode,
          variant?.모델명,
          variant?.모델코드,
        ) || "모델명 미상";
      const quantity = normalizeCount(product?.quantity);

      return Array.from({ length: quantity }, () => ({
        category,
        productName,
        modelName,
      }));
    })
    .flat();
};

const extractAffiliateCardNames = (data: any) => {
  const names = new Set<string>();

  if (Array.isArray(data.selectedAffiliateCardNames)) {
    data.selectedAffiliateCardNames.forEach((name: unknown) => {
      const normalized = pickMeaningfulText(name);
      if (normalized) names.add(normalized);
    });
  }

  const directName = pickMeaningfulText(data.selectedAffiliateCardName);
  if (directName) names.add(directName);

  if (Array.isArray(data.products)) {
    data.products.forEach((product: any) => {
      const productName = pickMeaningfulText(product?.selectedCardName);
      if (productName) names.add(productName);
    });
  }

  return Array.from(names);
};

const buildCombinationKey = (products: EstimateCombinationProduct[]) =>
  products
    .map((product) => `${product.category}:${product.modelName}`)
    .sort((a, b) => a.localeCompare(b, "ko"))
    .join("|");

const normalizeCombinationProducts = (
  products: EstimateCombinationProduct[],
) =>
  [...products].sort((a, b) => {
    const keyA = `${a.category}:${a.modelName}`;
    const keyB = `${b.category}:${b.modelName}`;
    return keyA.localeCompare(keyB, "ko");
  });

const buildCombinationLabel = (products: EstimateCombinationProduct[]) =>
  products
    .map((product) => `${product.category} - ${product.modelName}`)
    .join(" / ");

const toSafeDate = (value: any): Date | null => {
  if (!value) return null;
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "number" || typeof value === "string") {
    const coerced = new Date(value);
    if (!Number.isNaN(coerced.getTime())) {
      return coerced;
    }
  }
  return null;
};

const isWithinRange = (date: Date, start: Date, endExclusive: Date) =>
  date >= start && date < endExclusive;

const buildDateSeries = (
  start: Date,
  endExclusive: Date,
  source: Map<string, number>,
) => {
  const rows: Array<{ date: string; count: number }> = [];
  const cursor = new Date(start);
  while (cursor < endExclusive) {
    const key = formatDateKey(cursor);
    rows.push({
      date: key,
      count: source.get(key) ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
};

const incrementDailyNameCount = (
  source: Map<string, Map<string, number>>,
  dateKey: string,
  name: string,
) => {
  if (!dateKey || !name) return;
  const dayMap = source.get(dateKey) ?? new Map<string, number>();
  dayMap.set(name, (dayMap.get(name) ?? 0) + 1);
  source.set(dateKey, dayMap);
};

const incrementDailyBranchManagerCount = (
  source: Map<string, Map<string, Map<string, number>>>,
  dateKey: string,
  branchName: string,
  managerId: string,
) => {
  if (!dateKey || !branchName || !managerId) return;
  const dayMap = source.get(dateKey) ?? new Map<string, Map<string, number>>();
  const branchMap = dayMap.get(branchName) ?? new Map<string, number>();
  branchMap.set(managerId, (branchMap.get(managerId) ?? 0) + 1);
  dayMap.set(branchName, branchMap);
  source.set(dateKey, dayMap);
};

const pickTopName = (source?: Map<string, number>) => {
  if (!source || source.size === 0) return "";
  return Array.from(source.entries()).sort(
    ([nameA, countA], [nameB, countB]) =>
      countB - countA || nameA.localeCompare(nameB, "ko"),
  )[0][0];
};

const extractEstimateManagerId = (docId: string, data: any) => {
  const managerUid = normalizeText(data.managerUid);
  if (managerUid) return managerUid;

  const managerId = normalizeText(data.managerId);
  if (managerId) return managerId;

  return docId;
};

const extractShareManagerId = (docId: string, data: any) => {
  const managerUid = normalizeText(data.managerUid);
  if (managerUid) return managerUid;

  const matched = /^manager_([^_]+)_/.exec(docId);
  if (matched?.[1]) {
    return matched[1];
  }

  return "";
};

const resolveBranchName = (data: any, profile?: ManagerProfile) => {
  const branch = pickMeaningfulText(
    data.managerBranch,
    data.branch,
    data.office,
    profile?.office,
    profile?.branch,
  );
  if (branch) return branch;

  const hadAnyRawValue = [
    data.managerBranch,
    data.branch,
    data.office,
    profile?.office,
    profile?.branch,
  ].some((value) => normalizeText(value).length > 0);

  if (hadAnyRawValue) {
    return "office-mapping-error";
  }

  if (profile?.region) {
    return `${profile.region} (office-unassigned)`;
  }

  return "office-missing-source";
};

const normalizeIncludeDetails = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return false;
  return raw === "1" || raw.toLowerCase() === "true";
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ActivitySummaryResponse | { message: string }>,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const includeDetails = normalizeIncludeDetails(req.query.includeDetails);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const todayStart = new Date(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 29);

  const defaultStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

  const startParam = Array.isArray(req.query.start)
    ? req.query.start[0]
    : req.query.start;
  const endParam = Array.isArray(req.query.end)
    ? req.query.end[0]
    : req.query.end;

  const startDate = parseDateInput(startParam, defaultStart);
  const endDate = parseDateInput(endParam, todayStart);
  const normalizedEnd = new Date(endDate);

  if (normalizedEnd < startDate) {
    normalizedEnd.setTime(startDate.getTime());
  }
  normalizedEnd.setDate(normalizedEnd.getDate() + 1);
  normalizedEnd.setHours(0, 0, 0, 0);

  const startTimestamp = Timestamp.fromDate(startDate);
  const endTimestamp = Timestamp.fromDate(normalizedEnd);

  try {
    const estimatesQuery = query(
      collection(db, "estimates"),
      where("createdAt", ">=", startTimestamp),
      where("createdAt", "<", endTimestamp),
      orderBy("createdAt", "asc"),
    );

    const shareRangeQuery = query(
      collection(db, "shareCount"),
      where("updatedAt", ">=", startTimestamp),
      where("updatedAt", "<", endTimestamp),
    );

    const visitorEstimateQuery = query(
      collection(db, "estimates"),
      where("createdAt", ">=", Timestamp.fromDate(monthStart)),
      where("createdAt", "<", Timestamp.fromDate(tomorrowStart)),
    );

    const visitorShareQuery = query(
      collection(db, "shareCount"),
      where("updatedAt", ">=", Timestamp.fromDate(monthStart)),
      where("updatedAt", "<", Timestamp.fromDate(tomorrowStart)),
    );

    const [estimatesSnap, shareRangeSnap, visitorEstimateSnap, visitorShareSnap] =
      await Promise.all([
        getDocs(estimatesQuery),
        getDocs(shareRangeQuery),
        getDocs(visitorEstimateQuery),
        getDocs(visitorShareQuery),
      ]);

    const managerProfilesByUid = new Map<string, ManagerProfile>();
    const managerProfilesByManagerId = new Map<string, ManagerProfile>();

    if (includeDetails) {
      const managerSnap = await getDocs(
        query(collection(db, "users"), where("role", "==", "manager")),
      );
      managerSnap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const profile: ManagerProfile = {
          uid: docSnap.id,
          managerId: normalizeText(data.managerId),
          name: normalizeText(data.name),
          office: normalizeText(data.office),
          branch: normalizeText(data.branch),
          region: normalizeText(data.region),
        };
        managerProfilesByUid.set(profile.uid, profile);
        if (profile.managerId) {
          managerProfilesByManagerId.set(profile.managerId, profile);
        }
      });
    }

    const managerMap = new Map<string, ActivityManager>();
    const branchMap = new Map<string, number>();
    const typeMap = new Map<string, number>();
    const affiliateCardMap = new Map<string, number>();
    const dailySingleCounts = new Map<string, number>();
    const dailyMultiCounts = new Map<string, number>();
    const combinationMap = new Map<
      string,
      { estimateCount: number; products: EstimateCombinationProduct[] }
    >();

    const dailyEstimateCounts = new Map<string, number>();
    const dailyShareUniqueMap = new Map<string, Set<string>>();
    const dailyBranchCounts = new Map<string, Map<string, number>>();
    const dailyNationalManagerCounts = new Map<string, Map<string, number>>();
    const dailyBranchManagerCounts = new Map<
      string,
      Map<string, Map<string, number>>
    >();
    const dailyTypeCounts = new Map<string, Map<string, number>>();
    const shareRangeUnique = new Set<string>();
    const shareTodayUnique = new Set<string>();

    const visitorsToday = new Set<string>();
    const visitorsYesterday = new Set<string>();
    const visitorsLast30Days = new Set<string>();

    let totalEstimates = 0;
    let todayEstimateCount = 0;

    estimatesSnap.forEach((docSnap) => {
      totalEstimates += 1;
      const data = docSnap.data() as any;

      const createdAt = toSafeDate(data.createdAt);
      let dayKey = "";
      if (createdAt) {
        dayKey = formatDateKey(createdAt);
        dailyEstimateCounts.set(dayKey, (dailyEstimateCounts.get(dayKey) ?? 0) + 1);
      }

      const estimateProducts = extractEstimateProducts(data);
      const selectedProductCount =
        normalizeCount(data.selectedProductCount, estimateProducts.length) ||
        estimateProducts.length;
      const isMultiProduct =
        data.productSelectionType === "multi" ||
        data.isMultiProductEstimate === true ||
        selectedProductCount >= 2;

      if (dayKey) {
        if (isMultiProduct) {
          dailyMultiCounts.set(dayKey, (dailyMultiCounts.get(dayKey) ?? 0) + 1);
        } else {
          dailySingleCounts.set(dayKey, (dailySingleCounts.get(dayKey) ?? 0) + 1);
        }
      }

      const cardNames = extractAffiliateCardNames(data);
      if (cardNames.length === 0) {
        affiliateCardMap.set("제휴카드 미사용", (affiliateCardMap.get("제휴카드 미사용") ?? 0) + 1);
      } else {
        cardNames.forEach((cardName) => {
          affiliateCardMap.set(cardName, (affiliateCardMap.get(cardName) ?? 0) + 1);
        });
      }

      if (
        isMultiProduct &&
        estimateProducts.length >= 2 &&
        estimateProducts.length <= 5
      ) {
        const normalizedProducts = normalizeCombinationProducts(estimateProducts);
        const combinationKey = buildCombinationKey(normalizedProducts);
        const prev = combinationMap.get(combinationKey);
        if (prev) {
          prev.estimateCount += 1;
        } else {
          combinationMap.set(combinationKey, {
            estimateCount: 1,
            products: normalizedProducts,
          });
        }
      }

      if (!includeDetails) return;

      const rawManagerUid = normalizeText(data.managerUid);
      const rawManagerId = normalizeText(data.managerId);
      const resolvedProfile =
        managerProfilesByUid.get(rawManagerUid) ||
        managerProfilesByManagerId.get(rawManagerId) ||
        managerProfilesByManagerId.get(docSnap.id);

      const managerKey =
        resolvedProfile?.uid || rawManagerUid || rawManagerId || docSnap.id;
      const managerId = resolvedProfile?.managerId || rawManagerId;
      const managerName =
        pickMeaningfulText(
          data.managerName,
          resolvedProfile?.name,
          managerId,
          managerKey,
        ) || "unknown-manager";
      const managerExportId =
        pickMeaningfulText(managerId, rawManagerUid, managerKey) || "unknown-manager";
      const branch = resolveBranchName(data, resolvedProfile);

      const prevManager = managerMap.get(managerKey);
      if (prevManager) {
        prevManager.estimateCount += 1;
      } else {
        managerMap.set(managerKey, {
          id: managerKey,
          managerId,
          name: managerName,
          branch,
          estimateCount: 1,
        });
      }

      branchMap.set(branch, (branchMap.get(branch) ?? 0) + 1);
      incrementDailyNameCount(dailyBranchCounts, dayKey, branch);
      incrementDailyNameCount(dailyNationalManagerCounts, dayKey, managerExportId);
      incrementDailyBranchManagerCount(
        dailyBranchManagerCounts,
        dayKey,
        branch,
        managerExportId,
      );

      const estimateTypes = Array.isArray(data.estimateTypes) ? data.estimateTypes : [];
      estimateTypes.forEach((type: unknown) => {
        const normalized = String(type ?? "unknown") || "unknown";
        typeMap.set(normalized, (typeMap.get(normalized) ?? 0) + 1);
        incrementDailyNameCount(dailyTypeCounts, dayKey, normalized);
      });
    });

    shareRangeSnap.forEach((docSnap) => {
      const data = docSnap.data() as any;
      const updatedAt = toSafeDate(data.updatedAt);
      if (!updatedAt) return;

      const pathKey = String(data.path ?? docSnap.id ?? "");
      const timeKey = Math.floor(updatedAt.getTime() / 1000);
      const uniqueEventKey = `${pathKey}:${timeKey}`;

      shareRangeUnique.add(uniqueEventKey);

      const dayKey = formatDateKey(updatedAt);
      const daySet = dailyShareUniqueMap.get(dayKey) ?? new Set<string>();
      daySet.add(uniqueEventKey);
      dailyShareUniqueMap.set(dayKey, daySet);
    });

    visitorEstimateSnap.forEach((docSnap) => {
      const data = docSnap.data() as any;
      const createdAt = toSafeDate(data.createdAt);
      if (!createdAt) return;

      if (isWithinRange(createdAt, todayStart, tomorrowStart)) {
        todayEstimateCount += 1;
      }

      const managerId = extractEstimateManagerId(docSnap.id, data);
      if (!managerId) return;

      if (isWithinRange(createdAt, monthStart, tomorrowStart)) {
        visitorsLast30Days.add(managerId);
      }
      if (isWithinRange(createdAt, todayStart, tomorrowStart)) {
        visitorsToday.add(managerId);
      }
      if (isWithinRange(createdAt, yesterdayStart, todayStart)) {
        visitorsYesterday.add(managerId);
      }
    });

    visitorShareSnap.forEach((docSnap) => {
      const data = docSnap.data() as any;
      const updatedAt = toSafeDate(data.updatedAt);
      if (!updatedAt) return;

      const pathKey = String(data.path ?? docSnap.id ?? "");
      const timeKey = Math.floor(updatedAt.getTime() / 1000);
      const uniqueEventKey = `${pathKey}:${timeKey}`;
      if (isWithinRange(updatedAt, todayStart, tomorrowStart)) {
        shareTodayUnique.add(uniqueEventKey);
      }

      const managerId = extractShareManagerId(docSnap.id, data);
      if (!managerId) return;

      if (isWithinRange(updatedAt, monthStart, tomorrowStart)) {
        visitorsLast30Days.add(managerId);
      }
      if (isWithinRange(updatedAt, todayStart, tomorrowStart)) {
        visitorsToday.add(managerId);
      }
      if (isWithinRange(updatedAt, yesterdayStart, todayStart)) {
        visitorsYesterday.add(managerId);
      }
    });

    const dailyShareCounts = new Map<string, number>();
    dailyShareUniqueMap.forEach((set, dayKey) => {
      dailyShareCounts.set(dayKey, set.size);
    });

    const topManagers = includeDetails
      ? Array.from(managerMap.values())
          .sort((a, b) => b.estimateCount - a.estimateCount)
          .slice(0, 30)
      : [];

    const topBranches = includeDetails
      ? Array.from(branchMap.entries())
          .map(([name, estimateCount]) => ({ name, estimateCount }))
          .sort((a, b) => b.estimateCount - a.estimateCount)
          .slice(0, 20)
      : [];

    const typeCounts = includeDetails
      ? Array.from(typeMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 12)
      : [];

    const dailyCounts = buildDateSeries(startDate, normalizedEnd, dailyEstimateCounts);
    const dailyShareCountRows = buildDateSeries(
      startDate,
      normalizedEnd,
      dailyShareCounts,
    );
    const dailySingleRows = buildDateSeries(
      startDate,
      normalizedEnd,
      dailySingleCounts,
    );
    const dailyMultiRows = buildDateSeries(
      startDate,
      normalizedEnd,
      dailyMultiCounts,
    );
    const dailyProductMixCounts = dailySingleRows.map((row, index) => ({
      date: row.date,
      singleCount: row.count,
      multiCount: dailyMultiRows[index]?.count ?? 0,
    }));
    const affiliateCardStats = Array.from(affiliateCardMap.entries())
      .map(([cardName, count]) => ({
        cardName,
        count,
        ratio: totalEstimates > 0 ? Math.round((count / totalEstimates) * 1000) / 10 : 0,
      }))
      .sort(
        (a, b) =>
          b.count - a.count || a.cardName.localeCompare(b.cardName, "ko"),
      );
    const topMultiProductCombinations = Array.from(combinationMap.values())
      .map((item) => ({
        productCount: item.products.length,
        combinationLabel: buildCombinationLabel(item.products),
        estimateCount: item.estimateCount,
        products: item.products,
      }))
      .sort(
        (a, b) =>
          b.estimateCount - a.estimateCount ||
          a.combinationLabel.localeCompare(b.combinationLabel, "ko"),
      )
      .slice(0, 10)
      .map((item, index) => ({
        rank: index + 1,
        ...item,
      }));
    const dailyTopRows = includeDetails
      ? dailyCounts.map((row) => {
          const topBranchName = pickTopName(dailyBranchCounts.get(row.date));
          const topBranchManagerId = pickTopName(
            dailyBranchManagerCounts.get(row.date)?.get(topBranchName),
          );

          return {
            date: row.date,
            estimateCount: row.count,
            shareCount: dailyShareCounts.get(row.date) ?? 0,
            topBranchName,
            topBranchManagerId,
            topNationalManagerId: pickTopName(dailyNationalManagerCounts.get(row.date)),
            topCategoryName: pickTopName(dailyTypeCounts.get(row.date)),
          };
        })
      : [];

    const response: ActivitySummaryResponse = {
      totalEstimates,
      topManagers,
      topBranches,
      typeCounts,
      dailyCounts,
      dailyShareCounts: dailyShareCountRows,
      dailyTopRows,
      rangeStart: formatDateKey(startDate),
      rangeEnd: formatDateKey(new Date(normalizedEnd.getTime() - 1)),
      shareSummary: {
        today: shareTodayUnique.size,
        range: shareRangeUnique.size,
      },
      todayEstimates: todayEstimateCount,
      visitorSummary: {
        today: visitorsToday.size,
        yesterday: visitorsYesterday.size,
        last30Days: visitorsLast30Days.size,
      },
      affiliateCardStats,
      dailyProductMixCounts,
      topMultiProductCombinations,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("activity summary error:", error);
    return res.status(500).json({ message: "Unable to load activity summary" });
  }
}
