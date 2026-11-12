//  pages/api/search-products.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getProductImageCache, imageModelKey } from "@/lib/productImageCache";
import { fetchSheetData } from "@/lib/sheet";
import { normalizeAndExpandModelNames } from "@/lib/utils";
import { publishedRows } from "@/lib/catalog/read";

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

async function getThumbnailUrl(middle: string, modelId: string) {
  const cache = await getProductImageCache(middle);
  if (!cache) return "";
  for (const candidate of normalizeAndExpandModelNames(modelId).map(imageModelKey)) {
    if (cache.imageIndex[candidate]?.[0]) return cache.thumbnailIndex?.[candidate] || cache.imageIndex[candidate][0];
  }
  return "";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "no-store");
  const { q, limit = "9", cursor } = req.query;
  const search = (q as string)?.trim();
  const limitNum = parseInt(limit as string, 10);
  const cursorNum = parseInt(cursor as string, 10) || 0; //  시작 인덱스

  if (!search) {
    return res.status(200).json({ total: 0, groups: [], nextCursor: null });
  }

  try {
    //  중분류 시트 병렬 로딩 (기존 유지)
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
      "바스에어시스템",
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
          const released = await publishedRows(sheet, undefined, true);
          const rows = released?.rows ?? await fetchSheetData(sheet);
          return rows.map((r: Product) => ({ ...r, 중분류: sheet }));
        } catch {
          return [];
        }
      })
    );

    const allProducts = allProductsArrays.flat();

    //  검색 필터
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

    //  전체 그룹화 (기존 로직 유지)
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

    //  페이지네이션 적용
    const pagedKeys = groupKeys.slice(cursorNum, cursorNum + limitNum);
    const nextCursor =
      cursorNum + limitNum < totalGroups ? cursorNum + limitNum : null;

    const pagedGroups = pagedKeys.map((key) => grouped[key]);

    //  썸네일 + 최저가 + variants 구성 (병렬)
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
                    representative["중분류"],
                    v["모델코드"] //  variant별 모델코드 기준으로 탐색
                  );
            return { ...v, thumbnailUrl: thumb };
          })
        );


        const thumbnailUrl =
        representative.thumbnailUrl ||
        (await getThumbnailUrl(
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

    res.setHeader("Cache-Control", "no-store");
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
