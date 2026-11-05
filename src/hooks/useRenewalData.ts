import { useEffect, useState, useCallback } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  CardBenefit,
  PreviewProduct,
  TeacherPlan,
  normalizeProduct,
  selectThemeProducts,
  matchPrepayRules,
  ThemeProductSummary,
} from "@/lib/renewalTest";
import type { MainBanner, ThemeCategoryConfig } from "@/types/mainPage";
const productCache = new Map<
  string,
  { products: PreviewProduct[]; ts: number }
>();
export async function fetchRenewalPrepayRate(product: PreviewProduct) {
  const params = new URLSearchParams({
    middle: product.category,
    sub: product.subCategory,
    model: product.id,
  });
  try {
    const response = await fetch(`/api/prepay/rate?${params}`);
    if (response.ok) {
      const data = await response.json();
      if (data.ok && [null, "30", "30_50"].includes(data.rateType))
        return data.rateType as "30" | "30_50" | null;
    }
  } catch {
    /* Read the same rules through the authenticated Firebase client. */
  }
  const snap = await getDocs(
    query(
      collection(db, "prepayRules"),
      where("middle", "==", product.category),
    ),
  );
  return matchPrepayRules(
    snap.docs.map((d) => d.data()),
    product,
  );
}
export async function fetchRenewalProducts(
  category: string,
  search = "",
  model = "",
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ groupBy: "modelCode" });
  if (category && category !== "전체")
    params.set("middle", category === "스타일러" ? "의류관리기" : category);
  else
    params.set(
      "middles",
      "정수기,냉장고,김치냉장고,식기세척기,전기레인지,광파오븐,에어컨,공기청정기,제습기,세탁기,워시타워,워시콤보,의류건조기,의류관리기,신발관리기,청소기,안마의자,TV,가습기,바스에어시스템,마이컵",
    );
  if (search.trim()) params.set("q", search.trim());
  if (model) params.set("models", model);
  const key = params.toString(),
    cached = productCache.get(key);
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) return cached.products;
  const response = await fetch(`/api/products?${key}`, { signal });
  if (!response.ok)
    throw new Error(`상품을 불러오지 못했습니다. (${response.status})`);
  const data = (await response.json()) as {
    options?: Record<string, unknown>[];
  };
  if (!Array.isArray(data.options))
    throw new Error("상품 응답 형식이 올바르지 않습니다.");
  const products = data.options
    .map(normalizeProduct)
    .filter((p): p is PreviewProduct => p !== null);
  if (!signal?.aborted) productCache.set(key, { products, ts: Date.now() });
  return products;
}
export function useRenewalProducts(
  category: string,
  search = "",
  enabled = true,
) {
  const [products, setProducts] = useState<PreviewProduct[]>([]),
    [loading, setLoading] = useState(enabled),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => {
    productCache.clear();
    setRevision((n) => n + 1);
  }, []);
  useEffect(() => {
    if (!enabled) {
      setProducts([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setProducts([]);
    setLoading(true);
    setError("");
    fetchRenewalProducts(category, search, "", controller.signal)
      .then((p) => {
        if (!controller.signal.aborted) setProducts(p);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "상품 조회에 실패했습니다.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [category, search, enabled, revision]);
  return { products, loading, error, retry };
}
export function useRenewalMeta(enabled = true) {
  const [cards, setCards] = useState<CardBenefit[]>([]),
    [teachers, setTeachers] = useState<TeacherPlan[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    let cancelled = false;
    Promise.all([
      getDocs(query(collection(db, "cardDiscounts"), orderBy("order"))),
      getDocs(query(collection(db, "teacherPlans"), orderBy("type"))),
    ])
      .then(([cardSnap, teacherSnap]) => {
        if (cancelled) return;
        setCards(
          cardSnap.docs
            .filter((d) => d.data().isActive !== false)
            .map((d) => {
              const v = d.data();
              return {
                id: d.id,
                issuer: String(v.cardName ?? ""),
                discount: Number(v.amount ?? 0),
                allowTeacher: Boolean(v.allowTeacher),
              };
            })
            .filter((c) => Number.isFinite(c.discount) && c.discount >= 0),
        );
        setTeachers(
          teacherSnap.docs
            .map((d) => {
              const v = d.data();
              return {
                id: d.id,
                type: String(v.type ?? ""),
                maxSeats: Number(v.maxSeats ?? 0),
                discountPerSeat: Number(v.discountPerSeat ?? 0),
              };
            })
            .filter(
              (t) =>
                Number.isFinite(t.maxSeats) &&
                Number.isFinite(t.discountPerSeat),
            ),
        );
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "운영 카드·교원 설정을 불러오지 못했습니다. 할인 설정을 확인할 수 없습니다.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return { cards, teachers, loading, error };
}
const themeCache = new Map<
  string,
  { ts: number; products: ThemeProductSummary[] }
>();
const themePending = new Map<string, Promise<ThemeProductSummary[]>>();
export async function fetchRenewalThemeProducts(sheet: string, models: string) {
  const params = new URLSearchParams({
    middle: sheet === "스타일러" ? "의류관리기" : sheet,
    models,
  });
  const key = params.toString();
  const cached = themeCache.get(key);
  if (cached && Date.now() - cached.ts < 60_000) return cached.products;
  const pending = themePending.get(key);
  if (pending) return pending;
  const request = (async () => {
    const response = await fetch(`/api/renewal/theme-products?${params}`);
    if (!response.ok)
      throw new Error(`테마상품을 불러오지 못했습니다. (${response.status})`);
    const data = (await response.json()) as {
      products?: ThemeProductSummary[];
    };
    if (!Array.isArray(data.products))
      throw new Error("테마상품 응답을 확인할 수 없습니다.");
    if (themeCache.size >= 30)
      themeCache.delete(themeCache.keys().next().value!);
    themeCache.set(key, { ts: Date.now(), products: data.products });
    return data.products;
  })();
  themePending.set(key, request);
  try {
    return await request;
  } finally {
    themePending.delete(key);
  }
}
export function prefetchRenewalTheme(theme: ThemeCategoryConfig) {
  if (theme.modelNames.length)
    void fetchRenewalThemeProducts(
      theme.sheetName,
      theme.modelNames.slice(0, 3).join(","),
    ).catch(() => {});
}
export function useRenewalThemeProducts(theme?: ThemeCategoryConfig) {
  const [state, setState] = useState<{
    key: string;
    products: ThemeProductSummary[];
    loading: boolean;
    error: string;
  }>({ key: "", products: [], loading: false, error: "" });
  const [revision, setRevision] = useState(0);
  const sheet = theme?.sheetName ?? "";
  const models = (theme?.modelNames ?? []).slice(0, 3).join(",");
  const key = `${sheet}:${models}`;
  const retry = () => {
    themeCache.clear();
    setRevision((n) => n + 1);
  };
  useEffect(() => {
    let active = true;
    if (!sheet || !models) {
      setState({ key, products: [], loading: false, error: "" });
      return;
    }
    setState({ key, products: [], loading: true, error: "" });
    fetchRenewalThemeProducts(sheet, models)
      .then((products) => {
        if (active) setState({ key, products, loading: false, error: "" });
      })
      .catch((e) => {
        if (active)
          setState({
            key,
            products: [],
            loading: false,
            error:
              e instanceof Error
                ? e.message
                : "테마상품을 불러오지 못했습니다.",
          });
      });
    return () => {
      active = false;
    };
  }, [sheet, models, key, revision]);
  const cached = themeCache.get(
    new URLSearchParams({
      middle: sheet === "스타일러" ? "의류관리기" : sheet,
      models,
    }).toString(),
  );
  const fresh = cached && Date.now() - cached.ts < 60_000;
  return {
    products: selectThemeProducts(
      fresh ? cached.products : state.key === key ? state.products : [],
      theme?.modelNames ?? [],
    ),
    loading: !fresh && Boolean(models) && (state.key !== key || state.loading),
    error: fresh ? "" : state.key === key ? state.error : "",
    retry,
  };
}
export function useRenewalMainContent() {
  const [banners, setBanners] = useState<MainBanner[]>([]),
    [themes, setThemes] = useState<ThemeCategoryConfig[]>([]),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const failed = () => {
      setError("배너·테마상품 설정을 불러오지 못했습니다.");
      setLoading(false);
    };
    const stopBanner = onSnapshot(
      query(collection(db, "mainBanners"), orderBy("priority", "asc")),
      (snap) =>
        setBanners(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as MainBanner)
            .filter((b) => b.status === "active"),
        ),
      failed,
    );
    const stopTheme = onSnapshot(
      doc(db, "mainThemeProducts", "config"),
      (snap) => {
        setThemes(
          (snap.data()?.categories ?? [])
            .filter((c: ThemeCategoryConfig) => c.status === "active")
            .sort(
              (a: ThemeCategoryConfig, b: ThemeCategoryConfig) =>
                a.priority - b.priority,
            ),
        );
        setLoading(false);
      },
      failed,
    );
    return () => {
      stopBanner();
      stopTheme();
    };
  }, []);
  return { banners, themes, error, loading };
}
