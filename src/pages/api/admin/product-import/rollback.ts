import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin, adminError } from "@/lib/admin/requireAdmin";
import { CatalogImporter } from "@/lib/catalog/service";
import { createCatalogStore } from "@/lib/catalog/store";
import { legacyCatalog } from "@/lib/catalog/legacy";
import { clearCatalogReader } from "@/lib/catalog/read";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  try {
    const owner = await requireAdmin(req),
      store = createCatalogStore();
    if (
      typeof req.body?.generation !== "string" ||
      (req.body.target !== null && typeof req.body.target !== "string")
    )
      return res
        .status(400)
        .json({ ok: false, message: "버전 정보를 확인해 주세요." });
    await new CatalogImporter(store, legacyCatalog).rollback(
      req.body.generation,
      req.body.target,
      owner,
    );
    clearCatalogReader();
    return res.json({ ok: true, pointer: await store.pointer() });
  } catch (error) {
    const failure = adminError(error);
    return res
      .status(failure.status)
      .json({ ok: false, message: failure.message });
  }
}
