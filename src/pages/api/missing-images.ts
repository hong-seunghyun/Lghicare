import type { NextApiRequest, NextApiResponse } from "next";
import { google, drive_v3 } from "googleapis";
import { fetchSheetData } from "@/lib/sheet";

// ✅ 시트 데이터 기본 타입 (string | number 허용)
type Product = { [key: string]: string | number };

// ✅ 중분류 이미지 캐시 구조
type MiddleCacheEntry = {
  id: string;
  subFolders: drive_v3.Schema$File[];
  images: Record<string, string[]>;
  ts: number;
};

type ImageCache = MiddleCacheEntry;
type DetailCache = { files: Record<string, string>; ts: number };

type DriveCacheExtended = {
  middleCache: Record<string, ImageCache | DetailCache>;
  pending: Record<string, Promise<ImageCache | null>>;
};

// ✅ 글로벌 캐시 초기화
if (!globalThis.__driveCache) {
  globalThis.__driveCache = { middleCache: {} };
}
const driveCache = globalThis.__driveCache as DriveCacheExtended;
if (!driveCache.pending) driveCache.pending = {};

// ✅ 안전한 Drive API 호출 (쿼터 초과 시 백오프)
async function safeDriveList(
  drive: drive_v3.Drive,
  params: drive_v3.Params$Resource$Files$List,
  retries = 5
): Promise<drive_v3.Schema$FileList> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await drive.files.list(params);
      return res.data;
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        ((err as { code?: number }).code === 403 ||
          (err as { code?: number }).code === 429) &&
        i < retries - 1
      ) {
        const wait = 1000 * Math.pow(2, i);
        console.warn(`⚠️ Drive quota exceeded. Retry in ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        const message =
          typeof err === "object" && err && "message" in err
            ? (err as { message?: string }).message
            : String(err);
        console.error("❌ Drive API Error:", message);
        if (i === retries - 1) return { files: [] };
      }
    }
  }
  return { files: [] };
}

// ✅ 폴더·파일명과 모델코드 간 유연한 매칭 함수
function isFolderMatch(folderName: string, modelId: string): boolean {
  const normFolder = folderName.replace(/[()\s]/g, "").toLowerCase();
  const normModel = modelId.replace(/\s/g, "").toLowerCase();

  // 완전 일치
  if (normFolder === normModel) return true;

  // 괄호 제거 후 M 포함 버전 일치 (예: FQ18FC1EA1(M) ↔ FQ18FC1EA1M)
  if (normFolder === normModel + "m") return true;

  // M 제거한 기본 버전 일치 (예: FQ18FC1EA1(M) ↔ FQ18FC1EA1)
  if (normFolder.replace(/m$/, "") === normModel) return true;

  // 포함 관계 (예: 폴더명이 모델명 포함)
  if (normFolder.includes(normModel)) return true;

  return false;
}


// ✅ 이미지 캐시 (이미지/중분류/모델코드 구조)
async function ensureMiddleCache(
  middleName: string,
  drive: drive_v3.Drive,
  parentFolderId: string
): Promise<{ id: string; images: Record<string, string[]> } | null> {
  try {
    console.log(`🗂️ 이미지 폴더 실시간 조회 시작 (${middleName})`);

    const middleRes = await safeDriveList(drive, {
      q: `'${parentFolderId}' in parents and name = '${middleName}' and mimeType = 'application/vnd.google-apps.folder'`,
      fields: "files(id,name)",
      pageSize: 1,
    });

    const middleFolder = middleRes.files?.[0];
    if (!middleFolder?.id) return null;

    const subRes = await safeDriveList(drive, {
      q: `'${middleFolder.id}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
      fields: "files(id,name)",
      pageSize: 1000,
    });

    const subFolders = subRes.files || [];
    const images: Record<string, string[]> = {};

    
    for (const sf of subFolders) {
      const res = await safeDriveList(drive, {
        q: `'${sf.id}' in parents and mimeType contains 'image/' and trashed = false`,
        fields: "files(id,name)",
        pageSize: 1000,
      });
      images[sf.name || ""] = (res.files || []).map((f) => `/api/image-proxy?fileId=${f.id}`);
    }

    console.log(`✅ 이미지 폴더 조회 완료 (${middleName})`);
    return { id: middleFolder.id, images };
  } catch (error) {
    console.error(`❌ ensureMiddleCache(${middleName}) Error:`, error);
    return null;
  }
}


// ✅ 상세페이지 캐시 (상세페이지/중분류/모델코드.html 구조)
async function ensureDetailCache(
  middleName: string,
  drive: drive_v3.Drive,
  rootFolderId: string
): Promise<Record<string, Record<string, string>>> {
  const normalize = (s?: string) =>
    (s || "")
      .replace(/[().\s._-]/g, "") // 점 포함 모든 불필요 문자 제거
      .trim()
      .toLowerCase();

  try {
    console.log(`🗂️ 상세페이지 실시간 조회 시작 (${middleName})`);

    // ✅ 1. 루트 폴더 내 "상세페이지" 찾기
    const detailRootRes = await safeDriveList(drive, {
      q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id,name)",
      pageSize: 1000,
    });

    const detailRoot = detailRootRes.files?.find(
      (f) => normalize(f.name || "") === normalize("상세페이지")
    );
    if (!detailRoot?.id) {
      console.warn("⚠️ 상세페이지 폴더를 찾지 못했습니다.");
      return {};
    }

    // ✅ 2. 중분류 폴더 찾기
    const middleRes = await safeDriveList(drive, {
      q: `'${detailRoot.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id,name)",
      pageSize: 1000,
    });

    const middleFolder = middleRes.files?.find(
      (f) => normalize(f.name || "") === normalize(middleName)
    );
    if (!middleFolder?.id) {
      console.warn(`⚠️ 상세페이지 중분류(${middleName}) 폴더를 찾지 못했습니다.`);
      return {};
    }

    // ✅ 3. 중분류 폴더 내 HTML 파일 전부 실시간 조회
    const filesRes = await safeDriveList(drive, {
      q: `'${middleFolder.id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: "files(id,name)",
      pageSize: 1000,
    });

    const files: Record<string, string> = {};

    for (const f of filesRes.files || []) {
      const rawName = f.name || "";
      const match = rawName.match(/^([A-Za-z0-9_.()-]+)_detail\.html$/);
      if (!match) continue;

      const modelCode = match[1].trim();
      const normalizedKey = normalize(modelCode);

      files[normalizedKey] = `/api/html-proxy?fileId=${f.id}`;
    }

    // ✅ 디버깅용 로그
    console.log(`📄 상세페이지 파일 (${middleName}): ${Object.keys(files).length}개`);
    console.log("📁 상세페이지 검색 중분류:", middleName);

    Object.entries(files).forEach(([k, v]) => {
      if (k.includes("fx4kcq")) console.log(`   🔍 포함된 키: ${k}`);
    });

    return { [middleName.toLowerCase()]: files };
  } catch (err) {
    console.error(`❌ ensureDetailCache(${middleName}) Error:`, err);
    return {};
  }
}






// ✅ 이미지 + 상세페이지 병렬 조회
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ROOT_FOLDER_ID = "1x27KNuvpWCc9aUyiaCzPMoF1tDVQrdYD"; // lghicaresolution
    const IMAGE_FOLDER_ID = "12kbRkg4PREBp6f5_tmXCu0_SYgUngIrw"; // 이미지 폴더
    const { middle } = req.query;
    const targetMiddle = typeof middle === "string" ? middle : undefined;
    if (!targetMiddle) return res.status(400).json({ error: "중분류(middle) 파라미터 필요" });

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    const drive = google.drive({ version: "v3", auth });

    // 1️⃣ 시트 데이터 가져오기
    const products = await fetchSheetData(targetMiddle);

    // 2️⃣ 모델코드 기준 중복 제거
    const uniqueMap = new Map<string, Product>();
    for (const p of products) {
      const code = String(p["모델코드"] || "").trim();
      if (code && !uniqueMap.has(code)) uniqueMap.set(code, p);
    }
    const uniqueProducts = Array.from(uniqueMap.values());

    // 이미지 폴더 캐시
const imageCache = await ensureMiddleCache(targetMiddle, drive, IMAGE_FOLDER_ID);

// 상세페이지 폴더 캐시
const detailCache = await ensureDetailCache(targetMiddle, drive, ROOT_FOLDER_ID);

const normalize = (s?: string) =>
  (s || "")
    .replace(/[().\s._-]/g, "")
    .trim()
    .toLowerCase();



    // 4️⃣ 모델코드별 검사
    const results = await Promise.all(
      uniqueProducts.map(async (p: Product) => {
        const middleName = String(p["중분류"]);
        const modelId = String(p["모델코드"]);
        let thumb = "";
        let detailCount = 0;

        if (imageCache) {
          const match = Object.entries(imageCache.images).find(
             ([folder]) => isFolderMatch(folder, modelId)
        );
          if (match?.[1]?.length) {
            thumb = match[1][0];
            detailCount = match[1].length;
          }
        }

      const middleKey = normalize(targetMiddle);
const modelKey = normalize(String(p["모델코드"]));
const altKey = `${modelKey}m`; // M버전까지 포함

        const cacheByMiddle = (detailCache as unknown as Record<
        string,
        Record<string, string | undefined>
        >)[middleKey];

        const hasDetailPage =
        !!cacheByMiddle?.[modelKey] ||
        !!cacheByMiddle?.[altKey];

       if (!hasDetailPage) {
  const cacheKeys = Object.keys(cacheByMiddle || {});
const found = cacheKeys.find((k) =>
  k.includes(modelKey.replace(/\./g, "").slice(0, 6))
);
  console.log(`❌ 상세페이지 없음 → 모델: ${modelId}, 비교키: ${modelKey}, 근사키: ${found || "없음"}`);
}



        return { ...p, thumb, detailCount, hasDetailPage };
      })
    );

    // 5️⃣ 누락된 제품 필터링 (둘 중 하나라도 없으면 포함)
    const missing = results.filter(
      (p) => !p.thumb?.trim() || !Number(p.detailCount) || !p.hasDetailPage
    );

    // 6️⃣ 응답
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    return res.status(200).json({
      middle: targetMiddle,
      total: missing.length,
      items: missing.map(
            (p) => {
                const product = p as Product & {
                thumb: string;
                detailCount: number;
                hasDetailPage: boolean;
                };
                return {
                모델코드: String(product["모델코드"]),
                상품명: String(product["상품명"]),
                소분류: String(product["소분류"]),
                썸네일: product.thumb ? "✅ 있음" : "❌ 없음",
                상세페이지: product.hasDetailPage ? "✅ 있음" : "❌ 없음",
                };
            }
        ),
    });
  } catch (error: unknown) {
    const message =
      typeof error === "object" && error && "message" in error
        ? (error as { message?: string }).message
        : String(error);
    console.error("❌ Missing Images API Error:", message);
    return res.status(500).json({ error: "서버 오류", message });
  }
}
