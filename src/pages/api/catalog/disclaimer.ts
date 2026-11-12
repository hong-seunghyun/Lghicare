import type { NextApiRequest, NextApiResponse } from "next";
import legacy from "@/disclaimer/disclaimer.json";
import { publishedDisclaimers, catalogPointer } from "@/lib/catalog/read";
import { isSafeModel, isSafeId } from "@/lib/catalog/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET")
    return res.status(405).json({ error: "GET_REQUIRED" });
  const model = typeof req.query.model === "string" ? req.query.model : "";
  const version =
    typeof req.query.version === "string" ? req.query.version : undefined;
  if (
    !isSafeModel(model) ||
    (version && version !== "legacy" && !isSafeId(version))
  )
    return res.status(400).json({ error: "INVALID_MODEL" });
  try {
    const data = await publishedDisclaimers(version);
    const text = data
      ? (data[model] ?? null)
      : (legacy.find((row) => row.모델코드 === model)?.디스클레이머 ?? null);
    return res.json({
      text,
      version: version ?? (await catalogPointer()).id ?? "legacy",
    });
  } catch {
    return res
      .status(503)
      .json({ error: "디스클레이머를 확인하지 못했습니다." });
  }
}
