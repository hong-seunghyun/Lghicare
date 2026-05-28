"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styled, { css } from "styled-components";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getDashboardDailyExportData,
  getDashboardSummaryData,
  getOverviewData,
  type ActivitySummaryResponse,
  type DailyTopStatRow,
  type MultiProductCombinationStat,
} from "@/lib/admin/adminDataService";
import type { AdminDataMode } from "@/lib/admin/adminDataMode";
import PopupDisplay from "@/components/Popups/PopupDisplay";

type QuickRangeKey = "today" | "week" | "month" | "quarter" | "custom";
type TrendMode = "daily" | "weekly";

type TrendRow = {
  bucket: string;
  label: string;
  estimate: number;
  share: number;
};

type ProductMixTrendRow = {
  bucket: string;
  label: string;
  single: number;
  multi: number;
};

const padDate = (value: number) => String(value).padStart(2, "0");

const toIsoDateInput = (date: Date) =>
  `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(
    date.getDate(),
  )}`;

const formatRangeLabel = (start: string, end: string) => {
  if (!start && !end) return "조회 기간 미지정";
  if (start === end) return start;
  return `${start} ~ ${end}`;
};

const getQuickRange = (key: Exclude<QuickRangeKey, "custom">, baseDate: Date) => {
  const end = new Date(baseDate);
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  if (key === "today") {
    // no-op
  } else if (key === "week") {
    start.setDate(start.getDate() - 6);
  } else if (key === "month") {
    start.setMonth(start.getMonth() - 1);
  } else {
    start.setMonth(start.getMonth() - 3);
  }

  return {
    start: toIsoDateInput(start),
    end: toIsoDateInput(end),
  };
};

const getWeekStartKey = (isoDate: string) => {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return toIsoDateInput(date);
};

type AdminDashboardPageProps = {
  dataMode?: AdminDataMode;
};

const escapeExcelCell = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const buildDailyExportHtml = (rows: DailyTopStatRow[]) => {
  const headers = [
    "날짜",
    "오늘 견적 수",
    "오늘 공유",
    "상위 지점명",
    "상위 지점 내 최상위 매니저(ID)",
    "전국 최상위 매니저(ID)",
    "상위 카테고리 1개명",
  ];

  const headerHtml = headers
    .map((header) => `<th>${escapeExcelCell(header)}</th>`)
    .join("");
  const bodyHtml = rows
    .map(
      (row) => `<tr>
        <td>${escapeExcelCell(row.date)}</td>
        <td>${escapeExcelCell(row.estimateCount)}</td>
        <td>${escapeExcelCell(row.shareCount)}</td>
        <td>${escapeExcelCell(row.topBranchName || "-")}</td>
        <td>${escapeExcelCell(row.topBranchManagerId || "-")}</td>
        <td>${escapeExcelCell(row.topNationalManagerId || "-")}</td>
        <td>${escapeExcelCell(row.topCategoryName || "-")}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; }
    th, td { border: 1px solid #999; padding: 6px 10px; }
    th { background: #eef2f7; font-weight: 700; }
  </style>
</head>
<body>
  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>
</body>
</html>`;
};

const downloadDailyExport = (
  rows: DailyTopStatRow[],
  rangeStart: string,
  rangeEnd: string,
) => {
  const html = buildDailyExportHtml(rows);
  const blob = new Blob(["\ufeff", html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `admin_dashboard_daily_${rangeStart}_${rangeEnd}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export function AdminDashboardPage({ dataMode = "demo" }: AdminDashboardPageProps) {
  const today = useMemo(() => {
    const next = new Date();
    next.setHours(0, 0, 0, 0);
    return next;
  }, []);

  const initialRange = useMemo(() => getQuickRange("month", today), [today]);

  const [topStats, setTopStats] = useState({
    totalProducts: 0,
    managers: 0,
  });
  const [rangeStart, setRangeStart] = useState(initialRange.start);
  const [rangeEnd, setRangeEnd] = useState(initialRange.end);
  const [quickRange, setQuickRange] = useState<QuickRangeKey>("month");
  const [trendMode, setTrendMode] = useState<TrendMode>("daily");

  const [summary, setSummary] = useState<ActivitySummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [selectedCombination, setSelectedCombination] =
    useState<MultiProductCombinationStat | null>(null);
  const [exportStart, setExportStart] = useState(initialRange.start);
  const [exportEnd, setExportEnd] = useState(initialRange.end);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchOverview = async () => {
      try {
        const data = await getOverviewData(dataMode);
        if (cancelled) return;
        setTopStats({
          totalProducts: Number(data.topStats?.totalProducts ?? 0),
          managers: Number(data.topStats?.managers ?? 0),
        });
      } catch (error) {
        console.error("overview load error:", error);
      }
    };

    fetchOverview();
    return () => {
      cancelled = true;
    };
  }, [dataMode]);

  useEffect(() => {
    let cancelled = false;

    const fetchSummary = async () => {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const data = await getDashboardSummaryData(
          { rangeStart, rangeEnd },
          dataMode,
        );
        if (cancelled) return;
        setSummary(data);
      } catch (error) {
        console.error("activity summary load error:", error);
        if (!cancelled) {
          setSummaryError("핵심 지표를 불러오는 중 오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) {
          setSummaryLoading(false);
        }
      }
    };

    fetchSummary();
    return () => {
      cancelled = true;
    };
  }, [dataMode, rangeEnd, rangeStart]);

  const summaryRangeLabel = useMemo(() => {
    const start = summary?.rangeStart ?? rangeStart;
    const end = summary?.rangeEnd ?? rangeEnd;
    return formatRangeLabel(start, end);
  }, [rangeEnd, rangeStart, summary?.rangeEnd, summary?.rangeStart]);

  const trendDailyData = useMemo<TrendRow[]>(() => {
    if (!summary) return [];

    const estimateMap = new Map<string, number>(
      summary.dailyCounts.map((row) => [row.date, Number(row.count ?? 0)]),
    );
    const shareMap = new Map<string, number>(
      summary.dailyShareCounts.map((row) => [row.date, Number(row.count ?? 0)]),
    );

    const allDates = Array.from(
      new Set<string>([...estimateMap.keys(), ...shareMap.keys()]),
    ).sort((a, b) => a.localeCompare(b));

    return allDates.map((dateKey) => ({
      bucket: dateKey,
      label: dateKey.slice(5),
      estimate: estimateMap.get(dateKey) ?? 0,
      share: shareMap.get(dateKey) ?? 0,
    }));
  }, [summary]);

  const trendWeeklyData = useMemo<TrendRow[]>(() => {
    if (trendDailyData.length === 0) return [];

    const weekMap = new Map<string, { estimate: number; share: number }>();

    trendDailyData.forEach((row) => {
      const weekStartKey = getWeekStartKey(row.bucket);
      const prev = weekMap.get(weekStartKey) ?? { estimate: 0, share: 0 };
      weekMap.set(weekStartKey, {
        estimate: prev.estimate + row.estimate,
        share: prev.share + row.share,
      });
    });

    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, counts]) => ({
        bucket: weekStart,
        label: `${weekStart.slice(5)} 주`,
        estimate: counts.estimate,
        share: counts.share,
      }));
  }, [trendDailyData]);

  const trendData = trendMode === "daily" ? trendDailyData : trendWeeklyData;
  const productMixTrendData = useMemo<ProductMixTrendRow[]>(() => {
    if (!summary) return [];

    return (summary.dailyProductMixCounts ?? []).map((row) => ({
      bucket: row.date,
      label: row.date.slice(5),
      single: Number(row.singleCount ?? 0),
      multi: Number(row.multiCount ?? 0),
    }));
  }, [summary]);

  const affiliateCardStats = summary?.affiliateCardStats ?? [];
  const topMultiProductCombinations =
    summary?.topMultiProductCombinations ?? [];
  const analyticsHref =
    dataMode === "real" ? "/admin/analytics-real" : "/admin/analytics";

  const handleQuickRange = (key: Exclude<QuickRangeKey, "custom">) => {
    const nextRange = getQuickRange(key, today);
    setQuickRange(key);
    setRangeStart(nextRange.start);
    setRangeEnd(nextRange.end);
  };

  const handleRangeStartChange = (value: string) => {
    if (!value) return;
    setQuickRange("custom");
    if (rangeEnd && value > rangeEnd) {
      setRangeEnd(value);
    }
    setRangeStart(value);
  };

  const handleRangeEndChange = (value: string) => {
    if (!value) return;
    setQuickRange("custom");
    if (rangeStart && value < rangeStart) {
      setRangeStart(value);
    }
    setRangeEnd(value);
  };

  const handleExportStartChange = (value: string) => {
    if (!value) return;
    if (exportEnd && value > exportEnd) {
      setExportEnd(value);
    }
    setExportStart(value);
  };

  const handleExportEndChange = (value: string) => {
    if (!value) return;
    if (exportStart && value < exportStart) {
      setExportStart(value);
    }
    setExportEnd(value);
  };

  const handleDailyExport = async () => {
    if (!exportStart || !exportEnd) {
      setExportError("출력 기간을 선택해 주세요.");
      return;
    }

    setExportLoading(true);
    setExportError(null);
    try {
      const data = await getDashboardDailyExportData(
        { rangeStart: exportStart, rangeEnd: exportEnd },
        dataMode,
      );
      downloadDailyExport(
        data.dailyTopRows ?? [],
        data.rangeStart ?? exportStart,
        data.rangeEnd ?? exportEnd,
      );
    } catch (error) {
      console.error("dashboard daily export error:", error);
      setExportError("엑셀 파일을 만드는 중 오류가 발생했습니다.");
    } finally {
      setExportLoading(false);
    }
  };

  const visitorSummary = summary?.visitorSummary;

  return (
    <Page>
      <PopupDisplay location="admin_dashboard" />
      <PageHeader>
        <TitleBlock>
          <PageTitle>대시보드</PageTitle>
          <PageSubTitle>
            핵심 지표를 빠르게 확인하고, 상세 분석은 별도 페이지에서 조회할 수 있도록
            구성했습니다.
          </PageSubTitle>
        </TitleBlock>
        <HeaderActions>
          <ShortcutLink href={analyticsHref}>상세 분석 페이지 이동</ShortcutLink>
          <ExportPanel>
            <ExportTitle>비공식 엑셀 출력</ExportTitle>
            <ExportControls>
              <ExportDateInput
                type="date"
                value={exportStart}
                onChange={(event) => handleExportStartChange(event.target.value)}
              />
              <RangeSeparator>~</RangeSeparator>
              <ExportDateInput
                type="date"
                value={exportEnd}
                onChange={(event) => handleExportEndChange(event.target.value)}
              />
              <ExportButton
                type="button"
                onClick={handleDailyExport}
                disabled={exportLoading}
              >
                {exportLoading ? "출력 중..." : "엑셀 출력"}
              </ExportButton>
            </ExportControls>
            {exportError && <ExportError>{exportError}</ExportError>}
          </ExportPanel>
        </HeaderActions>
      </PageHeader>

      <KpiGrid>
        <KpiCard>
          <KpiIcon>PRD</KpiIcon>
          <KpiLabel>총 제품 수</KpiLabel>
          <KpiValueWrap>
            <KpiValue>{formatNumber(topStats.totalProducts)}</KpiValue>
            <KpiUnit>개</KpiUnit>
          </KpiValueWrap>
        </KpiCard>

        <KpiCard>
          <KpiIcon>MGR</KpiIcon>
          <KpiLabel>총 매니저 수</KpiLabel>
          <KpiValueWrap>
            <KpiValue>{formatNumber(topStats.managers)}</KpiValue>
            <KpiUnit>명</KpiUnit>
          </KpiValueWrap>
        </KpiCard>

        <KpiCard>
          <KpiIcon>TOD</KpiIcon>
          <KpiLabel>오늘 접속자 수</KpiLabel>
          <KpiValueWrap>
            <KpiValue>{formatNumber(visitorSummary?.today ?? 0)}</KpiValue>
            <KpiUnit>명</KpiUnit>
          </KpiValueWrap>
        </KpiCard>

        <KpiCard>
          <KpiIcon>YTD</KpiIcon>
          <KpiLabel>어제 접속자 수</KpiLabel>
          <KpiValueWrap>
            <KpiValue>{formatNumber(visitorSummary?.yesterday ?? 0)}</KpiValue>
            <KpiUnit>명</KpiUnit>
          </KpiValueWrap>
        </KpiCard>

        <KpiCard>
          <KpiIcon>30D</KpiIcon>
          <KpiLabel>최근 1개월 접속자 수</KpiLabel>
          <KpiValueWrap>
            <KpiValue>{formatNumber(visitorSummary?.last30Days ?? 0)}</KpiValue>
            <KpiUnit>명</KpiUnit>
          </KpiValueWrap>
        </KpiCard>
      </KpiGrid>

      <FilterCard>
        <FilterHeader>
          <FilterTitle>조회 기간</FilterTitle>
          <FilterHint>
            {summaryLoading
              ? "조회 범위 데이터를 불러오는 중입니다..."
              : `현재 조회 기준: ${summaryRangeLabel}`}
          </FilterHint>
        </FilterHeader>

        <FilterRow>
          <DateInputs>
            <DateInput
              type="date"
              value={rangeStart}
              onChange={(event) => handleRangeStartChange(event.target.value)}
            />
            <RangeSeparator>~</RangeSeparator>
            <DateInput
              type="date"
              value={rangeEnd}
              onChange={(event) => handleRangeEndChange(event.target.value)}
            />
          </DateInputs>

          <QuickButtonGroup>
            <QuickButton
              type="button"
              $active={quickRange === "today"}
              onClick={() => handleQuickRange("today")}
            >
              오늘
            </QuickButton>
            <QuickButton
              type="button"
              $active={quickRange === "week"}
              onClick={() => handleQuickRange("week")}
            >
              1주일
            </QuickButton>
            <QuickButton
              type="button"
              $active={quickRange === "month"}
              onClick={() => handleQuickRange("month")}
            >
              1개월
            </QuickButton>
            <QuickButton
              type="button"
              $active={quickRange === "quarter"}
              onClick={() => handleQuickRange("quarter")}
            >
              3개월
            </QuickButton>
          </QuickButtonGroup>
        </FilterRow>

        {summaryError && <ErrorText>{summaryError}</ErrorText>}
      </FilterCard>

      <ChartCard>
        <CardHeader>
          <CardTitle>견적내기 / 공유하기 추이</CardTitle>
          <CardActions>
            <ModeButton
              type="button"
              $active={trendMode === "daily"}
              onClick={() => setTrendMode("daily")}
            >
              일별
            </ModeButton>
            <ModeButton
              type="button"
              $active={trendMode === "weekly"}
              onClick={() => setTrendMode("weekly")}
            >
              주별
            </ModeButton>
          </CardActions>
        </CardHeader>

        <ChartContainer>
          {summaryLoading ? (
            <InfoText>추이 데이터를 불러오는 중입니다...</InfoText>
          ) : trendData.length === 0 ? (
            <InfoText>선택한 기간에 표시할 데이터가 없습니다.</InfoText>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8edf4" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${formatNumber(Number(value ?? 0))}건`,
                    name,
                  ]}
                  labelFormatter={(label) => `${label}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="estimate"
                  name="견적내기"
                  stroke="#3157d5"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="share"
                  name="공유하기"
                  stroke="#14b8a6"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>
      </ChartCard>

      <EstimateStatsGrid>
        <ChartCard>
          <CardHeader>
            <CardTitle>단품 / 다품목 견적 추이</CardTitle>
          </CardHeader>

          <ChartContainer>
            {summaryLoading ? (
              <InfoText>견적 구성 데이터를 불러오는 중입니다...</InfoText>
            ) : productMixTrendData.length === 0 ? (
              <InfoText>선택한 기간에 표시할 견적 구성 데이터가 없습니다.</InfoText>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={productMixTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8edf4" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${formatNumber(Number(value ?? 0))}건`,
                      name,
                    ]}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="single"
                    name="단품 견적"
                    stroke="#ea1917"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="multi"
                    name="다품목 견적"
                    stroke="#3157d5"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartContainer>
        </ChartCard>

        <StatsCard>
          <CardHeader>
            <CardTitle>제휴카드 사용 통계</CardTitle>
          </CardHeader>
          {summaryLoading ? (
            <CompactInfoText>제휴카드 통계를 불러오는 중입니다...</CompactInfoText>
          ) : affiliateCardStats.length === 0 ? (
            <CompactInfoText>선택한 기간에 제휴카드 데이터가 없습니다.</CompactInfoText>
          ) : (
            <AffiliateList>
              {affiliateCardStats.map((row) => (
                <AffiliateRow key={row.cardName}>
                  <AffiliateName>{row.cardName}</AffiliateName>
                  <AffiliateCount>{formatNumber(row.count)}건</AffiliateCount>
                  <AffiliateRatio>{row.ratio.toFixed(1)}%</AffiliateRatio>
                </AffiliateRow>
              ))}
            </AffiliateList>
          )}
        </StatsCard>
      </EstimateStatsGrid>

      <StatsCard>
        <CardHeader>
          <CardTitle>다품목 베스트 조합 TOP 10</CardTitle>
        </CardHeader>

        {summaryLoading ? (
          <CompactInfoText>다품목 조합 데이터를 불러오는 중입니다...</CompactInfoText>
        ) : topMultiProductCombinations.length === 0 ? (
          <CompactInfoText>선택한 기간에 다품목 조합 데이터가 없습니다.</CompactInfoText>
        ) : (
          <CombinationTableWrap>
            <CombinationTable>
              <thead>
                <tr>
                  <th>순위</th>
                  <th>종수</th>
                  <th>제품 조합</th>
                  <th>견적 수</th>
                  <th>상세보기</th>
                </tr>
              </thead>
              <tbody>
                {topMultiProductCombinations.map((row) => (
                  <tr key={`${row.rank}-${row.combinationLabel}`}>
                    <td>{row.rank}</td>
                    <td>{row.productCount}종</td>
                    <CombinationCell title={row.combinationLabel}>
                      {row.combinationLabel}
                    </CombinationCell>
                    <td>{formatNumber(row.estimateCount)}건</td>
                    <td>
                      <DetailSmallButton
                        type="button"
                        onClick={() => setSelectedCombination(row)}
                      >
                        상세보기
                      </DetailSmallButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </CombinationTable>
          </CombinationTableWrap>
        )}
      </StatsCard>

      <SummaryGrid>
        <SummaryCard>
          <SummaryLabel>오늘 견적 수</SummaryLabel>
          <SummaryValue>
            {summaryLoading ? "..." : formatNumber(summary?.todayEstimates ?? 0)}
            <SummaryUnit>건</SummaryUnit>
          </SummaryValue>
        </SummaryCard>

        <SummaryCard>
          <SummaryLabel>기간 내 견적 수</SummaryLabel>
          <SummaryValue>
            {summaryLoading ? "..." : formatNumber(summary?.totalEstimates ?? 0)}
            <SummaryUnit>건</SummaryUnit>
          </SummaryValue>
        </SummaryCard>

        <SummaryCard>
          <SummaryLabel>오늘 공유 수</SummaryLabel>
          <SummaryValue>
            {summaryLoading ? "..." : formatNumber(summary?.shareSummary.today ?? 0)}
            <SummaryUnit>건</SummaryUnit>
          </SummaryValue>
        </SummaryCard>

        <SummaryCard>
          <SummaryLabel>기간 내 공유 수</SummaryLabel>
          <SummaryValue>
            {summaryLoading ? "..." : formatNumber(summary?.shareSummary.range ?? 0)}
            <SummaryUnit>건</SummaryUnit>
          </SummaryValue>
        </SummaryCard>
      </SummaryGrid>

      <DetailCard>
        <DetailTitle>분리된 상세 분석 영역</DetailTitle>
        <DetailDesc>
          인기카테고리, 지난달 상위 지점/매니저, 조직 조회는 별도 페이지로 이동해
          메인 로딩을 경량화했습니다.
        </DetailDesc>
        <DetailList>
          <li>인기카테고리 차트</li>
          <li>지난달 상위 지점 TOP 10</li>
          <li>지난달 상위 매니저 TOP 10</li>
          <li>조직 조회</li>
        </DetailList>
        <DetailButton href={analyticsHref}>상세 분석 열기</DetailButton>
      </DetailCard>

      {selectedCombination && (
        <ModalBackdrop onClick={() => setSelectedCombination(null)}>
          <CombinationModal onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>다품목 조합 상세보기</ModalTitle>
                <ModalSubTitle>
                  {selectedCombination.productCount}종 조합 ·{" "}
                  {formatNumber(selectedCombination.estimateCount)}건
                </ModalSubTitle>
              </div>
              <ModalCloseButton
                type="button"
                aria-label="상세보기 닫기"
                onClick={() => setSelectedCombination(null)}
              >
                ×
              </ModalCloseButton>
            </ModalHeader>

            <ModalProductList>
              {selectedCombination.products.map((product, index) => (
                <ModalProductItem
                  key={`${product.category}-${product.modelName}-${index}`}
                >
                  <ModalProductIndex>{index + 1}</ModalProductIndex>
                  <ModalProductInfo>
                    <strong>{product.category}</strong>
                    <span>{product.productName}</span>
                    <b>{product.modelName}</b>
                  </ModalProductInfo>
                </ModalProductItem>
              ))}
            </ModalProductList>
          </CombinationModal>
        </ModalBackdrop>
      )}
    </Page>
  );
}

export default function AdminDashboardDemoPage() {
  return <AdminDashboardPage dataMode="demo" />;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

const Page = styled.div`
  padding: 28px 32px 36px;
  background: #f6f8fb;
  min-height: calc(100vh - 93px);
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
`;

const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const PageTitle = styled.h1`
  font-size: 30px;
  font-weight: 700;
  color: #111827;
`;

const PageSubTitle = styled.p`
  font-size: 14px;
  color: #64748b;
`;

const ShortcutLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #1e293b;
  font-size: 13px;
  font-weight: 600;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
`;

const ExportPanel = styled.div`
  border: 1px dashed #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 7px;
`;

const ExportTitle = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
`;

const ExportControls = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const ExportDateInput = styled.input`
  width: 128px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  padding: 0 8px;
  font-size: 12px;
  color: #0f172a;
`;

const ExportButton = styled.button`
  height: 32px;
  border-radius: 8px;
  border: 1px solid #0f172a;
  background: #0f172a;
  color: #fff;
  padding: 0 11px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

const ExportError = styled.div`
  font-size: 11px;
  color: #dc2626;
`;

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
`;

const KpiCard = styled.section`
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const KpiIcon = styled.span`
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const KpiLabel = styled.span`
  font-size: 13px;
  color: #64748b;
`;

const KpiValueWrap = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 6px;
`;

const KpiValue = styled.strong`
  font-size: 34px;
  line-height: 1;
  color: #0f172a;
`;

const KpiUnit = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #475569;
`;

const FilterCard = styled.section`
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  padding: 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const FilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const FilterTitle = styled.h2`
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
`;

const FilterHint = styled.span`
  font-size: 12px;
  color: #64748b;
`;

const FilterRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const DateInputs = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const DateInput = styled.input`
  height: 38px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  padding: 0 10px;
  font-size: 13px;
  color: #0f172a;
`;

const RangeSeparator = styled.span`
  font-size: 13px;
  color: #64748b;
`;

const QuickButtonGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const QuickButton = styled.button<{ $active: boolean }>`
  height: 34px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #fff;
  padding: 0 14px;
  font-size: 12px;
  color: #334155;
  cursor: pointer;

  ${(props) =>
    props.$active &&
    css`
      border-color: #3157d5;
      background: #e9efff;
      color: #1e3a8a;
      font-weight: 700;
    `}
`;

const ChartCard = styled.section`
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  padding: 16px;
  margin-bottom: 16px;
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
`;

const CardTitle = styled.h2`
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
`;

const CardActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ModeButton = styled.button<{ $active: boolean }>`
  height: 32px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #fff;
  padding: 0 12px;
  font-size: 12px;
  color: #475569;
  cursor: pointer;

  ${(props) =>
    props.$active &&
    css`
      border-color: #0f172a;
      background: #0f172a;
      color: #fff;
      font-weight: 700;
    `}
`;

const ChartContainer = styled.div`
  width: 100%;
  height: 320px;
`;

const EstimateStatsGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
  gap: 16px;
  margin-bottom: 16px;

  ${ChartCard} {
    margin-bottom: 0;
  }

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;
  }
`;

const StatsCard = styled.section`
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  padding: 16px;
  margin-bottom: 16px;
`;

const CompactInfoText = styled.div`
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 14px;
`;

const AffiliateList = styled.div`
  max-height: 268px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  border-top: 1px solid #e2e8f0;
`;

const AffiliateRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 74px 62px;
  gap: 10px;
  align-items: center;
  min-height: 48px;
  border-bottom: 1px solid #eef2f7;
  font-size: 13px;
`;

const AffiliateName = styled.strong`
  min-width: 0;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const AffiliateCount = styled.span`
  color: #334155;
  text-align: right;
  font-weight: 700;
`;

const AffiliateRatio = styled.span`
  color: #ea1917;
  text-align: right;
  font-weight: 800;
`;

const CombinationTableWrap = styled.div`
  overflow-x: auto;
`;

const CombinationTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;

  th,
  td {
    border-bottom: 1px solid #e2e8f0;
    padding: 12px 10px;
    color: #334155;
    font-size: 13px;
    text-align: left;
    vertical-align: middle;
  }

  th {
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
    background: #f8fafc;
  }

  th:nth-child(1),
  td:nth-child(1) {
    width: 58px;
    text-align: center;
  }

  th:nth-child(2),
  td:nth-child(2) {
    width: 68px;
    text-align: center;
  }

  th:nth-child(4),
  td:nth-child(4) {
    width: 90px;
    text-align: right;
  }

  th:nth-child(5),
  td:nth-child(5) {
    width: 104px;
    text-align: center;
  }
`;

const CombinationCell = styled.td`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DetailSmallButton = styled.button`
  height: 30px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #0f172a;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    border-color: #ea1917;
    color: #ea1917;
  }
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;

  @media (max-width: 1240px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
`;

const SummaryCard = styled.section`
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SummaryLabel = styled.span`
  font-size: 13px;
  color: #64748b;
`;

const SummaryValue = styled.strong`
  font-size: 30px;
  color: #111827;
  line-height: 1;
  display: flex;
  align-items: flex-end;
  gap: 6px;
`;

const SummaryUnit = styled.span`
  font-size: 13px;
  color: #475569;
`;

const DetailCard = styled.section`
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const DetailTitle = styled.h3`
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
`;

const DetailDesc = styled.p`
  font-size: 13px;
  color: #64748b;
`;

const DetailList = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;

  li {
    border-radius: 10px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 10px 12px;
    font-size: 13px;
    color: #334155;
  }
`;

const DetailButton = styled(Link)`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  border-radius: 10px;
  background: #0f172a;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
`;

const InfoText = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #64748b;
`;

const ErrorText = styled.div`
  font-size: 13px;
  color: #dc2626;
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.42);
`;

const CombinationModal = styled.div`
  width: min(560px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  overflow-y: auto;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.2);
  padding: 22px;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
`;

const ModalTitle = styled.h3`
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
`;

const ModalSubTitle = styled.p`
  margin-top: 6px;
  font-size: 13px;
  color: #64748b;
`;

const ModalCloseButton = styled.button`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #f1f5f9;
  color: #0f172a;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: #fee2e2;
    color: #ea1917;
  }
`;

const ModalProductList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
`;

const ModalProductItem = styled.div`
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  background: #f8fafc;
`;

const ModalProductIndex = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
`;

const ModalProductInfo = styled.div`
  min-width: 0;

  strong {
    display: block;
    color: #ea1917;
    font-size: 12px;
    font-weight: 800;
  }

  span {
    display: block;
    margin-top: 5px;
    color: #0f172a;
    font-size: 14px;
    font-weight: 800;
  }

  b {
    display: block;
    margin-top: 4px;
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
  }
`;
