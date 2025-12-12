/* eslint-disable @typescript-eslint/no-explicit-any */
// utils/prepay/classifyPrepayRate.ts

export type PrepayRate = "30" | "30_50" | null;

interface ProductInfo {
  middle: string;
  sub?: string;
  model?: string;
}

export async function classifyPrepayRate(
  product: ProductInfo
): Promise<PrepayRate> {
  const { middle, sub, model } = product;

  if (!middle) return null;

  const params = new URLSearchParams();
  params.set("middle", middle);

  if (sub) params.set("sub", sub);
  if (model) params.set("model", model);

  try {
    const res = await fetch(`/api/prepay/rate?${params.toString()}`, {
      method: "GET",
    });

    if (!res.ok) {
      console.error("❌ classifyPrepayRate API 응답 에러:", res.status);
      return null;
    }

    const data = (await res.json()) as { rateType?: PrepayRate };

    if (data.rateType === "30" || data.rateType === "30_50") {
      return data.rateType;
    }

    return null;
  } catch (err) {
    console.error("❌ classifyPrepayRate 호출 오류:", err);
    return null;
  }
}
