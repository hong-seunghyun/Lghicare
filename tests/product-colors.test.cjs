const assert = require('node:assert/strict');
const { test } = require('node:test');
const createLoader = require('./helpers/ts-load.cjs');
const memoryStore = require('./helpers/catalog-store.cjs');

const response = () => ({
  headers: {}, code: 0, body: null,
  setHeader(key, value) { this.headers[key] = value; },
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
});
const cacheControl = { registerCacheInvalidator() {}, syncProductCacheRevision: async () => {}, clearLocalProductCaches() {} };
const colors = [
  { 모델코드: 'WD724RK', 동일모델기준: 'WD724RE', 제품색상: '블랙' },
  { 모델코드: 'WD724RH', 동일모델기준: 'WD724RE', 제품색상: '화이트' },
  { 모델코드: 'WD724RE', 동일모델기준: '', 제품색상: '베이지' },
];
const rows = colors.flatMap(color => [60, 72].map(term => ({
  ...color, 중분류: '정수기', 소분류: '얼음정수기', 상품명: '색상 선택 정수기',
  계약기간: String(term), 서비스유형: '기본', '서비스주기/월': '6개월',
  '프로모션 대분류': '신규', 프로모션유형: '신규결합',
  할인전금액: '50000', 할인후금액: term === 60 ? '40000' : '35000',
})));
const imageIndex = Object.fromEntries(colors.map(({ 모델코드: code }) => [
  code, [`/api/image-proxy?fileId=${code}-1`, `/api/image-proxy?fileId=${code}-2`],
]));
function handlerFor(reader, legacyRows = rows, onImages = () => {}) {
  delete global.__productListCache;
  return createLoader({
    '@/lib/catalog/read': reader,
    '@/lib/productCacheControl': cacheControl,
    '@/lib/sheet': {
      fetchSheetData: async () => legacyRows,
      fetchSheetDataWithPolicy: async () => legacyRows,
    },
    '@/lib/productImageCache': { getProductImageCache: async () => { onImages(); return { imageIndex }; } },
  })('src/pages/api/products.ts').default;
}
const legacyReader = { catalogPointer: async () => ({ id: null }), publishedRows: async () => null };

test('list variants use their own model thumbnails, including subcategory lists', async () => {
  const handler = handlerFor(legacyReader);
  for (const query of [{}, { sub: '얼음정수기' }, { groupBy: 'modelCode' }]) {
    const res = response();
    await handler({ query: { middle: '정수기', ...query } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.options.length, query.groupBy ? 3 : 1);
    for (const product of res.body.options) {
      assert.equal(product.thumbnailUrl, imageIndex[product.모델코드][0]);
      for (const variant of product.variants)
        assert.equal(variant.thumbnailUrl, imageIndex[variant.모델코드][0]);
    }
    assert.equal(res.body.options.flatMap(product => product.variants).length, rows.length);
  }
});

test('lists with images disabled do not read the image cache', async () => {
  let reads = 0;
  const handler = handlerFor(legacyReader, rows, () => reads++);
  const res = response();
  await handler({ query: { middle: '정수기', includeImages: 'false' } }, res);
  assert.equal(res.code, 200);
  assert.equal(reads, 0);
  assert.ok(res.body.options[0].variants.every(variant => variant.thumbnailUrl === ''));
});

test('placeholder group values do not combine unrelated products', async () => {
  const unrelated = ['', '-', '동일모델기준없음'].flatMap((value, index) => [0, 1].map(suffix => ({
    ...rows[0], 모델코드: `OTHER${index}${suffix}`, 동일모델기준: value,
  })));
  const handler = handlerFor(legacyReader, unrelated);
  const list = response();
  await handler({ query: { middle: '정수기', includeImages: 'false' } }, list);
  assert.equal(list.body.options.length, unrelated.length);
  for (const row of unrelated) {
    const detail = response();
    await handler({ query: { middle: '정수기', id: row.모델코드 } }, detail);
    assert.deepEqual(detail.body.relatedModels.map(model => model.모델코드), [row.모델코드]);
  }
});

test('published details discover all sibling colors without loading their full subscription rows', async () => {
  delete global.__catalogReader;
  const store = memoryStore();
  const models = {};
  for (const color of colors) {
    models[color.모델코드] = await store.put(`product-catalog/v1/${color.모델코드}.json.gz`, rows.filter(row => row.모델코드 === color.모델코드));
  }
  const full = await store.put('product-catalog/v1/rows.json.gz', rows);
  const summary = await store.put('product-catalog/v1/summary.json.gz', colors.map(color => ({ ...rows.find(row => row.모델코드 === color.모델코드), __summary: '1' })));
  const manifest = await store.put('product-catalog/v1/manifest.json.gz', {
    schema: 1, id: 'v1', categories: { 정수기: { rows: full, summary, models, rowCount: rows.length } },
  });
  await store.activate('legacy', { id: 'v1', generation: 'v1', manifest }, {});
  const downloads = [];
  const get = store.get;
  store.get = async ref => { downloads.push(ref.path); return get(ref); };
  const reader = createLoader({ './store': { createCatalogStore: () => store }, '@/lib/productCacheControl': cacheControl })('src/lib/catalog/read.ts');
  const handler = handlerFor(reader, []);
  for (const color of colors) {
    const detail = response();
    await handler({ query: { middle: '정수기', id: color.모델코드 } }, detail);
    assert.equal(detail.code, 200);
    assert.equal(detail.body.options.length, 2);
    assert.ok(detail.body.options.every(option => option.모델코드 === color.모델코드 && option.catalogVersion === 'v1'));
    assert.deepEqual(detail.body.relatedModels.map(model => model.모델코드), colors.map(model => model.모델코드));
    assert.deepEqual(detail.body.options[0].images, imageIndex[color.모델코드]);
    if (color === colors[0]) {
      assert.ok(downloads.includes(summary.path));
      assert.equal(downloads.includes(models.WD724RH.path), false);
      assert.equal(downloads.includes(models.WD724RE.path), false);
    }
  }
  assert.equal(downloads.includes(full.path), false);
  const estimate = response();
  await handler({ query: { middle: '정수기', id: 'WD724RH', groupBy: 'modelCode' } }, estimate);
  assert.deepEqual(estimate.body.relatedModels.map(model => model.모델코드), ['WD724RH']);
  const list = response();
  await handler({ query: { middle: '정수기' } }, list);
  assert.equal(list.body.options.length, 1);
  assert.equal(new Set(list.body.options[0].variants.map(variant => variant.thumbnailUrl)).size, 3);
});

test('related colors stay pinned to the selected product release during a publication', async () => {
  delete global.__catalogReader;
  const store = memoryStore();
  const model = await store.put('product-catalog/v1/WD724RK.json.gz', rows.filter(row => row.모델코드 === 'WD724RK'));
  for (const [id, summaryRows] of [['v1', rows], ['v2', [rows[0]]]]) {
    const summary = await store.put(`product-catalog/${id}/summary.json.gz`, summaryRows);
    const manifest = await store.put(`product-catalog/${id}/manifest.json.gz`, {
      schema: 1, id, categories: { 정수기: { rows: summary, summary, models: { WD724RK: model } } },
    });
    await store.rememberVersion(id, manifest);
    if (id === 'v1') store.state.active = { id, generation: id, manifest };
  }
  const reader = createLoader({ './store': { createCatalogStore: () => store }, '@/lib/productCacheControl': cacheControl })('src/lib/catalog/read.ts');
  const get = store.get;
  store.get = async ref => {
    const value = await get(ref);
    if (ref.path === model.path) {
      store.state.active = { id: 'v2', generation: 'v2', manifest: await store.version('v2') };
      reader.clearCatalogReader();
    }
    return value;
  };
  const detail = response();
  await handlerFor(reader, [])({ query: { middle: '정수기', id: 'WD724RK' } }, detail);
  assert.equal(detail.code, 200);
  assert.equal(store.state.active.id, 'v2');
  assert.equal(detail.body.options[0].catalogVersion, 'v1');
  assert.equal(detail.body.relatedModels.length, 3);
});

function listHarness(file, product) {
  let slots, cursor;
  const parentSlots = [[product], [], false, false, false, 9, [], true];
  const cardSlots = [];
  const hooks = {
    useEffect() {},
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
  };
  const styled = new Proxy(component => () => component, { get: (_, name) => () => name });
  const Page = createLoader({
    react: hooks,
    'styled-components': { __esModule: true, default: styled },
    'next/router': { useRouter: () => ({ query: { middle: '정수기' } }) },
    'next/image': { __esModule: true, default: 'img' },
    'next/link': { __esModule: true, default: 'Link' },
    '@/components/loading/Loading': { __esModule: true, default: 'Loading' },
    '@/components/Modal/CompareModal': { __esModule: true, default: 'CompareModal' },
  })(file).default;
  function nodes(element) {
    if (!element || typeof element !== 'object') return [];
    if (element.type?.name === 'ColorChipBox')
      return [element, ...nodes(element.type(element.props))];
    const children = element.props?.children;
    return [element, ...(Array.isArray(children) ? children.flat(Infinity) : [children]).flatMap(nodes)];
  }
  return {
    parentSlots, nodes,
    renderPage() { slots = parentSlots; cursor = 0; return nodes(Page()).find(node => node.type?.name === 'ProductCardItem'); },
    renderCard(element) { slots = cardSlots; cursor = 0; return nodes(element.type(element.props)); },
  };
}

for (const file of ['src/pages/products/[middle]/index.tsx', 'src/pages/products/[middle]/sub/index.tsx']) {
  test(`${file}: color clicks update the thumbnail and detail link and survive parent updates`, async () => {
    const res = response();
    await handlerFor(legacyReader)({ query: { middle: '정수기' } }, res);
    const h = listHarness(file, res.body.options[0]);
    const initialCard = h.renderPage();
    let nodes = h.renderCard(initialCard);
    for (const color of [colors[1], colors[2], colors[0]]) {
      const button = nodes.find(node => node.props?.['aria-label'] === color.제품색상);
      let prevented = false;
      button.props.onClick({ preventDefault() { prevented = true; }, stopPropagation() {} });
      assert.equal(prevented, true);
      nodes = h.renderCard(initialCard);
      assert.equal(nodes.find(node => node.type === 'img' && node.props.alt === '썸네일').props.src, imageIndex[color.모델코드][0]);
      assert.equal(nodes.find(node => node.type === 'Link').props.href, `/products/정수기/${color.모델코드}`);
      assert.equal(nodes.find(node => node.props?.['aria-label'] === color.제품색상).props['aria-pressed'], true);
    }
    h.parentSlots[4] = true; // Sticky navigation changes on scroll.
    h.parentSlots[5] = 18; // Infinite scrolling reveals more cards.
    h.parentSlots[6] = [res.body.options[0]]; // The comparison tray opens.
    assert.equal(h.renderPage().type, initialCard.type);
  });
}
