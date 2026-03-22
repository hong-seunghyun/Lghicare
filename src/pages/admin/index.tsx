/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import styled, { keyframes, css } from "styled-components";

type BarDatum = {
  label: string;
  estimate: number;
  share: number;
};

type DashboardResponse = {
  estimateTypes?: Array<{
    type?: string;
    estimateCount?: number;
    shareCount?: number;
  }>;
  topManagers?: Array<{
    id?: string;
    name?: string;
    branchName?: string;
    estimateCount?: number;
    shareCount?: number;
  }>;
  topBranches?: Array<{
    id?: string;
    name?: string;
    estimateCount?: number;
    shareCount?: number;
  }>;
};

export default function AdminDashboardPage() {
  // =========================
  // 1) 더미 데이터
  // =========================
  const [topStats, setTopStats] = useState({
    totalProducts: 0,
    managers: 0,
    todaySearch: 0,
    yesterdaySearch: 0,
    totalSearch: 0,
  });

  const [visitStats, setVisitStats] = useState({
    pc: 0,
    mobile: 0,
  });
  const [currentMonthRange, setCurrentMonthRange] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);
  const counts = useMemo(
    () => ({
      todayOrders: 27,
      totalOrders: 12543,
      todayInquiries: 125,
      totalInquiries: 255321,
    }),
    [],
  );

  const latestSearches = useMemo(
    () => [
      { keyword: "WD722WE", count: 1225 },
      { keyword: "WD520WC", count: 785 },
      { keyword: "J2850B8142", count: 429 },
    ],
    [],
  );

  const [bestOrders, setBestOrders] = useState<
    Array<{ name: string; count: number }>
  >([]);

  const [bestInquiries, setBestInquiries] = useState<
    Array<{ name: string; count: number }>
  >([]);

  const [topBranches, setTopBranches] = useState<
    Array<{ region: string; name: string; count: number }>
  >([]);
  const [topManagers, setTopManagers] = useState<
    Array<{ branch: string; name: string; count: number }>
  >([]);
  const [barData, setBarData] = useState<BarDatum[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchAnalytics = async () => {
      try {
        setAnalyticsLoading(true);
        setAnalyticsError(null);

        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) {
          throw new Error(`Failed to load dashboard analytics (${res.status})`);
        }

        const data = (await res.json()) as DashboardResponse;
        if (cancelled) return;

        const estimateTypes = Array.isArray(data.estimateTypes)
          ? data.estimateTypes
          : [];
        const mappedBars: BarDatum[] = estimateTypes
          .map((row) => ({
            label: String(row.type ?? "unknown"),
            estimate: Number(row.estimateCount ?? 0),
            share: Number(row.shareCount ?? 0),
          }))
          .filter((row) => row.estimate > 0 || row.share > 0)
          .slice(0, 10);

        const mappedBestOrders = mappedBars
          .map((row) => ({ name: row.label, count: row.estimate }))
          .filter((row) => row.count > 0)
          .slice(0, 5);

        const mappedBestInquiries = mappedBars
          .map((row) => ({ name: row.label, count: row.share }))
          .filter((row) => row.count > 0)
          .slice(0, 5);

        const branches = Array.isArray(data.topBranches)
          ? data.topBranches
          : [];
        const mappedBranches = branches.map((row) => ({
          region: "지점",
          name: String(row.name ?? "unknown"),
          count: Number(row.estimateCount ?? 0) + Number(row.shareCount ?? 0),
        }));

        const managers = Array.isArray(data.topManagers)
          ? data.topManagers
          : [];
        const mappedManagers = managers.map((row) => ({
          branch: String(row.branchName ?? "unknown"),
          name: String(row.name ?? "unknown"),
          count: Number(row.estimateCount ?? 0) + Number(row.shareCount ?? 0),
        }));

        setBarData(mappedBars);
        setBestOrders(mappedBestOrders);
        setBestInquiries(mappedBestInquiries);
        setTopBranches(mappedBranches);
        setTopManagers(mappedManagers);
      } catch (err) {
        console.error("Admin dashboard analytics error:", err);
        if (!cancelled) {
          setAnalyticsError("애널리틱스 데이터를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    };

    fetchAnalytics();

    return () => {
      cancelled = true;
    };
  }, []);

  const monthRangeLabel = useMemo(() => {
    if (!currentMonthRange) return "";
    return `${currentMonthRange.startDate} ~ ${currentMonthRange.endDate}`;
  }, [currentMonthRange]);
  // =========================
  useEffect(() => {
    let cancelled = false;

    const fetchOverview = async () => {
      try {
        const res = await fetch("/api/admin/overview");
        if (!res.ok) {
          throw new Error(`Failed to load overview (${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;

        setTopStats({
          totalProducts: Number(data?.topStats?.totalProducts ?? 0),
          managers: Number(data?.topStats?.managers ?? 0),
          todaySearch: Number(data?.topStats?.todaySearch ?? 0),
          yesterdaySearch: Number(data?.topStats?.yesterdaySearch ?? 0),
          totalSearch: Number(data?.topStats?.totalSearch ?? 0),
        });

        setVisitStats({
          pc: Number(data?.visitStats?.pc ?? 0),
          mobile: Number(data?.visitStats?.mobile ?? 0),
        });
        setCurrentMonthRange(
          data?.currentMonthRange
            ? {
                startDate: String(data.currentMonthRange.startDate ?? ""),
                endDate: String(data.currentMonthRange.endDate ?? ""),
              }
            : null,
        );
      } catch (err) {
        console.error("Admin overview error:", err);
      }
    };

    fetchOverview();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2) 그래프 애니메이션 + 툴팁
  // =========================
  const [chartMounted, setChartMounted] = useState(false);

  useEffect(() => {
    // 첫 진입시에만 "위로 올라오는" 애니메이션 트리거
    const t = requestAnimationFrame(() => setChartMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const maxValue = useMemo(() => {
    let m = 1;
    for (const d of barData) m = Math.max(m, d.estimate + d.share);
    return m;
  }, [barData]);

  const maxTick = useMemo(() => {
    const step = 1000;
    return Math.max(step, Math.ceil(maxValue / step) * step);
  }, [maxValue]);

  const yTicks = useMemo(() => {
    const step = 1000;
    const arr: number[] = [];
    for (let v = 0; v <= maxTick; v += step) arr.push(v);
    return arr;
  }, [maxTick]);

  type TooltipState =
    | {
        visible: true;
        x: number;
        y: number;
        label: string;
        estimate: number;
        share: number;
        total: number;
      }
    | { visible: false };

  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false });
  const rafRef = useRef<number | null>(null);
  const chartWrapRef = useRef<HTMLDivElement | null>(null);

  const showTooltip = useCallback((e: React.MouseEvent, d: BarDatum) => {
    const clientX = e.clientX;
    const clientY = e.clientY;

    const update = () => {
      const wrapEl = chartWrapRef.current;
      if (!wrapEl) {
        rafRef.current = null;
        return;
      }

      const wrapRect = wrapEl.getBoundingClientRect();
      const x = clientX - wrapRect.left;
      const y = clientY - wrapRect.top;

      setTooltip({
        visible: true,
        x,
        y,
        label: d.label,
        estimate: d.estimate,
        share: d.share,
        total: d.estimate + d.share,
      });

      rafRef.current = null;
    };

    if (rafRef.current == null) rafRef.current = requestAnimationFrame(update);
  }, []);

  const hideTooltip = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setTooltip({ visible: false });
  }, []);

  // =========================
  // 3) 렌더
  // =========================
  return (
    <Page>
      <TopHero>
        <HeroTitle>
          대시보드
          <p
            style={{
              fontSize: "10px",
              fontWeight: "normal",
              marginTop: "8px",
              color: "#ddd",
            }}
          >
            해당 대시보드 값은 측정 중인 부분이 있어 부정확할 수 있습니다.
          </p>
        </HeroTitle>

        <HeroRow>
          <HeroStatCard>
            <HeroStatLabel>총 제품 수</HeroStatLabel>
            <HeroFlex>
              <HeroStatValue>
                {formatNumber(topStats.totalProducts)}
              </HeroStatValue>
              <HeroStatUnit>개</HeroStatUnit>
            </HeroFlex>
          </HeroStatCard>

          <HeroStatCard>
            <HeroStatLabel>총 매니저 수</HeroStatLabel>
            <HeroFlex>
              <HeroStatValue>{formatNumber(topStats.managers)}</HeroStatValue>
              <HeroStatUnit>명</HeroStatUnit>
            </HeroFlex>
          </HeroStatCard>

          <HeroMiniPanel>
            <HeroMiniLine>
              <span>오늘 접속자 수</span>
              <b>{formatNumber(topStats.todaySearch)}명</b>
            </HeroMiniLine>
            <HeroMiniLine>
              <span>어제 접속자 수</span>
              <b>{formatNumber(topStats.yesterdaySearch)}명</b>
            </HeroMiniLine>
            <HeroMiniLine>
              <span>지난달 접속자 수</span>
              <b>{formatNumber(topStats.totalSearch)}명</b>
            </HeroMiniLine>
          </HeroMiniPanel>
        </HeroRow>
      </TopHero>

      <Content>
        <Grid2>
          <Card>
            <CardHeader>
              <CardTitle>접속 현황 상세</CardTitle>
              <CardRight>
                {monthRangeLabel ? `날짜기준 ${monthRangeLabel}` : "날짜기준 -"}
              </CardRight>
            </CardHeader>

            <Split2>
              <MiniKpi>
                <MiniKpiLabel>PC</MiniKpiLabel>
                <HeroFlex>
                  <MiniKpiValue>{formatNumber(visitStats.pc)}</MiniKpiValue>
                  <MiniKpiUnit>명</MiniKpiUnit>
                </HeroFlex>
              </MiniKpi>

              <MiniKpi>
                <MiniKpiLabel>MOBILE</MiniKpiLabel>
                <HeroFlex>
                  <MiniKpiValue>{formatNumber(visitStats.mobile)}</MiniKpiValue>
                  <MiniKpiUnit>명</MiniKpiUnit>
                </HeroFlex>
              </MiniKpi>
            </Split2>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>지난달 접속 상세 페이지</CardTitle>
              <CardRight>
                {monthRangeLabel ? `날짜기준 ${monthRangeLabel}` : "날짜기준 -"}
              </CardRight>
            </CardHeader>

            <Table>
              <TBody>
                {latestSearches.map((r) => (
                  <tr key={r.keyword}>
                    <td>{r.keyword}</td>
                    <td>{formatNumber(r.count)}회</td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </Card>
        </Grid2>

        <CardHeader>
          <CardTitle>견적내기 / 공유하기</CardTitle>
        </CardHeader>

        <Grid4>
          <SmallCard>
            <SmallKpi>
              <SmallKpiLabel>오늘 견적 수</SmallKpiLabel>
              <HeroFlex>
                <SmallKpiValue>
                  {formatNumber(counts.todayOrders)}
                </SmallKpiValue>
                <SmallKpiUnit>건</SmallKpiUnit>
              </HeroFlex>
            </SmallKpi>
          </SmallCard>

          <SmallCard>
            <SmallKpi>
              <SmallKpiLabel>총 견적 수</SmallKpiLabel>
              <HeroFlex>
                <SmallKpiValue>
                  {formatNumber(counts.totalOrders)}
                </SmallKpiValue>
                <SmallKpiUnit>건</SmallKpiUnit>
              </HeroFlex>
            </SmallKpi>
          </SmallCard>

          <SmallCard>
            <SmallKpi>
              <SmallKpiLabel>오늘 공유 수</SmallKpiLabel>
              <HeroFlex>
                <SmallKpiValue>
                  {formatNumber(counts.todayInquiries)}
                </SmallKpiValue>
                <SmallKpiUnit>건</SmallKpiUnit>
              </HeroFlex>
            </SmallKpi>
          </SmallCard>

          <SmallCard>
            <SmallKpi>
              <SmallKpiLabel>총 공유 수</SmallKpiLabel>
              <HeroFlex>
                <SmallKpiValue>
                  {formatNumber(counts.totalInquiries)}
                </SmallKpiValue>
                <SmallKpiUnit>건</SmallKpiUnit>
              </HeroFlex>
            </SmallKpi>
          </SmallCard>
        </Grid4>

        <Grid2>
          <Card>
            <CardHeader>
              <CardTitle>견적내기 BEST 5 상품</CardTitle>
              <CardRight>
                {monthRangeLabel ? `날짜기준 ${monthRangeLabel}` : "날짜기준 -"}
              </CardRight>
            </CardHeader>

            <Table>
              <TBody>
                {bestOrders.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{formatNumber(r.count)}건</td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>공유하기 BEST 5 상품</CardTitle>
              <CardRight>
                {monthRangeLabel ? `날짜기준 ${monthRangeLabel}` : "날짜기준 -"}
              </CardRight>
            </CardHeader>

            <Table>
              <TBody>
                {bestInquiries.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{formatNumber(r.count)}건</td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </Card>
        </Grid2>

        <Card>
          <CardHeader>
            <CardTitle>
              인기 카테고리
              <ChartDesc>
                2026년 기준 가장 많은 카테고리 기준으로 비율이 표시됩니다.
              </ChartDesc>
            </CardTitle>

            <Legend>
              <LegendItem>
                <LegendDot $variant="estimate" />
                <span>견적내기</span>
              </LegendItem>
              <LegendItem>
                <LegendDot $variant="share" />
                <span>공유하기</span>
              </LegendItem>
            </Legend>
          </CardHeader>

          {analyticsLoading && (
            <CardFootNote>애널리틱스 로딩 중...</CardFootNote>
          )}
          {analyticsError && !analyticsLoading && (
            <CardFootNote>{analyticsError}</CardFootNote>
          )}

          <ChartWrap
            ref={chartWrapRef}
            $mounted={chartMounted}
            onMouseLeave={hideTooltip}
            role="figure"
            aria-label="인기 카테고리 스택 차트"
          >
            {/* ✅ Y축 + 플롯 영역(그리드/막대) */}
            <ChartGrid>
              <YAxis>
                {yTicks
                  .slice()
                  .reverse()
                  .map((t) => (
                    <YAxisTick key={t}>{formatNumber(t)}</YAxisTick>
                  ))}
              </YAxis>

              <Plot>
                {/* ✅ 막대가 시작하는 영역(0라인 포함) */}
                <BarStage>
                  {/* ✅ 가로 그리드 */}
                  <GridLines aria-hidden>
                    {yTicks
                      .slice()
                      .reverse()
                      .map((t) => {
                        const pct = maxTick === 0 ? 0 : (t / maxTick) * 100;
                        return (
                          <GridLine key={t} style={{ bottom: `${pct}%` }} />
                        );
                      })}
                  </GridLines>

                  {/* ✅ 막대들 (0라인=BarStage 바닥에서 시작) */}
                  <BarsRow>
                    {barData.map((d) => {
                      const total = d.estimate + d.share;

                      // ✅ 3) 막대 끝 비율 정확히 맞추기 (maxTick 기준)
                      const totalH =
                        maxTick === 0 ? 0 : (total / maxTick) * 100;

                      // ✅ 스택 내부 비율(합=100)
                      const estimatePct =
                        total === 0 ? 0 : (d.estimate / total) * 100;
                      const sharePct = Math.max(0, 100 - estimatePct);

                      return (
                        <BarGroup
                          key={d.label}
                          onMouseMove={(e) => showTooltip(e, d)}
                          onMouseEnter={(e) => showTooltip(e, d)}
                        >
                          {/* ✅ 막대 래퍼 자체가 0라인에서 시작 */}
                          <BarWrap style={{ height: `${totalH}%` }}>
                            {/* ✅ 4) 수치값은 막대 끝(상단)에 붙이기 */}
                            <BarTopValue>{formatNumber(total)}</BarTopValue>

                            <StackBar $mounted={chartMounted}>
                              {/* ✅ 2) 아래=견적 / 위=공유 유지 */}
                              <Segment
                                $variant="estimate"
                                $mounted={chartMounted}
                                style={{ height: `${estimatePct}%` }}
                              />
                              <Segment
                                $variant="share"
                                $mounted={chartMounted}
                                style={{ height: `${sharePct}%` }}
                              />
                            </StackBar>
                          </BarWrap>
                        </BarGroup>
                      );
                    })}
                  </BarsRow>
                </BarStage>

                {/* ✅ 1) X 라벨은 0라인(BarStage 바닥) 아래로 */}
                <XAxis>
                  {barData.map((d) => (
                    <XAxisLabel key={d.label} title={d.label}>
                      {d.label}
                    </XAxisLabel>
                  ))}
                </XAxis>
              </Plot>
            </ChartGrid>

            {tooltip.visible && (
              <Tooltip style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>
                <TooltipTitle>{tooltip.label}</TooltipTitle>

                <TooltipRow>
                  <TooltipKey>
                    <LegendDot $variant="estimate" />
                    견적내기
                  </TooltipKey>
                  <b>{formatNumber(tooltip.estimate)}</b>
                </TooltipRow>

                <TooltipRow>
                  <TooltipKey>
                    <LegendDot $variant="share" />
                    공유하기
                  </TooltipKey>
                  <b>{formatNumber(tooltip.share)}</b>
                </TooltipRow>

                <TooltipDivider />

                <TooltipRow>
                  <TooltipKey>합계</TooltipKey>
                  <b>{formatNumber(tooltip.total)}</b>
                </TooltipRow>
              </Tooltip>
            )}
          </ChartWrap>
        </Card>

        <Grid2>
          <Card>
            <CardHeader>
              <CardTitle>지난 달 상위 지점 TOP 10</CardTitle>
              <CardRight>
                {monthRangeLabel ? `집계기준 ${monthRangeLabel}` : "집계기준 -"}
              </CardRight>
            </CardHeader>

            <Table>
              <TBody>
                {topBranches.map((r, idx) => (
                  <tr key={`${r.region}-${r.name}-${idx}`}>
                    <td>
                      <Top10Left>
                        <Tag>{r.region}</Tag>
                        <span>{r.name}</span>
                      </Top10Left>
                    </td>
                    <td>{formatNumber(r.count)}건</td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>지난 달 상위 매니저 TOP 10</CardTitle>
              <CardRight>
                {monthRangeLabel ? `집계기준 ${monthRangeLabel}` : "집계기준 -"}
              </CardRight>
            </CardHeader>

            <Table>
              <TBody>
                {topManagers.map((r, idx) => (
                  <tr key={`${r.branch}-${r.name}-${idx}`}>
                    <td>
                      <Top10Left>
                        <span>{r.branch}</span>
                        <b>{r.name}</b>
                      </Top10Left>
                    </td>
                    <td>{formatNumber(r.count)}건</td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </Card>
        </Grid2>
      </Content>
    </Page>
  );
}

// =========================
// Utils
// =========================
function formatNumber(n: number) {
  return new Intl.NumberFormat("ko-KR").format(n);
}

// =========================
// Styled Components (신규 페이지 전용)
// =========================

const Page = styled.div`
  width: 100%;
`;

const TopHero = styled.div`
  background: #6162bf;
  color: #fff;
  padding: 40px 35px;
`;

const HeroTitle = styled.div`
  font-size: 34px;
  font-weight: bold;
  margin-bottom: 75px;
  color: #fff;
`;

const HeroRow = styled.div`
  display: flex;
  align-items: center;
  gap: 35px;
  @media (max-width: 1400px) {
    flex-wrap: wrap;
  }
`;

const HeroStatCard = styled.div`
  background: rgba(255, 255, 255, 0.15);
  border-radius: 25px;
  color: #fff;
  padding: 15px 20px 30px;
  color: #fff;
  min-width: 330px;
  @media (max-width: 1400px) {
    width: calc(50% - 17.5px);
    min-width: initial;
  }
`;

const HeroStatLabel = styled.div`
  font-size: 22px;
  color: #fff;
`;

const HeroStatValue = styled.div`
  font-size: 80px;
  font-weight: bold;
  color: #fff;
  line-height: 1;
`;

const HeroStatUnit = styled.div`
  font-size: 22px;
  font-weight: bold;
  color: #fff;
`;

const HeroFlex = styled.div`
  display: flex;
  align-items: end;
  gap: 5px;
  justify-content: start;
  margin-top: 30px;
  margin-bottom: 10px;
`;

const HeroMiniPanel = styled.div`
  display: grid;
  gap: 10px;
  width: 100%;
`;

const HeroMiniLine = styled.div`
  border-radius: 12px;
  height: 55px;
  background: rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
  padding: 0 25px;
  color: #fff;

  b {
    font-size: 22px;
    font-weight: 900;
  }
`;

const Content = styled.div`
  padding: 0px 35px 40px;
`;

const Grid2 = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 55px;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`;

const Grid4 = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 55px;

  @media (max-width: 960px) {
    grid-template-columns: 1fr 1fr;
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.div`
  background: #fff;
  border-radius: 10px;
`;

const SmallCard = styled(Card)``;

const CardHeader = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 22px;
  margin-top: 75px;
`;

const CardTitle = styled.div`
  font-size: 22px;
  font-weight: 500;
  color: #000;
`;

const CardRight = styled.div`
  font-size: 14px;
  color: #7b7b7b;
  white-space: nowrap;
`;

const Split2 = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 35px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const MiniKpi = styled.div`
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 18px;
  display: grid;
  grid-template-rows: auto auto;
  gap: 6px;
`;

const MiniKpiLabel = styled.div`
  font-size: 22px;
  color: #000;
  font-weight: 400;
`;

const MiniKpiValue = styled.div`
  font-size: 60px;
  font-weight: bold;
  color: #000;
  line-height: 1.05;
`;

const MiniKpiUnit = styled.div`
  font-size: 22px;
  font-weight: bold;
`;

const SmallKpi = styled.div`
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 18px;
`;

const SmallKpiLabel = styled.div`
  font-size: 22px;
  color: #000;
`;

const SmallKpiValue = styled.div`
  font-size: 60px;
  font-weight: bold;
  line-height: 1.05;
`;

const SmallKpiUnit = styled.div`
  font-size: 22px;
  font-weight: bold;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  border-spacing: 12px;

  tr {
    border: 1px solid #ddd;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    height: 50px;
  }
`;

const THead = styled.thead`
  th {
    text-align: left;
    font-size: 11px;
    color: #7a8296;
    padding: 10px 8px;
    border-bottom: 1px solid #ddd;
    font-weight: 800;
  }

  th:last-child {
    text-align: right;
  }
`;

const TBody = styled.tbody`
  td {
    font-size: 12px;
    color: #151922;
    padding: 10px 8px;
    border-bottom: 1px solid #f2f4f8;
    display: flex;
    align-items: center;
  }

  td:last-child {
    text-align: right;
    font-weight: 900;
  }

  tr:last-child td {
    border-bottom: none;
  }
`;

const Legend = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const LegendItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #7a8296;
  font-weight: 800;
`;

const LegendDot = styled.span<{ $variant: "estimate" | "share" }>`
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-block;

  ${(p) =>
    p.$variant === "estimate" &&
    css`
      background: #5c5cc8; /* 아래(견적내기) */
    `}
  ${(p) =>
    p.$variant === "share" &&
    css`
      background: #b8b8ff; /* 위(공유하기) */
    `}
`;

const StackBar = styled.div<{ $mounted: boolean }>`
  width: 45px;
  height: 100%;
  border-radius: 0px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  transform-origin: bottom;
  transition: transform 420ms ease;
  will-change: transform;

  ${(p) =>
    !p.$mounted &&
    css`
      transform: translateY(10px);
    `}
`;

const Segment = styled.div<{
  $variant: "estimate" | "share";
  $mounted: boolean;
}>`
  width: 100%;
  transform-origin: bottom;
  transition: height 420ms ease;
  will-change: height;

  ${(p) =>
    p.$variant === "estimate" &&
    css`
      background: #5c5cc8; /* 아래(견적내기) */
    `}
  ${(p) =>
    p.$variant === "share" &&
    css`
      background: #b8b8ff; /* 위(공유하기) */
    `}

  /* 첫 진입 시 살짝 올라오는 느낌 */
  ${(p) =>
    !p.$mounted &&
    css`
      height: 2%;
    `}
`;

const riseIn = keyframes`
  from {
    transform: translateY(16px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

const ChartWrap = styled.div<{ $mounted: boolean }>`
  position: relative;
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 40px 20px 20px;
  min-height: 260px;
  background: #fff;

  ${(p) =>
    p.$mounted &&
    css`
      animation: ${riseIn} 420ms ease both;
    `}
`;

const TooltipDivider = styled.div`
  height: 1px;
  background: rgba(255, 255, 255, 0.14);
  margin: 8px 0 4px;
`;

const ChartDesc = styled.div`
  margin-bottom: 10px;
  font-size: 12px;
  color: #7a8296;
`;

const ChartGrid = styled.div`
  display: grid;
  grid-template-columns: 46px 1fr;
  gap: 10px;
  align-items: stretch;
`;

const YAxis = styled.div`
  height: 220px; /* ✅ BarStage와 동일 */
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const YAxisTick = styled.div`
  font-size: 11px;
  color: #7a8296;
  text-align: right;
  line-height: 1;
`;

const GridLine = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: #eceff6;
`;

const BarLabel = styled.div`
  font-size: 12px;
  color: #7a8296;
  font-weight: 800;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Bars = styled.div`
  height: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  align-items: end;
`;

const Bar = styled.div<{ $variant: "desktop" | "mobile"; $mounted: boolean }>`
  width: 100%;
  border-radius: 8px 8px 4px 4px;
  transform-origin: bottom;
  transition:
    transform 420ms ease,
    height 420ms ease;
  will-change: transform, height;

  ${(p) =>
    p.$variant === "desktop" &&
    css`
      background: #5c5cc8;
    `}
  ${(p) =>
    p.$variant === "mobile" &&
    css`
      background: #b8b8ff;
    `}

  ${(p) =>
    !p.$mounted &&
    css`
      transform: scaleY(0.08);
    `}
`;

const Tooltip = styled.div`
  position: absolute;
  z-index: 10;
  min-width: 150px;
  border-radius: 10px;
  padding: 10px 10px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
  pointer-events: none;
`;

const TooltipTitle = styled.div`
  font-size: 12px;
  font-weight: 900;
  margin-bottom: 8px;
`;

const TooltipRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  margin-top: 6px;

  b {
    font-weight: 900;
  }
`;

const TooltipKey = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0.92;
`;

const CardFootNote = styled.div`
  margin-top: 10px;
  font-size: 11px;
  color: #7a8296;
`;

const PlotArea = styled.div`
  position: relative;
`;

const BarArea = styled.div`
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  align-items: end;
  gap: 6px;
`;

const BarTotal = styled.div`
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-height: 0;
`;

const Plot = styled.div`
  display: grid;
  grid-template-rows: 220px 26px; /* ✅ 위=막대(0라인 포함), 아래=X라벨 */
`;

const BarStage = styled.div`
  position: relative;
  height: 220px;
`;

const GridLines = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
`;
/* ✅ 막대들을 0라인(바닥) 기준으로 깔기 */
const BarsRow = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 22px;
  align-items: end; /* ✅ 각 막대가 바닥(0라인)에서 시작 */
  z-index: 1;
`;

const BarGroup = styled.div`
  position: relative;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
`;

/* ✅ 실제 막대 컨테이너: 높이는 %로 들어오고, 바닥에 붙음 */
const BarWrap = styled.div`
  position: absolute;
  bottom: 0; /* ✅ 2) 막대 시작은 0라인 */
  width: 44px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
`;

/* ✅ 4) 숫자는 막대 끝(상단)에 붙이기 */
const BarTopValue = styled.div`
  position: absolute;
  top: -25px; /* 막대 끝 위로 살짝 */
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  font-weight: 800;
  color: #7a8296;
  white-space: nowrap;
`;

const XAxis = styled.div`
  border-top: 1px solid #eceff6; /* ✅ 0라인 느낌 강화 */
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 22px;
  align-items: center;
  padding-top: 6px;
`;

const XAxisLabel = styled.div`
  font-size: 12px;
  color: #7a8296;
  font-weight: 800;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Top10Left = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  b {
    font-weight: 900;
  }
`;

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #e6e9f2;
  background: #f7f8fb;
  font-size: 12px;
  font-weight: 900;
  color: #151922;
  flex: 0 0 auto;
`;
