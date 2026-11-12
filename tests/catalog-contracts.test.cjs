const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const createLoader = require('./helpers/ts-load.cjs');
const memoryStore = require('./helpers/catalog-store.cjs');
const response = () => ({ code: 200, headers: {}, body: null, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } });

test('administrator endpoints verify Firebase tokens and user role on the server', async () => {
  let role = 'manager', tokenCalls = 0;
  const auth = createLoader({ 'firebase-admin/auth': { getAuth: () => ({ verifyIdToken: async token => { tokenCalls++; if (token !== 'valid') throw Error('expired'); return { uid: 'admin-id' }; } }) }, '@/lib/firebaseAdmin': { initFirebaseAdmin: () => ({ doc: () => ({ get: async () => ({ data: () => ({ role }) }) }) }) } })('src/lib/admin/requireAdmin.ts');
  await assert.rejects(auth.requireAdmin({ headers: {} }), error => error.status === 401); assert.equal(tokenCalls, 0);
  await assert.rejects(auth.requireAdmin({ headers: { authorization: 'Bearer forged' } }), error => error.status === 401);
  await assert.rejects(auth.requireAdmin({ headers: { authorization: 'Bearer valid' } }), error => error.status === 403);
  role = 'admin'; assert.equal(await auth.requireAdmin({ headers: { authorization: 'Bearer valid' } }), 'admin-id');
});
test('unauthenticated import requests cannot create jobs or write artifacts', async () => {
  let writes = 0;
  const load = createLoader({ '@/lib/catalog/store': { createCatalogStore: () => { writes++; throw Error('must not reach store'); } }, '@/lib/catalog/legacy': { legacyCatalog: {} } });
  const handler = load('src/pages/api/admin/product-import/index.ts').default;
  const res = response(); await handler({ method: 'POST', headers: {}, query: {} }, res);
  assert.equal(res.code, 401); assert.equal(writes, 0); assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('local mode explicitly refuses Drive and Sheet mutations', async () => {
  for (const target of ['images', 'sheets']) {
    let calls = 0;
    const service = target === 'images' ? '@/lib/catalog/imageSync' : '@/lib/catalog/sheetMirror';
    const load = createLoader({ '@/lib/admin/requireAdmin': { requireAdmin: async () => 'admin', adminError: error => ({ status: error.status ?? 503, message: error.message }), AdminRequestError: class extends Error { constructor(status, message) { super(message); this.status = status; } } }, '@/lib/catalog/store': { localCatalogMode: () => true }, [service]: new Proxy({}, { get: () => () => { calls++; } }) });
    const handler = load(`src/pages/api/admin/product-import/${target}.ts`).default, res = response();
    await handler({ method: 'POST', body: { action: 'start', category: '정수기', generation: 'g1' } }, res);
    assert.equal(res.code, 409); assert.equal(calls, 0);
  }
});
test('local snapshots are durable, immutable and isolated from Firebase', async () => {
  const root = path.resolve(__dirname, '../tmp/local-catalog-test-' + randomUUID()), parent = path.resolve(__dirname, '../tmp') + path.sep;
  const previous = process.env.PRODUCT_CATALOG_LOCAL_DIR; process.env.PRODUCT_CATALOG_LOCAL_DIR = root;
  try {
    const { localCatalogStore } = createLoader()('src/lib/catalog/localStore.ts'), store = localCatalogStore();
    const ref = await store.put('product-catalog/test.json.gz', { price: 100 });
    await assert.rejects(store.put('product-catalog/test.json.gz', { price: 200 }));
    await store.activate('legacy', { id: 'v1', generation: 'g1', manifest: ref, previousId: null }, { actor: 'test' });
    const reloaded = localCatalogStore(); assert.equal((await reloaded.pointer()).id, 'v1'); assert.equal((await reloaded.get(await reloaded.version('v1'))).price, 100);
    await assert.rejects(reloaded.get({ ...ref, path: '../../.env.local' }), /Invalid local/);
  } finally {
    if (previous === undefined) delete process.env.PRODUCT_CATALOG_LOCAL_DIR; else process.env.PRODUCT_CATALOG_LOCAL_DIR = previous;
    assert.ok(root.startsWith(parent)); await fs.rm(root, { recursive: true, force: true });
  }
});

test('production image import stays disabled so the existing manual Drive workflow is preserved', async () => {
  let writes = 0;
  const load = createLoader({ '@/lib/admin/requireAdmin': { requireAdmin: async () => 'admin', adminError: error => ({ status: error.status, message: error.message }), AdminRequestError: class extends Error { constructor(status, message) { super(message); this.status = status; } } }, '@/lib/catalog/store': { localCatalogMode: () => false }, '@/lib/catalog/imageSync': new Proxy({}, { get: () => () => { writes++; } }) });
  const handler = load('src/pages/api/admin/product-import/images.ts').default;
  const get = response(); await handler({ method: 'GET' }, get); assert.equal(get.body.manual, true);
  const post = response(); await handler({ method: 'POST', body: { action: 'start', category: '정수기' } }, post);
  assert.equal(post.code, 409); assert.equal(writes, 0);
});
test('a late pointer request cannot restore the version cleared during publication', async () => {
  delete global.__catalogReader;
  let oldResolve, newResolve, calls = 0;
  const old = new Promise(resolve => { oldResolve = resolve; }), current = new Promise(resolve => { newResolve = resolve; });
  const store = { pointer: () => ++calls === 1 ? old : current };
  const reader = createLoader({ './store': { createCatalogStore: () => store } })('src/lib/catalog/read.ts');
  const first = reader.catalogPointer(); reader.clearCatalogReader(); const second = reader.catalogPointer();
  newResolve({ id: null, generation: 'new' }); await second;
  oldResolve({ id: null, generation: 'old' }); await first;
  assert.equal((await reader.catalogPointer()).generation, 'new');
});
test('version-pinned voucher responses retain matching historical rules and model amounts', async () => {
  delete global.__catalogReader;
  const store = memoryStore();
  for (const [id, amount] of [['v1', 100000], ['v2', 160000]]) {
    const vouchers = await store.put(`product-catalog/${id}/vouchers.json.gz`, { rules: { version: 3 }, models: { P1: { promo: { 타사보상: amount } } } });
    const manifest = await store.put(`product-catalog/${id}/manifest.json.gz`, { schema: 1, id, categories: {}, vouchers });
    await store.rememberVersion(id, manifest); if (id === 'v2') store.state.active = { id, generation: id, manifest };
  }
  const reader = createLoader({ './store': { createCatalogStore: () => store } })('src/lib/catalog/read.ts');
  const handler = createLoader({ '@/lib/catalog/read': reader, '@/lib/firebaseAdmin': { initFirebaseAdmin: () => { throw Error('must not read legacy voucher data'); } } })('src/pages/api/catalog/vouchers.ts').default;
  for (const [version, amount] of [['v1', 100000], ['v2', 160000]]) {
    const res = response(); await handler({ method: 'GET', query: { model: 'P1', version } }, res);
    assert.equal(res.code, 200); assert.equal(res.body.version, version); assert.equal(res.body.model.promo.타사보상, amount);
  }
});

test('concurrent cold catalog reads share one download and failed downloads remain retryable', async () => {
  delete global.__catalogReader;
  let reads = 0, fail = true;
  const store = { get: async () => { reads++; await new Promise(resolve => setImmediate(resolve)); if (fail) throw Error('offline'); return { price: 57900 }; } };
  const reader = createLoader({ './store': { createCatalogStore: () => store } })('src/lib/catalog/read.ts');
  const ref = { path: 'product-catalog/model.json.gz', sha256: 'sample', bytes: 1 };
  const failed = await Promise.allSettled(Array.from({ length: 20 }, () => reader.readArtifact(ref)));
  assert.equal(reads, 1); assert.ok(failed.every(result => result.status === 'rejected'));
  fail = false;
  const values = await Promise.all(Array.from({ length: 20 }, () => reader.readArtifact(ref)));
  assert.equal(reads, 2); assert.ok(values.every(value => value.price === 57900));
  await reader.readArtifact(ref); assert.equal(reads, 2);
});
test('a published category uses model artifacts and does not resurrect deleted models from Sheets', async () => {
  const row = { 중분류: '정수기', 모델코드: 'P1', 상품명: '검증 상품', 계약기간: '60', 서비스유형: '기본', '서비스주기/월': '6개월', 할인전금액: '57900', 할인후금액: '57900' };
  let reads = 0; delete global.__productListCache;
  const handler = createLoader({ '@/lib/sheet': { fetchSheetData: async () => { reads++; return [row]; }, fetchSheetDataWithPolicy: async () => { reads++; return [row]; } }, '@/lib/catalog/read': { catalogPointer: async () => ({ id: 'v1' }), publishedRows: async (_, models) => ({ rows: models.includes('deleted') ? [] : [row], release: 'v1' }) }, '@/lib/productImageCache': { getProductImageCache: async () => null }, '@/lib/productCacheControl': { registerCacheInvalidator() {}, syncProductCacheRevision: async () => {} } })('src/pages/api/products.ts').default;
  const res = response(); await handler({ query: { middle: '정수기', id: 'deleted' } }, res); assert.equal(res.code, 404); assert.equal(reads, 0);
});
test('product selection fetches all conditions before a summary can enter an estimate', async t => {
  const fields = { 모델코드: 'P1', 상품명: '검증 상품', 중분류: '정수기' };
  const variants = [60, 72, 84].map(term => ({ 계약기간: String(term), 서비스유형: '기본', '서비스주기/월': '6개월', '프로모션 대분류': '신규', 프로모션유형: '일반', 프로모션명: '등록 조건', 할인전금액: '57900', 할인후금액: '57900' }));
  const requests = [];
  t.mock.method(global, 'fetch', async url => { const params = new URL(url, 'https://test.invalid').searchParams; requests.push(params); return { ok: true, json: async () => ({ options: [{ ...fields, variants: params.has('models') ? variants : variants.slice(0, 1), optionsLoaded: params.has('models'), catalogVersion: 'v1' }] }) }; });
  const lib = createLoader({ 'firebase/firestore': {}, '@/lib/firebase': { db: {} } })('src/hooks/useRenewalData.ts');
  const [summary] = await lib.fetchRenewalProducts('정수기'); assert.equal(summary.optionsLoaded, false); assert.equal(requests[0].get('summary'), 'true');
  const full = await lib.loadRenewalProductOptions(summary); assert.equal(full.variants.length, 3); assert.equal(full.catalogVersion, 'v1'); assert.equal(requests[1].get('models'), 'P1'); assert.equal(requests[1].has('summary'), false);
});
test('optimized Storage assets bypass the Next image proxy and unsafe hosts do not qualify', () => {
  const { isPublishedProductImage } = createLoader()('src/lib/catalog/imageUrl.ts');
  const url = 'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/product-assets%2Fid%2Fhash%2Fthumb.webp?alt=media&token=test';
  assert.equal(isPublishedProductImage(url), true); assert.equal(isPublishedProductImage('https://evil.invalid/o/product-assets%2Ftest'), false);
  const Image = require('next/image').default;
  const markup = renderToStaticMarkup(React.createElement(Image, { src: url, alt: '제품', width: 200, height: 200, unoptimized: isPublishedProductImage(url) }));
  assert.ok(markup.includes('firebasestorage.googleapis.com')); assert.equal(markup.includes('/_next/image'), false);
});
