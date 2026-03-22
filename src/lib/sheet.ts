// src/lib/sheet.ts
import { google } from "googleapis";

type Product = Record<string, string>;

type CacheEntry = {
  data: Product[];
  ts: number;
};

type SheetGlobalCache = {
  dataCache: Record<string, CacheEntry>;
  pending: Record<string, Promise<CacheEntry | null>>;
  sheetsClient: ReturnType<typeof google.sheets> | null;
};

//  전역 객체에 __sheetCache 붙여서
//    - HMR / 여러 API 라우트 간에도 캐시 & pending 공유
const g = globalThis as typeof globalThis & {
  __sheetCache?: SheetGlobalCache;
};

if (!g.__sheetCache) {
  g.__sheetCache = {
    dataCache: {},
    pending: {},
    sheetsClient: null,
  };
}

const sheetGlobal = g.__sheetCache;

//  시트 클라이언트 가져오기 (전역 1회 생성)
export async function getSheetsClient() {
  if (sheetGlobal.sheetsClient) return sheetGlobal.sheetsClient;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  sheetGlobal.sheetsClient = google.sheets({ version: "v4", auth });
  return sheetGlobal.sheetsClient!;
}

//  안전한 Sheets API 호출 (403 / 429 백오프 재시도)
async function safeSheetGet(
  sheet: string,
  range: string,
  retries = 5
) {
  const sheets = await getSheetsClient();

  for (let i = 0; i < retries; i++) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID!,
        range,
      });
      return res;
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string };

      // 403 / 429 → 지수 백오프 후 재시도
      if (
        (e.code === 403 || e.code === 429) &&
        i < retries - 1
      ) {
        const wait = 1000 * Math.pow(2, i); // 1s → 2s → 4s → ...
        console.warn(
          `⚠️ Sheets quota (${e.code}) for [${sheet}]. Retry in ${
            wait / 1000
          }s...`
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      // 마지막 시도 혹은 다른 에러면 그대로 throw
      throw err;
    }
  }

  // 이론상 여기까지 오면 안 옴
  throw new Error(`safeSheetGet(${sheet}) failed`);
}

//  admin에서 부를 수 있는 시트 캐시 초기화 헬퍼
export function clearSheetCache(sheet?: string) {
  if (sheet) {
    delete sheetGlobal.dataCache[sheet];
    delete sheetGlobal.pending[sheet];
  } else {
    sheetGlobal.dataCache = {};
    sheetGlobal.pending = {};
  }
}

//  시트 데이터 가져오기 (30일 TTL + 전역 캐시 + pending 공유)
export async function fetchSheetData(sheet: string) {
  const now = Date.now();
  const ttl = 30 * 24 * 60 * 60 * 1000; //  30일 TTL

  // 1) 캐시 유효하면 바로 반환
  const cached = sheetGlobal.dataCache[sheet];
  if (cached && now - cached.ts < ttl) {
    return cached.data;
  }

  // 2) 이미 같은 시트에 대한 요청이 진행 중이면 그 결과 기다렸다가 재사용
  const existing = sheetGlobal.pending[sheet];
  if (existing) {
    const result = await existing;
    if (result) return result.data;
    // pending이 null을 반환했다면 새로 시도
  }

  // 3) 새로 시트 요청 Promise 생성 (다른 요청과 공유)
  const promise: Promise<CacheEntry | null> = (async () => {
    try {
      // 필요한 범위만 가져오기 (A~Z, 26컬럼)
      const res = await safeSheetGet(sheet, `${sheet}!A:Z`);
      const rows = res.data.values || [];
      const headers = rows[0] || [];

      const products: Product[] = rows.slice(1).map((r) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h as string] = r[i] || "";
        });
        return obj;
      });

      const entry: CacheEntry = { data: products, ts: Date.now() };

      //  전역 캐시에 저장
      sheetGlobal.dataCache[sheet] = entry;

      return entry;
    } catch (err) {
      console.error(`❌ fetchSheetData(${sheet}) 오류:`, err);

      //  에러인데 이전 캐시라도 있으면 그걸 반환
      const fallback = sheetGlobal.dataCache[sheet];
      if (fallback) return fallback;

      // 캐시도 없으면 null → 호출측에서 throw
      return null;
    } finally {
      // pending 정리
      delete sheetGlobal.pending[sheet];
    }
  })();

  sheetGlobal.pending[sheet] = promise;

  const result = await promise;

  if (!result) {
    // 캐시도 없고 새로 가져오기도 실패한 경우 → 에러로 처리
    throw new Error(`fetchSheetData(${sheet}) failed with no cache`);
  }

  return result.data;
}
