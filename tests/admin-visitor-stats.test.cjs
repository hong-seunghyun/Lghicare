const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadTs(file, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    (name) => {
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    }, loaded, loaded.exports,
  );
  return loaded.exports;
}

const stats = loadTs("src/lib/admin/visitorStats.ts");

test("counts returning visitors on each day and sums daily counts for months and range", () => {
  const visitors = stats.createVisitorStats(
    stats.koreaDayStart("2026-01-30"), stats.koreaDayStart("2026-02-03"),
  );
  for (const date of ["2026-01-30", "2026-01-30", "2026-01-31", "2026-02-01"]) {
    visitors.add(stats.koreaDayStart(date), "same-person");
  }
  visitors.add(stats.koreaDayStart("2026-02-01"), "second-person");
  visitors.add(stats.koreaDayStart("2026-02-02"), "");
  visitors.add(stats.koreaDayStart("2026-01-29"), "outside");
  visitors.add(stats.koreaDayStart("2026-02-03"), "outside");
  assert.deepEqual(visitors.toJSON(), {
    count: 4,
    daily: [
      { date: "2026-01-30", count: 1 }, { date: "2026-01-31", count: 1 },
      { date: "2026-02-01", count: 2 }, { date: "2026-02-02", count: 0 },
    ],
    monthly: [
      { month: "2026-01", rangeStart: "2026-01-30", rangeEnd: "2026-01-31", count: 2 },
      { month: "2026-02", rangeStart: "2026-02-01", rangeEnd: "2026-02-02", count: 2 },
    ],
  });
});

test("uses Korea midnight at month and year boundaries regardless of host timezone", () => {
  assert.equal(stats.koreaDateKey(new Date("2025-12-31T14:59:59Z")), "2025-12-31");
  assert.equal(stats.koreaDateKey(new Date("2025-12-31T15:00:00Z")), "2026-01-01");
  assert.equal(stats.koreaDayStart("2026-01-01").toISOString(), "2025-12-31T15:00:00.000Z");
});

test("API excludes anonymous estimates and merges manager ID / UID across activity types", async () => {
  const records = {
    users: [{ id: "uid-a", data: () => ({ role: "manager", managerId: "manager-a" }) }],
    estimates: [
      { id: "e1", data: () => ({ createdAt: stats.koreaDayStart("2026-01-31"), managerUid: "uid-a" }) },
      { id: "e2", data: () => ({ createdAt: stats.koreaDayStart("2026-01-31"), managerId: "manager-a" }) },
      { id: "anonymous", data: () => ({ createdAt: stats.koreaDayStart("2026-01-31") }) },
    ],
    shareCount: [
      { id: "manager_uid-a_product", data: () => ({ updatedAt: stats.koreaDayStart("2026-02-01") }) },
    ],
  };
  const firestore = {
    collection: (_db, name) => name,
    where: (field, op, value) => ({ field, op, value }),
    orderBy: () => null,
    query: (name, ...filters) => ({ name, filters }),
    Timestamp: { fromDate: (date) => date },
    getDocs: async ({ name, filters }) => records[name].filter((doc) => filters.every((f) => {
      if (!f) return true;
      const value = doc.data()[f.field];
      if (f.op === "==") return value === f.value;
      if (f.op === ">=") return value >= f.value;
      if (f.op === "<") return value < f.value;
      throw new Error(`Unexpected operator: ${f.op}`);
    })),
  };
  const handler = loadTs("src/pages/api/admin/activity-summary.ts", {
    "@/lib/firebase": { db: {} }, "firebase/firestore": firestore,
    "@/lib/admin/visitorStats": stats,
  }).default;
  for (const includeDetails of ["0", "1"]) {
    let status;
    let body;
    const response = { status(code) { status = code; return this; }, json(data) { body = data; } };
    await handler({ method: "GET", query: { start: "2026-01-31", end: "2026-02-02", includeDetails } }, response);
    assert.equal(status, 200);
    assert.equal(body.totalEstimates, 3);
    assert.equal(body.visitorSummary.range, 2);
    assert.deepEqual(body.dailyVisitorCounts.map((row) => row.count), [1, 1, 0]);
    assert.deepEqual(body.monthlyVisitorCounts.map((row) => row.count), [1, 1]);
    assert.equal(body.rangeStart, "2026-01-31");
    assert.equal(body.rangeEnd, "2026-02-02");
  }

  // Recent-period summary must use the same daily-sum rule as the export range.
  const today = stats.koreaDayStart(stats.koreaDateKey(new Date()));
  const yesterday = new Date(today.getTime() - stats.DAY_MS);
  records.estimates = [
    { id: "today", data: () => ({ createdAt: today, managerUid: "uid-a" }) },
    { id: "yesterday", data: () => ({ createdAt: yesterday, managerId: "manager-a" }) },
  ];
  records.shareCount = [
    { id: "manager_uid-a_product", data: () => ({ updatedAt: today }) },
  ];
  let recent;
  await handler({ method: "GET", query: { start: stats.koreaDateKey(yesterday), end: stats.koreaDateKey(today) } }, {
    status(code) { assert.equal(code, 200); return this; },
    json(body) { recent = body; },
  });
  assert.deepEqual(recent.visitorSummary, { today: 1, yesterday: 1, range: 2, last30Days: 2 });
});

test("real export preserves raw numbers without demo multipliers", async () => {
  const mode = loadTs("src/lib/admin/adminDataMode.ts");
  const service = loadTs("src/lib/admin/adminDataService.ts", { "@/lib/admin/adminDataMode": mode });
  const raw = { totalEstimates: 7, visitorSummary: { range: 2 }, dailyVisitorCounts: [{ date: "2026-01-31", count: 2 }] };
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.match(url, /start=2026-01-31&end=2026-02-02&includeDetails=1/);
    return { ok: true, json: async () => raw };
  };
  try {
    assert.deepEqual(await service.getDashboardDailyExportRealData({ rangeStart: "2026-01-31", rangeEnd: "2026-02-02" }), raw);
  } finally {
    global.fetch = originalFetch;
  }
});
