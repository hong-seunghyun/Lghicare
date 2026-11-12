import type { PreviewLine } from "@/lib/renewalTest";
import { fetchVoucherData } from "@/lib/voucherMaster";
import { calcVoucher, normalizeMultiProductCount } from "@/utils/voucher/calcVoucher";

export async function resolveRenewalVoucher(line: Pick<PreviewLine, "product" | "selectedVariant">) {
  const { rules, model } = await fetchVoucherData(line.product.id, line.product.catalogVersion);
  const master = rules && model ? { version: rules.version ?? 1, rules, products: { [line.product.id]: model } } : null;
  const variant = line.selectedVariant;
  const voucher = master ? calcVoucher({
    voucherMaster: master,
    modelCode: line.product.id,
    promoType: String(variant.프로모션유형 ?? ""),
    serviceCycle: String(variant["서비스주기/월"] ?? ""),
    promoName: String(variant.프로모션명 ?? ""),
  }) : { total: 0, details: [] };
  return {
    voucherTotal: voucher.total,
    voucherDetails: voucher.details,
    voucherMultiProductCount: normalizeMultiProductCount(model?.multiProductCount),
    voucherMultiProductCountOnly: Boolean(model?.multiProductExcludeVoucher),
    voucherMultiProductNote: model?.multiProductNote,
    voucherMultiProductRule: rules?.multiProductRule,
    voucherCheckedAt: Date.now(),
  };
}

export function backfillRenewalVoucher(line: PreviewLine, voucher: Awaited<ReturnType<typeof resolveRenewalVoucher>>): PreviewLine {
  return {
    ...line,
    ...voucher,
    voucherTotal: line.voucherTotal ?? voucher.voucherTotal,
    voucherDetails: line.voucherDetails ?? voucher.voucherDetails,
  };
}
