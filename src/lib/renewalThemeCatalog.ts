import { normalizeModelCode, normalizeProduct, themeProductSummary } from "./renewalTest";

export function buildThemeCatalog(rows: Record<string, string>[], category: string, models: string[]) {
  const groups = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    if (row.중분류?.trim() !== category) continue;
    const key = normalizeModelCode(row.모델코드 || "");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return models.slice(0, 3).flatMap((model) => {
    const variants = groups.get(normalizeModelCode(model));
    if (!variants?.length) return [];
    const product = normalizeProduct({ ...variants[0], variants });
    return product ? [themeProductSummary(product)] : [];
  });
}
