import type { NextApiRequest, NextApiResponse } from "next";
import {
  requireAdmin,
  adminError,
  AdminRequestError,
} from "@/lib/admin/requireAdmin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method ?? ""))
    return res.status(405).json({ ok: false });
  try {
    await requireAdmin(req);
    if (req.method === "GET")
      return res.json({ ok: true, jobs: [], manual: true });
    throw new AdminRequestError(
      409,
      "이미지는 기존처럼 Drive에 직접 업로드한 뒤 캐시 관리에서 이미지 초기화 후 웜업을 실행해 주세요.",
    );
  } catch (error) {
    const failure = adminError(error);
    return res
      .status(failure.status)
      .json({ ok: false, message: failure.message });
  }
}
