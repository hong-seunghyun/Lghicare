import {
  scaleCountByMode,
  scaleVisitorCountByMode,
  type AdminDataMode,
} from "@/lib/admin/adminDataMode";

export type OverviewResponse = {
  topStats?: {
    totalProducts?: number;
    managers?: number;
  };
};

export type DailyCountRow = {
  date: string;
  count: number;
};

export type DailyTopStatRow = {
  date: string;
  estimateCount: number;
  shareCount: number;
  topBranchName: string;
  topBranchManagerId: string;
  topNationalManagerId: string;
  topCategoryName: string;
};

export type DailyProductMixRow = {
  date: string;
  singleCount: number;
  multiCount: number;
};

export type AffiliateCardStat = {
  cardName: string;
  count: number;
  ratio: number;
};

export type EstimateCombinationProduct = {
  category: string;
  productName: string;
  modelName: string;
};

export type MultiProductCombinationStat = {
  rank: number;
  productCount: number;
  combinationLabel: string;
  estimateCount: number;
  products: EstimateCombinationProduct[];
};

export type PromotionSetEstimateStat = {
  rank: number;
  packageName: string;
  setName: string;
  productLabel: string;
  estimateCount: number;
  products: EstimateCombinationProduct[];
};

export type ActivitySummaryResponse = {
  totalEstimates: number;
  dailyCounts: DailyCountRow[];
  dailyShareCounts: DailyCountRow[];
  dailyTopRows?: DailyTopStatRow[];
  rangeStart: string;
  rangeEnd: string;
  shareSummary: {
    today: number;
    range: number;
  };
  todayEstimates: number;
  visitorSummary: {
    today: number;
    yesterday: number;
    range: number;
    last30Days: number;
  };
  affiliateCardStats: AffiliateCardStat[];
  dailyProductMixCounts: DailyProductMixRow[];
  topMultiProductCombinations: MultiProductCombinationStat[];
  topPromotionSetEstimates: PromotionSetEstimateStat[];
};

export type DashboardCategoryResponse = {
  estimateTypes?: Array<{
    type?: string;
    estimateCount?: number;
    shareCount?: number;
  }>;
};

export type TopManagerRow = {
  id: string;
  managerId?: string;
  name: string;
  branch: string;
  estimateCount: number;
};

export type TopBranchRow = {
  name: string;
  estimateCount: number;
};

export type ActivitySummaryDetail = {
  rangeStart: string;
  rangeEnd: string;
  topManagers: TopManagerRow[];
  topBranches: TopBranchRow[];
  typeCounts?: Array<{
    name: string;
    count: number;
  }>;
  dailyTopRows?: DailyTopStatRow[];
};

export type DashboardRange = {
  rangeStart: string;
  rangeEnd: string;
};

type DashboardBundle = {
  overview: OverviewResponse;
  summary: ActivitySummaryResponse;
};

type AnalyticsBundle = {
  category: DashboardCategoryResponse;
  summary: ActivitySummaryDetail;
};

const fetchJson = async <T>(url: string, label: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

const toDemoOverview = (real: OverviewResponse): OverviewResponse => ({
  ...real,
  topStats: {
    // Keep product/manager KPIs as real values even on demo pages.
    totalProducts: Number(real.topStats?.totalProducts ?? 0),
    managers: Number(real.topStats?.managers ?? 0),
  },
});

const toDemoDailyRows = (rows: DailyCountRow[] = []): DailyCountRow[] =>
  rows.map((row) => ({
    ...row,
    count: scaleCountByMode(row.count, "demo"),
  }));

const toDemoActivitySummary = (
  real: ActivitySummaryResponse,
): ActivitySummaryResponse => ({
  ...real,
  totalEstimates: scaleCountByMode(real.totalEstimates, "demo"),
  todayEstimates: scaleCountByMode(real.todayEstimates, "demo"),
  dailyCounts: toDemoDailyRows(real.dailyCounts),
  dailyShareCounts: toDemoDailyRows(real.dailyShareCounts),
  dailyTopRows: (real.dailyTopRows ?? []).map((row) => ({
    ...row,
    estimateCount: scaleCountByMode(row.estimateCount, "demo"),
    shareCount: scaleCountByMode(row.shareCount, "demo"),
  })),
  dailyProductMixCounts: (real.dailyProductMixCounts ?? []).map((row) => ({
    ...row,
    singleCount: scaleCountByMode(row.singleCount, "demo"),
    multiCount: scaleCountByMode(row.multiCount, "demo"),
  })),
  affiliateCardStats: (real.affiliateCardStats ?? []).map((row) => ({
    ...row,
    count: scaleCountByMode(row.count, "demo"),
  })),
  topMultiProductCombinations: (real.topMultiProductCombinations ?? []).map(
    (row) => ({
      ...row,
      estimateCount: scaleCountByMode(row.estimateCount, "demo"),
    }),
  ),
  topPromotionSetEstimates: (real.topPromotionSetEstimates ?? []).map((row) => ({
    ...row,
    estimateCount: scaleCountByMode(row.estimateCount, "demo"),
  })),
  shareSummary: {
    today: scaleCountByMode(real.shareSummary?.today ?? 0, "demo"),
    range: scaleCountByMode(real.shareSummary?.range ?? 0, "demo"),
  },
  visitorSummary: {
    today: scaleVisitorCountByMode(real.visitorSummary?.today ?? 0, "demo"),
    yesterday: scaleVisitorCountByMode(real.visitorSummary?.yesterday ?? 0, "demo"),
    range: scaleVisitorCountByMode(real.visitorSummary?.range ?? 0, "demo"),
    last30Days: scaleVisitorCountByMode(real.visitorSummary?.last30Days ?? 0, "demo"),
  },
});

const toDemoCategoryResponse = (
  real: DashboardCategoryResponse,
): DashboardCategoryResponse => ({
  ...real,
  estimateTypes: (real.estimateTypes ?? []).map((row) => ({
    ...row,
    estimateCount: scaleCountByMode(row.estimateCount ?? 0, "demo"),
    shareCount: scaleCountByMode(row.shareCount ?? 0, "demo"),
  })),
});

const toDemoActivitySummaryDetail = (
  real: ActivitySummaryDetail,
): ActivitySummaryDetail => ({
  ...real,
  topManagers: (real.topManagers ?? []).map((row) => ({
    ...row,
    estimateCount: scaleCountByMode(row.estimateCount, "demo"),
  })),
  topBranches: (real.topBranches ?? []).map((row) => ({
    ...row,
    estimateCount: scaleCountByMode(row.estimateCount, "demo"),
  })),
  typeCounts: (real.typeCounts ?? []).map((row) => ({
    ...row,
    count: scaleCountByMode(row.count, "demo"),
  })),
  dailyTopRows: (real.dailyTopRows ?? []).map((row) => ({
    ...row,
    estimateCount: scaleCountByMode(row.estimateCount, "demo"),
    shareCount: scaleCountByMode(row.shareCount, "demo"),
  })),
});

export const getOverviewRealData = () =>
  fetchJson<OverviewResponse>("/api/admin/overview", "overview");

export const getOverviewDemoData = async () => toDemoOverview(await getOverviewRealData());

export const getOverviewData = (mode: AdminDataMode) =>
  mode === "demo" ? getOverviewDemoData() : getOverviewRealData();

export const getDashboardSummaryRealData = (range: DashboardRange) =>
  fetchJson<ActivitySummaryResponse>(
    `/api/admin/activity-summary?start=${encodeURIComponent(
      range.rangeStart,
    )}&end=${encodeURIComponent(range.rangeEnd)}`,
    "activity summary",
  );

export const getDashboardSummaryDemoData = async (range: DashboardRange) =>
  toDemoActivitySummary(await getDashboardSummaryRealData(range));

export const getDashboardSummaryData = (
  range: DashboardRange,
  mode: AdminDataMode,
) =>
  mode === "demo"
    ? getDashboardSummaryDemoData(range)
    : getDashboardSummaryRealData(range);

export const getDashboardDailyExportRealData = (range: DashboardRange) =>
  fetchJson<ActivitySummaryResponse>(
    `/api/admin/activity-summary?start=${encodeURIComponent(
      range.rangeStart,
    )}&end=${encodeURIComponent(range.rangeEnd)}&includeDetails=1`,
    "daily dashboard export",
  );

export const getDashboardDailyExportDemoData = async (range: DashboardRange) =>
  toDemoActivitySummary(await getDashboardDailyExportRealData(range));

export const getDashboardDailyExportData = (
  range: DashboardRange,
  mode: AdminDataMode,
) =>
  mode === "demo"
    ? getDashboardDailyExportDemoData(range)
    : getDashboardDailyExportRealData(range);

export const getAnalyticsCategoryRealData = () =>
  fetchJson<DashboardCategoryResponse>("/api/admin/dashboard", "dashboard analytics");

export const getAnalyticsCategoryDemoData = async () =>
  toDemoCategoryResponse(await getAnalyticsCategoryRealData());

export const getAnalyticsCategoryData = (mode: AdminDataMode) =>
  mode === "demo" ? getAnalyticsCategoryDemoData() : getAnalyticsCategoryRealData();

export const getAnalyticsSummaryRealData = (range: DashboardRange) =>
  fetchJson<ActivitySummaryDetail>(
    `/api/admin/activity-summary?start=${encodeURIComponent(
      range.rangeStart,
    )}&end=${encodeURIComponent(range.rangeEnd)}&includeDetails=1`,
    "detailed summary",
  );

export const getAnalyticsSummaryDemoData = async (range: DashboardRange) =>
  toDemoActivitySummaryDetail(await getAnalyticsSummaryRealData(range));

export const getAnalyticsSummaryData = (
  range: DashboardRange,
  mode: AdminDataMode,
) =>
  mode === "demo"
    ? getAnalyticsSummaryDemoData(range)
    : getAnalyticsSummaryRealData(range);

// Optional aggregate loaders for pages that need a single call path.
export const getDashboardRealData = async (range: DashboardRange): Promise<DashboardBundle> => {
  const [overview, summary] = await Promise.all([
    getOverviewRealData(),
    getDashboardSummaryRealData(range),
  ]);
  return { overview, summary };
};

export const getDashboardDemoData = async (range: DashboardRange): Promise<DashboardBundle> => {
  const real = await getDashboardRealData(range);
  return {
    overview: toDemoOverview(real.overview),
    summary: toDemoActivitySummary(real.summary),
  };
};

export const getAnalyticsRealData = async (range: DashboardRange): Promise<AnalyticsBundle> => {
  const [category, summary] = await Promise.all([
    getAnalyticsCategoryRealData(),
    getAnalyticsSummaryRealData(range),
  ]);
  return { category, summary };
};

export const getAnalyticsDemoData = async (range: DashboardRange): Promise<AnalyticsBundle> => {
  const real = await getAnalyticsRealData(range);
  return {
    category: toDemoCategoryResponse(real.category),
    summary: toDemoActivitySummaryDetail(real.summary),
  };
};
