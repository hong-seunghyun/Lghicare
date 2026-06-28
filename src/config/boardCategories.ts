import { categories } from "@/constants/categories";

export const SALES_HUB_ID = "sales-hub";
export const SALES_TALK_BOARD_ID = "sales-talk-board";
export const STANDARD_ESTIMATE_CATEGORY_PREFIX = "standard-multi-item-estimate";

export type BoardCategory = {
  id: string;
  label: string;
  parentId?: string;
  salesIndexed?: boolean;
};

const getSalesHubProductNames = () => {
  const names: string[] = [];
  const seen = new Set<string>();

  categories.forEach((group) => {
    group.subCategories.forEach((sub) => {
      if (!sub.url || !sub.url.startsWith("/products/")) return;
      if (seen.has(sub.name)) return;
      seen.add(sub.name);
      names.push(sub.name);
    });
  });

  return names;
};

const buildSalesHubProductCategories = (): BoardCategory[] => {
  const products = getSalesHubProductNames();
  return products.map((name) => ({
    id: `${SALES_HUB_ID}-${name}`,
    label: name,
    parentId: SALES_HUB_ID,
  }));
};

const buildSalesHubContentCategories = (
  productCategories: BoardCategory[],
): BoardCategory[] =>
  productCategories.flatMap((product) => [
    {
      id: `sales-talk-${product.label}`,
      label: "모바일 톡",
      parentId: product.id,
      salesIndexed: true,
    },
    {
      id: `spec-book-${product.label}`,
      label: "스펙 북",
      parentId: product.id,
      salesIndexed: true,
    },
    {
      id: `sales-new-book-${product.label}`,
      label: "세일즈 톡",
      parentId: product.id,
      salesIndexed: true,
    },
    {
      id: `${STANDARD_ESTIMATE_CATEGORY_PREFIX}-${product.label}`,
      label: "프로모션 견적서",
      parentId: product.id,
      salesIndexed: true,
    },
  ]);

const salesHubCommonCategory: BoardCategory = {
  id: `${SALES_HUB_ID}-common`,
  label: "공통",
  parentId: SALES_HUB_ID,
};

const salesHubProductCategories = buildSalesHubProductCategories();
const salesHubProducts = [salesHubCommonCategory, ...salesHubProductCategories];
const salesHubContentCategories = buildSalesHubContentCategories(salesHubProducts);

export const boardCategories: BoardCategory[] = [
  { id: "notice", label: "공지사항" },
  { id: "new-subscription", label: "신규구독" },
  { id: "combined-subscription", label: "통합구독" },
  { id: SALES_HUB_ID, label: "세일즈허브 게시판" },
  ...salesHubProducts,
  ...salesHubContentCategories,
  { id: "inquiry", label: "문의하기" },
];

export const getBoardCategoryById = (id?: string | null) =>
  boardCategories.find((category) => category.id === id) || null;

export const getBoardCategoryChildren = (parentId: string) =>
  boardCategories.filter((category) => category.parentId === parentId);

export const getBoardCategoryParents = () =>
  boardCategories.filter((category) => !category.parentId);

export const getBoardLeafCategories = () => {
  const parentIds = new Set(
    boardCategories
      .map((category) => category.parentId)
      .filter((parentId): parentId is string => Boolean(parentId)),
  );
  return boardCategories.filter((category) => !parentIds.has(category.id));
};

export const isSalesIndexedCategory = (id?: string | null) =>
  Boolean(getBoardCategoryById(id)?.salesIndexed);

export const isStandardEstimateCategory = (id?: string | null) =>
  Boolean(id && id.startsWith(`${STANDARD_ESTIMATE_CATEGORY_PREFIX}-`));

export const getBoardCounterId = (categoryId: string) =>
  `salesHub_${encodeURIComponent(categoryId)}`;

export const getBoardCategoryLabel = (id?: string | null) =>
  getBoardCategoryById(id)?.label || "-";

export const getBoardCategoryFullLabel = (id?: string | null) => {
  const category = getBoardCategoryById(id);
  if (!category) return "-";
  const labels = [category.label];
  let current = category;
  while (current.parentId) {
    const parent = getBoardCategoryById(current.parentId);
    if (!parent) break;
    labels.unshift(parent.label);
    current = parent;
  }
  return labels.join(" / ");
};

export const getBoardCategoryPath = (id: string) => `/admin/boards/${id}`;

export const getBoardNavigationItems = () => {
  const items: { label: string; path: string }[] = [];

  const walk = (parentId: string | null, depth: number) => {
    const categories = parentId
      ? getBoardCategoryChildren(parentId)
      : getBoardCategoryParents();
    categories.forEach((category) => {
      const prefix = depth > 0 ? "ㄴ ".repeat(depth) : "";
      items.push({
        label: `${prefix}${category.label}`,
        path: getBoardCategoryPath(category.id),
      });
      const children = getBoardCategoryChildren(category.id);
      if (children.length > 0) {
        walk(category.id, depth + 1);
      }
    });
  };

  walk(null, 0);

  return items;
};

export const getSalesHubNavigationItems = () => {
  const salesHub = getBoardCategoryById(SALES_HUB_ID);
  if (!salesHub) return [];
  return [{ label: salesHub.label, path: getBoardCategoryPath(salesHub.id) }];
};

export const getStandardEstimateDefaultCategory = () =>
  boardCategories.find((category) => isStandardEstimateCategory(category.id)) ||
  null;

export const getAdminStandardEstimateNavigationItem = () => {
  const category = getStandardEstimateDefaultCategory();
  if (!category) return null;
  return { label: "프로모션 견적서", path: "/promotion-set-estimate" };
};

export const getManagerStandardEstimateNavigationItem = () => {
  const category = getStandardEstimateDefaultCategory();
  if (!category) return null;
  return { label: "프로모션 견적서", path: "/promotion-set-estimate" };
};

export const getAdminBoardNavigationItems = () => {
  const items: { label: string; path: string }[] = [];
  const parents = getBoardCategoryParents();

  parents.forEach((parent) => {
    items.push({ label: parent.label, path: getBoardCategoryPath(parent.id) });
    if (parent.id === SALES_HUB_ID) return;
    const children = getBoardCategoryChildren(parent.id);
    children.forEach((child) => {
      items.push({
        label: `ㄴ ${child.label}`,
        path: getBoardCategoryPath(child.id),
      });
    });
  });

  return items;
};

export const getSalesHubProductCategories = () =>
  getBoardCategoryChildren(SALES_HUB_ID);

export const getSalesHubContentCategories = (productId: string) =>
  getBoardCategoryChildren(productId);

export const isSalesHubCategory = (id?: string | null) => {
  let current = getBoardCategoryById(id);
  while (current) {
    if (current.id === SALES_HUB_ID) return true;
    if (!current.parentId) break;
    current = getBoardCategoryById(current.parentId);
  }
  return false;
};

export const getSalesHubProductId = (id?: string | null) => {
  let current = getBoardCategoryById(id);
  while (current) {
    if (current.parentId === SALES_HUB_ID) return current.id;
    if (!current.parentId) break;
    current = getBoardCategoryById(current.parentId);
  }
  return null;
};

// ===== Manager board helpers =====
export const getSalesIndexedCategoryIds = () =>
  boardCategories
    .filter((category) => category.salesIndexed)
    .map((category) => category.id);

export const managerBoardCategoryIds = [
  "notice",
  "inquiry",
  ...getSalesIndexedCategoryIds(),
];

export const getManagerBoardLeafCategories = () =>
  boardCategories.filter((category) =>
    managerBoardCategoryIds.includes(category.id),
  );

export const getManagerBoardNavigationItems = () =>
  getManagerBoardLeafCategories().map((category) => ({
    label: getBoardCategoryFullLabel(category.id),
    path: `/manager/boards/${category.id}`,
  }));

export const getManagerSalesHubNavigationItems = () => {
  const items: { label: string; path: string }[] = [];
  const salesHub = getBoardCategoryById(SALES_HUB_ID);
  if (salesHub) {
    items.push({ label: salesHub.label, path: `/manager/boards/${salesHub.id}` });
  }
  const salesTalkBoard = getBoardCategoryById(SALES_TALK_BOARD_ID);
  if (salesTalkBoard) {
    items.push({
      label: salesTalkBoard.label,
      path: `/manager/boards/${salesTalkBoard.id}`,
    });
  }
  return items;
};
