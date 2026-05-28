import type {
  MainThemeProduct,
  ThemeCategoryConfig,
  ThemeCategoryPreview,
  ThemeProductPreview,
} from "@/types/mainPage";

export const PRODUCT_CATEGORY_OPTIONS = [
  "정수기",
  "냉장고",
  "김치냉장고",
  "식기세척기",
  "전기레인지",
  "광파오븐",
  "에어컨",
  "공기청정기",
  "제습기",
  "세탁기",
  "워시타워",
  "워시콤보",
  "의류건조기",
  "의류관리기",
  "신발관리기",
  "청소기",
  "안마의자",
  "TV",
] as const;

type ApiProductVariant = {
  모델코드?: string;
  상품명?: string;
  가격?: string;
  할인전금액?: string;
  할인후금액?: string;
  정상가?: string;
  thumbnailUrl?: string;
};

type ApiProduct = ApiProductVariant & {
  중분류?: string;
  thumbnailUrl?: string;
  variants?: ApiProductVariant[];
};

type ThemePreviewCacheEntry = {
  ts: number;
  value: ThemeCategoryPreview;
};

const THEME_PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;
const themePreviewCache = new Map<string, ThemePreviewCacheEntry>();
const pendingThemePreviewCache = new Map<string, Promise<ThemeCategoryPreview>>();

const normalizeModel = (value: string) =>
  value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

export const parseModelNames = (value: string) =>
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

const toPriceNumber = (value?: string) => {
  if (!value) return 0;
  const parsed = Number(value.replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getVariantPrice = (variant: ApiProductVariant) =>
  toPriceNumber(variant.할인후금액 || variant.가격 || variant.정상가 || variant.할인전금액);

const mapProduct = (
  product: ApiProduct,
  requestedModel: string,
  sheetName: string,
): MainThemeProduct | null => {
  const variants = product.variants ?? [];
  const requestedKey = normalizeModel(requestedModel);
  const exactVariant =
    variants.find((variant) => normalizeModel(variant.모델코드 ?? "") === requestedKey) ??
    undefined;

  const modelCode = exactVariant?.모델코드 || product.모델코드 || requestedModel;
  if (normalizeModel(modelCode) !== requestedKey && !exactVariant) return null;

  const prices = (variants.length > 0 ? variants : [product])
    .map(getVariantPrice)
    .filter((price) => price > 0);
  const monthlyPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const effectivePrice = monthlyPrice > 13000 ? monthlyPrice - 13000 : monthlyPrice;
  const middle = product.중분류 || sheetName;

  return {
    modelCode,
    productName: exactVariant?.상품명 || product.상품명 || modelCode,
    middle,
    thumbnailUrl: exactVariant?.thumbnailUrl || product.thumbnailUrl || "",
    monthlyPrice,
    effectivePrice,
    discountText:
      monthlyPrice > 0 && effectivePrice > 0 && effectivePrice < monthlyPrice
        ? `월 체감요금 ${effectivePrice.toLocaleString("ko-KR")}원`
        : "",
    detailUrl: `/products/${encodeURIComponent(middle)}/${encodeURIComponent(modelCode)}`,
  };
};

export const fetchThemeProduct = async (
  sheetName: string,
  modelName: string,
): Promise<ThemeProductPreview> => {
  const params = new URLSearchParams({
    middle: sheetName,
    q: modelName,
    groupBy: "modelCode",
  });

  try {
    const response = await fetch(`/api/products?${params.toString()}`);
    if (!response.ok) {
      return {
        modelName,
        found: false,
        error: `상품 조회 실패 (${response.status})`,
      };
    }

    const data = (await response.json()) as { options?: ApiProduct[] };
    const requestedKey = normalizeModel(modelName);
    const mappedProducts =
      data.options
        ?.map((item) => mapProduct(item, modelName, sheetName))
        .filter((item): item is MainThemeProduct => Boolean(item)) ?? [];
    const product =
      mappedProducts.find(
        (item) => normalizeModel(item.modelCode) === requestedKey,
      ) ?? null;

    if (!product) {
      return { modelName, found: false, error: "일치하는 모델명이 없습니다." };
    }

    return { modelName, found: true, product };
  } catch (error) {
    console.error("theme product lookup error:", error);
    return { modelName, found: false, error: "상품 조회 중 오류가 발생했습니다." };
  }
};

const getCategoryCacheKey = (category: ThemeCategoryConfig) =>
  JSON.stringify({
    id: category.id,
    label: category.label,
    sheetName: category.sheetName,
    status: category.status,
    priority: category.priority,
    modelNames: category.modelNames,
  });

const fetchThemeCategoryPreview = async (
  category: ThemeCategoryConfig,
): Promise<ThemeCategoryPreview> => {
  const cacheKey = getCategoryCacheKey(category);
  const cached = themePreviewCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.ts < THEME_PREVIEW_CACHE_TTL_MS) {
    return cached.value;
  }

  const pending = pendingThemePreviewCache.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    if (category.modelNames.length === 0) {
      return {
        ...category,
        previews: [],
        products: [],
      };
    }

    const params = new URLSearchParams({
      middle: category.sheetName,
      models: category.modelNames.join(","),
      groupBy: "modelCode",
    });

    try {
      const response = await fetch(`/api/products?${params.toString()}`);
      if (!response.ok) {
        const previews = category.modelNames.map((modelName) => ({
          modelName,
          found: false,
          error: `상품 조회 실패 (${response.status})`,
        }));
        return {
          ...category,
          previews,
          products: [],
        };
      }

      const data = (await response.json()) as { options?: ApiProduct[] };
      const products = data.options ?? [];
      const previews = category.modelNames.map((modelName) => {
        const requestedKey = normalizeModel(modelName);
        const mappedProduct =
          products
            .map((item) => mapProduct(item, modelName, category.sheetName))
            .filter((item): item is MainThemeProduct => Boolean(item))
            .find((item) => normalizeModel(item.modelCode) === requestedKey) ?? null;

        if (!mappedProduct) {
          return {
            modelName,
            found: false,
            error: "일치하는 모델명이 없습니다.",
          };
        }

        return { modelName, found: true, product: mappedProduct };
      });
      const value = {
        ...category,
        previews,
        products: previews
          .map((preview) => preview.product)
          .filter((product): product is MainThemeProduct => Boolean(product)),
      };

      themePreviewCache.set(cacheKey, { ts: Date.now(), value });
      return value;
    } catch (error) {
      console.error("theme category lookup error:", error);
      return {
        ...category,
        previews: category.modelNames.map((modelName) => ({
          modelName,
          found: false,
          error: "상품 조회 중 오류가 발생했습니다.",
        })),
        products: [],
      };
    } finally {
      pendingThemePreviewCache.delete(cacheKey);
    }
  })();

  pendingThemePreviewCache.set(cacheKey, promise);
  return promise;
};

export const fetchThemeCategoryPreviews = async (
  categories: ThemeCategoryConfig[],
  options?: { activeOnly?: boolean },
): Promise<ThemeCategoryPreview[]> => {
  const activeOnly = options?.activeOnly ?? false;
  const targetCategories = [...categories]
    .filter((category) => !activeOnly || category.status === "active")
    .sort((a, b) => a.priority - b.priority);

  return Promise.all(targetCategories.map(fetchThemeCategoryPreview));
};
