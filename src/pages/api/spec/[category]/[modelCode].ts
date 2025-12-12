import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { category, modelCode } = req.query;

  if (!category || !modelCode) {
    return res.status(400).json({ error: "Missing category or modelCode" });
  }

  try {
    const filePath = path.join(
      process.cwd(),
      "src/spec",
      String(category),
      `${String(modelCode)}.json`
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Spec not found" });
    }

    const data = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(data);
    return res.status(200).json(json);
  } catch (error) {
    console.error("❌ Failed to load spec:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
