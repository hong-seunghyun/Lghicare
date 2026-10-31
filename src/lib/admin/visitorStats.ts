export const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const koreaDateKey = (date: Date) =>
  new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

export const koreaDayStart = (key: string) => new Date(`${key}T00:00:00+09:00`);

export type MonthlyVisitorRow = {
  month: string;
  rangeStart: string;
  rangeEnd: string;
  count: number;
};

// Count once per person per day; monthly and range totals sum those daily counts.
export const createVisitorStats = (start: Date, endExclusive: Date) => {
  const daily = new Map<string, Set<string>>();
  const months = new Map<string, MonthlyVisitorRow>();
  for (let time = start.getTime(); time < endExclusive.getTime(); time += DAY_MS) {
    const date = koreaDateKey(new Date(time));
    const month = date.slice(0, 7);
    daily.set(date, new Set());
    const row = months.get(month) ?? { month, rangeStart: date, rangeEnd: date, count: 0 };
    row.rangeEnd = date;
    months.set(month, row);
  }
  return {
    add(date: Date, visitorId: string) {
      if (!visitorId || date < start || date >= endExclusive) return;
      const key = koreaDateKey(date);
      daily.get(key)?.add(visitorId);
    },
    toJSON() {
      const dailyRows = Array.from(daily, ([date, visitors]) => ({ date, count: visitors.size }));
      const monthlyCounts = new Map<string, number>();
      for (const row of dailyRows) {
        const month = row.date.slice(0, 7);
        monthlyCounts.set(month, (monthlyCounts.get(month) ?? 0) + row.count);
      }
      return {
        count: dailyRows.reduce((sum, row) => sum + row.count, 0),
        daily: dailyRows,
        monthly: Array.from(months.values(), (row) => ({
          ...row,
          count: monthlyCounts.get(row.month) ?? 0,
        })),
      };
    },
  };
};
