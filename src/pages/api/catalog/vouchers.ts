import type { NextApiRequest, NextApiResponse } from "next";
import { publishedVouchers, activeCatalog } from "@/lib/catalog/read";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";
import { isSafeId, isSafeModel } from "@/lib/catalog/types";

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
    (model && !isSafeModel(model)) ||
    (version && version !== "legacy" && !isSafeId(version))
  )
    return res.status(400).json({ error: "INVALID_MODEL_OR_VERSION" });
  try {
    const catalog = await activeCatalog(version);
    const released = catalog ? await publishedVouchers(catalog.id) : null;
    if (released)
      return res.json({
        rules: released.rules,
        model: model ? (released.models[model] ?? null) : null,
        version: catalog!.id,
      });
    const db = initFirebaseAdmin();
    const [rules, entry] = await Promise.all([
      db.doc("voucherRules/current").get(),
      model ? db.doc(`voucherModels/${model}`).get() : null,
    ]);
    return res.json({
      rules: rules.exists ? rules.data() : null,
      model: entry?.exists ? entry.data() : null,
      version: catalog?.id ?? "legacy",
    });
  } catch {
    return res
      .status(503)
      .json({
        error: "상품권 정보를 확인하지 못했습니다. 다시 시도해 주세요.",
      });
  }
}
