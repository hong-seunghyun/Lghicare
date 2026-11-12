const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
function load(file, mocks = {}, fetcher = global.fetch) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", code)((name) => {
    if (name in mocks) return mocks[name];
    if (name === "@/utils/voucher/calcVoucher") return load("src/utils/voucher/calcVoucher.ts");
    throw Error(name);
  }, module, module.exports, fetcher);
  return module.exports;
}
const lib = load("src/lib/renewalTest.ts");
const variant = { 계약기간: "72", 서비스유형: "기본", "서비스주기/월": "6개월", "프로모션 대분류": "신규", 프로모션유형: "기본", 프로모션명: "등록 할인", 할인전금액: "50000", 할인후금액: "45000" };
const line = () => lib.createLine(lib.normalizeProduct({ 모델코드: "P1", 상품명: "검증 상품", 중분류: "정수기", variants: [variant] }));
const rule = { tiers: [{ minUnits: 2, maxUnits: 2, rewardPerUnit: 50000 }, { minUnits: 3, maxUnits: null, rewardPerUnit: 100000 }], rounding: "floor" };
const metadata = { voucherTotal: 100000, voucherMultiProductCount: 1, voucherMultiProductRule: rule, voucherCheckedAt: 1 };

test("renewal uses the existing multi-product rules without adding vouchers to monthly prices", () => {
  const one = { ...line(), ...metadata };
  const two = { ...line(), ...metadata };
  const totals = lib.quoteTotals([one, two]);
  assert.equal(totals.productVoucher, 200000);
  assert.equal(totals.multiProductVoucher, 100000);
  assert.equal(totals.voucher, 300000);
  assert.equal(totals.monthly, 90000);
  assert.equal(lib.quoteTotals([one]).multiProductVoucher, 0);
  assert.equal(lib.quoteTotals([{ ...one, quantity: 3 }]).multiProductVoucher, 300000);
});

test("count-only exclusions, bad counts, newest rules, and removed rules match legacy behavior", () => {
  const one = { ...line(), ...metadata };
  const excluded = { ...line(), ...metadata, voucherTotal: 0, voucherMultiProductCountOnly: true };
  assert.equal(lib.quoteTotals([one, excluded]).multiProductVoucher, 50000);
  assert.equal(lib.quoteTotals([one, { ...excluded, voucherMultiProductCount: 50000 }]).multiProductVoucher, 0);
  const changed = { ...one, id: "changed", voucherCheckedAt: 2, voucherMultiProductRule: { tiers: [{ minUnits: 2, rewardPerUnit: 60000 }] } };
  assert.equal(lib.quoteTotals([one, changed]).multiProductVoucher, 120000);
  assert.equal(lib.quoteTotals([one, { ...changed, voucherMultiProductRule: undefined }]).multiProductVoucher, 0);
  assert.equal(lib.quoteTotals([line(), line()]).multiProductVoucher, 0);
});

test("voucher metadata survives save/restore and is cleared before new conditions are resolved", () => {
  const product = { ...line().product, variants: [variant, { ...variant, 계약기간: "60" }] };
  const selected = { ...lib.createLine(product), ...metadata };
  const quote = JSON.parse(JSON.stringify({ ...lib.emptyQuote("owner"), lines: [selected] }));
  assert.equal(lib.isPreviewQuote(quote), true);
  assert.equal(quote.lines[0].voucherMultiProductCount, 1);
  const changed = lib.changeLineVariant(selected, "계약기간", "60");
  assert.equal(changed.voucherTotal, undefined);
  assert.equal(changed.voucherMultiProductRule, undefined);
  assert.equal(changed.voucherCheckedAt, undefined);
});

test("per-product resolution preserves the configured count-only flag and product amounts", async () => {
  const rules = { multiProductRule: rule };
  const resolver = load("src/lib/renewalVoucher.ts", { "@/lib/voucherMaster": {
    fetchVoucherData: async () => ({ rules, model: { modelCode: "P1", base: { default: 100000, combine_new_existing: 150000, resubscribe: 50000 }, serviceCycle: { "6개월": 20000 }, promo: {}, multiProductCount: 0.5, multiProductExcludeVoucher: true } }),
  } });
  const result = await resolver.resolveRenewalVoucher(line());
  assert.equal(result.voucherTotal, 120000);
  assert.equal(result.voucherMultiProductCount, 0.5);
  assert.equal(result.voucherMultiProductCountOnly, true);
  assert.deepEqual(result.voucherMultiProductRule, rule);
});

test("a missing voucher model produces zero product vouchers but retains shared multi-product rules", async () => {
  const resolver = load("src/lib/renewalVoucher.ts", { "@/lib/voucherMaster": { fetchVoucherData: async () => ({ rules: { multiProductRule: rule }, model: null }) } });
  const result = await resolver.resolveRenewalVoucher(line());
  assert.equal(result.voucherTotal, 0);
  assert.equal(result.voucherMultiProductCount, 0);
  assert.deepEqual(result.voucherMultiProductRule, rule);
});

test("older active quotes gain missing multi-product metadata without changing saved prices or product vouchers", () => {
  const resolver = load("src/lib/renewalVoucher.ts", { "@/lib/voucherMaster": {} });
  const original = { ...line(), voucherTotal: 0, voucherDetails: [] };
  const updated = resolver.backfillRenewalVoucher(original, {
    ...metadata, voucherDetails: [{ type: "현재 규칙", amount: 100000, reason: "테스트" }], voucherMultiProductCountOnly: false, voucherMultiProductNote: undefined,
  });
  assert.equal(updated.voucherTotal, 0);
  assert.deepEqual(updated.voucherDetails, []);
  assert.equal(updated.selectedVariant, original.selectedVariant);
  assert.equal(lib.lineTotals(updated).monthly, lib.lineTotals(original).monthly);
  assert.equal(updated.voucherMultiProductCount, 1);
  assert.equal(lib.quoteTotals([updated, { ...updated, id: "second" }]).voucher, 100000);
});

function masterLoader(getDoc) {
  return load("src/lib/voucherMaster.ts", {}, async url => {
    const model = new URL(url, "https://test.invalid").searchParams.get("model");
    const snapshot = await getDoc({ collection: model ? "voucherModels" : "voucherRules", id: model || "current" });
    return { ok: true, json: async () => ({ rules: model ? {} : snapshot.exists() ? snapshot.data() : null, model: model && snapshot.exists() ? snapshot.data() : null, version: "legacy" }) };
  });
}
test("failed voucher reads are retryable and concurrent requests share the same read", async () => {
  let rulesCalls = 0, modelCalls = 0;
  const master = masterLoader(async ({ collection }) => {
    const attempt = collection === "voucherRules" ? ++rulesCalls : ++modelCalls;
    if (attempt === 1) throw Error("offline");
    return { exists: () => true, data: () => ({ version: 2 }) };
  });
  await assert.rejects(master.fetchVoucherRules(), /offline/);
  await assert.rejects(master.fetchVoucherModel("P1"), /offline/);
  await Promise.all([master.fetchVoucherRules(), master.fetchVoucherRules(), master.fetchVoucherModel("P1"), master.fetchVoucherModel("P1")]);
  assert.equal(rulesCalls, 2);
  assert.equal(modelCalls, 2);
});

test("voucher rules expire after one minute and missing models are checked again after fifteen seconds", async () => {
  const originalNow = Date.now;
  let now = 100000, rulesCalls = 0, modelCalls = 0;
  Date.now = () => now;
  try {
    const master = masterLoader(async ({ collection }) => {
      if (collection === "voucherRules") return { exists: () => true, data: () => ({ version: ++rulesCalls }) };
      modelCalls++;
      return { exists: () => modelCalls > 1, data: () => ({ modelCode: "P1" }) };
    });
    assert.equal((await master.fetchVoucherRules()).version, 1);
    assert.equal(await master.fetchVoucherModel("P1"), null);
    now += 16000;
    assert.equal((await master.fetchVoucherModel("P1")).modelCode, "P1");
    assert.equal((await master.fetchVoucherRules()).version, 1);
    now += 45000;
    assert.equal((await master.fetchVoucherRules()).version, 2);
  } finally { Date.now = originalNow; }
});
