import { useState, useEffect, useCallback, useRef } from "react";

interface ProductVariant {
  모델코드: string;
  상품명: string;
  계약기간: string;
  서비스유형: string;
  "서비스주기/월": string;
  프로모션유형: string;
  프로모션명: string;
  정상가: string;
  할인전금액: string;
  할인후금액: string;
  할인금액?: string;
  thumbnailUrl?: string;
}

interface Product {
  모델코드: string;
  상품명: string;
  thumbnailUrl?: string;
  variants?: ProductVariant[];
}

interface ApiResponse {
  options: Product[];
}

export default function useInfiniteProducts(category: string, search: string) {
  const PAGE_SIZE = 12;
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const currentSearchRef = useRef<string>("");
  const isFetchingRef = useRef(false);

  //  검색/카테고리 변경 시 초기화
  useEffect(() => {
    setProducts([]);
    setPage(0);
    setHasMore(true);
    currentSearchRef.current = search.trim();
  }, [category, search]);

	const dedupeProductsByModelCode = (items: Product[]): Product[] => {
		const map = new Map<string, Product>();
	
		for (const item of items) {
			const code = (item.모델코드 ?? "").toString().trim();
			if (!code) continue;
	
			const prev = map.get(code);
			if (!prev) {
				map.set(code, item);
				continue;
			}
	
			const prevVariants = Array.isArray(prev.variants) ? prev.variants : [];
			const nextVariants = Array.isArray(item.variants) ? item.variants : [];
	
			map.set(code, {
				...prev,
				...item,
				//  variants 누적
				variants: [...prevVariants, ...nextVariants],
			});
		}
	
		return Array.from(map.values());
	};

	
  const fetchProducts = useCallback(
    async (pageToLoad: number, reset = false) => {
      //  검색어 추적 (검색어가 바뀌면 캐시 무시)
      const keyword = search.trim();
      const currentKeyword = currentSearchRef.current;

      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setIsLoading(true);

      try {
				const params = new URLSearchParams({ middle: category, groupBy: "modelCode" });

        if (keyword) params.append("q", keyword);

        const res = await fetch(`/api/products?${params.toString()}`);
        const data: ApiResponse = await res.json();
				const allProductsRaw = data.options || [];

        //  검색어가 도중에 바뀐 경우 — 중간 요청 취소
        if (keyword !== currentKeyword) {
          isFetchingRef.current = false;
          setIsLoading(false);
          return;
        }

        //  모델코드 기준으로 중복 제거 + variants 합치기
        const dedupedAllProducts = dedupeProductsByModelCode(allProductsRaw);

        //  페이지 슬라이싱
        const start = pageToLoad * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        const nextChunk = dedupedAllProducts.slice(start, end);

        setProducts((prev) => {
          if (reset) return nextChunk;
          return dedupeProductsByModelCode([...prev, ...nextChunk]);
        });

        setHasMore(end < dedupedAllProducts.length);
        setPage(pageToLoad + 1);

      } catch (err) {
        console.error("❌ 제품 데이터 불러오기 오류:", err);
      } finally {
        isFetchingRef.current = false;
        setIsLoading(false);
      }
    },
    [category, search]
  );

  //  첫 페이지 로드 (검색어 변경 시마다)
  useEffect(() => {
    fetchProducts(0, true);
  }, [category, search, fetchProducts]);

  //  스크롤 시 다음 페이지 로드
  const loadMore = useCallback(() => {
    if (hasMore && !isFetchingRef.current) {
      fetchProducts(page, false);
    }
  }, [fetchProducts, hasMore, page]);

  return { products, hasMore, loadMore, isLoading };
}
