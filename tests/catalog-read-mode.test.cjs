const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const createLoader = require('./helpers/ts-load.cjs');

function setup(t, environment = 'development') {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = environment;
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    delete global.__catalogReader;
  });
  delete global.__catalogReader;
  const files = new Map();
  const documents = new Map();
  const reads = [];
  let localReads = 0, localWrites = 0, remoteWrites = 0, unavailable = false;
  function artifact(name, value) {
    const bytes = gzipSync(Buffer.from(JSON.stringify(value)));
    const ref = { path: `product-catalog/${name}.json.gz`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    files.set(ref.path, bytes);
    return ref;
  }
  const rows = [{ 모델코드: 'UPLOADED', 중분류: '정수기', 상품명: '운영에 반영한 상품', 할인후금액: '34500' }];
  const product = artifact('v1/products', rows);
  const vouchers = artifact('v1/vouchers', { rules: { version: 3 }, models: { UPLOADED: { base: { default: 100000 } } } });
  const disclaimers = artifact('v1/disclaimers', { UPLOADED: '업로드한 안내 문구' });
  const manifest = artifact('v1/manifest', {
    schema: 1, id: 'published-v1',
    categories: { 정수기: { rows: product, summary: product, models: { UPLOADED: product } } },
    vouchers, disclaimers,
  });
  const published = { id: 'published-v1', generation: 'published-g1', manifest };
  documents.set('_system/productCatalog', published);
  documents.set('productCatalogVersions/published-v1', { manifest });
  const localStore = {
    pointer: async () => { localReads++; return { id: 'local-v1', generation: 'local-g1' }; },
    activate: async () => { localWrites++; },
  };
  const db = {
    doc: name => ({ get: async () => {
      reads.push(name);
      if (unavailable) throw Error('published catalog unavailable');
      return { data: () => documents.get(name) };
    } }),
    runTransaction: async () => { remoteWrites++; throw Error('unexpected write'); },
  };
  const bucket = { file: name => ({
    download: async () => { reads.push(name); return [files.get(name)]; },
    save: async () => { remoteWrites++; throw Error('unexpected write'); },
  }) };
  const load = createLoader({
    './localStore': { localCatalogStore: () => localStore },
    './developmentRead': { developmentCatalogAccess: () => ({ db, bucket }) },
    '@/lib/firebaseAdmin': { initFirebaseAdmin: () => db },
    'firebase-admin/storage': { getStorage: () => ({ bucket: () => bucket }) },
    '@/lib/productCacheControl': { clearLocalProductCaches() {} },
  });
  return {
    factory: load('src/lib/catalog/store.ts'),
    reader: load('src/lib/catalog/read.ts'),
    rows, reads, localStore, published,
    stats: () => ({ localReads, localWrites, remoteWrites }),
    disconnect: () => { unavailable = true; },
  };
}

test('development public catalog reads the published products, vouchers and disclaimers', async t => {
  const h = setup(t);
  assert.deepEqual(await h.reader.catalogPointer(), h.published);
  assert.deepEqual(await h.reader.publishedRows('정수기', ['UPLOADED']), { rows: h.rows, release: 'published-v1' });
  assert.deepEqual(await h.reader.publishedRows('정수기', [], true, 'published-v1'), { rows: h.rows, release: 'published-v1' });
  assert.equal((await h.reader.publishedVouchers()).models.UPLOADED.base.default, 100000);
  assert.equal((await h.reader.publishedDisclaimers()).UPLOADED, '업로드한 안내 문구');
  assert.ok(h.reads.includes('productCatalogVersions/published-v1'));
  assert.deepEqual(h.stats(), { localReads: 0, localWrites: 0, remoteWrites: 0 });
});

test('development public reader exposes no writes and admin changes still use the local store', async t => {
  const h = setup(t);
  const publicStore = h.factory.createCatalogStore({ readOnly: true });
  assert.deepEqual(Object.keys(publicStore).sort(), ['get', 'pointer', 'version']);
  assert.equal((await publicStore.pointer()).id, 'published-v1');
  assert.equal(h.factory.localCatalogMode(), true);
  const adminStore = h.factory.createCatalogStore();
  assert.equal(adminStore, h.localStore);
  assert.equal((await adminStore.pointer()).id, 'local-v1');
  await adminStore.activate();
  assert.deepEqual(h.stats(), { localReads: 1, localWrites: 1, remoteWrites: 0 });
});

test('a cold published read failure never substitutes the local development catalog', async t => {
  const h = setup(t);
  h.disconnect();
  await assert.rejects(h.reader.catalogPointer(), /published catalog unavailable/);
  assert.equal(h.stats().localReads, 0);
});

test('production continues to use the published catalog for reads and the existing admin store', async t => {
  const h = setup(t, 'production');
  assert.equal(h.factory.localCatalogMode(), false);
  const adminStore = h.factory.createCatalogStore();
  assert.notEqual(adminStore, h.localStore);
  assert.equal(typeof adminStore.activate, 'function');
  assert.equal((await adminStore.pointer()).id, 'published-v1');
  assert.deepEqual((await h.reader.publishedRows('정수기')).rows, h.rows);
  assert.deepEqual(h.stats(), { localReads: 0, localWrites: 0, remoteWrites: 0 });
});

test('development reuses existing Google credentials without replacing the default admin app', t => {
  const keys = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'GOOGLE_SERVICE_EMAIL', 'GOOGLE_PRIVATE_KEY'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
  for (const key of keys) delete process.env[key];
  process.env.GOOGLE_SERVICE_EMAIL = 'existing-reader@example.test';
  process.env.GOOGLE_PRIVATE_KEY = 'existing\\nkey';
  const apps = [], credentials = [];
  const load = createLoader({
    'firebase-admin/app': {
      getApps: () => apps,
      cert: value => { credentials.push(value); return value; },
      initializeApp: (options, name = '[DEFAULT]') => { const app = { name, options }; apps.push(app); return app; },
    },
    'firebase-admin/firestore': { getFirestore: app => ({ app: app?.name ?? '[DEFAULT]' }) },
    'firebase-admin/storage': { getStorage: app => ({ bucket: () => ({ app: app.name }) }) },
  });
  const reader = load('src/lib/catalog/developmentRead.ts');
  assert.equal(reader.developmentCatalogAccess().db.app, 'published-catalog-reader');
  reader.developmentCatalogAccess();
  assert.equal(apps.length, 1);
  assert.equal(credentials[0].clientEmail, 'existing-reader@example.test');
  assert.equal(credentials[0].privateKey, 'existing\nkey');
  const admin = load('src/lib/firebaseAdmin.ts');
  assert.throws(() => admin.initFirebaseAdmin(), /환경변수/);
  process.env.FIREBASE_PROJECT_ID = 'configured-project';
  process.env.FIREBASE_CLIENT_EMAIL = 'configured-admin@example.test';
  process.env.FIREBASE_PRIVATE_KEY = 'configured-admin-key';
  assert.equal(admin.initFirebaseAdmin().app, '[DEFAULT]');
  assert.deepEqual(apps.map(app => app.name), ['published-catalog-reader', '[DEFAULT]']);
  assert.equal(credentials[1].clientEmail, 'configured-admin@example.test');
});
