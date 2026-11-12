import type { NextApiRequest, NextApiResponse } from "next";
import {
  requireAdmin,
  adminError,
  AdminRequestError,
} from "@/lib/admin/requireAdmin";
import { createCatalogStore, localCatalogMode } from "@/lib/catalog/store";
import { CatalogImporter } from "@/lib/catalog/service";
import { legacyCatalog } from "@/lib/catalog/legacy";

export const config = { api: { bodyParser: false } };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method ?? "")) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false });
  }
  try {
    const owner = await requireAdmin(req),
      store = createCatalogStore();
    if (req.method === "GET")
      return res.json({
        ok: true,
        jobs: await store.jobs(),
        pointer: await store.pointer(),
        mode: localCatalogMode() ? "local" : "production",
      });
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 25 * 1024 * 1024)
        throw new AdminRequestError(
          413,
          "25MB 이하의 엑셀 파일을 선택해 주세요.",
        );
      chunks.push(Buffer.from(chunk));
    }
    let name = "";
    try {
      name = decodeURIComponent(String(req.headers["x-file-name"] ?? ""));
    } catch {
      throw new AdminRequestError(400, "파일 이름을 확인해 주세요.");
    }
    const job = await new CatalogImporter(store, legacyCatalog).upload(
      Buffer.concat(chunks),
      name,
      owner,
    );
    return res.json({ ok: true, job });
  } catch (error) {
    const failure = adminError(error);
    return res
      .status(failure.status)
      .json({ ok: false, message: failure.message });
  }
}
