const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { ServerStyleSheet } = require('styled-components');
const createLoader = require('./helpers/ts-load.cjs');
const catalogColorNames = require('./fixtures/product-color-names.json');
const load = createLoader();
const colors = load('src/constants/colorMap.ts');
const ColorChipBox = load('src/components/ColorChipBox/ColorChipBox.tsx').default;

test('WD522 beige, white and clay brown each show a distinct known color', () => {
  const names = ['카밍베이지', '에센스화이트', '카밍 클레이 브라운'];
  const chips = names.map(name => colors.getProductColorChipColors(name));
  assert.equal(new Set(chips.flat()).size, 3);
  assert.deepEqual(chips[1], [colors.WHITE_SWATCH]);
  assert.ok([chips[0][0], chips[2][0]].every(color => color !== colors.WHITE_SWATCH && color !== colors.COLOR_FALLBACK));
});

test('all named colors in the 21-category uploaded catalog resolve without a fallback', () => {
  const named = catalogColorNames.filter(colors.isProductColorName);
  assert.equal(named.length, 120);
  for (const name of named)
    assert.ok(colors.getProductColorChipColors(name).every(color => color !== colors.COLOR_FALLBACK), name);
});

test('spacing, legacy abbreviations and spelling variants resolve to the same hue', () => {
  for (const [left, right] of [
    ['카밍 클레이 브라운', '카밍클레이브라운'],
    ['오)클레이민트', '오브제클레이민트'],
    ['모던스테인레스', '모던스테인리스'],
    ['플래티늄 블랙', '플래티넘블랙'],
    ['카멩베이지', '카밍베이지'],
    ['신규 카밍 베이지', '카밍베이지'],
    ['미스트 크림 스카이', '크림스카이'],
  ]) assert.deepEqual(colors.getProductColorChipColors(left), colors.getProductColorChipColors(right), left);
});

test('two-tone colors preserve both hues, including white and hyphen-separated panels', () => {
  const pink = colors.resolveProductColor('미스트핑크');
  assert.deepEqual(colors.getProductColorChipColors('화이트/미스트핑크'), [colors.WHITE_SWATCH, pink]);
  assert.deepEqual(colors.getProductColorChipColors('화이트-화이트'), [colors.WHITE_SWATCH, colors.WHITE_SWATCH]);
  assert.deepEqual(colors.getProductColorChipColors('상단: 카밍베이지 / 하단: 카밍 클레이 브라운'), [colors.resolveProductColor('카밍베이지'), colors.resolveProductColor('카밍클레이브라운')]);
  assert.match(colors.getProductColorChipBackground('화이트/미스트핑크'), /linear-gradient\(to bottom,/);
  assert.match(colors.getProductColorChipBackground('무드업'), /conic-gradient/);
});

test('unknown names have a neutral pattern instead of masquerading as white', () => {
  assert.notEqual(colors.COLOR_FALLBACK, colors.WHITE_SWATCH);
  assert.equal(colors.resolveProductColor('미등록한 새 색상'), colors.COLOR_FALLBACK);
  assert.equal(colors.getProductColorChipBackground('미등록한 새 색상'), colors.UNKNOWN_COLOR_SWATCH);
  for (const value of ['', '-', '0', '단일색상', 'N/A']) assert.equal(colors.isProductColorName(value), false);
});

function render(colorName, compact = false) {
  const sheet = new ServerStyleSheet();
  try {
    const html = renderToStaticMarkup(sheet.collectStyles(React.createElement(ColorChipBox, {
      colorName, modelCode: 'WD522MN', selected: true, compact, onClick() {},
    })));
    return { html, css: sheet.getStyleTags() };
  } finally { sheet.seal(); }
}

test('the detailed selector renders its color, visible label and selected check with focus styling', () => {
  const { html, css } = render('카밍 클레이 브라운');
  assert.ok(html.includes(`background:${colors.resolveProductColor('카밍클레이브라운')}`));
  assert.match(html, /aria-label="카밍 클레이 브라운"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, />카밍 클레이 브라운<\/span>/);
  assert.match(html, /<svg[^>]*aria-hidden="true"/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /width:24px;height:24px/);
  assert.match(css, /:focus-visible/);
  assert.equal(html.includes('$selected'), false);
  assert.equal(html.includes(' colors='), false);
});

test('compact selectors have a fixed swatch and an independent check badge for white colors', () => {
  const { html, css } = render('화이트', true);
  assert.match(html, /background:#FFFFFF/);
  assert.match(css, /width:36px/);
  assert.match(css, /flex:0 0 24px/);
  assert.match(css, /right:-2px;bottom:-2px/);
});
