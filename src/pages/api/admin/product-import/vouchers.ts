import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "node:crypto";
import {
  requireAdmin,
  adminError,
  AdminRequestError,
} from "@/lib/admin/requireAdmin";
import { createCatalogStore } from "@/lib/catalog/store";
import { clearCatalogReader } from "@/lib/catalog/read";
import type { CatalogRelease, VoucherBundle } from "@/lib/catalog/types";
import { isSafeModel } from "@/lib/catalog/types";
import {
  normalizedVoucherModel,
  validateVoucherRules,
  voucherJsonBundle,
} from "@/lib/catalog/voucherEditing";
import { contentHash } from "@/lib/catalog/parse";

export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method ?? ""))
    return res.status(405).json({ ok: false });
  try {
    const owner = await requireAdmin(req),
      store = createCatalogStore(),
      pointer = await store.pointer();
    const current = pointer.manifest
      ? await store.get<CatalogRelease>(pointer.manifest)
      : null;
    if (!current?.vouchers) return res.json({ ok: true, active: false });
    let bundle = await store.get<VoucherBundle>(current.vouchers);
    if (req.method === "GET")
      return res.json({
        ok: true,
        active: true,
        bundle,
        generation: pointer.generation,
      });
    if (req.body?.generation !== pointer.generation)
      throw new AdminRequestError(
        409,
        "다른 변경이 있습니다. 다시 불러와 주세요.",
      );
    const code = String(req.body?.modelCode ?? "").trim();
    if (req.body.action === "rules")
      bundle = { ...bundle, rules: validateVoucherRules(req.body.rules) };
    else if (req.body.action === "model") {
      const data = normalizedVoucherModel(code, {
        ...bundle.models[code],
        ...req.body.model,
      });
      bundle = { ...bundle, models: { ...bundle.models, [code]: data } };
    } else if (req.body.action === "delete") {
      if (!isSafeModel(code))
        throw new AdminRequestError(400, "모델코드를 확인해 주세요.");
      const models = { ...bundle.models };
      delete models[code];
      bundle = { ...bundle, models };
    } else if (req.body.action === "import")
      bundle = voucherJsonBundle(req.body.data, bundle);
    else throw new AdminRequestError(400, "지원하지 않는 작업입니다.");
    const id = randomUUID(),
      prefix = `product-catalog/releases/${id}`;
    const vouchers = await store.put(`${prefix}/vouchers.json.gz`, bundle);
    const release: CatalogRelease = {
      ...current,
      id,
      parentId: current.id,
      createdBy: owner,
      createdAt: new Date().toISOString(),
      source: { name: "상품권 관리자 수정", sha256: contentHash(bundle) },
      vouchers,
    };
    const manifest = await store.put(`${prefix}/manifest.json.gz`, release);
    await store.activate(
      pointer.generation,
      { id, manifest, generation: randomUUID(), previousId: current.id },
      { owner, action: "voucher-edit" },
    );
    clearCatalogReader();
    return res.json({ ok: true, active: true });
  } catch (error) {
    const failure = adminError(error);
    return res
      .status(failure.status)
      .json({ ok: false, message: failure.message });
  }
}
