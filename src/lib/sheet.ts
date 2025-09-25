import { google } from "googleapis";

let cachedSheets: ReturnType<typeof google.sheets> | null = null;
type Product = Record<string, string>;
const cache: Record<string, Product[]> = {}; // 메모리 캐시

export async function getSheetsClient() {
  if (!cachedSheets) {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    cachedSheets = google.sheets({ version: "v4", auth });
  }
  return cachedSheets;
}

export async function fetchSheetData(sheet: string) {
  // ✅ 메모리 캐시 먼저 확인
  if (cache[sheet]) {
    return cache[sheet];
  }

  const sheets = await getSheetsClient();

  // 필요한 범위만 가져오기 (A~T, 컬럼 20개 정도까지만)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID!,
    range: `${sheet}!A:T`,
  });

  const rows = res.data.values || [];
  const headers = rows[0] || [];

  const products = rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] || "";
    });
    return obj;
  });

  // ✅ 캐시에 저장 (5분 TTL)
  cache[sheet] = products;
  setTimeout(() => {
    delete cache[sheet];
  }, 5 * 60 * 1000);

  return products;
}
