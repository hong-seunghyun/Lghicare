import type { NextApiRequest, NextApiResponse } from "next";
import {
  requireAdmin,
  adminError,
  AdminRequestError,
} from "@/lib/admin/requireAdmin";
import {
  startSheetMirror,
  stepSheetMirror,
  sheetMirrorJobs,
} from "@/lib/catalog/sheetMirror";
import { isSafeId } from "@/lib/catalog/types";
import { localCatalogMode } from "@/lib/catalog/store";
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method ?? ""))
    return res.status(405).json({ ok: false });
  try {
    const owner = await requireAdmin(req);
    if (localCatalogMode()) {
      if (req.method === "GET")
        return res.json({ ok: true, jobs: [], local: true });
      throw new AdminRequestError(
        409,
        "로컬 검증에서는 운영 Google 시트 쓰기를 실행하지 않습니다.",
      );
    }
    if (req.method === "GET")
      return res.json({ ok: true, jobs: await sheetMirrorJobs() });
    if (
      req.body?.action === "start" &&
      typeof req.body.category === "string" &&
      typeof req.body.generation === "string"
    )
      return res.json({
        ok: true,
        job: await startSheetMirror(
          req.body.category,
          req.body.generation,
          owner,
        ),
      });
    if (
      req.body?.action === "step" &&
      typeof req.body.id === "string" &&
      isSafeId(req.body.id)
    )
      return res.json({ ok: true, job: await stepSheetMirror(req.body.id) });
    throw new AdminRequestError(400, "시트 동기화 작업을 확인해 주세요.");
  } catch (error) {
    const failure = adminError(error);
    return res
      .status(failure.status)
      .json({ ok: false, message: failure.message });
  }
}
