export type MainBannerStatus = "active" | "inactive";

export type MainBanner = {
  id: string;
  title?: string;
  status: MainBannerStatus;
  priority: number;
  pcImageUrl?: string | null;
  pcImageStoragePath?: string | null;
  mobileImageUrl?: string | null;
  mobileImageStoragePath?: string | null;
  linkUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ThemeCategoryConfig = {
  id: string;
  label: string;
  sheetName: string;
  status: "active" | "inactive";
  priority: number;
  modelNames: string[];
};

export type ThemeProductsConfig = {
  categories: ThemeCategoryConfig[];
  updatedAt?: unknown;
};

export type ThemeProductPreview = {
  modelName: string;
  found: boolean;
  product?: MainThemeProduct;
  error?: string;
};

export type ThemeCategoryPreview = ThemeCategoryConfig & {
  previews: ThemeProductPreview[];
  products: MainThemeProduct[];
};

export type MainThemeProduct = {
  modelCode: string;
  productName: string;
  middle: string;
  thumbnailUrl?: string;
  monthlyPrice: number;
  effectivePrice: number;
  discountText?: string;
  detailUrl: string;
};
