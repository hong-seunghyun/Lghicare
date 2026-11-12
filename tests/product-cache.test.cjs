const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    if (name in mocks) return mocks[name];
    if (name === "@/lib/catalog/read") return { publishedRows: async () => null, catalogPointer: async () => ({ id: null, generation: "legacy" }) };
    if (name === "@/lib/catalog/publishedImages") return { publishedImageIndex: async () => null, imagePointer: async () => ({ categories: {} }), clearPublishedImages() {} };
    if (name === "@/lib/admin/requireAdmin") return { requireAdmin: async () => "admin", adminError: () => ({ status: 503, message: "failed" }) };
    if (name === "@/lib/renewalTest") return require("./helpers/ts-load.cjs")()("src/lib/renewalTest.ts");
    if (name.startsWith("node:")) return require(name);
    throw new Error("Unmocked dependency: " + name);
  }, module, module.exports);
  return module.exports;
}
const response = () => ({ headers: {}, code: 0, body: null,
  setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; },
});
const noRevision = { registerCacheInvalidator() {}, async syncProductCacheRevision() {} };
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("a shared reset invalidates another server, including dependent product lists", async () => {
  const document = {};
  const mocks = { "@/lib/firebaseAdmin": { initFirebaseAdmin: () => ({ doc: () => ({
    get: async () => ({ data: () => ({ ...document }) }),
    set: async (value) => Object.assign(document, value),
  }) }) } };
  delete global.__productCacheControl;
  const first = load("src/lib/productCacheControl.ts", mocks);
  let firstCleared = 0, secondCleared = 0, listsCleared = 0;
  first.registerCacheInvalidator("sheets", "sheets", () => firstCleared++);
  delete global.__productCacheControl;
  const second = load("src/lib/productCacheControl.ts", mocks);
  second.registerCacheInvalidator("sheets", "sheets", () => secondCleared++);
  second.registerCacheInvalidator("lists", "all", () => listsCleared++);
  await first.invalidateProductCaches("sheets");
  assert.equal(firstCleared, 1);
  assert.equal(secondCleared, 0);
  await second.syncProductCacheRevision();
  assert.equal(secondCleared, 1);
  assert.equal(listsCleared, 1);
  await second.syncProductCacheRevision();
  assert.equal(secondCleared, 1);
});

test("a failed shared reset is not reported or applied as a successful reset", async () => {
  delete global.__productCacheControl;
  const control = load("src/lib/productCacheControl.ts", { "@/lib/firebaseAdmin": { initFirebaseAdmin: () => ({ doc: () => ({ set: async () => { throw new Error("unavailable"); } }) }) } });
  let clears = 0;
  control.registerCacheInvalidator("sheets", "sheets", () => clears++);
  await assert.rejects(control.invalidateProductCaches("all"), /unavailable/);
  assert.equal(clears, 0);
});

test("reset during a sheet request cannot restore old rows or delete a new pending request", async () => {
  let finishOld, finishNew;
  const replies = [new Promise((resolve) => { finishOld = resolve; }), new Promise((resolve) => { finishNew = resolve; })];
  let calls = 0;
  global.__sheetCache = { dataCache: {}, pending: {}, sheetsClient: { spreadsheets: { values: { get: () => replies[calls++] } } } };
  const sheet = load("src/lib/sheet.ts", { googleapis: { google: {} }, "@/lib/productCacheControl": noRevision });
  const old = sheet.fetchSheetData("정수기");
  await flush();
  sheet.clearSheetCache();
  const current = sheet.fetchSheetData("정수기");
  await flush();
  const pending = global.__sheetCache.pending.정수기;
  finishOld({ data: { values: [["price"], ["old"]] } });
  await old;
  assert.equal(global.__sheetCache.dataCache.정수기, undefined);
  assert.equal(global.__sheetCache.pending.정수기, pending);
  finishNew({ data: { values: [["price"], ["new"]] } });
  await current;
  assert.equal(global.__sheetCache.dataCache.정수기.data[0].price, "new");
});

test("force-refresh bypasses valid sheet rows and refresh failures cannot count as warmup success", async () => {
  let calls = 0;
  global.__sheetCache = { dataCache: { 정수기: { ts: Date.now(), data: [{ price: "old" }] } }, pending: {}, sheetsClient: { spreadsheets: { values: { get: async () => {
    calls++;
    if (calls === 2) throw new Error("offline");
    return { data: { values: [["price"], ["new"]] } };
  } } } } };
  const sheet = load("src/lib/sheet.ts", { googleapis: { google: {} }, "@/lib/productCacheControl": noRevision });
  assert.equal((await sheet.fetchSheetData("정수기"))[0].price, "old");
  assert.equal(calls, 0);
  assert.equal((await sheet.fetchSheetDataWithPolicy("정수기", { forceRefresh: true, allowStale: false }))[0].price, "new");
  await assert.rejects(sheet.fetchSheetDataWithPolicy("정수기", { forceRefresh: true, allowStale: false }), /no cache/);
  assert.equal(calls, 2);
});

test("product detail retries missing cached models against fresh sheets and never caches 404s", async () => {
  delete global.__productListCache;
  const utils = load("src/lib/utils.ts");
  let refreshes = 0;
  const row = { 모델코드: "usp_wd522mh", 중분류: "정수기", 상품명: "QR 정수기 제품" };
  const handler = load("src/pages/api/products.ts", {
    "@/lib/sheet": { fetchSheetData: async () => [], fetchSheetDataWithPolicy: async (_, policy) => {
      assert.equal(policy.forceRefresh, true); assert.equal(policy.allowStale, false); refreshes++;
      return refreshes === 1 ? [row] : [];
    } },
    "@/lib/productImageCache": { getProductImageCache: async () => null },
    "@/lib/productCacheControl": noRevision, "@/lib/utils": utils,
  }).default;
  const good = response();
  await handler({ query: { middle: "정수기", id: "usp_wd522mh" } }, good);
  assert.equal(good.code, 200); assert.equal(good.body.options[0].모델코드, row.모델코드);
  const missing = response();
  await handler({ query: { middle: "정수기", id: "missing" } }, missing);
  assert.equal(missing.code, 404); assert.equal(missing.headers["Cache-Control"], "no-store");
});

test("warmup reports each failed resource and requires fresh data", async () => {
  let resets = 0;
  const handler = load("src/pages/api/admin/warmup.ts", {
    "@/lib/sheet": { fetchSheetDataWithPolicy: async (_, policy) => { assert.equal(policy.forceRefresh, true); assert.equal(policy.allowStale, false); } },
    "@/lib/productImageCache": { PRODUCT_CATEGORIES: ["정수기"], getProductImageCache: async (_, fresh) => { assert.equal(fresh, true); return null; } },
    "@/lib/productCacheControl": { invalidateProductCaches: async () => resets++ }, "@/lib/drive": {},
  }).default;
  const partial = response();
  await handler({ method: "POST", query: { target: "all" }, body: { category: "정수기" } }, partial);
  assert.equal(resets, 1); assert.equal(partial.code, 207); assert.equal(partial.body.ok, false);
  assert.deepEqual(partial.body.warmedSheets, ["정수기"]); assert.deepEqual(partial.body.warmedDrive, []);
  assert.deepEqual(partial.body.failed.map((f) => f.target), ["drive"]);
  const bad = response();
  await handler({ method: "POST", query: { target: "unknown" }, body: {} }, bad);
  assert.equal(bad.code, 400); assert.equal(resets, 1);
  const repeated = response();
  await handler({ method: "POST", query: { target: ["all"] }, body: {} }, repeated);
  assert.equal(repeated.code, 400); assert.equal(resets, 1);
});

test("image cache follows Drive pages, sorts numerically, and shares in-flight reads", async () => {
  delete global.__productImages;
  const calls = [];
  const image = load("src/lib/productImageCache.ts", {
    googleapis: { google: { auth: { GoogleAuth: class {} }, drive: () => ({ files: { list: async ({ q, pageToken }) => {
      calls.push({ q, pageToken });
      if (q.includes("name = '정수기'")) return { data: { files: [{ id: "root" }] } };
      if (q.includes("'root'")) return { data: { files: [{ id: "model", name: "P1" }] } };
      if (!pageToken) return { data: { files: [{ id: "ten", name: "10.jpg" }], nextPageToken: "next" } };
      return { data: { files: [{ id: "two", name: "2.jpg" }] } };
    } } }) } },
    "@/lib/productCacheControl": noRevision, "@/lib/utils": load("src/lib/utils.ts"),
  });
  const [a, b] = await Promise.all([image.getProductImageCache("정수기"), image.getProductImageCache("정수기")]);
  assert.strictEqual(a, b); assert.equal(calls.length, 4);
  assert.deepEqual(a.imageIndex.P1, ["/api/image-proxy?fileId=two", "/api/image-proxy?fileId=ten"]);
});

test("only the explicitly declared model group can supply a missing product image", async () => {
  delete global.__productListCache;
  const row = { 모델코드: "M626GBB032", 동일모델기준: "M626GBB032S", 중분류: "냉장고", 계약기간: "72" };
  const handler = load("src/pages/api/products.ts", {
    "@/lib/sheet": { fetchSheetData: async () => [row] },
    "@/lib/productImageCache": { getProductImageCache: async () => ({ imageIndex: { M626GBB032S: ["/api/image-proxy?fileId=declared-group"] } }) },
    "@/lib/productCacheControl": noRevision, "@/lib/utils": load("src/lib/utils.ts"),
  }).default;
  for (const query of [{ middle: "냉장고", id: row.모델코드 }, { middle: "냉장고", models: row.모델코드, groupBy: "modelCode" }]) {
    const result = response();
    await handler({ query }, result);
    assert.equal(result.code, 200);
    assert.equal(result.body.options[0].모델코드, row.모델코드);
    assert.equal(result.body.options[0].thumbnailUrl, "/api/image-proxy?fileId=declared-group");
    if (query.id) assert.deepEqual(result.body.options[0].images, ["/api/image-proxy?fileId=declared-group"]);
  }
});
