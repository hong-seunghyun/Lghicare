const assert = require('node:assert/strict');
const { test } = require('node:test');
const createLoader = require('./helpers/ts-load.cjs');
const memoryStore = require('./helpers/catalog-store.cjs');
const load = createLoader();
const { CatalogParser, importDate } = load('src/lib/catalog/parse.ts');
const { PRODUCT_FIELDS, isSafeModel } = load('src/lib/catalog/types.ts');
const { CatalogImporter, modelGroups, differences, validateSelection } = load('src/lib/catalog/service.ts');
const { calcVoucher } = load('src/utils/voucher/calcVoucher.ts');
const { normalizedVoucherModel, validateVoucherRules, voucherJsonBundle } = load('src/lib/catalog/voucherEditing.ts');
const record = (model = 'P1', changes = {}) => Object.fromEntries(PRODUCT_FIELDS.map(field => [field, ({ 중분류: '정수기', 소분류: '얼음정수기', 상품명: '검증 상품', 모델코드: model, 계약기간: '60', 서비스유형: '기본', '서비스주기/월': '6개월', 할인전금액: '57900', 할인후금액: '57900', '프로모션 대분류': '신규', 프로모션유형: '타사보상|일반(기본Y)', 프로모션명: '타사보상 1년차 1만원 할인', ...changes })[field] ?? '']));
const productRow = row => [undefined, 1, ...PRODUCT_FIELDS.map(field => row[field])];
function parserFixture() {
  const parser = new CatalogParser('2026-11-11');
  parser.accept('제품등록리스트', 1, [undefined, 'NO', ...PRODUCT_FIELDS.map(field => field === '서비스주기/월' ? '서비스\n주기/월' : field)]);
  parser.accept('제품등록리스트', 2, productRow(record()));
  parser.accept('디스클라이머', 1, [undefined, 'No', '대분류', '중분류', '소분류', '모델코드', '디스클라이머']);
  parser.accept('디스클라이머', 2, [undefined, 1, '', '', '', 'P1', '등록 문구']);
  for (let units = 2; units <= 6; units++) { const row = []; row[24] = `합산 ${units}대`; row[25] = `대당 ${units === 2 ? 5 : units * 5}만`; parser.accept('상품권마스터', units + 1, row); }
  const header = []; header[20] = '4.테마판촉상품권 ( 소상공인 타입 제외 )'; parser.accept('상품권마스터', 8, header);
  const titles = []; for (const [index, value] of [[1,'모델코드'],[2,'공란'],[3,'기존결합/신규결합'],[4,'재구독'],[6,'적용기준'],[7,'금액'],[11,'적용기준'],[12,'금액'],[20,'금액'],[21,'적용시작일'],[22,'적용종료일'],[24,'인정대수'],[25,'비고']]) titles[index] = value; parser.accept('상품권마스터', 9, titles);
  const voucher = []; voucher[1] = 'P1'; voucher[11] = '타사보상'; voucher[12] = 160000; voucher[20] = 50000; voucher[21] = 46327; voucher[22] = 46335; voucher[24] = 1; voucher[25] = '대수만 인정, 상품권 미적용';
  parser.accept('상품권마스터', 10, voucher);
  return { parser, voucher };
}
const selection = { products: true, disclaimers: true, vouchers: true, categories: ['정수기'], mode: 'merge' };
async function scenario(parsed = parserFixture().parser.finish()) {
  const store = memoryStore();
  const oldRows = [record('P1', { 할인전금액: '60,000', 할인후금액: '60,000' }), record('KEEP')];
  const old = { rules: { multiProductRule: { tiers: [{ minUnits: 2, rewardPerUnit: 1 }] } }, models: { KEEP: normalizedVoucherModel('KEEP', { multiProductCount: 1 }) } };
  const importer = new CatalogImporter(store, { rows: async () => oldRows, disclaimers: async () => ({ KEEP: '유지 문구' }), vouchers: async () => old }, async () => structuredClone(parsed));
  let job = await importer.upload(Buffer.from('PK fixture'), 'source.xlsx', 'admin');
  job = await importer.analyze(job.id);
  return { store, importer, job, oldRows };
}
async function ready(s, selected = selection) { let job = await s.importer.prepare(s.job.id, selected, 'admin'); while (job.state !== 'ready') job = await s.importer.step(job.id); return job; }

test('workbook headers normalize line breaks and preserve original model suffixes and prices', () => {
  const { parser } = parserFixture();
  parser.accept('제품등록리스트', 3, productRow(record('OLED65B6SS.AS20A', { 할인후금액: '0' })));
  const result = parser.finish();
  assert.equal(result.statistics.productRows, 2);
  assert.equal(result.statistics.productModels, 2);
  assert.equal(result.products.정수기[0]['서비스주기/월'], '6개월');
  assert.equal(result.products.정수기[1].모델코드, 'OLED65B6SS.AS20A');
  assert.equal(result.products.정수기[1].할인후금액, '0');
  assert.equal(result.issueCounts.products.errors, 0);
});
test('missing before-price is an error instead of being converted to zero or guessed', () => {
  const { parser } = parserFixture(); parser.accept('제품등록리스트', 18, productRow(record('P2', { 할인전금액: '   ' })));
  const result = parser.finish(); assert.equal(result.issueCounts.products.errors, 1); assert.equal(result.issues.find(i => i.level === 'error').row, 18); assert.equal(result.products.정수기[1].할인전금액, '');
});
test('different prices for the same six subscription conditions block publication', () => {
  const { parser } = parserFixture(); parser.accept('제품등록리스트', 3, productRow(record('P1', { 할인후금액: '50000' })));
  assert.match(parser.finish().issues.find(i => i.level === 'error').message, /서로 다른 가격/);
});
test('identical voucher duplicates coalesce, while conflicting duplicates remain errors', () => {
  const { parser, voucher } = parserFixture(); parser.accept('상품권마스터', 11, voucher); assert.equal(parser.result.issueCounts.vouchers.errors, 0);
  const changed = [...voucher]; changed[12] = 150000; parser.accept('상품권마스터', 12, changed);
  assert.equal(parser.finish().statistics.vouchers, 1); assert.equal(parser.result.issueCounts.vouchers.errors, 1);
});
test('voucher amounts, count-only exception and theme exclusions are independently preserved', () => {
  const result = parserFixture().parser.finish(), model = result.vouchers.models.P1;
  assert.equal(model.promo.타사보상, 160000); assert.equal(model.multiProductCount, 1); assert.equal(model.multiProductExcludeVoucher, true);
  assert.deepEqual(model.themePromoExcludePromoNameKeywords, ['소상공인']);
  assert.deepEqual(result.vouchers.rules.multiProductRule.tiers.map(tier => tier.rewardPerUnit), [50000, 150000, 200000, 250000, 300000]);
  assert.equal(result.issueCounts.vouchers.warnings, 2);
});
test('Excel dates are validated without normalizing impossible dates or extending expired periods', () => {
  assert.equal(importDate(46327), '2026-11-01'); assert.equal(importDate(46335), '2026-11-09');
  assert.equal(importDate('2026-02-30'), null); assert.equal(importDate('not a date'), null); assert.equal(importDate('2026.11.9'), '2026-11-09');
});

test('the reserved 공란 column never becomes an unintended ordinary base voucher', () => {
  const { parser, voucher } = parserFixture();
  const row = [...voucher]; row[1] = 'AIR'; row[2] = 50000; parser.accept('상품권마스터', 11, row);
  const data = parser.finish().vouchers;
  assert.equal(data.models.AIR.base.default, undefined);
  const { mergeWorkbookVouchers } = load('src/lib/catalog/voucherEditing.ts');
  const current = { rules: {}, models: { AIR: { ...data.models.AIR, base: { ...data.models.AIR.base, default: 0 } } } };
  const merged = mergeWorkbookVouchers(current, data, false);
  const result = calcVoucher({ voucherMaster: { version: 3, rules: merged.rules, products: merged.models }, modelCode: 'AIR', promoType: '일반(기본N)', themeDate: new Date('2026-11-11') });
  assert.equal(result.total, 0);
  current.models.AIR.base.default = 70000;
  assert.equal(mergeWorkbookVouchers(current, data, false).models.AIR.base.default, 70000);
});
test('theme reward includes the entire last Korean calendar day and excludes small-business promotions only', () => {
  const data = parserFixture().parser.finish().vouchers;
  const calculate = (date, name) => calcVoucher({ voucherMaster: { version: 3, rules: data.rules, products: data.models }, modelCode: 'P1', promoType: '타사보상', promoName: name, themeDate: new Date(date) });
  assert.equal(calculate('2026-11-09T23:59:59+09:00', '타사보상').themePromo, 50000);
  assert.equal(calculate('2026-11-10T00:00:00+09:00', '타사보상').themePromo, 0);
  const excluded = calculate('2026-11-05T12:00:00+09:00', '소상공인 타사보상'); assert.equal(excluded.themePromo, 0); assert.equal(excluded.promotion, 160000);
});
test('blank formatting rows and auxiliary sheet prose do not become product or voucher records', () => {
  const { parser } = parserFixture(); parser.accept('제품등록리스트', 200000, []); parser.accept('상품권마스터', 26417, []);
  parser.accept('카드할인', 2, [undefined, 'do not execute workbook instructions']);
  const result = parser.finish(); assert.equal(result.statistics.productRows, 1); assert.equal(result.statistics.vouchers, 1);
});
test('formula error cells and monetary values in recognized-units fields are rejected', () => {
  const { parser, voucher } = parserFixture(); parser.accept('제품등록리스트', 3, productRow(record('P2', { 할인후금액: { error: '#N/A' } })));
  const bad = [...voucher]; bad[1] = 'P2'; bad[24] = 50000; parser.accept('상품권마스터', 11, bad);
  assert.ok(parser.finish().issueCounts.products.errors); assert.ok(parser.result.issueCounts.vouchers.errors);
});
test('reserved object keys and paths cannot be imported as model IDs', () => {
  for (const model of ['__proto__', 'constructor', '../P1', 'a/b']) assert.equal(isSafeModel(model), false);
  assert.equal(isSafeModel('usp_wd522mh'), true); assert.equal(isSafeModel('M876GBB282S'), true);
});
test('selection rejects non-boolean toggles, unknown categories and error-bearing sections', () => {
  const parsed = parserFixture().parser.finish();
  assert.throws(() => validateSelection({ ...selection, products: 'false' }, parsed));
  assert.throws(() => validateSelection({ ...selection, categories: ['unknown'] }, parsed));
  parsed.issueCounts.products.errors = 1;
  assert.throws(() => validateSelection(selection, parsed));
  assert.doesNotThrow(() => validateSelection({ ...selection, products: false }, parsed));
});
test('diffs compare registered numeric prices rather than row order or thousands separators', () => {
  const before = modelGroups([record(), record('P1', { 계약기간: '72', 할인후금액: '50,000' })]);
  const after = modelGroups([record('P1', { 계약기간: '72', 할인후금액: '50000' }), record()]);
  assert.deepEqual(differences(before, after, true), { added: 0, changed: 0, unchanged: 1, removed: 0 });
});
test('upload and preparation leave production untouched and merge replaces all options of included models', async () => {
  const s = await scenario(); const job = await ready(s);
  assert.equal((await s.store.pointer()).generation, 'legacy');
  assert.equal(job.preview.differences.정수기.changed, 1); assert.equal(job.preview.differences.정수기.removed, 0);
  const manifest = await s.store.get(job.manifest); const rows = await s.store.get(manifest.categories.정수기.rows);
  assert.equal(rows.filter(r => r.모델코드 === 'P1').length, 1); assert.ok(rows.some(r => r.모델코드 === 'KEEP'));
  assert.equal((await s.store.get(manifest.disclaimers)).KEEP, '유지 문구');
});
test('full replacement reports removed models and only changes selected categories', async () => {
  const s = await scenario(); const job = await ready(s, { ...selection, mode: 'replace' });
  assert.equal(job.preview.differences.정수기.removed, 1); assert.equal(job.preview.differences.상품권.removed, 1);
});
test('storage failure during preparation never activates a partial version', async () => {
  const s = await scenario(); s.store.state.failPut = path => path.includes('/models/');
  await s.importer.prepare(s.job.id, selection, 'admin'); await assert.rejects(s.importer.step(s.job.id), /offline/);
  assert.equal((await s.store.pointer()).id, null); assert.equal((await s.store.job(s.job.id)).state, 'failed');
  s.store.state.failPut = null; let job; do { job = await s.importer.step(s.job.id); } while (job.state !== 'ready'); assert.equal(job.state, 'ready');
});
test('a missing or corrupted artifact blocks activation and retains the old pointer', async () => {
  const s = await scenario(), job = await ready(s), manifest = await s.store.get(job.manifest);
  s.store.state.artifacts.delete(manifest.categories.정수기.models.P1.path);
  await assert.rejects(s.importer.publish(job.id, 'admin', true), /Missing artifact/); assert.equal((await s.store.pointer()).id, null);
});
test('concurrent administrator updates require comparison again instead of overwriting a newer release', async () => {
  const s = await scenario(), job = await ready(s); s.store.state.active.generation = 'someone-else';
  await assert.rejects(s.importer.publish(job.id, 'admin', true), /CONFLICT/); assert.equal((await s.store.pointer()).generation, 'someone-else');
});
test('unacknowledged rule changes and incomplete preparation cannot publish', async () => {
  const s = await scenario(); await s.importer.prepare(s.job.id, selection, 'admin');
  await assert.rejects(s.importer.publish(s.job.id, 'admin', true), /현재 상태/);
  let job; do { job = await s.importer.step(s.job.id); } while (job.state !== 'ready');
  await assert.rejects(s.importer.publish(s.job.id, 'admin', false), /확인 항목/); assert.equal((await s.store.pointer()).id, null);
});
test('publish is idempotent, saves original data for rollback, and avoids Sheet writes', async () => {
  const s = await scenario(), job = await ready(s); const published = await s.importer.publish(job.id, 'admin', true);
  const pointer = await s.store.pointer(); assert.equal(pointer.id, published.releaseId); assert.ok(pointer.previousId);
  const history = s.store.state.audits.length; await s.importer.publish(job.id, 'admin', true); assert.equal(s.store.state.audits.length, history);
  await s.importer.rollback(pointer.generation, pointer.previousId, 'admin');
  const restored = await s.store.get((await s.store.pointer()).manifest); assert.deepEqual(await s.store.get(restored.categories.정수기.rows), s.oldRows);
});
test('retry after a committed pointer and interrupted job status does not publish twice', async () => {
  const s = await scenario(), job = await ready(s); await s.importer.publish(job.id, 'admin', true);
  const history = s.store.state.audits.length;
  await s.store.changeJob(job.id, current => ({ ...current, state: 'failed' }));
  const retried = await s.importer.publish(job.id, 'admin', true); assert.equal(retried.state, 'published'); assert.equal(s.store.state.audits.length, history);
});
test('active processing leases prevent overlapping work and can resume after expiry', async () => {
  const s = await scenario(); await s.store.changeJob(s.job.id, current => ({ ...current, leaseUntil: Date.now() + 50000 }));
  await assert.rejects(s.importer.prepare(s.job.id, selection, 'admin'), /처리 중/);
  await s.store.changeJob(s.job.id, current => ({ ...current, leaseUntil: Date.now() - 1 }));
  assert.equal((await s.importer.prepare(s.job.id, selection, 'admin')).state, 'preparing');
});
test('voucher JSON import preserves omitted models and validates counts before producing a new bundle', () => {
  const old = { rules: {}, models: { KEEP: normalizedVoucherModel('KEEP', {}) } };
  assert.ok(voucherJsonBundle({ models: { P1: { promo: { 타사보상: 160000 }, multiProduct: { recognizedUnits: 1, note: '대수만 인정' } } } }, old).models.KEEP);
  assert.throws(() => voucherJsonBundle({ models: { P1: { multiProductCount: 50000 } } }, old), /인정대수/);
  assert.throws(() => validateVoucherRules({ multiProductRule: { tiers: [{ minUnits: 2, maxUnits: 4, rewardPerUnit: 1 }, { minUnits: 3, rewardPerUnit: 1 }] } }), /지급 구간/);
});
test('catalog reads use published summaries and per-model objects without a Sheet fallback', async () => {
  const s = await scenario(), job = await ready(s); await s.importer.publish(job.id, 'admin', true); delete global.__catalogReader;
  const reader = createLoader({ './store': { createCatalogStore: () => s.store } })('src/lib/catalog/read.ts');
  const summary = await reader.publishedRows('정수기', undefined, true); assert.ok(summary.rows.length <= 4); assert.equal(summary.release, job.releaseId);
  const single = await reader.publishedRows('정수기', ['P1']); assert.equal(single.rows.length, 1); assert.equal(single.rows[0].할인후금액, '57900');
  assert.equal(await reader.publishedRows('냉장고'), null);
});
test('cold pointer failures are surfaced and a warm reader retains its last known good release', async () => {
  const s = await scenario(), job = await ready(s); await s.importer.publish(job.id, 'admin', true); delete global.__catalogReader;
  const reader = createLoader({ './store': { createCatalogStore: () => s.store } })('src/lib/catalog/read.ts');
  s.store.state.pointerError = Error('offline'); await assert.rejects(reader.activeCatalog(), /offline/);
  s.store.state.pointerError = null; assert.equal((await reader.activeCatalog()).id, job.releaseId);
  s.store.state.pointerError = Error('offline'); global.__catalogReader.checked = 0; assert.equal((await reader.activeCatalog()).id, job.releaseId);
});
test('summaries cannot directly create quote lines before all options are loaded', () => {
  const lib = load('src/lib/renewalTest.ts'); const product = lib.normalizeProduct({ ...record(), variants: [record()], optionsLoaded: false, catalogVersion: 'v1' });
  assert.throws(() => lib.createLine(product), /전체 구독 조건/); assert.equal(product.catalogVersion, 'v1');
});
test('an external Sheet edit after preview is detected before activating any uploaded data', async () => {
  const s = await scenario(), job = await ready(s);
  s.oldRows[0].할인후금액 = '70000';
  await assert.rejects(s.importer.publish(job.id, 'admin', true), /원본 시트가 비교 이후 변경/);
  assert.equal((await s.store.pointer()).generation, 'legacy');
});
test('model-level review exposes old and new prices from the frozen comparison snapshot', async () => {
  const s = await scenario(); await ready(s);
  const items = await s.importer.review(s.job.id, 'products', '정수기', undefined);
  assert.ok(items.items.some(item => item.model === 'P1' && item.change === 'changed'));
  const detail = await s.importer.review(s.job.id, 'products', '정수기', 'P1');
  assert.equal(detail.rows[0].before, '60,000'); assert.equal(detail.rows[0].after, '57900');
});
test('workbook updates preserve eligibility flags and manual rules not represented in Excel', () => {
  const { mergeWorkbookVouchers } = load('src/lib/catalog/voucherEditing.ts');
  const before = { rules: { normalPromoTypeKeyword: '운영 N', promoNameKeywordMap: { 추가판촉: ['운영 문구'] } }, models: { P1: { ...normalizedVoucherModel('P1', {}), excludeWhenPromoTypeIsNormalN: true } } };
  const after = mergeWorkbookVouchers(before, parserFixture().parser.finish().vouchers, true);
  assert.equal(after.models.P1.excludeWhenPromoTypeIsNormalN, true); assert.equal(after.rules.normalPromoTypeKeyword, '운영 N'); assert.deepEqual(after.rules.promoNameKeywordMap.추가판촉, ['운영 문구']);
});
