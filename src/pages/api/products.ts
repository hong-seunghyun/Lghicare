import type { NextApiRequest, NextApiResponse } from "next";
import { fetchSheetData } from "@/lib/sheet";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sheet = (req.query.sheet as string) || "정수기";
  const id = req.query.id as string | undefined;

  const products = await fetchSheetData(sheet);

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

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ options: products });
}
