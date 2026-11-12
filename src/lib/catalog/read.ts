import { createCatalogStore } from "./store";
import type {
  ArtifactRef,
  CatalogPointer,
  CatalogRelease,
  ProductRow,
  VoucherBundle,
} from "./types";
import { clearLocalProductCaches } from "@/lib/productCacheControl";

const state = globalThis as typeof globalThis & {
  __catalogReader?: {
    pointer?: CatalogPointer;
    checked: number;
    epoch: number;
    pending?: Promise<CatalogPointer>;
    artifacts: Map<string, { value: unknown; size: number }>;
    bytes: number;
    versions?: Map<string, ArtifactRef>;
    pendingArtifacts?: Map<string, Promise<unknown>>;
  };
};
const cache: NonNullable<typeof state.__catalogReader> =
  (state.__catalogReader ??= {
    checked: 0,
    epoch: 0,
    artifacts: new Map(),
    bytes: 0,
  });
cache.epoch ??= 0;
const versions = (cache.versions ??= new Map<string, ArtifactRef>());
const pendingArtifacts = (cache.pendingArtifacts ??= new Map<
  string,
  Promise<unknown>
>());
export function clearCatalogReader() {
  cache.checked = 0;
  cache.epoch++;
  cache.pending = undefined;
}
export async function catalogPointer(fresh = false): Promise<CatalogPointer> {
  if (!fresh && cache.pointer && Date.now() - cache.checked < 15_000)
    return cache.pointer;
  if (cache.pending) return cache.pending;
  const epoch = cache.epoch;
  const request = createCatalogStore()
    .pointer()
    .then((pointer) => {
      if (!pointer.generation || (pointer.id && !pointer.manifest))
        throw new Error("상품 버전 정보가 올바르지 않습니다.");
      if (epoch === cache.epoch) {
        if (cache.pointer && cache.pointer.generation !== pointer.generation)
          clearLocalProductCaches("sheets");
        cache.pointer = pointer;
        cache.checked = Date.now();
      }
      return pointer;
    })
    .catch((error) => {
      // Keep the last known published version; never silently replace it with Sheet prices.
      if (cache.pointer && !fresh) {
        cache.checked = Date.now() - 10_000;
        return cache.pointer;
      }
      throw error;
    });
  cache.pending = request;
  try {
    return await request;
  } finally {
    if (cache.pending === request) cache.pending = undefined;
  }
}
export async function readArtifact<T>(ref: ArtifactRef): Promise<T> {
  const pending = pendingArtifacts.get(ref.sha256);
  if (pending) return pending as Promise<T>;
  const request = loadArtifact<T>(ref);
  pendingArtifacts.set(ref.sha256, request);
  try {
    return await request;
  } finally {
    if (pendingArtifacts.get(ref.sha256) === request)
      pendingArtifacts.delete(ref.sha256);
  }
}
async function loadArtifact<T>(ref: ArtifactRef): Promise<T> {
  const found = cache.artifacts.get(ref.sha256);
  if (found) {
    cache.artifacts.delete(ref.sha256);
    cache.artifacts.set(ref.sha256, found);
    return found.value as T;
  }
  const value = await createCatalogStore().get<T>(ref);
  const size = Buffer.byteLength(JSON.stringify(value));
  if (size < 32 * 1024 * 1024) {
    while (cache.bytes + size > 64 * 1024 * 1024 && cache.artifacts.size) {
      const oldest = cache.artifacts.keys().next().value!;
      cache.bytes -= cache.artifacts.get(oldest)!.size;
      cache.artifacts.delete(oldest);
    }
    cache.artifacts.set(ref.sha256, { value, size });
    cache.bytes += size;
  }
  return value;
}
export async function activeCatalog(
  version?: string,
): Promise<CatalogRelease | null> {
  if (version === "legacy") return null;
  if (version) {
    const reference =
      versions.get(version) ?? (await createCatalogStore().version(version));
    if (!reference)
      throw new Error(
        "상품 데이터 버전을 찾지 못했습니다. 제품을 다시 선택해 주세요.",
      );
    if (versions.size >= 80) versions.delete(versions.keys().next().value!);
    versions.set(version, reference);
    const catalog = await readArtifact<CatalogRelease>(reference);
    if (catalog.schema !== 1 || catalog.id !== version)
      throw new Error("상품 데이터 버전이 일치하지 않습니다.");
    return catalog;
  }
  const pointer = await catalogPointer();
  if (!pointer.id || !pointer.manifest) return null;
  const catalog = await readArtifact<CatalogRelease>(pointer.manifest);
  if (catalog.schema !== 1 || catalog.id !== pointer.id)
    throw new Error("상품 데이터 버전이 일치하지 않습니다.");
  return catalog;
}
export async function publishedRows(
  category: string,
  models?: string[],
  summary = false,
): Promise<{ rows: ProductRow[]; release: string } | null> {
  const catalog = await activeCatalog();
  const entry = catalog?.categories[category];
  if (!entry || !catalog) return null;
  if (models?.length) {
    if (!Object.keys(entry.models).length) {
      const rows = await readArtifact<ProductRow[]>(entry.rows);
      return {
        rows: rows.filter((row) => models.includes(row.모델코드)),
        release: catalog.id,
      };
    }
    const parts = await Promise.all(
      models.map((model) =>
        entry.models[model]
          ? readArtifact<ProductRow[]>(entry.models[model])
          : [],
      ),
    );
    return { rows: parts.flat(), release: catalog.id };
  }
  return {
    rows: await readArtifact<ProductRow[]>(
      summary ? entry.summary : entry.rows,
    ),
    release: catalog.id,
  };
}
export async function publishedDisclaimers(
  version?: string,
): Promise<Record<string, string> | null> {
  const catalog = await activeCatalog(version);
  return catalog?.disclaimers
    ? readArtifact<Record<string, string>>(catalog.disclaimers)
    : null;
}
export async function publishedVouchers(
  version?: string,
): Promise<VoucherBundle | null> {
  const catalog = await activeCatalog(version);
  return catalog?.vouchers
    ? readArtifact<VoucherBundle>(catalog.vouchers)
    : null;
}
