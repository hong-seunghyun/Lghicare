const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const createLoader = require('./helpers/ts-load.cjs');
const memoryStore = require('./helpers/catalog-store.cjs');
const firestore = require('./helpers/firestore.cjs');
const { PRODUCT_FIELDS } = createLoader()('src/lib/catalog/types.ts');
const row = index => Object.fromEntries(PRODUCT_FIELDS.map(field => [field, field === '모델코드' ? 'P' + index : field === '중분류' ? '정수기' : 'value']));
async function mirrorScenario(count = 1200) {
  const store = memoryStore(), db = firestore(), calls = [], options = { failWrite: false, badHeader: false, changedAfterWrite: false };
  const rows = await store.put('product-catalog/rows.json.gz', Array.from({ length: count }, (_, i) => row(i)));
  const manifest = await store.put('product-catalog/manifest.json.gz', { id: 'v1', parentId: 'backup', categories: { 정수기: { rows, rowCount: count } } });
  store.state.active = { id: 'v1', generation: 'g1', manifest };
  const api = { spreadsheets: { get: async () => ({ data: { sheets: [{ properties: { sheetId: 1, title: '정수기', gridProperties: { rowCount: 2000, columnCount: 26 } } }] } }), values: {
    get: async () => ({ data: { values: [options.badHeader ? ['NO', ...PRODUCT_FIELDS] : PRODUCT_FIELDS] } }),
    update: async value => { if (options.failWrite) throw Object.assign(Error('permission denied'), { code: 403 }); calls.push({ action: 'write', ...value }); if (options.changedAfterWrite) store.state.active.generation = 'g2'; return {}; },
    clear: async value => { calls.push({ action: 'clear', ...value }); return {}; },
  } } };
  const lib = createLoader({ '@/lib/firebaseAdmin': { initFirebaseAdmin: () => db }, './store': { createCatalogStore: () => store }, googleapis: { google: { auth: { GoogleAuth: function() {} }, sheets: () => api } } })('src/lib/catalog/sheetMirror.ts');
  const before = process.env.GOOGLE_SHEET_ID; process.env.GOOGLE_SHEET_ID = 'test-sheet';
  return { store, db, calls, options, lib, restore: () => { if (before === undefined) delete process.env.GOOGLE_SHEET_ID; else process.env.GOOGLE_SHEET_ID = before; } };
}
test('Sheet mirror writes bounded RAW batches, preserves retry offsets, and only clears stale trailing rows', async () => {
  const s = await mirrorScenario();
  try {
    let job = await s.lib.startSheetMirror('정수기', 'g1', 'admin');
    job = await s.lib.stepSheetMirror(job.id); assert.equal(job.offset, 1000); assert.equal(job.state, 'preparing');
    assert.equal(s.calls[0].range, "'정수기'!A1:W1001"); assert.equal(s.calls[0].valueInputOption, 'RAW');
    assert.equal(s.calls.filter(c => c.action === 'clear').length, 0);
    job = await s.lib.stepSheetMirror(job.id); assert.equal(job.state, 'complete');
    assert.equal(s.calls[1].range, "'정수기'!A1002:W1201"); assert.equal(s.calls[2].range, "'정수기'!A1202:W2000");
    assert.equal((await s.store.pointer()).generation, 'g1');
  } finally { s.restore(); }
});
test('Sheet write failures retain published data and restart at the uncommitted chunk', async () => {
  const s = await mirrorScenario();
  try {
    let job = await s.lib.startSheetMirror('정수기', 'g1', 'admin'); s.options.failWrite = true;
    await assert.rejects(s.lib.stepSheetMirror(job.id), /permission denied/);
    assert.equal(s.db.docs.get('productSheetMirrors/' + job.id).offset, 0); assert.equal((await s.store.pointer()).id, 'v1');
    s.options.failWrite = false; job = await s.lib.stepSheetMirror(job.id); assert.equal(job.offset, 1000);
  } finally { s.restore(); }
});
test('unexpected Sheet headers block writes rather than overwriting custom columns', async () => {
  const s = await mirrorScenario(1);
  try { s.options.badHeader = true; const job = await s.lib.startSheetMirror('정수기', 'g1', 'admin'); await assert.rejects(s.lib.stepSheetMirror(job.id), /열 구성/); assert.equal(s.calls.length, 0); }
  finally { s.restore(); }
});
test('a new release during Sheet synchronization cannot be reported as completed', async () => {
  const s = await mirrorScenario(1);
  try { s.options.changedAfterWrite = true; const job = await s.lib.startSheetMirror('정수기', 'g1', 'admin'); await assert.rejects(s.lib.stepSheetMirror(job.id), /상품 버전이 변경/); assert.equal(s.db.docs.get('productSheetMirrors/' + job.id).state, 'failed'); }
  finally { s.restore(); }
});
test('two Sheet jobs cannot concurrently overwrite the same category', async () => {
  const s = await mirrorScenario(1);
  try { await s.lib.startSheetMirror('정수기', 'g1', 'admin'); await assert.rejects(s.lib.startSheetMirror('정수기', 'g1', 'admin2'), /진행 중/); }
  finally { s.restore(); }
});
function imageScenario() {
  const store = memoryStore(), db = firestore(), objects = new Map(), options = { failSave: false, corrupt: false }, resizes = [];
  const source = { id: 'folder', ts: 1, subFolders: [{ id: 'p1', name: 'P1' }], images: { P1: ['/api/image-proxy?fileId=file00001', '/api/image-proxy?fileId=file00002'] }, imageIndex: { p1: ['/api/image-proxy?fileId=file00001', '/api/image-proxy?fileId=file00002'] } };
  const bucket = { name: 'test-bucket', file: path => ({ getMetadata: async () => { if (!objects.has(path)) throw Object.assign(Error('missing'), { code: 404 }); return [objects.get(path).metadata]; }, save: async (bytes, config) => { if (options.failSave && path.endsWith('full.jpg')) throw Error('Storage unavailable'); if (objects.has(path)) throw Object.assign(Error('exists'), { code: 412 }); objects.set(path, { bytes, metadata: config.metadata }); } }) };
  const google = { auth: { GoogleAuth: function() {} }, drive: () => ({ files: { get: async (params) => {
    const bytes = Buffer.from('source-' + params.fileId);
    return params.alt ? { data: options.corrupt ? Buffer.from('changed') : bytes } : { data: { mimeType: 'image/jpeg', md5Checksum: createHash('md5').update(bytes).digest('hex'), size: String(bytes.length) } };
  } } }) };
  const sharp = () => ({ rotate() { return this; }, resize(value) { resizes.push(value); return this; }, webp() { return this; }, flatten() { return this; }, jpeg() { return this; }, toBuffer: async () => Buffer.from('webp') });
  const lib = createLoader({ '@/lib/firebaseAdmin': { initFirebaseAdmin: () => db }, '@/lib/productImageCache': { getSourceProductImageCache: async () => source }, './store': { createCatalogStore: () => store, catalogBucket: () => bucket }, './publishedImages': { imagePointer: async () => db.docs.get('_system/productImageCatalog') || { categories: {} }, clearPublishedImages() {} }, googleapis: { google }, sharp })('src/lib/catalog/imageSync.ts');
  return { store, db, objects, options, resizes, source, lib };
}
test('image conversion publishes the full category only after all immutable variants are stored', async () => {
  const s = imageScenario(); const job = await s.lib.startImageSync('정수기', 'admin'); assert.equal(s.db.docs.has('_system/productImageCatalog'), false);
  const completed = await s.lib.stepImageSync(job.id); assert.equal(completed.state, 'complete'); assert.equal(completed.count, 2);
  const index = await s.store.get(s.db.docs.get('_system/productImageCatalog').categories.정수기);
  assert.ok(index.thumbnailIndex.p1.includes('thumb.webp')); assert.ok(index.images.P1[0].includes('full.jpg'));
  assert.equal(s.objects.size, 4); assert.ok(s.resizes.every(size => size.fit === 'inside' && size.withoutEnlargement));
  for (const object of s.objects.values()) assert.equal(object.metadata.cacheControl, 'public, max-age=31536000, immutable');
});
test('failed image conversion keeps the old index and resumes using already stored thumbnails', async () => {
  const s = imageScenario(); const job = await s.lib.startImageSync('정수기', 'admin'); s.options.failSave = true;
  await assert.rejects(s.lib.stepImageSync(job.id), /unavailable/); assert.equal(s.db.docs.has('_system/productImageCatalog'), false); assert.equal(s.objects.size, 1);
  s.options.failSave = false; assert.equal((await s.lib.stepImageSync(job.id)).state, 'complete'); assert.equal(s.objects.size, 4);
});
test('source image changes mid-download never become cached under the old checksum', async () => {
  const s = imageScenario(); const job = await s.lib.startImageSync('정수기', 'admin'); s.options.corrupt = true;
  await assert.rejects(s.lib.stepImageSync(job.id), /원본 이미지가 변경/); assert.equal(s.objects.size, 0); assert.equal(s.db.docs.has('_system/productImageCatalog'), false);
});
test('an older image job cannot replace a newer published index', async () => {
  const s = imageScenario(); const job = await s.lib.startImageSync('정수기', 'admin'); s.db.docs.set('_system/productImageCatalog', { categories: { 정수기: { sha256: 'newer' } } });
  await assert.rejects(s.lib.stepImageSync(job.id), /최근 이미지/); assert.equal(s.db.docs.get('_system/productImageCatalog').categories.정수기.sha256, 'newer');
});
