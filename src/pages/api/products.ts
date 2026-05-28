// pages/api/products.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { fetchSheetData } from "@/lib/sheet";
import { google, drive_v3 } from "googleapis";
import { normalizeAndExpandModelNames, normalizeModelName } from "@/lib/utils";

type DriveCacheExtended = NonNullable<typeof globalThis.__driveCache> & {
  pending: Record<string, Promise<MiddleCacheEntry | null>>;
};

type MiddleCacheEntry = {
  id: string;
  subFolders: drive_v3.Schema$File[];
  images: Record<string, string[]>; // 폴더 원래 이름 기준
  imageIndex: Record<string, string[]>; //  정규화된 폴더명 기준 (O(1) 조회용)
  ts: number;
};

type Product = { [key: string]: string };

//  전역 Drive 클라이언트 + 캐시 설정
const g = globalThis as typeof globalThis & {
  __driveClient?: drive_v3.Drive;
};

const DRIVE_PARENT_FOLDER_ID = "12kbRkg4PREBp6f5_tmXCu0_SYgUngIrw";
const DRIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일
const DRIVE_MAX_RETRIES = 3;
const DRIVE_BACKOFF_BASE_MS = 800; // 0.8s → 1.6s → 3.2s ...

//  기존 전역 캐시 안전하게 초기화 (타입 충돌 방지)
if (!globalThis.__driveCache) {
  globalThis.__driveCache = { middleCache: {} };
}

//  여기서만 확장형으로 단언
const driveCache = globalThis.__driveCache as DriveCacheExtended;
if (!driveCache.pending) {
  driveCache.pending = {};
}

//  공통 정규화 함수 (폴더명/모델명 정규화에 사용)
const normalizeName = (s?: string) =>
  normalizeModelName((s || "").replace(/\s+/g, "").trim().toLowerCase());

//  전역 Drive 클라이언트 (1회 생성 후 재사용)
async function getDriveClient(): Promise<drive_v3.Drive> {
  if (g.__driveClient) return g.__driveClient;

  const clientEmail = process.env.GOOGLE_SERVICE_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    console.error(
      "❌ Drive 클라이언트 설정 누락 (GOOGLE_SERVICE_EMAIL / GOOGLE_PRIVATE_KEY)"
    );
    throw new Error("Drive client not configured");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  g.__driveClient = google.drive({ version: "v3", auth });
  return g.__driveClient!;
}

//  안전한 Drive API 호출 (쿼터 초과 자동 백오프)
async function safeDriveList(
  drive: drive_v3.Drive,
  params: drive_v3.Params$Resource$Files$List,
  retries = DRIVE_MAX_RETRIES
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
        (err as { code: number }).code &&
        ((err as { code: number }).code === 403 ||
          (err as { code: number }).code === 429) &&
        i < retries - 1
      ) {
        const wait = DRIVE_BACKOFF_BASE_MS * Math.pow(2, i); // 0.8s → 1.6s → 3.2s
        console.warn(`⚠️ Drive quota exceeded. Retry in ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        const message =
          typeof err === "object" && err && "message" in err
            ? (err as { message?: string }).message
            : String(err);
        console.error("❌ Drive API Error:", message);
        if (i === retries - 1) {
          return { files: [] };
        }
      }
    }
  }
  return { files: [] };
}

//  병렬 이미지 조회 (쿼터 완화 + 자연 정렬 완벽 대응)
async function fetchImagesInBatches(
  subFolders: drive_v3.Schema$File[],
  drive: drive_v3.Drive
): Promise<Record<string, string[]>> {
  const BATCH_SIZE = 5; // 병렬 요청 단위
  const images: Record<string, string[]> = {};

  //  자연 정렬 객체 (사람이 보는 순서 그대로)
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });

  for (let i = 0; i < subFolders.length; i += BATCH_SIZE) {
    const batch = subFolders.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (sf) => {
        const res = await safeDriveList(drive, {
          q: `'${sf.id}' in parents and mimeType contains 'image/' and trashed = false`,
          fields: "files(id,name,mimeType)",
          pageSize: 1000,
        });

        //  파일명 자연 정렬 적용
        const sortedFiles = (res.files || []).sort((a, b) =>
          collator.compare(a.name || "", b.name || "")
        );

        return { folderName: sf.name || "", files: sortedFiles };
      })
    );

    //  폴더별 이미지 경로 병합
    for (const { folderName, files } of results) {
      images[folderName] = files.map((f) => `/api/image-proxy?fileId=${f.id}`);
    }

    //  쿼터 초과 방지용 짧은 딜레이
    await new Promise((r) => setTimeout(r, 200));
  }

  return images;
}

//  중분류 캐시 생성 함수
async function ensureMiddleCache(
  middleName: string,
  drive: drive_v3.Drive,
  parentFolderId: string
): Promise<MiddleCacheEntry | null> {
  const now = Date.now();
  const ttl = DRIVE_TTL_MS;

  const cached = driveCache.middleCache[middleName] as
    | MiddleCacheEntry
    | undefined;
  if (cached && now - cached.ts < ttl) return cached;

  //  pending Promise 존재 여부 안전하게 확인
  const existing = driveCache.pending[middleName];
  if (existing) {
    return existing;
  }

  const promise: Promise<MiddleCacheEntry | null> = (async (): Promise<
    MiddleCacheEntry | null
  > => {
    try {
      const middleRes = await safeDriveList(drive, {
        q: `'${parentFolderId}' in parents and name = '${middleName}' and mimeType = 'application/vnd.google-apps.folder'`,
        fields: "files(id,name)",
        pageSize: 1,
      });

      const middleFolder = middleRes.files?.[0];
      if (!middleFolder?.id) return null;

      const allRes = await safeDriveList(drive, {
        q: `'${middleFolder.id}' in parents and trashed = false`,
        fields: "files(id,name,mimeType,parents)",
        pageSize: 1000,
      });

      const allFiles = allRes.files || [];
      const subFolders = allFiles.filter(
        (f) => f.mimeType === "application/vnd.google-apps.folder"
      );

      const images = await fetchImagesInBatches(subFolders, drive);

      //  정규화된 폴더명 → 이미지 배열 인덱스 미리 생성 (O(1) 조회용)
      const imageIndex: Record<string, string[]> = {};
      for (const [folderName, urls] of Object.entries(images)) {
        const key = normalizeName(folderName);
        if (!key) continue;
        imageIndex[key] = urls;
      }

      const entry: MiddleCacheEntry = {
        id: middleFolder.id,
        subFolders,
        images,
        imageIndex,
        ts: now,
      };

      driveCache.middleCache[middleName] = entry;
      return entry;
    } catch (error) {
      console.error(`❌ ensureMiddleCache(${middleName}) Error:`, error);
      const cached = driveCache.middleCache[middleName];
      //  타입 단언으로 명시적 보장
      return (cached as MiddleCacheEntry) ?? null;
    } finally {
      delete driveCache.pending[middleName];
    }
  })();

  driveCache.pending[middleName] = promise;
  return promise;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const middle = req.query.middle as string | undefined;
  const sub = req.query.sub as string | undefined;
  const id = req.query.id as string | undefined;
  const q = req.query.q as string | undefined;
  const modelsQuery = req.query.models;

	const groupBy = req.query.groupBy as string | undefined;
  const isModelCodeGrouping = groupBy === "modelCode";

  const sheet = middle || "정수기";

  try {
    const drive = await getDriveClient();

    //  1. 시트 데이터 (fetchSheetData 자체는 별도 캐시 사용)
    const products = await fetchSheetData(sheet);

    // (기존 normalize는 그대로 두되, 아래에서는 normalizeName 사용)
    const normalize = (s?: string) =>
      (s || "").replace(/\s+/g, "").trim().toLowerCase();
    const modelFilters = (Array.isArray(modelsQuery) ? modelsQuery : [modelsQuery])
      .flatMap((value) => (value ?? "").split(","))
      .map((value) => normalizeName(value))
      .filter(Boolean);
    const modelFilterSet = new Set(modelFilters);

    //  요청 단위 썸네일/이미지 캐시 (UI 반응성 + 중복 연산 제거)
    const thumbCache = new Map<string, string>();
    const imagesCache = new Map<string, string[]>();

    const getThumbnailUrl = async (
      middleName: string,
      modelId: string
    ): Promise<string> => {
      const cacheKey = `${middleName}::${modelId}`;
      if (thumbCache.has(cacheKey)) {
        return thumbCache.get(cacheKey)!;
      }

      const cache = await ensureMiddleCache(
        middleName,
        drive,
        DRIVE_PARENT_FOLDER_ID
      );
      if (!cache) {
        thumbCache.set(cacheKey, "");
        return "";
      }

      const candidates = normalizeAndExpandModelNames(modelId).map(normalizeName);
      for (const candidate of candidates) {
        const urls = cache.imageIndex[candidate];
        if (urls?.[0]) {
          thumbCache.set(cacheKey, urls[0]);
          return urls[0];
        }
      }

      thumbCache.set(cacheKey, "");
      return "";
    };

    const getAllImages = async (
      middleName: string,
      modelId: string,
      fallbackId?: string
    ): Promise<string[]> => {
      const cacheKey = `${middleName}::${modelId}::${fallbackId || ""}`;
      if (imagesCache.has(cacheKey)) {
        return imagesCache.get(cacheKey)!;
      }

      const cache = await ensureMiddleCache(
        middleName,
        drive,
        DRIVE_PARENT_FOLDER_ID
      );
      if (!cache) {
        imagesCache.set(cacheKey, []);
        return [];
      }

      const candidates = normalizeAndExpandModelNames(modelId).map(normalizeName);
      for (const candidate of candidates) {
        const urls = cache.imageIndex[candidate];
        if (urls?.length) {
          imagesCache.set(cacheKey, urls);
          return urls;
        }
      }

      if (fallbackId) {
        const fallbackCandidates = normalizeAndExpandModelNames(
          fallbackId
        ).map(normalizeName);
        for (const candidate of fallbackCandidates) {
          const urls = cache.imageIndex[candidate];
          if (urls?.length) {
            imagesCache.set(cacheKey, urls);
            return urls;
          }
        }
      }

      imagesCache.set(cacheKey, []);
      return [];
    };

    const subCategories = Array.from(
      new Set(products.map((p) => p["소분류"]).filter(Boolean))
    );

      const getGroupKey = (p: Product): string => {
      const model = (p["모델코드"] || "").trim();
      if (isModelCodeGrouping) return model; //  견적용: 무조건 모델코드 기준
      const group = (p["동일모델기준"] || "").trim();
      return group || model; //  기존 동작 유지
    };

    //  상세 조회
    if (id) {
      //  1️⃣ 현재 모델코드 기준 행만
      const options = products.filter(
        (p) => p["모델코드"]?.trim() === id.trim()
      );
      if (!options.length)
        return res.status(404).json({ options: [], subCategories });

      const target = options[0];

      //  2️⃣ 동일모델 그룹키 계산
			const groupKey = isModelCodeGrouping
			? (target["모델코드"] || "").trim()
			: ((target["동일모델기준"] || "").trim() ||
				 (target["모델코드"] || "").trim());

		const relatedModels = products.filter((p) => {
			const model = (p["모델코드"] || "").trim();

			if (isModelCodeGrouping) {
				//  견적용: 같은 모델코드 행만 (실질적으로 동일 모델코드 variants 묶는 용도)
				return model === groupKey;
			}

			//  기존 동작 유지: 동일모델기준 그룹 확장
			const sameGroup = (p["동일모델기준"] || "").trim();
			return (
				model === groupKey ||
				sameGroup === groupKey ||
				model === (target["모델코드"] || "").trim() ||
				sameGroup === (target["모델코드"] || "").trim()
			);
		});


      //  4️⃣ 중복 제거 (모델코드 기준)
      const dedupedRelated = Array.from(
        new Map<string, Product>(
          relatedModels.map((m) => [m["모델코드"], m])
        ).values()
      );

      //  5️⃣ 이미지 fetch 병렬화
      const [thumb, imgs] = await Promise.all([
        getThumbnailUrl(target["중분류"], target["모델코드"]),
        getAllImages(target["중분류"], target["모델코드"]),
      ]);

      const enrichedOptions = options.map((p) => ({
        ...p,
        thumbnailUrl: thumb,
        images: imgs,
      }));

      //  6️⃣ 응답에 relatedModels 추가
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=300"
      );
      return res.status(200).json({
        options: enrichedOptions,
        relatedModels: dedupedRelated,
        subCategories,
      });
    }

    //  목록 조회
    let filtered = products;
    if (middle)
      filtered = filtered.filter(
        (p) => p["중분류"]?.trim() === middle.trim()
      );
    if (sub)
      filtered = filtered.filter((p) => p["소분류"]?.trim() === sub.trim());
    const keyword = (q || "").trim();
    if (keyword) {
      const normalizedKeyword = normalize(keyword);
      const searchableFields = ["모델코드", "상품명", "제품명"];
      filtered = filtered.filter((p) =>
        searchableFields.some((field) => {
          const value = p[field];
          if (typeof value !== "string") return false;
          return normalize(value).includes(normalizedKeyword);
        })
      );
    }
    if (modelFilterSet.size > 0) {
      filtered = filtered.filter((p) =>
        modelFilterSet.has(normalizeName(p["모델코드"]))
      );
    }

    const groupedFiltered = filtered.reduce<Record<string, Product[]>>(
      (acc, cur) => {
        const key = getGroupKey(cur);
        (acc[key] ||= []).push(cur);
        return acc;
      },
      {}
    );

    const enrichedFiltered = await Promise.all(
      Object.values(groupedFiltered).map(async (group) => {
        const representative = group[0];
        const [thumbnailUrl, variants] = await Promise.all([
          getThumbnailUrl(
            representative["중분류"],
            representative["모델코드"]
          ),
          Promise.all(
            group.map(async (p) => ({
              모델코드: p["모델코드"],
              제품색상: p["제품색상"],
              상품명: p["상품명"],
              계약기간: p["계약기간"],
              서비스유형: p["서비스유형"],
              "서비스주기/월": p["서비스주기/월"],
              "프로모션 대분류": p["프로모션 대분류"],
              프로모션유형: p["프로모션유형"],
              프로모션명: p["프로모션명"],
              정상가: p["정상가"],
              할인전금액: p["할인전금액"],
              할인후금액: p["할인후금액"],
              가격: p["할인후금액"] || p["정상가"],
              thumbnailUrl: await getThumbnailUrl(
                p["중분류"],
                p["모델코드"]
              ),
            }))
          ),
        ]);
        return { ...representative, thumbnailUrl, variants };
      })
    );

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300"
    );
    return res
      .status(200)
      .json({ options: enrichedFiltered, subCategories });
  } catch (error: unknown) {
    console.error("❌ products API 오류:", error);
    return res.status(500).json({ error: "서버 오류" });
  }
}
