import type { NextApiRequest, NextApiResponse } from "next";
import { google, drive_v3 } from "googleapis";
import { fetchSheetDataWithPolicy } from "@/lib/sheet";
import { buildThemeCatalog } from "@/lib/renewalThemeCatalog";
import { PREVIEW_CATEGORIES, normalizeModelCode } from "@/lib/renewalTest";
import { normalizeAndExpandModelNames } from "@/lib/utils";

const ROOT_FOLDER = "12kbRkg4PREBp6f5_tmXCu0_SYgUngIrw";
const TTL = 5 * 60 * 1000;
type File = drive_v3.Schema$File;
type Entry = { ts: number; files: File[] };
const state = globalThis as typeof globalThis & {
  __renewalThemeFiles?: Map<string, Entry>;
  __renewalThemePending?: Map<string, Promise<File[]>>;
};
const cache = state.__renewalThemeFiles ??= new Map();
const pending = state.__renewalThemePending ??= new Map();
let client: drive_v3.Drive | undefined;

async function listFiles(key: string, query: string): Promise<File[]> {
  const found = cache.get(key);
  if (found && Date.now() - found.ts < TTL) return found.files;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = (async () => {
    client ??= google.drive({ version: "v3", auth: new google.auth.GoogleAuth({
      credentials: { client_email: process.env.GOOGLE_SERVICE_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") },
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    }) });
    const files: File[] = [];
    let pageToken: string | undefined;
    do {
      const response = await client.files.list({ q: query, fields: "nextPageToken,files(id,name,mimeType)", pageSize: 1000, pageToken });
      files.push(...(response.data.files ?? []));
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(key, { ts: Date.now(), files });
    return files;
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}

async function thumbnail(category: string, model: string) {
  const roots = await listFiles(`category:${category}`, `'${ROOT_FOLDER}' in parents and name = '${category}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  if (!roots[0]?.id) return "";
  // Folder metadata only; images are requested for the selected models, never every folder.
  const folders = await listFiles(`folders:${roots[0].id}`, `'${roots[0].id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const candidates = normalizeAndExpandModelNames(model).map(normalizeModelCode);
  const folder = candidates.flatMap((candidate) => folders.filter((file) => normalizeModelCode(file.name || "") === candidate))[0];
  if (!folder?.id) return "";
  const images = await listFiles(`images:${folder.id}`, `'${folder.id}' in parents and mimeType contains 'image/' and trashed = false`);
  const image = [...images].sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: "base" }))[0];
  return image?.id ? `/api/image-proxy?fileId=${image.id}` : "";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "GET_REQUIRED" }); }
  const category = typeof req.query.middle === "string" ? req.query.middle : "";
  const models = typeof req.query.models === "string" ? req.query.models.split(",").filter(Boolean) : [];
  if (!PREVIEW_CATEGORIES.includes(category) || category === "전체" || !models.length || models.length > 3 || models.some((m) => !/^[A-Za-z0-9()_.-]{1,80}$/.test(m)))
    return res.status(400).json({ error: "INVALID_CATEGORY_OR_MODELS" });
  try {
    const rows = await fetchSheetDataWithPolicy(category, { maxAgeMs: TTL, allowStale: false });
    const products = buildThemeCatalog(rows, category, models);
    const options = await Promise.all(products.map(async (product) => ({ ...product, image: await thumbnail(category, product.id) })));
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=60");
    return res.status(200).json({ products: options });
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "테마상품을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." });
  }
}
