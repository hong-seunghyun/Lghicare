import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { google } from "googleapis";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";
import { getSourceProductImageCache } from "@/lib/productImageCache";
import { catalogBucket, createCatalogStore } from "./store";
import {
  clearPublishedImages,
  imagePointer,
  type PublishedImageIndex,
} from "./publishedImages";
import { PRODUCT_CATEGORIES, type ArtifactRef } from "./types";

export type ImageJob = {
  id: string;
  category: string;
  owner: string;
  createdAt: string;
  state: "preparing" | "complete" | "failed";
  count: number;
  total: number;
  source: ArtifactRef;
  assets?: ArtifactRef;
  baseHash: string | null;
  leaseUntil?: number;
  leaseToken?: string;
  error?: string;
};
type Asset = { thumb: string; full: string };
const drive = () =>
  google.drive({
    version: "v3",
    auth: new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    }),
  });
const fileId = (url: string) =>
  new URL(url, "https://catalog.invalid").searchParams.get("fileId");
const ids = (index: PublishedImageIndex) => [
  ...new Set(
    Object.values(index.images)
      .flat()
      .map(fileId)
      .filter((id): id is string => Boolean(id)),
  ),
];
const jobs = () => initFirebaseAdmin().collection("productImageImports");
export async function startImageSync(
  category: string,
  owner: string,
): Promise<ImageJob> {
  if (!(PRODUCT_CATEGORIES as readonly string[]).includes(category))
    throw new Error("제품 분류를 선택해 주세요.");
  const source = await getSourceProductImageCache(category);
  if (!source) throw new Error("Drive 원본 폴더를 찾지 못했습니다.");
  if (!ids(source).length)
    throw new Error(
      "원본 이미지가 없어 동기화하지 않았습니다. 기존 이미지 연결은 유지됩니다.",
    );
  const id = randomUUID(),
    store = createCatalogStore(),
    pointer = await imagePointer(true);
  const reference = await store.put(
    `product-catalog/image-imports/${id}/source.json.gz`,
    source,
  );
  const job: ImageJob = {
    id,
    category,
    owner,
    createdAt: new Date().toISOString(),
    state: "preparing",
    count: 0,
    total: ids(source).length,
    source: reference,
    baseHash: pointer.categories[category]?.sha256 ?? null,
  };
  await jobs().doc(id).create(job);
  return job;
}
const downloadUrl = (bucket: string, path: string, token: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
async function existingImage(path: string): Promise<string | null> {
  const bucket = catalogBucket();
  try {
    const [metadata] = await bucket.file(path).getMetadata();
    const token = metadata.metadata?.firebaseStorageDownloadTokens;
    return typeof token === "string" && token
      ? downloadUrl(bucket.name, path, token.split(",")[0])
      : null;
  } catch (error) {
    if ((error as { code?: number }).code === 404) return null;
    throw error;
  }
}
async function saveImage(path: string, bytes: Buffer): Promise<string> {
  const bucket = catalogBucket(),
    token = randomUUID();
  try {
    await bucket
      .file(path)
      .save(bytes, {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType: path.endsWith(".jpg") ? "image/jpeg" : "image/webp",
          cacheControl: "public, max-age=31536000, immutable",
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });
  } catch (error) {
    if ((error as { code?: number }).code !== 412) throw error;
    const existing = await existingImage(path);
    if (!existing) throw new Error("이미지 저장 상태를 확인하지 못했습니다.");
    return existing;
  }
  return downloadUrl(bucket.name, path, token);
}
async function convertImage(id: string): Promise<Asset> {
  if (!/^[\w-]{8,200}$/.test(id))
    throw new Error("올바르지 않은 Drive 이미지입니다.");
  const client = drive();
  const response = await client.files.get({
    fileId: id,
    fields: "id,mimeType,md5Checksum,size",
  });
  const metadata = response.data;
  if (
    !metadata.mimeType?.startsWith("image/") ||
    !/^[a-f0-9]{32}$/i.test(metadata.md5Checksum ?? "") ||
    !Number.isFinite(Number(metadata.size)) ||
    Number(metadata.size) <= 0 ||
    Number(metadata.size) > 25 * 1024 * 1024
  )
    throw new Error("지원하지 않거나 25MB를 초과한 제품 이미지입니다.");
  const prefix = `product-assets/${id}/${metadata.md5Checksum}`;
  const [thumb, full] = await Promise.all([
    existingImage(`${prefix}/thumb.webp`),
    existingImage(`${prefix}/full.jpg`),
  ]);
  if (thumb && full) return { thumb, full };
  const file = await client.files.get(
    { fileId: id, alt: "media" },
    { responseType: "arraybuffer" },
  );
  const input = Buffer.from(file.data as ArrayBuffer);
  if (
    input.length !== Number(metadata.size) ||
    createHash("md5").update(input).digest("hex") !== metadata.md5Checksum
  )
    throw new Error(
      "다운로드 중 원본 이미지가 변경됐습니다. 다시 동기화해 주세요.",
    );
  const base = () =>
    sharp(input, { limitInputPixels: 40_000_000, failOn: "error" }).rotate();
  const thumbUrl =
    thumb ??
    (await saveImage(
      `${prefix}/thumb.webp`,
      await base()
        .resize({
          width: 640,
          height: 640,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer(),
    ));
  const fullUrl =
    full ??
    (await saveImage(
      `${prefix}/full.jpg`,
      await base()
        .resize({
          width: 1920,
          height: 1920,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer(),
    ));
  return { thumb: thumbUrl, full: fullUrl };
}
export async function stepImageSync(id: string): Promise<ImageJob> {
  const ref = jobs().doc(id),
    token = randomUUID(),
    store = createCatalogStore();
  const job = await initFirebaseAdmin().runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error("이미지 처리 내역을 찾지 못했습니다.");
    const data = snap.data() as ImageJob;
    if (data.state === "complete") return data;
    if ((data.leaseUntil ?? 0) > Date.now())
      throw new Error(
        "이미지 처리가 진행 중입니다. 잠시 후 다시 확인해 주세요.",
      );
    const current = {
      ...data,
      leaseToken: token,
      leaseUntil: Date.now() + 300000,
      error: "",
    };
    transaction.set(ref, current);
    return current;
  });
  if (job.state === "complete") return job;
  try {
    const source = await store.get<PublishedImageIndex>(job.source),
      fileIds = ids(source);
    const assets = job.assets
      ? await store.get<Record<string, Asset>>(job.assets)
      : {};
    for (const file of fileIds.slice(job.count, job.count + 5))
      assets[file] = await convertImage(file);
    const count = Math.min(job.count + 5, fileIds.length);
    const checkpoint = await store.put(
      `product-catalog/image-imports/${id}/assets-${randomUUID()}.json.gz`,
      assets,
    );
    if (count === fileIds.length) {
      const images = Object.fromEntries(
        Object.entries(source.images).map(([model, urls]) => [
          model,
          urls.map((url) => assets[fileId(url) ?? ""]?.full ?? url),
        ]),
      );
      const imageIndex = Object.fromEntries(
        Object.entries(source.imageIndex).map(([model, urls]) => [
          model,
          urls.map((url) => assets[fileId(url) ?? ""]?.full ?? url),
        ]),
      );
      const thumbnailIndex = Object.fromEntries(
        Object.entries(source.imageIndex).map(([model, urls]) => [
          model,
          assets[fileId(urls[0] ?? "") ?? ""]?.thumb ?? urls[0] ?? "",
        ]),
      );
      const index = await store.put(
        `product-catalog/image-imports/${id}/index.json.gz`,
        { ...source, images, imageIndex, thumbnailIndex, ts: Date.now() },
      );
      const pointerRef = initFirebaseAdmin().doc("_system/productImageCatalog");
      await initFirebaseAdmin().runTransaction(async (transaction) => {
        const [current, locked] = await Promise.all([
          transaction.get(pointerRef),
          transaction.get(ref),
        ]);
        if (locked.data()?.leaseToken !== token)
          throw new Error("이미지 작업이 변경됐습니다.");
        if (
          (current.data()?.categories?.[job.category]?.sha256 ?? null) !==
          job.baseHash
        )
          throw new Error(
            "더 최근 이미지가 반영됐습니다. 새 동기화로 다시 확인해 주세요.",
          );
        transaction.set(
          pointerRef,
          {
            categories: { [job.category]: index },
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        transaction.update(ref, {
          state: "complete",
          assets: checkpoint,
          count,
          leaseUntil: 0,
        });
      });
      clearPublishedImages();
      return {
        ...job,
        state: "complete",
        assets: checkpoint,
        count,
        leaseUntil: 0,
      };
    }
    const next = {
      ...job,
      state: "preparing" as const,
      assets: checkpoint,
      count,
      leaseUntil: 0,
    };
    await initFirebaseAdmin().runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (current.data()?.leaseToken !== token)
        throw new Error("이미지 작업이 변경됐습니다.");
      transaction.set(ref, next);
    });
    return next;
  } catch (error) {
    await initFirebaseAdmin().runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (current.data()?.leaseToken === token)
        transaction.update(ref, {
          state: "failed",
          leaseUntil: 0,
          error: error instanceof Error ? error.message : "이미지 처리 실패",
        });
    });
    throw error;
  }
}
export async function imageSyncJobs() {
  const snap = await jobs().orderBy("createdAt", "desc").limit(10).get();
  return snap.docs.map((doc) => doc.data() as ImageJob);
}
