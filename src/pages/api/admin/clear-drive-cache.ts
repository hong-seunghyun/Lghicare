// pages/api/admin/clear-drive-cache.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { clearSheetCache } from "@/lib/sheet";
import { clearDriveThumbnailCache } from "@/lib/drive"; // ← lib/drive 파일 경로에 맞춰 조정

// 이 파일 안에서만 느슨하게 사용할 캐시 타입
type DriveCacheLoose = {
  middleCache?: Record<string, unknown>;
  pending?: Record<string, unknown>;
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method Not Allowed" });
  }

  try {
    //  이미 global.d.ts에서 선언된 __driveCache를 그대로 가져오되,
    //    여기서는 타입을 느슨하게 다루기 위해 any로 우회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cache = (globalThis as any).__driveCache as
      | DriveCacheLoose
      | undefined;

    if (cache) {
      //  middleCache 초기화
      if (cache.middleCache) {
        cache.middleCache = {};
      } else {
        cache.middleCache = {};
      }

      //  pending 있으면 함께 초기화 (없어도 에러 X)
      if (cache.pending) {
        cache.pending = {};
      }
    }

    //  드라이브 썸네일 캐시 초기화 (getDriveThumbnail 캐시)
    clearDriveThumbnailCache(); // 모델코드 없이 호출하면 전체 썸네일 캐시 초기화

    return res.status(200).json({
      ok: true,
      message: "Drive 이미지/썸네일 캐시가 초기화되었습니다.",
    });
  } catch (error) {
    console.error("❌ clear-drive-cache error:", error);
    return res.status(500).json({
      ok: false,
      message: "캐시 초기화 중 오류가 발생했습니다.",
    });
  }
}
