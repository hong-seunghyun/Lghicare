import { google } from "googleapis";
import Link from "next/link";

interface Item {
  중분류: string;
  소분류: string;
}

interface HomeProps {
  items: Item[];
}

export default function Home({ items }: HomeProps) {
  // 중복 제거 및 구조화
  const grouped: Record<string, Set<string>> = {};

  items.forEach(({ 중분류, 소분류 }) => {
    if (!grouped[중분류]) grouped[중분류] = new Set();
    if (소분류) grouped[중분류].add(소분류);
  });

  return (
    <div style={{ padding: "20px" }}>
      <h1>제품 카테고리</h1>
      <ul>
        {Object.entries(grouped).map(([middle, subs]) => (
          <li key={middle} style={{ marginBottom: "1rem" }}>
            {/* 중분류 클릭 → 중분류 기준 제품 리스트 */}
            <Link href={`/products/${encodeURIComponent(middle)}`}>
              <strong>{middle}</strong>
            </Link>
            <ul style={{ marginLeft: "20px" }}>
              {[...subs].map((sub) => (
                <li key={sub}>
                  {/* 소분류 클릭 → 중분류+소분류 기준 제품 리스트 */}
                  <Link
                    href={`/products/${encodeURIComponent(
                      middle
                    )}/${encodeURIComponent(sub)}`}
                  >
                    {sub}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function getServerSideProps() {
  if (!process.env.GOOGLE_SHEET_ID) {
    throw new Error("❌ GOOGLE_SHEET_ID 환경 변수가 설정되지 않았습니다.");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
  });

  const sheetTitles =
    meta.data.sheets?.map((s) => s.properties?.title || "") || [];

  const results = await Promise.all(
    sheetTitles.map(async (title) => {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID!,
        range: `${title}!A:Z`,
      });

      const rows = res.data.values || [];
      const headers = rows[0] || [];

      const 중분류Idx = headers.indexOf("중분류");
      const 소분류Idx = headers.indexOf("소분류");

      return rows.slice(1).map((r) => ({
        중분류: r[중분류Idx] || "",
        소분류: r[소분류Idx] || "",
      }));
    })
  );

  const items = results.flat();

  return {
    props: {
      items,
    },
  };
}
