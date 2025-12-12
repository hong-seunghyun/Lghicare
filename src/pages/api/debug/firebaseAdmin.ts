/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/api/debug/firebaseAdmin.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getApps } from "firebase-admin/app";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";

type DebugResponse = {
  ok: boolean;
  projectId?: string;
  rulesSampleCount?: number;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DebugResponse>
) {
  try {
    // 1) Admin 초기화 시도
    const db = initFirebaseAdmin();

    // 2) 현재 등록된 app들에서 projectId 확인
    const apps = getApps();
    const app = apps[0];
    const projectId = (app?.options as any)?.projectId as string | undefined;

    let rulesSampleCount: number | undefined;

    try {
      // 3) prepayRules 컬렉션이 읽히는지 간단하게 체크 (있으면 0 또는 1 이상)
      const snap = await db.collection("prepayRules").limit(1).get();
      rulesSampleCount = snap.size;
    } catch (innerErr) {
      console.error("❌ prepayRules 컬렉션 읽기 오류:", innerErr);
    }

    return res.status(200).json({
      ok: true,
      projectId,
      rulesSampleCount,
    });
  } catch (err: any) {
    console.error("❌ firebaseAdmin 디버그 오류:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "unknown error",
    });
  }
}
