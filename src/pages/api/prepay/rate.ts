/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/api/prepay/rate.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";
import type { PrepayRate } from "@/utils/prepay/classifyPrepayRate";

type Data = {
  ok: boolean;
  rateType: PrepayRate;
  reason?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ ok: false, rateType: null, reason: "METHOD_NOT_ALLOWED" });
  }

  try {
    const middleRaw = req.query.middle;
    const subRaw = req.query.sub;
    const modelRaw = req.query.model;

    const middle =
      typeof middleRaw === "string" ? middleRaw.trim() : (middleRaw || "").toString().trim();
    const sub =
      typeof subRaw === "string" ? subRaw.trim() : (subRaw || "").toString().trim();
    const model =
      typeof modelRaw === "string" ? modelRaw.trim() : (modelRaw || "").toString().trim();

    if (!middle) {
      return res
        .status(400)
        .json({ ok: false, rateType: null, reason: "MIDDLE_REQUIRED" });
    }

    const db = initFirebaseAdmin();

    // 🔥 prepayRules 컬렉션에서 middle 기준으로만 가져온 뒤, JS에서 우선순위 매칭
    const snap = await db
      .collection("prepayRules")
      .where("middle", "==", middle)
      .get();

    let matchedByMiddle: PrepayRate = null;
    let matchedBySub: PrepayRate = null;
    let matchedByModel: PrepayRate = null;

    snap.forEach((doc) => {
      const data = doc.data() as {
        middle?: string;
        sub?: string | null;
        model?: string | null;
        rate30?: boolean;
        rate50?: boolean;
      };

      const rate30 = !!data.rate30;
      const rate50 = !!data.rate50;

      // 🔹 rate 추출: 30만 true → "30", 30+50 or 50만 true → "30_50" 취급
      let rate: PrepayRate = null;
      if (rate30 && rate50) rate = "30_50";
      else if (rate30) rate = "30";
      else if (rate50) rate = "30_50";

      if (!rate) return;

      const ruleSub = (data.sub || "").trim();
      const ruleModel = (data.model || "").trim();

      // 1) 모델 기준 (최우선)
      if (model && ruleModel && ruleModel === model) {
        matchedByModel = rate;
      }

      // 2) 소분류 기준
      if (!matchedByModel && sub && ruleSub && ruleSub === sub) {
        matchedBySub = rate;
      }

      // 3) 중분류 기준 (sub / model 없음)
      if (!ruleSub && !ruleModel && !matchedByModel && !matchedBySub) {
        matchedByMiddle = rate;
      }
    });

    const finalRate: PrepayRate =
      matchedByModel || matchedBySub || matchedByMiddle || null;

    return res.status(200).json({ ok: true, rateType: finalRate });
  } catch (err: any) {
    console.error("❌ /api/prepay/rate 서버 오류:", err);
    return res.status(500).json({
      ok: false,
      rateType: null,
      reason: err?.message || "INTERNAL_ERROR",
    });
  }
}
