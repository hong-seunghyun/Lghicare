"use server";
import { google } from "googleapis";
import { normalizeAndExpandModelNames } from "@/lib/utils";
import { registerCacheInvalidator, syncProductCacheRevision } from "@/lib/productCacheControl";
import { imagePointer, publishedImageIndex } from "@/lib/catalog/publishedImages";
import { normalizeModelName } from "@/lib/utils";

let cachedDrive: ReturnType<typeof google.drive> | null = null;

type DriveCacheEntry = {
  url: string;
  ts: number;
};

// 모델코드별 썸네일 캐시. 상품 캐시 초기화와 함께 갱신합니다.
const driveGlobal = globalThis as typeof globalThis & { __driveThumbnails?: Record<string, DriveCacheEntry> };
const cache = driveGlobal.__driveThumbnails ??= {};
let generation = 0;

//  나중에 admin 버튼에서 사용할 캐시 초기화 헬퍼
export function clearDriveThumbnailCache(modelCode?: string) {
  generation += 1;
  if (!modelCode) {
    (globalThis as typeof globalThis & { __renewalThemeFiles?: Map<string, unknown> }).__renewalThemeFiles?.clear();
  }
  if (modelCode) {
    const key = modelCode;
    if (cache[key]) {
      delete cache[key];
    }
  } else {
    Object.keys(cache).forEach((k) => {
      delete cache[k];
    });
  }
}
registerCacheInvalidator("drive-thumbnails", "drive", () => clearDriveThumbnailCache());

// 🔹 구글 드라이브 클라이언트 생성
async function getDriveClient() {
  if (!cachedDrive) {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    cachedDrive = google.drive({ version: "v3", auth });
  }
  return cachedDrive;
}

// 🔹 특정 모델코드에 대한 썸네일 URL 가져오기
export async function getDriveThumbnail(modelCode: string): Promise<string> {
  await syncProductCacheRevision();
  const published = await imagePointer();
  const keys = normalizeAndExpandModelNames(modelCode).map(model => normalizeModelName(model.replace(/\s+/g, "").toLowerCase()));
  for (const category of Object.keys(published.categories)) {
    const index = await publishedImageIndex(category);
    for (const key of keys) if (index?.imageIndex[key]?.[0]) return index.thumbnailIndex?.[key] || index.imageIndex[key][0];
  }
  const requestGeneration = generation;
  const now = Date.now();
  const ttl = 30 * 60 * 1000;
  const cacheKey = modelCode;

  //  캐시 유효하면 반환
  if (cache[cacheKey] && now - cache[cacheKey].ts < ttl) {
    return cache[cacheKey].url;
  }

  try {
    const drive = await getDriveClient();

    // 🔹 모델명 정규화 + 확장
    const candidates = normalizeAndExpandModelNames(modelCode);

    // 🔹 후보들을 OR 조건으로 검색
    const query = candidates
      .map((name) => `name contains '${name}'`)
      .join(" or ");

    const res = await drive.files.list({
      q: `${query} and mimeType contains 'image/' and trashed = false`,
      fields: "files(id, name, thumbnailLink, webViewLink)",
      pageSize: 1,
      orderBy: "createdTime desc",
    });

    const files = res.data.files || [];
    if (files.length > 0) {
      const file = files[0];
      const url = file.thumbnailLink?.replace("=s220", "=s800") || "";

      // 초기화 이후에는 이전 요청의 이미지를 다시 저장하지 않습니다.
      if (generation === requestGeneration) cache[cacheKey] = { url, ts: now };
      return url;
    }

    // ❌ 파일이 없을 경우 placeholder 반환
    return "/images/no-image.png";
  } catch (err) {
    console.error(`❌ getDriveThumbnail(${modelCode}) 오류:`, err);

    //  기존 캐시라도 있으면 반환
    if (cache[cacheKey]) {
      return cache[cacheKey].url;
    }
    return "/images/no-image.png";
  }
}
