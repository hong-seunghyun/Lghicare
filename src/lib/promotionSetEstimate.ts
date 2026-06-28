export const PROMOTION_SET_CONFIG_COLLECTION = "promotionSetEstimateConfig";
export const PROMOTION_SET_CONFIG_DOC_ID = "active";

export const PROMOTION_SET_CATEGORIES = [
  "정수기",
  "TV",
  "의류건조기",
  "세탁기",
  "신발관리기",
  "냉장고",
  "김치냉장고",
  "식기세척기",
  "전기레인지",
  "광파오븐",
  "워시타워",
  "의류관리기",
  "청소기",
  "가습기",
  "바스에어시스템",
  "워시콤보",
  "에어컨",
  "제습기",
  "공기청정기",
  "안마의자",
  "마이컵",
];

export type PromotionSetVariant = Record<string, unknown> & {
  모델코드?: string;
  상품명?: string;
  계약기간?: string;
  서비스유형?: string;
  "서비스주기/월"?: string;
  "프로모션 대분류"?: string;
  프로모션유형?: string;
  프로모션명?: string;
  정상가?: string | number;
  할인전금액?: string | number;
  할인후금액?: string | number;
  할인금액?: string | number;
  thumbnailUrl?: string;
};

export type PromotionSetProduct = {
  id: string;
  modelCode: string;
  productName: string;
  category: string;
  modelName: string;
  thumbnailUrl: string;
  benefitLabel: string;
  baseMonthly?: number;
  finalMonthly?: number;
  selectedVariant?: PromotionSetVariant;
  variants?: ProductSearchVariant[];
};

export type PromotionSetType = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  products: PromotionSetProduct[];
};

export type PromotionSetDiy = {
  enabled: boolean;
  name: string;
  description: string;
  minSelections: number;
  products: PromotionSetProduct[];
};

export type PromotionSetPackage = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  sets: PromotionSetType[];
  diy: PromotionSetDiy;
};

export type PromotionSetEstimateLabels = {
  pageTitle: string;
  pageDescription: string;
  setProductsTitle: string;
  summaryTitle: string;
  estimateButton: string;
  emptySelectionText: string;
  fixedSetNotice: string;
  diyHelpText: string;
  benefitTitle: string;
};

export type PromotionSetEstimateConfig = {
  labels: PromotionSetEstimateLabels;
  packages: PromotionSetPackage[];
  sets?: PromotionSetType[];
  diy?: PromotionSetDiy;
  updatedAt?: unknown;
};

export type ProductSearchVariant = PromotionSetVariant & {
  모델코드: string;
  상품명: string;
};

export type ProductSearchResult = {
  모델코드: string;
  상품명: string;
  중분류?: string;
  thumbnailUrl?: string;
  variants?: ProductSearchVariant[];
  selectedVariant?: PromotionSetVariant;
  baseMonthly?: number;
  finalPrice?: number;
};

export const PROMOTION_SET_TYPE_NAMES = ["Essential", "Value", "Premium"];

const createDefaultSets = (): PromotionSetType[] =>
  PROMOTION_SET_TYPE_NAMES.map((name) => ({
    id: name.toLowerCase(),
    name,
    description: `${name} 세트 구성`,
    enabled: true,
    products: [],
  }));

const createDefaultDiy = (): PromotionSetDiy => ({
  enabled: true,
  name: "DIY",
  description: "원하는 제품을 자유롭게 선택",
  minSelections: 1,
  products: [],
});

export const DEFAULT_PROMOTION_SET_CONFIG: PromotionSetEstimateConfig = {
  labels: {
    pageTitle: "프로모션 세트견적",
    pageDescription: "시즌별 패키지와 세트 타입을 선택해 월 예상 구독료를 확인하세요.",
    setProductsTitle: "세트 구성 제품",
    summaryTitle: "선택한 견적 요약",
    estimateButton: "견적내기",
    emptySelectionText: "담은 제품이 없습니다.",
    fixedSetNotice: "관리자가 지정한 세트 구성입니다.",
    diyHelpText: "원하는 제품을 골라 담은 뒤 견적을 확인하세요.",
    benefitTitle: "혜택 안내",
  },
  packages: [
    {
      id: "rainy-season-essential",
      name: "장마시즌 필수가전",
      description: "습도와 실내 위생 관리에 필요한 시즌 필수 구성입니다.",
      enabled: true,
      sets: [
        {
          id: "essential",
          name: "Essential",
          description: "가장 기본이 되는 필수 제품 구성",
          enabled: true,
          products: [
            {
              id: "essential-wd521awb",
              modelCode: "WD521AWB",
              productName: "오브제 정수기",
              category: "정수기",
              modelName: "WD521AWB",
              thumbnailUrl: "/images/main-category-1.png",
              benefitLabel: "기본 프로모션 적용",
              baseMonthly: 29900,
              finalMonthly: 29900,
              selectedVariant: {
                모델코드: "WD521AWB",
                상품명: "오브제 정수기",
                계약기간: "72",
                서비스유형: "방문관리",
                프로모션명: "기본 프로모션",
                할인후금액: 29900,
              },
            },
          ],
        },
        {
          id: "value",
          name: "Value",
          description: "가격과 구성을 균형 있게 맞춘 추천 세트",
          enabled: true,
          products: [],
        },
        {
          id: "premium",
          name: "Premium",
          description: "상위 제품까지 포함한 프리미엄 구성",
          enabled: true,
          products: [
            {
              id: "premium-as303dwfa",
              modelCode: "AS303DWFA",
              productName: "퓨리케어 360° 공기청정기",
              category: "공기청정기",
              modelName: "AS303DWFA",
              thumbnailUrl: "/images/main-category-7.png",
              benefitLabel: "공기청정 케어 혜택",
              baseMonthly: 19900,
              finalMonthly: 19900,
              selectedVariant: {
                모델코드: "AS303DWFA",
                상품명: "퓨리케어 360° 공기청정기",
                계약기간: "72",
                서비스유형: "방문관리",
                프로모션명: "공기청정 케어",
                할인후금액: 19900,
              },
            },
          ],
        },
      ],
      diy: {
        enabled: true,
        name: "DIY",
        description: "세트 제한 없이 원하는 제품을 자유롭게 선택",
        minSelections: 1,
        products: [
          {
            id: "diy-s5mbua",
            modelCode: "S5MBUA",
            productName: "오브제 스타일러",
            category: "의류관리기",
            modelName: "S5MBUA",
            thumbnailUrl: "/images/main-category-8.png",
            benefitLabel: "골라담기 추천 제품",
            baseMonthly: 32900,
            finalMonthly: 32900,
            selectedVariant: {
              모델코드: "S5MBUA",
              상품명: "오브제 스타일러",
              계약기간: "72",
              서비스유형: "방문관리",
              프로모션명: "골라담기",
              할인후금액: 32900,
            },
          },
        ],
      },
    },
    {
      id: "summer-appliances",
      name: "무더위 가전",
      description: "더운 계절에 필요한 냉방과 공기 케어 중심 구성입니다.",
      enabled: true,
      sets: createDefaultSets(),
      diy: createDefaultDiy(),
    },
  ],
};

export const parsePromotionMoney = (value: unknown): number => {
  if (!value && value !== 0) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  const cleaned = value.replace(/[^0-9]/g, "");
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatPromotionPrice = (value: number) =>
  `${value.toLocaleString("ko-KR")}원`;

export const getVariantMonthly = (variant?: PromotionSetVariant) =>
  parsePromotionMoney(variant?.할인후금액) ||
  parsePromotionMoney(variant?.정상가) ||
  parsePromotionMoney(variant?.할인전금액);

export const getDefaultPromotionVariant = <
  T extends PromotionSetVariant | undefined,
>(
  variants: T[] | undefined,
): T | undefined => {
  const safeVariants = (variants ?? []).filter(Boolean) as NonNullable<T>[];
  if (!safeVariants.length) return undefined;

  const newPromotionVariants = safeVariants.filter(
    (variant) => String(variant["프로모션 대분류"] ?? "").trim() === "신규",
  );
  const candidates = newPromotionVariants.length
    ? newPromotionVariants
    : safeVariants;

  return candidates.reduce((best, variant) => {
    const bestMonthly = getVariantMonthly(best);
    const variantMonthly = getVariantMonthly(variant);

    if (!bestMonthly) return variant;
    if (!variantMonthly) return best;
    return variantMonthly < bestMonthly ? variant : best;
  }, candidates[0]) as T;
};

export const getVariantLabel = (variant?: PromotionSetVariant) => {
  if (!variant) return "옵션 정보 없음";

  const parts = [
    variant.계약기간 ? `${variant.계약기간}개월` : "",
    variant.서비스유형,
    variant["서비스주기/월"],
    variant.프로모션명 || variant.프로모션유형,
  ].filter(Boolean);

  const price = getVariantMonthly(variant);
  return `${parts.join(" / ") || "기본 옵션"}${price ? ` · 월 ${formatPromotionPrice(price)}` : ""}`;
};

export const compactPromotionSetProduct = (
  product: PromotionSetProduct,
): PromotionSetProduct => {
  const selectedVariant =
    product.selectedVariant ?? getDefaultPromotionVariant(product.variants);
  const monthly = getVariantMonthly(selectedVariant);

  return {
    id: product.id,
    modelCode: product.modelCode,
    productName: product.productName,
    category: product.category,
    modelName: product.modelName || product.modelCode,
    thumbnailUrl: product.thumbnailUrl || "/placeholder.png",
    benefitLabel: product.benefitLabel || "프로모션 구성 모델",
    ...(selectedVariant ? { selectedVariant } : {}),
    ...(monthly ? { baseMonthly: monthly, finalMonthly: monthly } : {}),
  };
};

export const compactPromotionSetConfig = (
  config: PromotionSetEstimateConfig,
): PromotionSetEstimateConfig => ({
  ...config,
  packages: config.packages.map((promotionPackage) => ({
    ...promotionPackage,
    sets: promotionPackage.sets.map((set) => ({
      ...set,
      products: set.products.map(compactPromotionSetProduct),
    })),
    diy: {
      ...promotionPackage.diy,
      products: promotionPackage.diy.products.map(compactPromotionSetProduct),
    },
  })),
});

export const createPromotionSetProduct = (
  result: ProductSearchResult,
): PromotionSetProduct => {
  const representative = result.variants?.[0];
  const selectedVariant = getDefaultPromotionVariant(result.variants);
  const modelCode = result.모델코드 || representative?.모델코드 || "";
  const productName = result.상품명 || representative?.상품명 || modelCode;
  const category = result.중분류 || "";
  const monthly = getVariantMonthly(selectedVariant);

  return {
    id: `${modelCode}-${Date.now()}`,
    modelCode,
    productName,
    category,
    modelName: modelCode,
    thumbnailUrl: result.thumbnailUrl || representative?.thumbnailUrl || "/placeholder.png",
    benefitLabel: "프로모션 구성 모델",
    selectedVariant,
    variants: result.variants,
    ...(monthly ? { baseMonthly: monthly, finalMonthly: monthly } : {}),
  };
};

const normalizeSets = (sets: PromotionSetType[] | undefined) => {
  const source = Array.isArray(sets) ? sets : [];
  return PROMOTION_SET_TYPE_NAMES.map((name) => {
    const existing = source.find(
      (set) => set.name === name || set.id === name.toLowerCase(),
    );

    return {
      id: existing?.id || name.toLowerCase(),
      name,
      description: existing?.description || `${name} 세트 구성`,
      enabled: existing?.enabled !== false,
      products: Array.isArray(existing?.products) ? existing.products : [],
    };
  });
};

const normalizeDiy = (diy: PromotionSetDiy | undefined): PromotionSetDiy => ({
  ...createDefaultDiy(),
  ...(diy ?? {}),
  name: diy?.name || "DIY",
  products: Array.isArray(diy?.products) ? diy.products : [],
});

export const normalizePromotionSetConfig = (
  data: Partial<PromotionSetEstimateConfig> | null | undefined,
): PromotionSetEstimateConfig => {
  const labels = {
    ...DEFAULT_PROMOTION_SET_CONFIG.labels,
    ...(data?.labels ?? {}),
  };
  const legacySets = Array.isArray(data?.sets) ? data.sets : undefined;
  const legacyDiy = data?.diy;
  const sourcePackages = Array.isArray(data?.packages)
    ? data.packages
    : legacySets || legacyDiy
      ? [
          {
            id: "rainy-season-essential",
            name: "장마시즌 필수가전",
            description: "습도와 실내 위생 관리에 필요한 시즌 필수 구성입니다.",
            enabled: true,
            sets: legacySets ?? [],
            diy: legacyDiy ?? createDefaultDiy(),
          },
          DEFAULT_PROMOTION_SET_CONFIG.packages[1],
        ]
      : DEFAULT_PROMOTION_SET_CONFIG.packages;

  return {
    labels,
    packages: sourcePackages.map((promotionPackage) => ({
      id: promotionPackage.id || `package-${Date.now()}`,
      name: promotionPackage.name || "새 프로모션",
      description: promotionPackage.description || "",
      enabled: promotionPackage.enabled !== false,
      sets: normalizeSets(promotionPackage.sets),
      diy: normalizeDiy(promotionPackage.diy),
    })),
    updatedAt: data?.updatedAt,
  };
};

export const getEnabledPromotionPackages = (
  config: PromotionSetEstimateConfig,
) => config.packages.filter((promotionPackage) => promotionPackage.enabled);

export const getPromotionPackageDiyProducts = (
  promotionPackage: PromotionSetPackage,
) => {
  const productMap = new Map<string, PromotionSetProduct>();
  const addProduct = (product: PromotionSetProduct) => {
    const key = product.modelCode || product.id;
    if (!productMap.has(key)) {
      productMap.set(key, product);
    }
  };

  promotionPackage.sets.forEach((set) => {
    set.products.forEach(addProduct);
  });
  promotionPackage.diy.products.forEach(addProduct);

  return Array.from(productMap.values());
};

export const getPromotionPackageEntries = (
  promotionPackage: PromotionSetPackage,
) => [
  ...promotionPackage.sets.filter((set) => set.enabled),
  ...(promotionPackage.diy.enabled
    ? [
        {
          id: "diy",
          name: promotionPackage.diy.name,
          description: promotionPackage.diy.description,
          enabled: true,
          products: getPromotionPackageDiyProducts(promotionPackage),
        } satisfies PromotionSetType,
      ]
    : []),
];

export const getEnabledPromotionEntries = (
  config: PromotionSetEstimateConfig,
) => {
  const firstPackage = getEnabledPromotionPackages(config)[0];
  return firstPackage ? getPromotionPackageEntries(firstPackage) : [];
};
