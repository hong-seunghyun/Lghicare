import type { NextApiRequest, NextApiResponse } from "next";
import { fetchSheetData } from "@/lib/sheet";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const middle = req.query.middle as string | undefined;
  const sub = req.query.sub as string | undefined;
  const id = req.query.id as string | undefined;

  // 기본적으로 시트 이름은 중분류와 동일
  const sheet = middle || "정수기";

  // 시트 데이터 전체 불러오기
  const products = await fetchSheetData(sheet);

  // ✅ 개별 제품 상세 조회 (id 기준)
  if (id) {
    const target = products.find(
      (p) => p["동일 모델 기준"] === id || p["모델코드"] === id
    );

    if (!target) {
      return res.status(404).json({ options: [] });
    }

    const baseKey = target["동일 모델 기준"]?.trim() || target["모델코드"];
    const options = products.filter(
      (p) => p["동일 모델 기준"] === baseKey || p["모델코드"] === baseKey
    );

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ options });
  }

  // ✅ 중분류 + 소분류 필터링
  let filtered = products;

  if (middle) {
    filtered = filtered.filter((p) => p["중분류"]?.trim() === middle.trim());
  }

  if (sub) {
    filtered = filtered.filter((p) => p["소분류"]?.trim() === sub.trim());
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ options: filtered });
}
