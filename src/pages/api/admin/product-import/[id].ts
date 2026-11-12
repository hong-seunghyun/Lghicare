import type { NextApiRequest, NextApiResponse } from "next";
import {
  requireAdmin,
  adminError,
  AdminRequestError,
} from "@/lib/admin/requireAdmin";
import { createCatalogStore } from "@/lib/catalog/store";
import { CatalogImporter } from "@/lib/catalog/service";
import { legacyCatalog } from "@/lib/catalog/legacy";
import {
  clearCatalogReader,
  publishedRows,
  publishedVouchers,
  publishedDisclaimers,
} from "@/lib/catalog/read";
import { isSafeId } from "@/lib/catalog/types";

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
      id = typeof req.query.id === "string" ? req.query.id : "";
    if (!isSafeId(id))
      throw new AdminRequestError(400, "업로드 번호를 확인해 주세요.");
    const store = createCatalogStore(),
      importer = new CatalogImporter(store, legacyCatalog);
    if (req.method === "GET") {
      if (req.query.view === "changes") {
        const section =
          typeof req.query.section === "string" ? req.query.section : "";
        if (!["products", "disclaimers", "vouchers"].includes(section))
          throw new AdminRequestError(400, "항목을 확인해 주세요.");
        const data = await importer.review(
          id,
          section as "products" | "disclaimers" | "vouchers",
          typeof req.query.category === "string" ? req.query.category : "",
          typeof req.query.model === "string" ? req.query.model : undefined,
          Number(req.query.offset) || 0,
        );
        return res.json({ ok: true, ...data });
      }
      const job = await store.job(id);
      if (!job) throw new AdminRequestError(404, "업로드 내역이 없습니다.");
      return res.json({ ok: true, job });
    }
    let job;
    switch (req.body?.action) {
      case "analyze":
        job = await importer.analyze(id);
        break;
      case "prepare":
        job = await importer.prepare(id, req.body.selection, owner);
        break;
      case "step":
        job = await importer.step(id);
        break;
      case "publish": {
        job = await importer.publish(id, owner, req.body.acknowledged === true);
        clearCatalogReader();
        const selection = job.preview?.selection;
        const tasks: Array<{ name: string; run: () => Promise<unknown> }> = [];
        if (selection?.products)
          for (const category of selection.categories)
            tasks.push({
              name: category,
              run: () => publishedRows(category, undefined, true),
            });
        if (selection?.vouchers)
          tasks.push({ name: "상품권", run: () => publishedVouchers() });
        if (selection?.disclaimers)
          tasks.push({
            name: "디스클레이머",
            run: () => publishedDisclaimers(),
          });
        const completed: string[] = [],
          failed: string[] = [];
        for (const task of tasks) {
          try {
            await task.run();
            completed.push(task.name);
          } catch {
            failed.push(task.name);
          }
        }
        // Warming is best-effort after a committed release; failures never undo a valid publish.
        try {
          job = await store.changeJob(id, (current) => ({
            ...current,
            warmup: { completed, failed },
          }));
        } catch {
          job = { ...job, warmup: { completed, failed } };
        }
        break;
      }
      default:
        throw new AdminRequestError(400, "지원하지 않는 작업입니다.");
    }
    return res.json({ ok: true, job });
  } catch (error) {
    const failure = adminError(error);
    return res
      .status(failure.status)
      .json({ ok: false, message: failure.message });
  }
}
