const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    if (name in mocks) return mocks[name];
    if (name === "@/utils/voucher/calcVoucher") return load("src/utils/voucher/calcVoucher.ts");
    if (name === "react/jsx-runtime") return require(name);
    throw new Error(name);
  }, module, module.exports);
  return module.exports;
}
const lib = load("src/lib/renewalTest.ts");
const variant = { 계약기간: "72", 서비스유형: "기본", "서비스주기/월": "6개월", "프로모션 대분류": "신규", 프로모션유형: "일반(기본N)", 프로모션명: "긴 프로모션 상세 설명", 할인전금액: "50000", 할인후금액: "45000" };
const initialLine = () => lib.createLine(lib.normalizeProduct({ 모델코드: "P1", 상품명: "검증 제품", 중분류: "정수기", variants: [variant, { ...variant, 계약기간: "60", "프로모션 대분류": "재약정", "서비스주기/월": "12개월", 할인후금액: "40000" }] }));

function harness(editing = false) {
  const slots = []; let cursor = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (update) => { slots[index] = typeof update === "function" ? update(slots[index]) : update; }]; },
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useEffect() {}, useMemo(fn) { return fn(); },
  };
  const css = { default: Object.fromEntries(["primary", "optionCompleted", "paperProduct", "paperProductPrice", "paperProductImage", "paperPriceDetail", "paperBenefitPrice", "conditionTags", "compactQuoteRow"].map((name) => [name, name])) };
  const details = load("src/components/renewal-test/QuoteDetails.tsx", {
    "@/lib/renewalTest": lib, "./renewal.module.css": css, "./quotePresentation.module.css": css,
  });
  const controls = { RadioField: "RadioField", ListField: "ListField", SelectField: "SelectField", Accordion: "Accordion", CategoryRail: "CategoryRail" };
  const otherProduct = lib.normalizeProduct({ 모델코드: "P2", 상품명: "비교 제품", 중분류: "정수기", variants: [
    { ...variant, 서비스유형: "자가", "서비스주기/월": "12개월", 할인후금액: "38000" },
    { ...variant, 서비스유형: "자가", "서비스주기/월": "12개월", 계약기간: "60", 할인후금액: "36000" },
  ] });
  const dialogs = load("src/components/renewal-test/QuoteDialogs.tsx", {
    react: hooks, "react-dom": { createPortal: (element) => element }, "@/lib/renewalTest": lib, "@/hooks/useRenewalData": { useRenewalProducts: () => ({ products: [otherProduct], loading: false, error: "" }), loadRenewalProductOptions: async product => product },
    "@/lib/renewalVoucher": {}, "@/lib/voucherMaster": {}, "./Controls": controls,
    "./TestLayout": { Modal: "Modal", Icon: "Icon" }, "./renewal.module.css": css, "./quotePresentation.module.css": css,
    "./QuoteDetails": details, "./BenefitsDialog": {},
  });
  const initial = initialLine(); let applied;
  const Row = load("src/components/renewal-test/QuoteRow.tsx", { "@/lib/renewalTest": lib, "./QuoteDetails": details, "./TestLayout": { Icon: "Icon" }, "./renewal.module.css": css, "./quotePresentation.module.css": css }).default;
  const render = () => { cursor = 0; return dialogs.OptionWizard({ initial, lines: [], editing, onApply: (line) => { applied = line; }, onClose() {} }); };
  const renderCompare = () => { cursor = 0; return dialogs.CompareDialog({ line: initial, lines: [initial], onApply: (line) => { applied = line; }, onClose() {} }); };
  const renderPicker = (lines) => { cursor = 0; slots.length = 0; return dialogs.ProductPicker({ lines, onChoose: (product) => { applied = product; }, onClose() {} }); };
  const nodes = (element) => {
    if (!element || typeof element !== "object") return [];
    if (typeof element.type === "function") return [element, ...nodes(element.type(element.props))];
    const children = element.props?.children;
    return [element, ...(Array.isArray(children) ? children.flat(Infinity) : [children]).flatMap(nodes)];
  };
  const field = (tree, label) => nodes(tree).find((node) => ["RadioField", "SelectField", "ListField"].includes(node.type) && node.props.label === label);
  const action = (tree) => nodes(tree).find((node) => node.type === "button" && node.props.className === "primary");
  const renderPrint = (quote, settings = [true, true, true, false]) => {
    cursor = 0; slots.length = 0; settings.forEach((value, index) => { slots[index] = value; });
    const previous = global.document;
    global.document = { body: {} };
    try { return dialogs.PrintPreview({ quote, onClose() {} }); }
    finally { global.document = previous; }
  };
  return { initial, slots, render, renderCompare, renderPicker, renderPrint, renderRow: (line) => Row({ line, onEdit() {}, onCompare() {}, onDetails() {}, onRemove() {} }), field, action, nodes, applied: () => applied };
}

test("new subscription progressively reveals a single flow and applies the registered variant", () => {
  const h = harness(); let tree = h.render();
  assert.ok(h.field(tree, "가입 유형"));
  assert.equal(h.field(tree, "가입 유형").type, "RadioField");
  assert.equal(h.field(tree, "계약 기간"), undefined);
  assert.equal(h.action(tree).props.disabled, true);
  const choices = [["가입 유형", "신규"], ["계약 기간", "72"], ["관리 방식", "기본"], ["관리 주기", "6개월"], ["프로모션 유형", "일반(기본N)"], ["프로모션 상세", "긴 프로모션 상세 설명"]];
  for (let index = 0; index < choices.length; index++) {
    const [label, value] = choices[index];
    const current = h.field(tree, label);
    assert.equal(current.props.value, "__unselected__");
    current.props.onChange(value);
    tree = h.render();
    assert.equal(h.nodes(tree).filter((node) => node.props?.className === "optionCompleted").length, index + 1);
  }
  h.slots[3] = false; h.slots[6] = false; // Independent rate/voucher lookups have finished.
  tree = h.render();
  assert.equal(h.action(tree).props.disabled, false);
  h.action(tree).props.onClick();
  assert.equal(h.applied().selectedVariant["프로모션명"], variant["프로모션명"]);
  assert.equal(lib.lineTotals(h.applied()).monthly, 45000);
});

test("changing an earlier condition hides later choices and removes stale summary tags", () => {
  const h = harness(true); let tree = h.render();
  assert.equal(h.nodes(tree).filter((node) => node.props?.className === "optionCompleted").length, 6);
  h.nodes(tree).find((node) => node.props?.className === "optionCompleted").props.onClick();
  tree = h.render();
  h.field(tree, "가입 유형").props.onChange("재약정");
  tree = h.render();
  assert.deepEqual(h.field(tree, "계약 기간").props.options.map((option) => option.value), ["60"]);
  assert.equal(h.field(tree, "관리 방식"), undefined);
  assert.equal(h.action(tree).props.disabled, true);
  const tags = h.nodes(tree).filter((node) => node.type === "li").map((node) => node.props.children.join(""));
  assert.deepEqual(tags, ["#재약정유형"]);
});

test("long composite promotion labels remain compact without changing the stored option", () => {
  const line = initialLine();
  const raw = "일반(기본Y)|타사보상|타사보상일반(기본Y)";
  const composite = { ...line, selectedVariant: { ...line.selectedVariant, 프로모션유형: raw } };
  assert.ok(lib.selectedConditionTags(composite).includes("복합프로모션"));
  assert.equal(lib.promotionTypeLabel(raw), "일반(기본Y) · 타사보상 · 타사보상일반(기본Y)");
  assert.equal(composite.selectedVariant.프로모션유형, raw);
  assert.equal(lib.promotionTypeLabel("일반(기본Y)일반(기본Y)"), "일반(기본Y)");
});

test("condition tags use human-readable terms while long promotion names stay separate", () => {
  const line = initialLine();
  assert.deepEqual(lib.selectedConditionTags(line), ["신규유형", "6년계약", "기본관리", "6개월주기", "프로모션일반(기본N)", "선납없음"]);
  assert.deepEqual(lib.selectedConditionTags(line, 2), ["신규유형", "6년계약"]);
  assert.equal(lib.selectedConditionTags({ ...line, prepay: 30 }).at(-1), "30%선납");
  assert.ok(lib.selectedConditionTags(line).every((tag) => !tag.includes(variant.프로모션명)));
});

test("estimate rows and printed rows share tags while the PDF preserves the full promotion", () => {
  const h = harness();
  const line = { ...initialLine(), product: { ...initialLine().product, image: "/product.png" }, selectedVariant: { ...variant, 프로모션유형: "일반(기본Y)|타사보상|타사보상일반(기본Y)" } };
  const row = h.renderRow(line);
  const printed = h.renderPrint({ ...lib.emptyQuote(), lines: [line] });
  const tags = (tree) => h.nodes(tree).filter((node) => node.type === "li" && Array.isArray(node.props.children) && node.props.children[0] === "#").map((node) => node.props.children.join(""));
  assert.deepEqual(tags(row), tags(printed));
  assert.ok(tags(printed).includes("#복합프로모션"));
  const text = JSON.stringify(printed);
  assert.ok(text.includes("일반(기본Y) · 타사보상 · 타사보상일반(기본Y)"));
  assert.ok(text.includes(variant.프로모션명));
  assert.equal(h.nodes(printed).filter((node) => node.props?.className === "paperProduct").length, 1);
  assert.equal(h.nodes(printed).filter((node) => node.props?.className === "paperProductPrice").length, 1);
});

test("PDF image, discount, and card switches still control the compact rows", () => {
  const h = harness();
  const line = { ...initialLine(), product: { ...initialLine().product, image: "/product.png" }, card: { id: "card", issuer: "신한카드", discount: 10000, allowTeacher: false } };
  const quote = { ...lib.emptyQuote(), lines: [line] };
  const shown = h.renderPrint(quote);
  const hidden = h.renderPrint(quote, [false, false, false, false]);
  const count = (tree, name) => h.nodes(tree).filter((node) => node.props?.className === name).length;
  for (const name of ["paperProductImage", "paperPriceDetail", "paperBenefitPrice"]) {
    assert.equal(count(shown, name), 1);
    assert.equal(count(hidden, name), 0);
  }
  assert.ok(JSON.stringify(hidden).includes("45,000원"));
});

test("comparison edits all conditions in a separate draft and applies only on final confirmation", () => {
  const h = harness(); let tree = h.renderCompare();
  const findButton = (label) => h.nodes(tree).find((node) => node.type === "button" && node.props.children === label);
  findButton("세부 조건 변경").props.onClick();
  tree = h.renderCompare();
  assert.equal(tree.type.name, "OptionWizard");
  assert.equal(tree.props.applyLabel, "비교 조건 반영");
  const edited = lib.changeLineVariant(tree.props.initial, "프로모션 대분류", "재약정");
  tree.props.onApply(edited);
  tree = h.renderCompare();
  assert.equal(h.applied(), undefined);
  assert.equal(h.initial.signup, "신규");
  assert.ok(h.nodes(tree).some((node) => node.type === "li" && Array.isArray(node.props.children) && node.props.children[0] === "#"));
  h.action(tree).props.onClick();
  assert.equal(h.applied().signup, "재약정");
  assert.equal(h.applied().cycle, 12);
  assert.equal(h.applied().term, 60);
  assert.equal(lib.lineTotals(h.applied()).monthly, 40000);
});

test("other-product comparison retains edited options when switching tabs and supports canceling edits", async () => {
  const h = harness(); let tree = h.renderCompare();
  const button = (label) => h.nodes(tree).find((node) => node.type === "button" && node.props.children === label);
  button("다른 제품").props.onClick();
  tree = h.renderCompare();
  await h.field(tree, "비교할 제품").props.onChange("P2");
  tree = h.renderCompare();
  button("세부 조건 변경").props.onClick();
  tree = h.renderCompare();
  assert.equal(tree.props.initial.product.id, "P2");
  tree.props.onApply(lib.changeLineVariant(tree.props.initial, "계약기간", "60"));
  tree = h.renderCompare();
  button("같은 제품의 조건").props.onClick();
  tree = h.renderCompare();
  button("다른 제품").props.onClick();
  tree = h.renderCompare();
  button("세부 조건 변경").props.onClick();
  tree = h.renderCompare();
  assert.equal(tree.props.initial.term, 60);
  assert.equal(tree.props.initial.care, "자가");
  tree.props.onClose();
  tree = h.renderCompare();
  h.action(tree).props.onClick();
  assert.equal(h.applied().id, h.initial.id);
  assert.equal(h.applied().product.id, "P2");
  assert.equal(lib.lineTotals(h.applied()).monthly, 36000);
});

test("the product picker shows an explicit empty summary and the existing quote amount", async () => {
  const h = harness();
  const empty = h.renderPicker([]);
  const emptySummary = h.nodes(empty).find((node) => node.type === "aside" && node.props["aria-label"] === "현재 견적 요약");
  assert.ok(emptySummary);
  assert.ok(JSON.stringify(h.nodes(emptySummary)).includes("첫 제품을 선택해 주세요"));
  const populated = h.renderPicker([h.initial]);
  const summary = h.nodes(populated).find((node) => node.type === "aside" && node.props["aria-label"] === "현재 견적 요약");
  assert.ok(JSON.stringify(h.nodes(summary)).includes("45,000원"));
  const choose = h.nodes(populated).find((node) => node.type === "button" && node.props["aria-label"] === "비교 제품 구독 조건 선택");
  await choose.props.onClick();
  assert.equal(h.applied().id, "P2");
});

test("PDF totals include product vouchers and the same multi-product reward as the estimate", () => {
  const h = harness();
  const metadata = { voucherTotal: 100000, voucherMultiProductCount: 1, voucherMultiProductRule: { tiers: [{ minUnits: 2, rewardPerUnit: 50000 }] }, voucherCheckedAt: 1 };
  const lines = [{ ...h.initial, ...metadata }, { ...initialLine(), ...metadata }];
  const tree = h.renderPrint({ ...lib.emptyQuote(), lines });
  const text = JSON.stringify(h.nodes(tree));
  assert.ok(text.includes("다품목 상품권"));
  assert.ok(text.includes("100,000원"));
  assert.ok(text.includes("300,000원"));
  assert.equal(lib.quoteTotals(lines).voucher, 300000);
});
