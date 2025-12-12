// pages/api/admin/warmup.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { google, drive_v3 } from "googleapis";
import { fetchSheetData } from "@/lib/sheet";
import { normalizeModelName } from "@/lib/utils";

// ⚙️ 서버에서 먼저 캐시를 채워둘 대상 중분류 목록
const MIDDLES_TO_WARM = [
  "정수기",
  "TV",
  "의류건조기",
  "세탁기",
  "신발관리기",
  "냉장고",
  "김치냉장고",
  "식기세척기",
  "전기레인지",
  "광파오븐",
  "워시타워",
  "의류관리기",
  "청소기",
  "가습기",
  "워시콤보",
  "에어컨",
  "제습기",
  "공기청정기",
  "안마의자",
  "마이컵"
];

// products.ts 와 동일한 정규화 로직
const normalizeName = (s?: string) =>
  normalizeModelName((s || "").replace(/\s+/g, "").trim().toLowerCase());

// Drive 캐시를 느슨하게 다룰 타입 (global.d.ts 충돌 방지)
type DriveCacheLoose = {
  middleCache?: Record<string, MiddleCacheEntryWarm>;
  pending?: Record<string, Promise<MiddleCacheEntryWarm | null>>;
};

type MiddleCacheEntryWarm = {
  id: string;
  subFolders: drive_v3.Schema$File[];
  images: Record<string, string[]>;      // 폴더 원래 이름 기준
  imageIndex: Record<string, string[]>;  // ✅ 정규화된 폴더명 기준 (products.ts와 맞춤)
  ts: number;
};

// ✅ 안전한 Drive list 호출 (429, 403 등에 대비한 백오프)
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
      const e = err as { code?: number; message?: string };
      if ((e.code === 403 || e.code === 429) && i < retries - 1) {
        const wait = 1000 * Math.pow(2, i); // 1 → 2 → 4 → ...
        console.warn(
          `⚠️ [warmup] Drive quota (${e.code}) 재시도까지 ${wait / 1000}s 대기...`
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  return { files: [] };
}

// ✅ 폴더별 이미지 리스트 구성 (products.ts와 동일한 구조 유지)
async function fetchImagesInBatchesForWarmup(
  subFolders: drive_v3.Schema$File[],
  drive: drive_v3.Drive
): Promise<Record<string, string[]>> {
  const BATCH_SIZE = 5;
  const images: Record<string, string[]> = {};

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

        const sortedFiles = (res.files || []).sort((a, b) =>
          collator.compare(a.name || "", b.name || "")
        );

        return { folderName: sf.name || "", files: sortedFiles };
      })
    );

    for (const { folderName, files } of results) {
      images[folderName] = files.map(
        (f) => `/api/image-proxy?fileId=${f.id}`
      );
    }

    // 너무 빠르게 연속 호출하지 않도록 살짝 텀
    await new Promise((r) => setTimeout(r, 200));
  }

  return images;
}

// ✅ 특정 중분류의 Drive middle 캐시를 미리 채우는 함수
async function warmDriveMiddleCache(
  middleName: string,
  drive: drive_v3.Drive,
  parentFolderId: string
): Promise<MiddleCacheEntryWarm | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  let cache = g.__driveCache as DriveCacheLoose | undefined;

  if (!cache) {
    cache = { middleCache: {}, pending: {} };
    g.__driveCache = cache;
  } else {
    if (!cache.middleCache) cache.middleCache = {};
    if (!cache.pending) cache.pending = {};
  }

  const driveCache = cache as DriveCacheLoose;

  // 이미 캐시가 있다면 그대로 사용
  if (driveCache.middleCache && driveCache.middleCache[middleName]) {
    return driveCache.middleCache[middleName] || null;
  }

  // 동일 middle에 대한 동시 warmup 방지
  if (driveCache.pending?.[middleName]) {
    return await driveCache.pending[middleName];
  }

  const promise: Promise<MiddleCacheEntryWarm | null> = (async () => {
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

      const images = await fetchImagesInBatchesForWarmup(
        subFolders,
        drive
      );

      // ✅ products.ts 와 동일한 imageIndex 생성
      const imageIndex: Record<string, string[]> = {};
      for (const [folderName, urls] of Object.entries(images)) {
        const key = normalizeName(folderName);
        if (!key) continue;
        imageIndex[key] = urls;
      }

      const entry: MiddleCacheEntryWarm = {
        id: middleFolder.id,
        subFolders,
        images,
        imageIndex,
        ts: Date.now(),
      };

      if (!driveCache.middleCache) driveCache.middleCache = {};
      driveCache.middleCache[middleName] = entry;

      return entry;
    } catch (err) {
      console.error(`❌ [warmup] warmDriveMiddleCache(${middleName}) 오류:`, err);
      return null;
    } finally {
      if (driveCache.pending) {
        delete driveCache.pending[middleName];
      }
    }
  })();

  if (!driveCache.pending) driveCache.pending = {};
  driveCache.pending[middleName] = promise;

  return await promise;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ ok: false, message: "Method Not Allowed" });
  }

  try {
    const parentFolderId = "12kbRkg4PREBp6f5_tmXCu0_SYgUngIrw";

    // ✅ Sheets warmup + Drive warmup 병렬 실행
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    const drive = google.drive({ version: "v3", auth });

    const warmedSheets: string[] = [];
    const warmedDrive: string[] = [];

    // 1) 시트 데이터 캐시 선로딩 (병렬)
    await Promise.all(
      MIDDLES_TO_WARM.map(async (middle) => {
        try {
          await fetchSheetData(middle);
          warmedSheets.push(middle);
        } catch (e) {
          console.warn(`⚠️ [warmup] fetchSheetData(${middle}) 실패`, e);
        }
      })
    );

    // 2) Drive middle 캐시 선로딩 (순차 - quota 보호)
    for (const middle of MIDDLES_TO_WARM) {
      try {
        const entry = await warmDriveMiddleCache(
          middle,
          drive,
          parentFolderId
        );
        if (entry) warmedDrive.push(middle);
      } catch (e) {
        console.warn(`⚠️ [warmup] warmDriveMiddleCache(${middle}) 실패`, e);
      }
    }

    return res.status(200).json({
      ok: true,
      warmedSheets,
      warmedDrive,
      message: "Warmup 완료",
    });
  } catch (error) {
    console.error("❌ warmup API error:", error);
    return res.status(500).json({
      ok: false,
      message: "warmup 수행 중 오류가 발생했습니다.",
    });
  }
}
