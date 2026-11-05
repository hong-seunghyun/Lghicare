const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript");
function load(file, mocks = {}) {
  const source = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) => {
      if (name in mocks) return mocks[name];
      throw new Error(name);
    },
    module,
    module.exports,
  );
  return module.exports;
}
const lib = load("src/lib/renewalTest.ts");
const {
  normalizeProduct,
  createLine,
  changeLineVariant,
  variantOptions,
  lineTotals,
  quoteTotals,
  emptyQuote,
  isPreviewQuote,
  canUseRenewalEstimate,
  ownerStorageKey,
  DRAFT_KEY,
  koreaDate,
  validUntil,
} = lib;
const variant = {
  모델코드: "P1",
  상품명: "검증 상품",
  계약기간: "72",
  서비스유형: "기본",
  "서비스주기/월": "6개월",
  "프로모션 대분류": "신규",
  프로모션유형: "일반(기본N)",
  프로모션명: "등록 프로모션",
  할인전금액: "53,900",
  할인후금액: "47,400",
};
const product = () =>
  normalizeProduct({
    모델코드: "P1",
    상품명: "검증 상품",
    중분류: "정수기",
    소분류: "냉온정수기",
    thumbnailUrl: "/api/image-proxy?fileId=test",
    variants: [
      { ...variant },
      {
        ...variant,
        계약기간: "60",
        할인전금액: "58,900",
        할인후금액: "52,100",
      },
      {
        ...variant,
        "서비스주기/월": "4개월",
        할인전금액: "56,900",
        할인후금액: "50,400",
      },
    ],
  });
test("registered option prices are used without fabricated term/care adjustments", () => {
  const l = createLine(product());
  assert.equal(lineTotals(l).monthly, 47400);
  assert.equal(
    lineTotals(changeLineVariant(l, "계약기간", "60")).monthly,
    52100,
  );
  assert.deepEqual(variantOptions(l, "서비스주기/월"), ["6개월", "4개월"]);
});
test("unsupported combinations are never synthesized", () => {
  const l = createLine(product());
  const five = changeLineVariant(l, "계약기간", "60");
  assert.deepEqual(variantOptions(five, "서비스주기/월"), ["6개월"]);
  assert.strictEqual(changeLineVariant(five, "서비스주기/월", "4개월"), five);
  assert.strictEqual(changeLineVariant(l, "서비스유형", "자가관리"), l);
});
test("prepayment matches original hundred-won rounding and 1.135 calculation", () => {
  const l = { ...createLine(product()), prepay: 30 };
  const t = lineTotals(l);
  assert.equal(t.deposit, 1164200);
  assert.equal(t.monthly, 29000);
  assert.equal(t.total, 1164200 + 29000 * 72);
  assert.equal(changeLineVariant(l, "계약기간", "60").prepay, 0);
});
test("quantities and mixed contract periods are summed separately", () => {
  const a = { ...createLine(product()), quantity: 2 },
    b = changeLineVariant(createLine(product()), "계약기간", "60");
  const t = quoteTotals([a, b]);
  assert.equal(t.units, 3);
  assert.equal(t.monthly, 47400 * 2 + 52100);
  assert.equal(t.total, 47400 * 2 * 72 + 52100 * 60);
});
test("live card and teacher metadata control stacking; amounts cannot become negative", () => {
  const l = {
    ...createLine(product()),
    card: {
      id: "card1",
      issuer: "운영 카드",
      discount: 13000,
      allowTeacher: true,
    },
    teachers: [
      {
        id: "teacher1",
        type: "등록 플랜",
        maxSeats: 4,
        discountPerSeat: 2000,
        seats: 2,
      },
    ],
  };
  assert.equal(lineTotals(l).effective, 30400);
  assert.equal(
    lineTotals({ ...l, card: { ...l.card, allowTeacher: false } }).effective,
    34400,
  );
  assert.equal(
    lineTotals({ ...l, card: { ...l.card, discount: 999999 } }).effective,
    0,
  );
});
test("genuine zero-won promotional prices are preserved", () => {
  const p = normalizeProduct({
    모델코드: "ZERO",
    상품명: "zero",
    variants: [{ ...variant, 할인후금액: "0" }],
  });
  assert.equal(lineTotals(createLine(p)).monthly, 0);
  assert.equal(normalizeProduct({ 모델코드: "EMPTY", variants: [] }), null);
});
test("featured benefit subtracts the requested 10,000 won without changing contract prices", () => {
  const line = createLine(product());
  const before = lineTotals(line).monthly;
  assert.equal(lib.featuredBenefitPrice(before), 37400);
  assert.equal(lib.featuredBenefitPrice(10000), 0);
  assert.equal(lib.featuredBenefitPrice(5000), 0);
  assert.equal(lib.featuredBenefitPrice(0), 0);
  assert.equal(lineTotals(line).monthly, before);
});
test("weekly best products keep only the administrator's first three model slots and order", () => {
  const p = product();
  const items = ["P1", "AB-2", "P3", "P4"].map((id) => ({ ...p, id }));
  const chosen = lib.selectThemeProducts(items, ["ab2", "P3", "missing", "P1"]);
  assert.deepEqual(chosen.map(({ product: p, rank }) => [p.id, rank]), [["AB-2", 1], ["P3", 2]]);
  assert.deepEqual(lib.selectThemeProducts(items, []), []);
});
test("minimum monthly price comes from a real option and the same option opens in the estimate", () => {
  const p = product();
  p.variants.push({ ...variant, 계약기간: "84", 할인후금액: "19,900", "프로모션 대분류": "재구독" });
  const minimum = lib.lowestVariant(p);
  assert.equal(minimum.계약기간, "84");
  assert.equal(lineTotals(createLine(p, minimum)).monthly, 19900);
  p.variants.push({ ...variant, 할인후금액: "0" });
  assert.equal(lineTotals(createLine(p, lib.lowestVariant(p))).monthly, 0);
});
test("old quantities become independent entries without changing saved amounts or benefits", () => {
  const q = { ...emptyQuote("owner"), lines: [{ ...createLine(product()), quantity: 3, voucherTotal: 50000 }] };
  const migrated = lib.individualizeQuote(q);
  assert.equal(migrated.lines.length, 3);
  assert.equal(new Set(migrated.lines.map((l) => l.id)).size, 3);
  assert.ok(migrated.lines.every((l) => l.quantity === 1));
  assert.deepEqual(quoteTotals(migrated.lines), quoteTotals(q.lines));
  assert.equal(isPreviewQuote(migrated), true);
  assert.deepEqual(lib.individualizeQuote(migrated), migrated);
});
test("prepayment rule priority matches the original model, subcategory and category rules", () => {
  const p = product();
  const rules = [
    { middle: "정수기", rate30: true },
    { middle: "정수기", sub: p.subCategory, rate50: true },
    { middle: "정수기", model: p.id, rate30: true },
  ];
  assert.equal(lib.matchPrepayRules(rules, p), "30");
  assert.equal(lib.matchPrepayRules(rules.slice(0, 2), p), "30_50");
  assert.equal(lib.matchPrepayRules(rules.slice(0, 1), p), "30");
  assert.equal(lib.matchPrepayRules([], p), null);
});
test("prepayment API failure reads registered rules; a failed rule read is never reported as no prepayment", async () => {
  let failRead = false;
  const hook = load("src/hooks/useRenewalData.ts", {
    react: {},
    "firebase/firestore": {
      collection: () => ({}), query: () => ({}), where: () => ({}),
      getDocs: async () => {
        if (failRead) throw Error("permission denied");
        return { docs: [{ data: () => ({ middle: "정수기", model: "P1", rate30: true, rate50: true }) }] };
      },
    },
    "@/lib/firebase": { db: {} },
    "@/lib/renewalTest": lib,
  });
  const previous = global.fetch;
  try {
    global.fetch = async () => ({ ok: false, status: 500 });
    assert.equal(await hook.fetchRenewalPrepayRate(product()), "30_50");
    failRead = true;
    await assert.rejects(hook.fetchRenewalPrepayRate(product()), /permission denied/);
  } finally { global.fetch = previous; }
});
test("manager/admin role checks match existing inactive-manager behavior", () => {
  assert.equal(canUseRenewalEstimate(null), false);
  assert.equal(canUseRenewalEstimate({ role: "user" }), false);
  assert.equal(
    canUseRenewalEstimate({ role: "manager", profile: { isActive: false } }),
    false,
  );
  assert.equal(
    canUseRenewalEstimate({ role: "manager", profile: { isActive: true } }),
    true,
  );
  assert.equal(
    canUseRenewalEstimate({ role: "admin", profile: { isActive: false } }),
    true,
  );
});
test("quotes are owner-scoped and old mock records cannot be restored", () => {
  const q = {
    ...emptyQuote("owner-a", "담당자"),
    lines: [createLine(product())],
  };
  assert.equal(isPreviewQuote(q), true);
  assert.notEqual(
    ownerStorageKey(DRAFT_KEY, "owner-a"),
    ownerStorageKey(DRAFT_KEY, "owner-b"),
  );
  assert.equal(isPreviewQuote({ ...q, source: "mock-v1" }), false);
  assert.equal(
    isPreviewQuote({ ...q, lines: [{ ...q.lines[0], quantity: 1.5 }] }),
    false,
  );
  assert.equal(
    isPreviewQuote({ ...q, lines: [{ ...q.lines[0], term: 120 }] }),
    false,
  );
});
test("saved quote prices remain the saved snapshot", () => {
  const q = { ...emptyQuote("owner"), lines: [createLine(product())] };
  const saved = JSON.parse(JSON.stringify(q));
  q.lines[0].selectedVariant.할인후금액 = "99999";
  assert.equal(lineTotals(saved.lines[0]).monthly, 47400);
  assert.equal(isPreviewQuote(saved), true);
});
test("product loader calls the original API with category/model filters and propagates failures", async () => {
  const hook = load("src/hooks/useRenewalData.ts", {
    react: {},
    "firebase/firestore": {},
    "@/lib/firebase": { db: {} },
    "@/lib/renewalTest": lib,
  });
  const previous = global.fetch;
  try {
    global.fetch = async (url) => {
      const p = new URL(url, "http://localhost").searchParams;
      assert.equal(p.get("middle"), "정수기");
      assert.equal(p.get("models"), "P1");
      assert.equal(p.get("groupBy"), "modelCode");
      return {
        ok: true,
        json: async () => ({
          options: [{ 모델코드: "P1", 상품명: "live", variants: [variant] }],
        }),
      };
    };
    assert.equal(
      (await hook.fetchRenewalProducts("정수기", "", "P1"))[0].id,
      "P1",
    );
    global.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(hook.fetchRenewalProducts("냉장고"), /503/);
  } finally {
    global.fetch = previous;
  }
});
test("Korea dates and validity do not depend on host timezone", () => {
  assert.equal(koreaDate(new Date("2026-10-31T15:00:00Z")), "2026-11-01");
  assert.equal(
    validUntil({
      ...emptyQuote("owner"),
      savedAt: "2026-10-31T15:00:00Z",
      validity: 15,
    }),
    "2026-11-16",
  );
});

test("login return destination only permits the renewal estimate route", () => {
  for (const value of [
    "https://evil.example",
    "//evil.example",
    "/admin",
    "/renewal-test/estimate-other",
    undefined,
  ])
    assert.equal(lib.getManagerLoginDestination(value), "/manager");
  for (const value of [
    "/renewal-test/estimate",
    "/renewal-test/estimate?add=P1&category=정수기",
    "/renewal-test/estimate?view=saved",
  ])
    assert.equal(lib.getManagerLoginDestination(value), value);
});

test("theme summaries retain the real minimum and its conditions without shipping all variants", () => {
  const catalog = load("src/lib/renewalThemeCatalog.ts", { "./renewalTest": lib });
  const rows = Array.from({ length: 200 }, (_, i) => ({ ...variant, 중분류: "정수기", 할인후금액: String(47000 + i) }));
  rows.push({ ...variant, 중분류: "정수기", 할인후금액: "19900", 계약기간: "84" });
  const [summary] = catalog.buildThemeCatalog(rows, "정수기", ["P1"]);
  assert.equal(summary.monthly, 19900);
  assert.equal(summary.minimumVariant.계약기간, "84");
  assert.equal(summary.variants, undefined);
  assert.ok(JSON.stringify(summary).length < JSON.stringify(rows).length / 10);
  assert.deepEqual(catalog.buildThemeCatalog(rows, "냉장고", ["P1"]), []);
});

test("concurrent theme requests are shared, cached, and failures remain retryable", async () => {
  const hook = load("src/hooks/useRenewalData.ts", { react: {}, "firebase/firestore": {}, "@/lib/firebase": { db: {} }, "@/lib/renewalTest": lib });
  const previous = global.fetch;
  let calls = 0;
  try {
    global.fetch = async (url) => {
      calls++;
      assert.ok(url.startsWith("/api/renewal/theme-products?"));
      await Promise.resolve();
      return { ok: true, json: async () => ({ products: [lib.themeProductSummary(product())] }) };
    };
    const [a, b] = await Promise.all([hook.fetchRenewalThemeProducts("정수기", "P1"), hook.fetchRenewalThemeProducts("정수기", "P1")]);
    assert.strictEqual(a, b);
    await hook.fetchRenewalThemeProducts("정수기", "P1");
    assert.equal(calls, 1);
    global.fetch = async () => { calls++; return { ok: false, status: 503 }; };
    await assert.rejects(hook.fetchRenewalThemeProducts("정수기", "P2"), /503/);
    await assert.rejects(hook.fetchRenewalThemeProducts("정수기", "P2"), /503/);
    assert.equal(calls, 3);
  } finally { global.fetch = previous; }
});

test("theme endpoint only looks up selected image folders and limits input to three models", async () => {
  delete global.__renewalThemeFiles;
  delete global.__renewalThemePending;
  const calls = [];
  const rows = ["P1", "P2", "P3", "OTHER"].map((id) => ({ ...variant, 모델코드: id, 중분류: "정수기" }));
  const catalog = load("src/lib/renewalThemeCatalog.ts", { "./renewalTest": lib });
  const handler = load("src/pages/api/renewal/theme-products.ts", {
    googleapis: { google: { auth: { GoogleAuth: class {} }, drive: () => ({ files: { list: async ({ q }) => {
      calls.push(q);
      if (q.includes("name = '정수기'")) return { data: { files: [{ id: "category" }] } };
      if (q.includes("'category' in parents")) return { data: { files: ["P1", "P2", "P3", "OTHER"].map((id) => ({ id: `folder-${id}`, name: id })) } };
      return { data: { files: [{ id: "ten", name: "10.jpg" }, { id: "first", name: "1.jpg" }] } };
    } } }) } },
    "@/lib/sheet": { fetchSheetDataWithPolicy: async (_, policy) => { assert.equal(policy.allowStale, false); return rows; } },
    "@/lib/renewalThemeCatalog": catalog,
    "@/lib/renewalTest": lib,
    "@/lib/utils": { normalizeAndExpandModelNames: (id) => [id] },
  }).default;
  const response = () => ({ code: 0, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const bad = response();
  await handler({ method: "GET", query: { middle: "정수기", models: "P1,P2,P3,OTHER" } }, bad);
  assert.equal(bad.code, 400);
  assert.equal(calls.length, 0);
  const good = response();
  await handler({ method: "GET", query: { middle: "정수기", models: "P3,P1,P2" } }, good);
  assert.equal(good.code, 200);
  assert.deepEqual(good.body.products.map((p) => p.id), ["P3", "P1", "P2"]);
  assert.equal(calls.filter((q) => q.includes("mimeType contains 'image/'")).length, 3);
  assert.ok(calls.every((q) => !q.includes("folder-OTHER")));
  assert.ok(good.body.products.every((p) => p.image.endsWith("fileId=first")));
  const count = calls.length;
  await handler({ method: "GET", query: { middle: "정수기", models: "P3,P1,P2" } }, response());
  assert.equal(calls.length, count);
});

test("a fresh sheet read refreshes an old legacy cache without changing legacy read policy", async () => {
  const previous = global.__sheetCache;
  global.__sheetCache = { dataCache: { 정수기: { ts: Date.now() - 600000, data: [{ price: "old" }] } }, pending: {}, sheetsClient: { spreadsheets: { values: { get: async () => ({ data: { values: [["price"], ["current"]] } }) } } } };
  try {
    const sheet = load("src/lib/sheet.ts", { googleapis: { google: {} } });
    assert.equal((await sheet.fetchSheetData("정수기"))[0].price, "old");
    assert.equal((await sheet.fetchSheetDataWithPolicy("정수기", { maxAgeMs: 300000, allowStale: false }))[0].price, "current");
  } finally { global.__sheetCache = previous; }
});
