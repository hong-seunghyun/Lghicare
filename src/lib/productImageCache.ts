import { google, drive_v3 } from "googleapis";
import { normalizeModelName } from "@/lib/utils";
import { registerCacheInvalidator, syncProductCacheRevision } from "@/lib/productCacheControl";
import { publishedImageIndex, clearPublishedImages } from "@/lib/catalog/publishedImages";

export const PRODUCT_CATEGORIES = [
  "정수기", "TV", "의류건조기", "세탁기", "신발관리기", "냉장고", "김치냉장고",
  "식기세척기", "전기레인지", "광파오븐", "워시타워", "의류관리기", "청소기",
  "가습기", "바스에어시스템", "워시콤보", "에어컨", "제습기", "공기청정기", "안마의자", "마이컵",
] as const;
const ROOT_FOLDER = "12kbRkg4PREBp6f5_tmXCu0_SYgUngIrw";
const TTL = 30 * 60 * 1000;
export type ProductImageEntry = {
  id: string;
  ts: number;
  subFolders: drive_v3.Schema$File[];
  images: Record<string, string[]>;
  imageIndex: Record<string, string[]>;
  thumbnailIndex?: Record<string, string>;
};
type ImageState = {
  entries: Record<string, ProductImageEntry>;
  pending: Record<string, Promise<ProductImageEntry | null>>;
};
const g = globalThis as typeof globalThis & { __productImages?: ImageState };
const state = g.__productImages ??= { entries: {}, pending: {} };
let client: drive_v3.Drive | undefined;
registerCacheInvalidator("product-images", "drive", () => {
  clearPublishedImages();
  state.entries = {};
  state.pending = {};
  if (globalThis.__driveCache) globalThis.__driveCache.middleCache = {};
  if (globalThis.__detailCache) {
    globalThis.__detailCache.rootFolderId = null;
    globalThis.__detailCache.middleFolders = {};
  }
});

export const imageModelKey = (value: string) =>
  normalizeModelName(value.replace(/\s+/g, "").trim().toLowerCase());

async function listFiles(query: string) {
  client ??= google.drive({ version: "v3", auth: new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_SERVICE_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  }) });
  const files: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  do {
    let response;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await client.files.list({ q: query, fields: "nextPageToken,files(id,name,mimeType)", pageSize: 1000, pageToken });
        break;
      } catch (error) {
        const code = (error as { code?: number }).code;
        if (attempt >= 2 || ![403, 429, 500, 503].includes(code || 0)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** attempt));
      }
    }
    files.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  return files;
}

export async function getProductImageCache(category: string, fresh = false): Promise<ProductImageEntry | null> {
  await syncProductCacheRevision();
  const published = await publishedImageIndex(category, fresh);
  if (published) return published;
  return getDriveProductImages(category, fresh);
}
export function getSourceProductImageCache(category: string) { return getDriveProductImages(category, true); }
async function getDriveProductImages(category: string, fresh = false): Promise<ProductImageEntry | null> {
  await syncProductCacheRevision();
  const cached = state.entries[category];
  if (!fresh && cached && Date.now() - cached.ts < TTL) return cached;
  const existing = state.pending[category];
  if (existing) {
    try { return await existing; } catch (error) {
      if (fresh) throw error;
      return state.entries[category] ?? null;
    }
  }
  const entries = state.entries, pending = state.pending;
  const request = (async () => {
    const escaped = category.replace(/'/g, "\\'");
    const roots = await listFiles(`'${ROOT_FOLDER}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const id = roots[0]?.id;
    if (!id) return null;
    const subFolders = await listFiles(`'${id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const images: Record<string, string[]> = {}, imageIndex: Record<string, string[]> = {};
    for (let offset = 0; offset < subFolders.length; offset += 5) {
      await Promise.all(subFolders.slice(offset, offset + 5).map(async (folder) => {
        const files = await listFiles(`'${folder.id}' in parents and mimeType contains 'image/' and trashed = false`);
        files.sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: "base" }));
        const urls = files.map((file) => `/api/image-proxy?fileId=${file.id}`);
        images[folder.name || ""] = urls;
        imageIndex[imageModelKey(folder.name || "")] = urls;
      }));
    }
    const entry = { id, ts: Date.now(), subFolders, images, imageIndex };
    // A reset during an in-flight fetch must not restore the discarded cache.
    if (state.entries === entries) entries[category] = entry;
    return entry;
  })();
  pending[category] = request;
  try { return await request; } catch (error) {
    if (fresh) throw error;
    console.warn(`${category} 이미지를 불러오지 못했습니다.`, error instanceof Error ? error.message : error);
    return state.entries[category] ?? null;
  } finally { if (pending[category] === request) delete pending[category]; }
}
