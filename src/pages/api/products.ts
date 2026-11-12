// pages/api/products.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { fetchSheetData, fetchSheetDataWithPolicy } from "@/lib/sheet";
import { getProductImageCache } from "@/lib/productImageCache";
import { registerCacheInvalidator, syncProductCacheRevision } from "@/lib/productCacheControl";
import { normalizeAndExpandModelNames, normalizeModelName } from "@/lib/utils";
import { publishedRows, catalogPointer } from "@/lib/catalog/read";
import { defaultVariant, lowestVariant, normalizeProduct } from "@/lib/renewalTest";

type Product = { [key: string]: string };
type ProductVariantSummary = Record<string, string | undefined>;
type ProductListOption = Record<string, unknown> & {
  thumbnailUrl: string;
  variants: ProductVariantSummary[];
};
type ProductListResponse = {
  options: ProductListOption[];
  subCategories: string[];
};
type ProductListCacheEntry = {
  ts: number;
  value: ProductListResponse;
  bytes: number;
};

const g = globalThis as typeof globalThis & { __productListCache?: Record<string, ProductListCacheEntry> };
g.__productListCache ??= {};
const PRODUCT_LIST_CACHE_TTL_MS = 60 * 1000;
registerCacheInvalidator("product-lists", "all", () => { g.__productListCache = {}; });

//  공통 정규화 함수 (폴더명/모델명 정규화에 사용)
const normalizeName = (s?: string) =>
  normalizeModelName((s || "").replace(/\s+/g, "").trim().toLowerCase());

const queryValueKey = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.join(",") : value || "";

const queryValues = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value : [value])
    .flatMap((item) => (item ?? "").split(","))
    .map((item) => item.trim())
    .filter(Boolean);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "no-store");
  const middle = req.query.middle as string | undefined;
  const middlesQuery = req.query.middles;
  const sub = req.query.sub as string | undefined;
  const id = req.query.id as string | undefined;
  const q = req.query.q as string | undefined;
  const modelsQuery = req.query.models;
  const includeImages = req.query.includeImages !== "false";
  const summaryOnly = req.query.summary === "true" && !id && !modelsQuery;

	const groupBy = req.query.groupBy as string | undefined;
  const isModelCodeGrouping = groupBy === "modelCode";

  const middleValues = queryValues(middlesQuery);
  const sheet = middleValues.length ? "__multi__" : middle || "정수기";
  let listCacheKey = id
    ? ""
    : [
        sheet,
        middle || "",
        queryValueKey(middlesQuery),
        sub || "",
        q || "",
        queryValueKey(modelsQuery),
        groupBy || "",
        includeImages ? "images" : "no-images",
        summaryOnly ? "summary" : "full",
      ].join("::");

  try {
    await syncProductCacheRevision();
    const version = (await catalogPointer()).id ?? "legacy";
    if (listCacheKey) listCacheKey += `::${version}`;
    const listCache = g.__productListCache;
    if (listCacheKey) {
      const cached = g.__productListCache?.[listCacheKey];
      if (cached && Date.now() - cached.ts < PRODUCT_LIST_CACHE_TTL_MS) {
        res.setHeader(
          "Cache-Control",
          "no-store"
        );
        return res.status(200).json(cached.value);
      }
    }

    const loadImages = Boolean(id || includeImages);

    //  1. 시트 데이터 (fetchSheetData 자체는 별도 캐시 사용)
    const sheets = middleValues.length ? middleValues : [sheet];
    const requestedModels = id ? [id] : queryValues(modelsQuery);
    const publishedCategories = new Set<string>();
    let products = (await Promise.all(sheets.map(async category => {
      const released = await publishedRows(category, requestedModels, summaryOnly);
      if (released) publishedCategories.add(category);
      return released?.rows ?? fetchSheetData(category);
    }))).flat();

    // (기존 normalize는 그대로 두되, 아래에서는 normalizeName 사용)
    const normalize = (s?: string) =>
      (s || "").replace(/\s+/g, "").trim().toLowerCase();
    const modelFilters = queryValues(modelsQuery)
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
      if (!loadImages) return "";
      const cacheKey = `${middleName}::${modelId}`;
      if (thumbCache.has(cacheKey)) {
        return thumbCache.get(cacheKey)!;
      }

      const cache = await getProductImageCache(middleName);
      if (!cache) {
        thumbCache.set(cacheKey, "");
        return "";
      }

      const candidates = normalizeAndExpandModelNames(modelId).map(normalizeName);
      for (const candidate of candidates) {
        const urls = cache.imageIndex[candidate];
        if (urls?.[0]) {
          const url = cache.thumbnailIndex?.[candidate] || urls[0];
          thumbCache.set(cacheKey, url);
          return url;
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
      if (!loadImages) return [];
      const cacheKey = `${middleName}::${modelId}::${fallbackId || ""}`;
      if (imagesCache.has(cacheKey)) {
        return imagesCache.get(cacheKey)!;
      }

      const cache = await getProductImageCache(middleName);
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
      let options = products.filter(
        (p) => p["모델코드"]?.trim() === id.trim()
      );
      if (!options.length && !publishedCategories.has(sheet)) {
        products = await fetchSheetDataWithPolicy(sheet, { forceRefresh: true, allowStale: false });
        options = products.filter((p) => p["모델코드"]?.trim() === id.trim());
      }
      if (!options.length) return res.status(404).json({ options: [], subCategories });

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
        getThumbnailUrl(target["중분류"], target["모델코드"]).then((url) =>
          url || (target["동일모델기준"] ? getThumbnailUrl(target["중분류"], target["동일모델기준"]) : "")
        ),
        getAllImages(target["중분류"], target["모델코드"], target["동일모델기준"]),
      ]);

      const enrichedOptions = options.map((p) => ({
        ...p,
        thumbnailUrl: thumb,
        images: imgs,
        shareImageUrl: imgs[0] || thumb,
        catalogVersion: version,
      }));

      //  6️⃣ 응답에 relatedModels 추가
      res.setHeader(
        "Cache-Control",
        "no-store"
      );
      return res.status(200).json({
        options: enrichedOptions,
        relatedModels: dedupedRelated,
        subCategories,
      });
    }

    //  목록 조회
    let filtered = products;
    if (middle && !middleValues.length)
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
        const thumbnailUrl =
          includeImages && loadImages
            ? (await getThumbnailUrl(
                representative["중분류"],
                representative["모델코드"]
              )) || (representative["동일모델기준"]
                ? await getThumbnailUrl(representative["중분류"], representative["동일모델기준"])
                : "")
            : "";
        let selectedRows = group;
        if (summaryOnly && !group[0].__summary) {
          const product = normalizeProduct({ ...representative, variants: group });
          if (product) selectedRows = [...new Set([defaultVariant(product), lowestVariant(product)])] as Product[];
        }
        const variants = selectedRows.map((p) => ({
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
          할인금액: p["할인금액"],
          가격: p["할인후금액"] || p["정상가"],
          thumbnailUrl,
        }));
        return { ...representative, thumbnailUrl, variants, optionsLoaded: !summaryOnly, optionCount: Number(representative.__optionCount ?? group.length), catalogVersion: version };
      })
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );
    const responseBody: ProductListResponse = {
      options: enrichedFiltered,
      subCategories,
    };
    if (listCacheKey && listCache && g.__productListCache === listCache) {
      const bytes = Buffer.byteLength(JSON.stringify(responseBody));
      for (const [key, entry] of Object.entries(listCache)) if (Date.now() - entry.ts >= PRODUCT_LIST_CACHE_TTL_MS) delete listCache[key];
      if (bytes <= 16 * 1024 * 1024) {
        let used = Object.values(listCache).reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);
        while ((used + bytes > 32 * 1024 * 1024 || Object.keys(listCache).length >= 120) && Object.keys(listCache).length) { const oldest = Object.keys(listCache)[0]; used -= listCache[oldest].bytes ?? 0; delete listCache[oldest]; }
        g.__productListCache[listCacheKey] = { ts: Date.now(), value: responseBody, bytes };
      }
    }
    return res.status(200).json(responseBody);
  } catch (error: unknown) {
    console.error("❌ products API 오류:", error);
    return res.status(500).json({ error: "서버 오류" });
  }
}
