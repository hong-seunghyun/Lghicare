import type { NextApiRequest, NextApiResponse } from "next";
import { fetchSheetDataWithPolicy } from "@/lib/sheet";
import { getProductImageCache, PRODUCT_CATEGORIES } from "@/lib/productImageCache";
import { invalidateProductCaches, type CacheTarget } from "@/lib/productCacheControl";
import "@/lib/drive";
import { requireAdmin, adminError } from "@/lib/admin/requireAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "POST 요청만 사용할 수 있습니다." });
  }
  try { await requireAdmin(req); }
  catch (error) { const failure = adminError(error); return res.status(failure.status).json({ ok: false, message: failure.message }); }
  const target = req.query.target ?? "all";
  const category = req.body?.category;
  if (typeof target !== "string" || !["sheets", "drive", "all"].includes(target) ||
      (category !== undefined && !PRODUCT_CATEGORIES.includes(category))) {
    return res.status(400).json({ ok: false, message: "올바른 캐시 대상과 제품 분류를 선택해 주세요." });
  }
  const categories = category ? [category as string] : [...PRODUCT_CATEGORIES];
  const warmedSheets: string[] = [], warmedDrive: string[] = [];
  const failed: Array<{ category: string; target: string; message: string }> = [];
  const started = Date.now();
  try {
    if (req.body?.reset !== false) await invalidateProductCaches(target as CacheTarget);
    for (const middle of categories) {
      if (target !== "drive") {
        try {
          await fetchSheetDataWithPolicy(middle, { forceRefresh: true, allowStale: false });
          warmedSheets.push(middle);
        } catch {
          failed.push({ category: middle, target: "sheets", message: "시트 최신 데이터를 읽지 못했습니다." });
        }
      }
      if (target !== "sheets") {
        try {
          const entry = await getProductImageCache(middle, true);
          if (!entry) throw new Error("MISSING_FOLDER");
          warmedDrive.push(middle);
        } catch {
          failed.push({ category: middle, target: "drive", message: "이미지 폴더를 읽지 못했습니다. 폴더와 접근 권한을 확인해 주세요." });
        }
      }
    }
    const ok = failed.length === 0;
    return res.status(ok ? 200 : 207).json({
      ok, warmedSheets, warmedDrive, failed, elapsedMs: Date.now() - started,
      message: ok ? "최신 데이터로 웜업을 완료했습니다." : "일부 항목의 웜업에 실패했습니다. 실패 항목을 다시 실행해 주세요.",
    });
  } catch (error) {
    console.error("캐시 웜업 실패", error);
    return res.status(503).json({ ok: false, warmedSheets, warmedDrive, failed, message: "캐시 초기화에 실패하여 웜업을 시작하지 못했습니다." });
  }
}
