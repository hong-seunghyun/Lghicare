export const WHITE_SWATCH = "#FFFFFF";
export const COLOR_FALLBACK = WHITE_SWATCH;
export const RAINBOW_SWATCH =
  "linear-gradient(to right, red, orange, yellow, green, blue, indigo, violet)";
const RAINBOW_CHIP_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "indigo",
  "violet",
];

export const colorMap: Record<string, string> = {
  // 화이트/그레이/실버 계열
  화이트: WHITE_SWATCH,
  린넨화이트: WHITE_SWATCH,
  에센스화이트: WHITE_SWATCH,
  크림화이트: WHITE_SWATCH,
  오브제크림화이트: WHITE_SWATCH,
  샤이니퓨어: "#F8F8FF",
  릴리화이트: WHITE_SWATCH,
  스톤실버: "#C0C0C0",
  스테인리스: "#9FA6A9",
  스테인리스실버: "#A9A9A9",
  모던스테인리스: "#B0B0B0",
  실버: "#C0C0C0",
  샤인: "#D9D9D9",

  // 블랙/다크 계열
  블랙: "#000000",
  오닉스블랙: "#1C1C1C",
  플래티넘블랙: "#2F2F2F",
  다크그라파이트: "#3A3A3A",
  솔리드블랙: "#000000",
  솔리드다크그라파이트: "#333333",
  스페이스블랙: "#1E1E1E",
  스페이스블랙스페이스블랙: "#1E1E1E",
  맨해튼미드나잇: "#2C3E50",
  무드업: RAINBOW_SWATCH, // 특수 처리 (그라데이션)

  // 베이지/브라운 계열
  베이지: "#E6D9C6",
  샌드베이지: "#E4D2BA",
  코지베이지: "#E2C9A7",
  솔리드베이지: "#EAD9BF",
  솔리드카밍베이지: "#E0C7A0",
  오브제베이지: "#E3D3B2",
  브라운: "#8B5E3C",
  코지브라운: "#7B4B3A",
  클레이브라운: "#A9746E",
  토프: "#B9A18F",
  토푸: "#B19E8B",

  // 네이비 계열
  네이비: "#1B2A41",
  네이처네이비: "#1E2D50",
  솔리드맨해튼미드나잇: "#2C3E50",

  // 그린 계열
  네이처그린: "#6BA292",
  솔리드그린: "#4CAF50",
  솔리드카밍그린: "#7BAE7F",
  솔리드미스트그린: "#A8C3A0",

  // 핑크/레드 계열
  핑크: "#F7C6D9",
  샤이니퓨어핑크: "#FADDE1",
  클레이핑크: "#E8AEB7",
  오브제클레이핑크: "#F1C5C5",
  솔리드미스트핑크: "#F7BACF",
  크림피치: "#FFD1BA",
  크림라벤더: "#E6DAF0",

  // 크림/파스텔 계열
  크림레몬: "#FFFACD",
  크림스카이: "#B2D7E6",
  크림그레이: "#D6D6D6",
  솔리드크림화이트: WHITE_SWATCH,
  솔리드크림라벤더: "#D8BFD8",
  솔리드크림레몬: "#FFFACD",
  솔리드크림스카이: "#B0E0E6",

  // 특수 오브제/솔리드 계열
  오브제프라임실버: "#C0C0C0",
  오브제클레이민트: "#A8D5BA",
  오브제클레이미트: "#A8D5BA",
  솔리드스톤핑크: "#F4C2C2",
  솔리드스톤실버: "#C4C4C4",
  솔리드스톰브라운: "#6E4B3A",
  솔리드스페이스블랙: "#1E1E1E",
  솔리드미드블랙: "#2B2B2B",
  솔리드프라임실버: "#B0B0B0",
  솔리드카밍크림화이트: WHITE_SWATCH,
  솔리드카밍크림그레이: "#DDD9D5",
  솔리드아몬드: "#D9CAB3",

  // 아몬드/토프 계열
  아몬드: "#EED9C4",
  아몬드토프: "#CBBBA0",

  // 린넨 계열
  린넨블랙: "#3B3B3B",

  // 스카이/블루 계열
  스카이: "#B0E0E6",
  솔리드미드프리실버: "#C8C8C8",

  // 기타
  솔리드모던스테인리스: "#B5B5B5",
  오브제클레임핑크: "#F1C5C5",
};

const normalizeColorName = (colorName: string) =>
  colorName
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .trim();

const splitColorNames = (colorName: string) =>
  colorName
    .split(/[,/|:：]/)
    .map(normalizeColorName)
    .filter(Boolean);

export const resolveProductColor = (
  colorName: string,
  fallback = COLOR_FALLBACK,
) => {
  const normalized = normalizeColorName(colorName);

  if (!normalized) return fallback;
  if (normalized.includes("무드업")) return RAINBOW_SWATCH;
  if (normalized.includes("화이트") || /white/i.test(normalized)) {
    return WHITE_SWATCH;
  }

  return colorMap[normalized] || fallback;
};

export const getProductColorChipColors = (colorName: string) => {
  const colorNames = splitColorNames(colorName);

  if (colorNames.length === 0) {
    return [COLOR_FALLBACK];
  }

  if (colorNames.some((name) => name.includes("무드업"))) {
    return RAINBOW_CHIP_COLORS;
  }

  return colorNames.map((name) => resolveProductColor(name));
};
