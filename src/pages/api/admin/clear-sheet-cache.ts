// pages/api/admin/clear-sheet-cache.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { clearSheetCache } from "@/lib/sheet";

type ClearResult = {
  ok: boolean;
  message?: string;
};

export default function handler(req: NextApiRequest, res: NextApiResponse<ClearResult>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method Not Allowed" });
  }

  try {
    clearSheetCache();

    return res.status(200).json({
      ok: true,
      message: "시트 데이터 캐시가 초기화되었습니다.",
    });
  } catch (error) {
    console.error("? clear-sheet-cache error:", error);
    return res.status(500).json({
      ok: false,
      message: "시트 캐시 초기화 중 오류가 발생했습니다.",
    });
  }
}

