import type { NextApiRequest, NextApiResponse } from "next";
import { invalidateProductCaches, type CacheTarget } from "@/lib/productCacheControl";
import "@/lib/sheet";
import "@/lib/productImageCache";
import "@/lib/drive";
import { requireAdmin, adminError } from "@/lib/admin/requireAdmin";

export async function resetProductCache(req: NextApiRequest, res: NextApiResponse, target: CacheTarget) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "POST 요청만 사용할 수 있습니다." });
  }
  try {
    await requireAdmin(req);
    const revision = await invalidateProductCaches(target);
    return res.status(200).json({ ok: true, revision, message: "캐시 초기화가 완료되었습니다. 다른 서버에도 5초 이내에 반영됩니다." });
  } catch (error) {
    const failure = adminError(error);
    if (failure.status === 401 || failure.status === 403) return res.status(failure.status).json({ ok: false, message: failure.message });
    console.error("캐시 초기화 실패", error);
    return res.status(503).json({ ok: false, message: "캐시 초기화를 공유하지 못했습니다. 잠시 후 다시 실행해 주세요." });
  }
}
