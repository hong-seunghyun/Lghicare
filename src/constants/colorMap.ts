export const WHITE_SWATCH = "#FFFFFF";
export const COLOR_FALLBACK = "#CDD2D8";
export const UNKNOWN_COLOR_SWATCH =
  "repeating-linear-gradient(135deg, #EEF0F3 0px, #EEF0F3 4px, #C4CAD2 4px, #C4CAD2 8px)";
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
  크림화이트: "#F4F1E9",
  오브제크림화이트: "#F4F1E9",
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
  클레이브라운: "#A39789",
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
  솔리드크림화이트: "#F4F1E9",
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
  솔리드카밍크림화이트: "#F4F1E9",
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

  // Uploaded catalog names. Swatches are display approximations; preserve the
  // catalog's full color names in the selector and use product photos as well.
  카밍베이지: "#E3DFD5",
  카밍클레이브라운: "#A39789",
  카밍크림화이트: "#F4F1E9",
  카밍크림그레이: "#D7D6D1",
  카밍그린: "#8D9B8C",
  카밍핑크: "#DDBDB7",
  카밍클레이민트: "#B9C9BE",
  그레이: "#A8AAAC",
  그린: "#8D9B8C",
  네이처베이지: "#D8CFBE",
  에센스그라파이트: "#626668",
  에센스블랙: "#272A2D",
  미드블랙: "#2B2B2B",
  스틸블랙: "#45494A",
  딥블랙미러: "#242629",
  블랙틴트미러: "#3C3E40",
  미드프리실버: "#C8C8C8",
  프라임실버: "#B0B0B0",
  몽블랑네이처: "#A2A5A5",
  스톤: "#B9BBBC",
  스톤핑크: "#D6B8B0",
  스톰브라운: "#6E5F56",
  클레이민트: "#B9C9BE",
  미스트베이지: "#DFD5C5",
  미스트핑크: "#E1C2C2",
};

export const normalizeColorName = (colorName: string) =>
  colorName
    .normalize("NFKC")
    .replace(/^오[)）]/, "오브제")
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .replace(/스테인레스/g, "스테인리스")
    .replace(/플래티늄/g, "플래티넘")
    .replace(/카멩/g, "카밍")
    .toLowerCase()
    .trim();

const splitColorNames = (colorName: string) =>
  colorName
    .normalize("NFKC")
    .replace(/(?:상단|하단|상부|하부|본체|패널)\s*[:：]\s*/g, "")
    .split(/[,/|:+&·\-]/)
    .map(normalizeColorName)
    .filter(Boolean);

const englishColors: Record<string, string> = {
  white: WHITE_SWATCH, black: colorMap.블랙, beige: colorMap.베이지,
  brown: colorMap.브라운, navy: colorMap.네이비, green: colorMap.그린,
  pink: colorMap.핑크, silver: colorMap.실버, gray: colorMap.그레이,
  grey: colorMap.그레이, blue: "#6D91AD", mint: colorMap.클레이민트,
};
const colorNamesByLength = Object.keys({ ...colorMap, ...englishColors })
  .sort((a, b) => b.length - a.length);

export const isProductColorName = (colorName?: string) => {
  const value = normalizeColorName(colorName ?? "");
  return Boolean(value) && !["-", "0", "단일색상", "없음", "n/a", "na"].includes(value);
};

export const resolveProductColor = (
  colorName: string,
  fallback = COLOR_FALLBACK,
) => {
  const normalized = normalizeColorName(colorName);

  if (!normalized) return fallback;
  if (normalized.includes("무드업")) return RAINBOW_SWATCH;
  const exact = colorMap[normalized] || englishColors[normalized];
  if (exact) return exact;
  // Longer names win: 카밍 클레이 브라운 uses its own tone before 브라운.
  const suffix = colorNamesByLength.find((name) => normalized.endsWith(name));
  return suffix ? colorMap[suffix] || englishColors[suffix] : fallback;
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

export const getProductColorChipBackground = (colorName: string) => {
  const colors = getProductColorChipColors(colorName);
  if (colors.every((color) => color === COLOR_FALLBACK)) return UNKNOWN_COLOR_SWATCH;
  if (colors.length === 1) return colors[0];
  if (colors.length === 2)
    return `linear-gradient(to bottom, ${colors[0]} 0% 50%, ${colors[1]} 50% 100%)`;
  return `conic-gradient(${colors.map((color, index) =>
    `${color} ${(index / colors.length) * 100}% ${((index + 1) / colors.length) * 100}%`,
  ).join(", ")})`;
};
