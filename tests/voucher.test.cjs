const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, "../src/utils/voucher/calcVoucher.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;
const voucherModule = { exports: {} };
new Function("module", "exports", source)(voucherModule, voucherModule.exports);
const { calcMultiProductVoucher, isValidMultiProductCount, normalizeMultiProductCount } = voucherModule.exports;

// 운영 규칙과 오류 데이터: 인정 대수 50,000 × 대당 300,000원 = 150억 원.
const voucherRules = {
  multiProductRule: {
    tiers: [
      { minUnits: 2, maxUnits: 2, rewardPerUnit: 100000 },
      { minUnits: 3, maxUnits: 3, rewardPerUnit: 150000 },
      { minUnits: 4, maxUnits: 4, rewardPerUnit: 200000 },
      { minUnits: 5, maxUnits: 5, rewardPerUnit: 250000 },
      { minUnits: 6, maxUnits: null, rewardPerUnit: 300000 },
    ],
    rounding: "floor",
  },
};
const product = (count, extra = {}) => ({ modelCode: "W826SVV482S", multiProductCount: count, ...extra });
const calculate = (products, rules = voucherRules) => calcMultiProductVoucher({ voucherRules: rules, products });

test("금액이 인정 대수에 들어가도 150억 원 상품권을 지급하지 않는다", () => {
  const result = calculate([product(50000)]);
  assert.equal(result.total, 0);
  assert.equal(result.perUnitReward, 0);
  assert.equal(result.totalUnits, 0);
  assert.equal(result.eligibleUnits, 0);
});

test("상품별 인정 대수는 0~1 범위의 유한한 숫자만 허용한다", () => {
  for (const value of [0, 0.5, 1, "0.5", "1"]) {
    assert.equal(isValidMultiProductCount(value), true);
    assert.equal(normalizeMultiProductCount(value), Number(value));
  }
  for (const value of [50000, "50000", -1, 1.1, Infinity, NaN, "invalid", true, {}, []]) {
    assert.equal(isValidMultiProductCount(value), false);
    assert.equal(normalizeMultiProductCount(value), 0);
  }
  for (const value of [null, undefined, ""]) {
    assert.equal(normalizeMultiProductCount(value), 0);
  }
});

test("정상 대수는 기존 지급 구간을 유지한다", () => {
  assert.equal(calculate([product(1)]).total, 0);
  for (const [units, reward] of [[2, 100000], [3, 150000], [4, 200000], [5, 250000], [6, 300000]]) {
    const result = calculate(Array.from({ length: units }, () => product(1)));
    assert.equal(result.total, units * reward);
    assert.equal(result.perUnitReward, reward);
    assert.equal(result.totalUnits, units);
  }
});

test("오류 대수가 정상 상품의 지급 구간을 부풀리지 않는다", () => {
  const result = calculate([product(50000), product(1), product(1)]);
  assert.equal(result.total, 200000);
  assert.equal(result.perUnitReward, 100000);
  assert.equal(result.totalUnits, 2);
});

test("0.5대 인정과 대수만 인정하는 상품의 예외를 유지한다", () => {
  const result = calculate([product(0.5), product(0.5), product(1, { multiProductCountOnly: true, multiProductNote: "상품권 미적용" })]);
  assert.equal(result.totalUnits, 2);
  assert.equal(result.eligibleUnits, 1);
  assert.equal(result.total, 100000);
  assert.equal(result.details[1].amount, 0);
  assert.match(result.details[1].reason, /1대는 상품권 미적용/);
});

test("잘못된 값과 비어 있는 규칙은 금액을 발생시키지 않는다", () => {
  for (const value of [-1, Infinity, NaN, "invalid", undefined]) {
    assert.equal(calculate([product(value)]).total, 0);
  }
  assert.equal(calculate([product(1)], {}).total, 0);
});

// 컴포넌트 내부 핸들러를 추출해 UI/Firestore 연결 없이 쓰기 전 검증을 실행한다.
function loadAdminHandler(name, bindings) {
  const file = ts.createSourceFile("voucher.tsx", fs.readFileSync(path.join(__dirname, "../src/pages/admin/voucher.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(initializer, `Missing handler: ${name}`);
  const compiled = ts.transpileModule(`const handler = ${initializer.getText(file)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(bindings), `${compiled}\nreturn handler;`)(...Object.values(bindings));
}

test("모든 JSON 형식에서 오류 대수를 규칙 삭제와 상품 저장 전에 차단한다", async () => {
  const models = Object.fromEntries(Array.from({ length: 401 }, (_, i) => [`P${i}`, { multiProductCount: 1 }]));
  models.W826SVV482S = { multiProductCount: 50000 };
  const alerts = [];
  let writes = 0;
  const handler = loadAdminHandler("importJsonData", {
    isValidMultiProductCount,
    alert: (message) => alerts.push(message),
    db: {},
    RULES_COLLECTION: "voucherRules",
    RULES_DOC_ID: "current",
    doc: () => ({}),
    deleteDoc: async () => { writes++; },
    setDoc: async () => { writes++; },
    writeBatch: () => { writes++; throw new Error("Unexpected batch"); },
  });
  for (const data of [
    { rules: {}, models },
    { products: models },
    { baseDefaultKeyword: "기본", models },
    { products: { W826SVV482S: { multiProduct: { recognizedUnits: 50000 } } } },
  ]) {
    assert.equal(await handler(data), false);
    assert.match(alerts.at(-1), /W826SVV482S.*0~1대/);
    assert.equal(writes, 0);
  }
});

test("관리자 개별 저장도 오류 대수를 쓰기 전에 차단한다", async () => {
  const alerts = [];
  const handler = loadAdminHandler("saveModel", {
    editing: { modelCode: "W826SVV482S", multiProductCount: 50000 },
    isValidMultiProductCount,
    alert: (message) => alerts.push(message),
    setSavingModel: () => { throw new Error("Invalid count reached save"); },
  });
  await handler();
  assert.match(alerts[0], /0~1대/);
});

test("견적 비교의 상품별 표시도 오류 대수를 다시 곱하지 않는다", () => {
  const file = ts.createSourceFile("EstimateModal.tsx", fs.readFileSync(path.join(__dirname, "../src/components/Modal/EstimateModal.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "getProductMultiProductReward");
  assert.ok(declaration);
  const compiled = ts.transpileModule(declaration.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const reward = new Function("normalizeMultiProductCount", `${compiled}\nreturn getProductMultiProductReward;`)(normalizeMultiProductCount);
  assert.equal(reward({ voucherMultiProductCount: 50000 }, { total: 200000, perUnitReward: 100000 }).amount, 0);
  assert.equal(reward({ voucherMultiProductCount: 1 }, { total: 200000, perUnitReward: 100000 }).amount, 100000);
  assert.equal(reward({ voucherMultiProductCount: 1 }, { total: 0, perUnitReward: 100000 }).amount, 0);
  assert.equal(reward({ voucherMultiProductCount: 1, voucherMultiProductCountOnly: true }, { total: 100000, perUnitReward: 100000 }).amount, 0);
});
