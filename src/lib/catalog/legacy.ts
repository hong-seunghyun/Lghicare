import legacyDisclaimers from "@/disclaimer/disclaimer.json";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";
import { fetchSheetDataWithPolicy } from "@/lib/sheet";
import type { VoucherBundle } from "./types";
import type { VoucherModel, VoucherRules } from "@/lib/voucherMaster";

export const legacyCatalog = {
  rows: (category: string, fresh = false) =>
    fetchSheetDataWithPolicy(category, {
      sourceOnly: true,
      allowStale: false,
      forceRefresh: fresh,
    }),
  async disclaimers() {
    return Object.fromEntries(
      legacyDisclaimers.map((row) => [row.모델코드, row["디스클레이머"]]),
    );
  },
  async vouchers(): Promise<VoucherBundle> {
    const db = initFirebaseAdmin();
    const [rules, models] = await Promise.all([
      db.doc("voucherRules/current").get(),
      db.collection("voucherModels").get(),
    ]);
    return {
      rules: (rules.data() ?? {}) as VoucherRules,
      models: Object.fromEntries(
        models.docs.map((doc) => [
          doc.id,
          { ...doc.data(), modelCode: doc.id } as VoucherModel,
        ]),
      ),
    };
  },
};
