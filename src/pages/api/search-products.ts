// ✅ pages/api/search-products.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { google, drive_v3 } from "googleapis";
import { fetchSheetData } from "@/lib/sheet";
import { normalizeAndExpandModelNames } from "@/lib/utils";

type Product = Record<string, string>;

type Variant = {
  모델코드: string;
  제품색상: string;
  상품명: string;
  가격?: string;
  thumbnailUrl?: string;
};

type ProductCard = {
  상품명: string;
  모델코드: string;
  제품색상?: string;
  중분류?: string;
  가격: string;
  thumbnailUrl: string;
  variants: Variant[];
  [key: string]: string | Variant[] | undefined; // 기타 시트 필드
};

if (!globalThis.__driveCache) {
  globalThis.__driveCache = { middleCache: {} };
}
const driveCache = globalThis.__driveCache || { middleCache: {} };

const normalizeModelName = (s?: string) =>
  (s || "").replace(/\s+/g, "").trim().toLowerCase();

async function ensureMiddleCache(drive: drive_v3.Drive, middleName: string) {
  if (driveCache.middleCache[middleName])
    return driveCache.middleCache[middleName];

  const parentFolderId = "12kbRkg4PREBp6f5_tmXCu0_SYgUngIrw";
  const middleRes = await drive.files.list({
    q: `'${parentFolderId}' in parents and name='${middleName}' and mimeType='application/vnd.google-apps.folder'`,
    fields: "files(id,name)",
    pageSize: 1,
  });
  const middleFolder = middleRes.data.files?.[0];
  if (!middleFolder?.id) return null;

  const subRes = await drive.files.list({
    q: `'${middleFolder.id}' in parents and mimeType='application/vnd.google-apps.folder'`,
    fields: "files(id,name)",
    pageSize: 1000,
  });

  const subFolders = subRes.data.files || [];
  const images: Record<string, string[]> = {};

  // ✅ 이미지 병렬 로딩 (속도 개선)
  await Promise.all(
    subFolders.map(async (sf) => {
      const imgRes = await drive.files.list({
        q: `'${sf.id}' in parents and mimeType contains 'image/' and trashed = false`,
        fields: "files(id,name)",
        pageSize: 1000,
      });
      images[sf.name ?? ""] = (imgRes.data.files || []).map(
        (f) => `/api/image-proxy?fileId=${f.id}`
      );
    })
  );

  driveCache.middleCache[middleName] = {
    id: middleFolder.id,
    subFolders,
    images,
  };
  return driveCache.middleCache[middleName];
}

async function getThumbnailUrl(
  drive: drive_v3.Drive,
  middle: string,
  modelId: string
) {
  const cache = await ensureMiddleCache(drive, middle);
  if (!cache) return "";

  const candidates = normalizeAndExpandModelNames(modelId).map((c) =>
    normalizeModelName(c)
  );
  for (const candidate of candidates) {
    const match = Object.entries(cache.images).find(([folderName]) => {
      return normalizeModelName(folderName) === candidate;
    });
    if (match?.[1]?.[0]) return match[1][0];
  }
  return "";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { q, limit = "9", cursor } = req.query;
  const search = (q as string)?.trim();
  const limitNum = parseInt(limit as string, 10);
  const cursorNum = parseInt(cursor as string, 10) || 0; // ✅ 시작 인덱스

  if (!search) {
    return res.status(200).json({ total: 0, groups: [], nextCursor: null });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    const drive = google.drive({ version: "v3", auth });

    // ✅ 중분류 시트 병렬 로딩 (기존 유지)
    const sheetsToSearch = [
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

    const allProductsArrays = await Promise.all(
      sheetsToSearch.map(async (sheet) => {
        try {
          const rows = await fetchSheetData(sheet);
          return rows.map((r: Product) => ({ ...r, 중분류: sheet }));
        } catch {
          return [];
        }
      })
    );

    const allProducts = allProductsArrays.flat();

    // ✅ 검색 필터
    const filtered = allProducts.filter((p: Product) => {
      const combined = `
        ${p["상품명"] || ""}
        ${p["모델코드"] || ""}
        ${p["제품기능"] || ""}
        ${p["제품색상"] || ""}
        ${p["중분류"] || ""}
        ${p["소분류"] || ""}
      `
        .toLowerCase()
        .replace(/\s+/g, "");

      const keyword = (search || "").toLowerCase().trim().replace(/\s+/g, "");
      return combined.includes(keyword);
    });

    // ✅ 전체 그룹화 (기존 로직 유지)
const grouped = (filtered as Product[]).reduce<Record<string, Product[]>>(
  (acc, cur) => {
    const key = ((cur["동일모델기준"] || cur["모델코드"]) ?? "").trim();
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(cur);
    return acc;
  },
  {}
);

    const groupKeys = Object.keys(grouped);
    const totalGroups = groupKeys.length;

    // ✅ 페이지네이션 적용
    const pagedKeys = groupKeys.slice(cursorNum, cursorNum + limitNum);
    const nextCursor =
      cursorNum + limitNum < totalGroups ? cursorNum + limitNum : null;

    const pagedGroups = pagedKeys.map((key) => grouped[key]);

    // ✅ 썸네일 + 최저가 + variants 구성 (병렬)
    const cards: ProductCard[] = await Promise.all(
      pagedGroups.map(async (group) => {
        const representative = group[0];

        const numericPrices = group
          .map((v) => {
            const raw = v["할인후금액"] || v["가격"] || "";
            const num = parseInt(raw.replace(/[^0-9]/g, ""), 10);
            return isNaN(num) || num <= 0 ? null : num;
          })
          .filter((n): n is number => n !== null);

        const minPrice = numericPrices.length > 0 ? Math.min(...numericPrices) : 0;

        const variants: Variant[] = group.map((v) => ({
          모델코드: v["모델코드"] || "",
          제품색상: v["제품색상"] || "",
          상품명: v["상품명"] || "",
          가격: v["할인후금액"] || v["가격"] || "",
          thumbnailUrl: v["thumbnailUrl"] || "",
        }));

        const variantThumbnails = await Promise.all(
          variants.map(async (v) => {
            const thumb =
              v.thumbnailUrl && v.thumbnailUrl.trim()
                ? v.thumbnailUrl
                : await getThumbnailUrl(
                    drive,
                    representative["중분류"],
                    v["모델코드"] // ✅ variant별 모델코드 기준으로 탐색
                  );
            return { ...v, thumbnailUrl: thumb };
          })
        );


        const thumbnailUrl =
        representative.thumbnailUrl ||
        (await getThumbnailUrl(
          drive,
          representative["중분류"],
          representative["모델코드"]
        ));

        return {
          상품명: representative["상품명"] || "",
          모델코드: representative["모델코드"] || "",
          제품색상: representative["제품색상"] || "",
          중분류: representative["중분류"] || "",
          가격: minPrice.toString(),
          thumbnailUrl,
           variants: variantThumbnails,
          ...representative,
        };
      })
    );

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({
      total: totalGroups,
      groups: cards,
      nextCursor,
    });
  } catch (err) {
    console.error("[search-products] error", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
