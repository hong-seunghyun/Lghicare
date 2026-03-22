/* eslint-disable @typescript-eslint/no-explicit-any */
import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";

import CustomSelect from "@/components/Select/CustomSelect";
import { classifyPrepayRate } from "@/utils/prepay/classifyPrepayRate";

import { calcVoucher } from "@/utils/voucher/calcVoucher";
import { getVoucherMasterForModel } from "@/lib/voucherMaster";

const KEY = {
  modelCode: "모델코드",
  productName: "상품명",
  contract: "계약기간",
  serviceType: "서비스유형",
  serviceCycle: "서비스주기/월",
  promoType: "프로모션유형",
  promoName: "프로모션명",
  normalPrice: "정상가",
  priceBefore: "할인전금액",
  priceAfter: "할인후금액",
  middle: "중분류",
  sub: "소분류",
} as const;

interface ProductVariant {
  [key: string]: unknown;
  [KEY.modelCode]?: string;
  [KEY.productName]?: string;
  [KEY.contract]?: string;
  [KEY.serviceType]?: string;
  [KEY.serviceCycle]?: string;
  [KEY.promoType]?: string;
  [KEY.promoName]?: string;
  [KEY.normalPrice]?: string | number;
  [KEY.priceBefore]?: string | number;
  [KEY.priceAfter]?: string | number;
  thumbnailUrl?: string;
}

interface Product {
  [key: string]: unknown;
  [KEY.modelCode]?: string;
  [KEY.productName]?: string;
  [KEY.contract]?: string;
  [KEY.serviceType]?: string;
  [KEY.serviceCycle]?: string;
  [KEY.promoType]?: string;
  [KEY.promoName]?: string;
  [KEY.normalPrice]?: string | number;
  [KEY.priceBefore]?: string | number;
  [KEY.priceAfter]?: string | number;
  thumbnailUrl?: string;
  variants?: ProductVariant[];
}

export interface SelectedProduct {
  [KEY.modelCode]: string;
  [KEY.productName]: string;
  thumbnailUrl?: string;

  // ??? ??품 ??션
  selectedVariant?: ProductVariant;

  // ??? 계산 관??값들
  baseMonthly?: number; // ??기?? ????용??금(??납/카드/교원 ??용 ??
  finalPrice?: number | string; // 최종 ??택가 ????용??금

  // ??? ??인 ??보
  cardDiscount?: number; // ??휴카드 ????인 금액
  teacherDiscount?: number; // 구독교원 ????인 금액

  // ??? ??납 ??보
  prepayRate?: string; // "30" | "50" | ""
  prepayAmount?: number; // ??납금액

  // ??(추??) ??납??로 ??한 "????감?? (기????- ??납반영 ??요??
  prepayMonthlyDiscount?: number;

  //  (추??) 견적 비교 ??기 ????택 ??보??같이 ??달 (기존 ??용??깨??지 ??게 optional)
  selectedCardId?: string;
  selectedCardName?: string;
  selectedCardAmount?: number;

  teacherSelections?: Record<string, number>; // planId -> seats
  teacherTotalSeats?: number;
  teacherSelectionDetails?: Array<{
    planId: string;
    type: string;
    seats: number;
    discountPerSeat: number;
    monthlyDiscount: number;
  }>;
  voucherTotal?: number;
  voucherDetails?: Array<{ type: string; amount: number; reason: string }>;
  voucherMultiProductCount?: number;
}

interface TeacherPlan {
  id: string;
  type: string;
  maxSeats: number;
  discountPerSeat: number;
}

interface CardDiscount {
  id: string;
  cardName: string;
  amount: number; // ????인 금액
  allowTeacher: boolean;
}

// ??? ??납 가?????? 캐시 (middle/sub/model 조합 기??)
const prepayRateCache = new Map<string, "30" | "30_50" | null>();

interface Props {
  product: Product;
  onAdd: (item: SelectedProduct) => void;
  teacherPlans: TeacherPlan[];
  cardDiscounts: CardDiscount[];
}

export default function ProductCard({
  product,
  onAdd,
  teacherPlans,
  cardDiscounts,
}: Props) {
  const [showOptions, setShowOptions] = useState(false);
  const [contract, setContract] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [serviceCycle, setServiceCycle] = useState("");
  const [promoType, setPromoType] = useState("");
  const [promo, setPromo] = useState("");

  const [voucherMasterForModel, setVoucherMasterForModel] = useState<
    any | null
  >(null);

  // ??? ??납 ??태
  const [prepayRate, setPrepayRate] = useState<string>(""); // "30" | "50" | ""
  const [prepayAvailableRate, setPrepayAvailableRate] = useState<
    "30" | "30_50" | null
  >(null);
  const [prepayAmountDisplay, setPrepayAmountDisplay] = useState<number | null>(
    null,
  );

  // ??? ??휴카드 / 구독교원 ??태
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [teacherSelections, setTeacherSelections] = useState<
    Record<string, number>
  >({});

  const variants = useMemo(() => product.variants ?? [], [product.variants]);

  //  ??롭??운 리스????성 (선택 상태에 따라 필터링)
  const contractList = useMemo(
    () =>
      Array.from(new Set(variants.map((v) => v[KEY.contract]).filter(Boolean))),
    [variants],
  );

  const variantsByContract = useMemo(() => {
    if (!contract) return variants;
    return variants.filter((v) => v[KEY.contract] === contract);
  }, [variants, contract]);

  const serviceTypeList = useMemo(
    () =>
      Array.from(
        new Set(
          variantsByContract.map((v) => v[KEY.serviceType]).filter(Boolean),
        ),
      ),
    [variantsByContract],
  );

  const variantsByServiceType = useMemo(() => {
    if (!serviceType) return variantsByContract;
    return variantsByContract.filter((v) => v[KEY.serviceType] === serviceType);
  }, [variantsByContract, serviceType]);

  const serviceCycleList = useMemo(
    () =>
      Array.from(
        new Set(
          variantsByServiceType.map((v) => v[KEY.serviceCycle]).filter(Boolean),
        ),
      ),
    [variantsByServiceType],
  );

  const variantsByServiceCycle = useMemo(() => {
    if (!serviceCycle) return variantsByServiceType;
    return variantsByServiceType.filter(
      (v) => v[KEY.serviceCycle] === serviceCycle,
    );
  }, [variantsByServiceType, serviceCycle]);

  const promoTypeList = useMemo(
    () =>
      Array.from(
        new Set(
          variantsByServiceCycle.map((v) => v[KEY.promoType]).filter(Boolean),
        ),
      ),
    [variantsByServiceCycle],
  );

  const variantsByPromoType = useMemo(() => {
    if (!promoType) return variantsByServiceCycle;
    return variantsByServiceCycle.filter((v) => v[KEY.promoType] === promoType);
  }, [variantsByServiceCycle, promoType]);

  const promoList = useMemo(
    () =>
      Array.from(
        new Set(
          variantsByPromoType.map((v) => v[KEY.promoName]).filter(Boolean),
        ),
      ),
    [variantsByPromoType],
  );

  const normalizeNum = (v?: string | number) => {
    if (v == null) return "";
    return v
      .toString()
      .replace(/[^0-9]/g, "")
      .trim();
  };
  const normalizeStr = (v?: unknown) => (v ?? "").toString().trim();

  const getPriceValue = (
    variant: ProductVariant | undefined,
    hasPromo: boolean,
  ) => {
    if (!variant) return 0;

    // 기본: 할인전금액 우선
    let base =
      variant[KEY.priceBefore] || variant[KEY.normalPrice] || variant[KEY.priceAfter] || "";

    // 프로모션 선택 시 할인후금액 적용
    if (hasPromo && variant[KEY.priceAfter]) {
      base = variant[KEY.priceAfter] as string | number;
    }

    const cleaned = base.toString().replace(/[^0-9]/g, "");
    if (!cleaned) return 0;
    return parseInt(cleaned, 10);
  };

  //  ??재 조합??맞는 ??션 찾기
  const current = useMemo(() => {
    if (!contract || !serviceType || !serviceCycle || !promoType)
      return undefined;
    return variants.find((v) => {
      const match =
        normalizeNum(v[KEY.contract] as string | number) ===
          normalizeNum(contract) &&
        normalizeStr(v[KEY.serviceType]) === normalizeStr(serviceType) &&
        normalizeNum(v[KEY.serviceCycle] as string | number) ===
          normalizeNum(serviceCycle) &&
        normalizeStr(v[KEY.promoType]) === normalizeStr(promoType) &&
        (!promo ||
          normalizeStr(v[KEY.promoName]) === normalizeStr(promo));
      return match;
    });
  }, [contract, serviceType, serviceCycle, promoType, promo, variants]);

  const toSafeNumber = (val?: string | number): number => {
    if (!val) return 0;
    if (typeof val === "number") return val;
    const cleaned = val.replace(/[^\d.-]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  //  최??가 기?? 기본 ??팅 (????로모션??형: '기존결합' ??선)
  useEffect(() => {
    if (product.variants && product.variants.length > 0) {
      const sorted = [...product.variants].sort((a, b) => {
        const priceA = toSafeNumber(
          (a[KEY.priceAfter] as string | number | undefined) ||
            (a[KEY.priceBefore] as string | number | undefined) ||
            (a[KEY.normalPrice] as string | number | undefined),
        );
        const priceB = toSafeNumber(
          (b[KEY.priceAfter] as string | number | undefined) ||
            (b[KEY.priceBefore] as string | number | undefined) ||
            (b[KEY.normalPrice] as string | number | undefined),
        );
        return priceA - priceB;
      });

      // ??1) '기존결합' ??로모션??형????는지 ??선 ??색 (최??가 기????로)
      const preferred =
        sorted.find(
          (v) => (v[KEY.promoType] ?? "").toString().trim() === "기존결합",
        ) ?? sorted[0];

      setContract((preferred?.[KEY.contract] as string) || "");
      setServiceType((preferred?.[KEY.serviceType] as string) || "");
      setServiceCycle((preferred?.[KEY.serviceCycle] as string) || "");
      setPromoType((preferred?.[KEY.promoType] as string) || "");
      setPromo((preferred?.[KEY.promoName] as string) || "");

      // ??션??변경되????납/카드/교원 ??택??초기??
      setPrepayRate("");
    }
  }, [product.variants]);

  // ??? 구독교원 기본 ??택??0??로 초기??
  useEffect(() => {
    setTeacherSelections((prev) => {
      const next: Record<string, number> = { ...prev };
      teacherPlans.forEach((p) => {
        if (next[p.id] == null) next[p.id] = 0;
      });
      return next;
    });
  }, [teacherPlans]);

  // ??? ??납 가?????? 조회 (ProductDetail????일??규칙)
  useEffect(() => {
    if (!product.variants || product.variants.length === 0) {
      setPrepayAvailableRate(null);
      return;
    }

    const firstVariant: any = product.variants[0] || {};
    const middle = (
      firstVariant[KEY.middle] ||
      (product as any)[KEY.middle] ||
      ""
    )
      .toString()
      .trim();
    const sub = (firstVariant[KEY.sub] || (product as any)[KEY.sub] || "")
      .toString()
      .trim();
    const model = ((product[KEY.modelCode] as string) || "").toString().trim();

    if (!middle) {
      setPrepayAvailableRate(null);
      return;
    }

    const cacheKey = `${middle}__${sub}__${model}`;
    const cached = prepayRateCache.get(cacheKey);
    if (cached !== undefined) {
      setPrepayAvailableRate(cached);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const rate = await classifyPrepayRate({ middle, sub, model });
        if (!cancelled) {
          prepayRateCache.set(cacheKey, rate);
          setPrepayAvailableRate(rate);
        }
      } catch (err) {
        console.error("선납 규칙 조회 오류(estimate):", err);
        if (!cancelled) {
          prepayRateCache.set(cacheKey, null);
          setPrepayAvailableRate(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [product]);

  // ??? 계약기간(개월) ??자
  const contractMonths = useMemo(() => {
    if (!contract) return 0;
    const num = Number(normalizeNum(contract));
    return isNaN(num) ? 0 : num;
  }, [contract]);

  // ??? ??재 ????용??금 (??로모션 반영) ??"기?? ????금"????천
  const usageFee = useMemo(() => {
    if (!current) return 0;
    return getPriceValue(current, !!promo);
  }, [current, promo]);

  const floorTo10 = (v: number) => Math.floor(v / 100) * 100;

  // ??? ??납??계산 (72개월 & ??납 ??택 ??
  useEffect(() => {
    if (!prepayRate || !current || !usageFee || contractMonths !== 72) {
      setPrepayAmountDisplay(null);
      return;
    }

    const rate = Number(prepayRate); // 30 or 50
    const total = usageFee * 72;
    const rawPrepay = total * (rate / 100);
    const truncatedPrepay = floorTo10(rawPrepay);

    setPrepayAmountDisplay(truncatedPrepay);
  }, [prepayRate, current, usageFee, contractMonths]);

  // ??? ??휴카드 ??택
  const selectedCard = useMemo(() => {
    if (!selectedCardId) return null;
    return cardDiscounts.find((c) => c.id === selectedCardId) ?? null;
  }, [cardDiscounts, selectedCardId]);

  // ??? ??카드??서??구독교원 ??용 가??
  const isTeacherAvailable = !!selectedCard?.allowTeacher;

  // ??? 구독교원 ??용???? ??는 카드 ??택 ?? 좌수 초기??
  useEffect(() => {
    if (isTeacherAvailable) return;
    if (teacherPlans.length > 0) {
      setTeacherSelections((prev) => {
        const next: Record<string, number> = {};
        teacherPlans.forEach((p) => {
          next[p.id] = 0;
        });
        return next;
      });
    }
  }, [isTeacherAvailable, teacherPlans]);

  // ??? 구독교원 ??구좌 / ????인??(최?? 4구좌)
  const { teacherTotalSeats, teacherTotalDiscount } = useMemo(() => {
    if (!isTeacherAvailable) {
      return { teacherTotalSeats: 0, teacherTotalDiscount: 0 };
    }

    let seats = 0;
    let discount = 0;

    teacherPlans.forEach((p) => {
      const cnt = teacherSelections[p.id] ?? 0;
      if (!cnt) return;
      seats += cnt;
      discount += cnt * p.discountPerSeat;
    });

    return { teacherTotalSeats: seats, teacherTotalDiscount: discount };
  }, [teacherPlans, teacherSelections, isTeacherAvailable]);

  //  (추??) 구독교원 ??택 ??세(견적 비교????께 ??기 ??함)
  const teacherSelectionDetails = useMemo(() => {
    if (!isTeacherAvailable) return [];
    return teacherPlans
      .map((p) => {
        const seats = teacherSelections[p.id] ?? 0;
        return {
          planId: p.id,
          type: p.type,
          seats,
          discountPerSeat: p.discountPerSeat,
          monthlyDiscount: seats * p.discountPerSeat,
        };
      })
      .filter((x) => x.seats > 0);
  }, [teacherPlans, teacherSelections, isTeacherAvailable]);

  // ??? 구독교원 좌수 변????들??(??4구좌 ??한)
  const handleTeacherSeatsChange = (
    planId: string,
    maxSeats: number,
    nextSeats: number,
  ) => {
    if (nextSeats < 0 || nextSeats > maxSeats) return;

    setTeacherSelections((prev) => {
      const currentSeats = prev[planId] ?? 0;

      let totalSeats = 0;
      teacherPlans.forEach((p) => {
        const cnt = p.id === planId ? currentSeats : (prev[p.id] ?? 0);
        totalSeats += cnt;
      });

      const nextTotal = totalSeats - currentSeats + nextSeats;

      if (nextTotal > 4) {
        alert("구독교원 전체 구좌 수는 최대 4개까지 가능합니다.");
        return prev;
      }

      return {
        ...prev,
        [planId]: nextSeats,
      };
    });
  };

  // ??? ??납/??휴카드/구독교원 반영??최종 ??용??금 & ??체감 ??택

  // 1??계: ??납까?? 반영??????용??금
  const finalUsageFee = useMemo(() => {
    if (!current || !usageFee) return 0;

    // 6??& ??납 ??택??경우 (ProductDetail????일 로직)
    if (contractMonths === 72 && prepayRate && prepayAmountDisplay) {
      const total = usageFee * 72;
      const discount = prepayAmountDisplay * 0.135; // ??납 ??인 13.5%

      const newMonthlyRaw = (total - prepayAmountDisplay - discount) / 72;
      const newMonthly = floorTo10(newMonthlyRaw);
      return newMonthly;
    }

    return usageFee;
  }, [current, usageFee, contractMonths, prepayRate, prepayAmountDisplay]);

  // 2??계: ??휴카드까?? 반영??기본 ??체감 ??택
  const baseBestPrice = useMemo(() => {
    if (!current || !finalUsageFee) return 0;

    if (!selectedCard) {
      const bp = finalUsageFee > 0 ? finalUsageFee - 0 : finalUsageFee;
      return Math.max(bp, 0);
    }

    const discounted = finalUsageFee - selectedCard.amount;
    return Math.max(discounted, 0);
  }, [current, finalUsageFee, selectedCard]);

  // 3??계: 구독교원까?? 반영??최종 ??체감 ??택
  const finalBestPriceWithTeacher = useMemo(() => {
    if (!current) return 0;
    return Math.max(baseBestPrice - teacherTotalDiscount, 0);
  }, [current, baseBestPrice, teacherTotalDiscount]);

  // ??기??최종 가??(??체감 ??택 ??선, ??으????용??금)
  const finalPriceForCompare = useMemo(() => {
    if (finalBestPriceWithTeacher > 0) return finalBestPriceWithTeacher;
    if (finalUsageFee > 0) return finalUsageFee;
    if (!current) return 0;
    const base =
      (current[KEY.priceAfter] as string | number | undefined) ||
      (current[KEY.normalPrice] as string | number | undefined) ||
      (current[KEY.priceBefore] as string | number | undefined) ||
      "0";
    return toSafeNumber(base);
  }, [current, finalBestPriceWithTeacher, finalUsageFee]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const master = await getVoucherMasterForModel(
          (product[KEY.modelCode] as string) || "",
        );
        if (!cancelled) setVoucherMasterForModel(master);
      } catch (err) {
        console.error("상품권 마스터 불러오기 오류:", err);
        if (!cancelled) setVoucherMasterForModel(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [product[KEY.modelCode]]);

  const voucher = useMemo(() => {
    if (!current || !voucherMasterForModel) {
      return { total: 0, details: [] };
    }

    return calcVoucher({
      voucherMaster: voucherMasterForModel as any,
      modelCode: (product[KEY.modelCode] as string) || "",
      promoType: promoType,
      serviceCycle: serviceCycle,
      promoName: promo,
    });
  }, [
    current,
    voucherMasterForModel,
    product[KEY.modelCode],
    promoType,
    serviceCycle,
    promo,
  ]);

  const multiProductCount = useMemo(() => {
    const model =
      voucherMasterForModel?.products?.[
        (product[KEY.modelCode] as string) || ""
      ] ?? null;
    if (!model) return 0;
    const count = Number(model.multiProductCount);
    return Number.isFinite(count) ? count : 0;
  }, [voucherMasterForModel, product[KEY.modelCode]]);

  return (
    <Card>
      <ImageBox>
        {product.thumbnailUrl ? (
          <StyledImage
            src={product.thumbnailUrl}
            alt={(product[KEY.productName] as string) || ""}
            width={280}
            height={280}
            loading="lazy"
          />
        ) : (
          <ImagePlaceholder>이미지 없음</ImagePlaceholder>
        )}
      </ImageBox>

      <InfoBox>
        <Title>{(product[KEY.productName] as string) || ""}</Title>
        <Model>{(product[KEY.modelCode] as string) || ""}</Model>
        <Spec>{(product["상품기능"] as string) || ""}</Spec>
        <OptionsToggle
          type="button"
          onClick={() => setShowOptions((prev) => !prev)}
        >
          {showOptions ? "옵션 닫기" : "옵션 설정"}
        </OptionsToggle>

        {showOptions && (
          <OptionsPanel>
            <OptionBox>
              <CustomSelect
                label="계약기간"
                value={contract}
                onChange={(val) => {
                  setContract(val);
                  setServiceType("");
                  setServiceCycle("");
                  setPromoType("");
                  setPromo("");
                  setPrepayRate("");
                }}
                options={contractList.map((v) => {
                  const months = Number(v);
                  const years = months / 12;
                  return {
                    label: `${years}년`,
                    value: String(v ?? ""),
                  };
                })}
              />

              <CustomSelect
                label="서비스유형"
                value={serviceType}
                onChange={(val) => {
                  setServiceType(val);
                  setServiceCycle("");
                  setPromoType("");
                  setPromo("");
                  setPrepayRate("");
                }}
                options={serviceTypeList.map((v) => ({
                  label: v || "",
                  value: v || "",
                }))}
              />

              <CustomSelect
                label="방문주기"
                value={serviceCycle}
                onChange={(val) => {
                  setServiceCycle(val);
                  setPromoType("");
                  setPromo("");
                  setPrepayRate("");
                }}
                options={serviceCycleList.map((v) => ({
                  label: v || "",
                  value: v || "",
                }))}
              />

              <CustomSelect
                label="프로모션유형"
                value={promoType}
                onChange={(val) => {
                  setPromoType(val);
                  setPromo("");
                  setPrepayRate("");
                }}
                options={promoTypeList.map((v) => ({
                  label: v || "",
                  value: v || "",
                }))}
              />

              <CustomSelect
                label="프로모션명"
                value={promo}
                onChange={(val) => {
                  setPromo(val);
                  setPrepayRate("");
                }}
                options={promoList.map((v) => ({
                  label: v || "",
                  value: v || "",
                }))}
              />

              {contractMonths === 72 && prepayAvailableRate && (
                <CustomSelect
                  label="선납"
                  value={prepayRate}
                  onChange={setPrepayRate}
                  options={[
                    { label: "혜택 선택", value: "" },
                    ...(prepayAvailableRate === "30" ||
                    prepayAvailableRate === "30_50"
                      ? [{ label: "30% 선납", value: "30" }]
                      : []),
                    ...(prepayAvailableRate === "30_50"
                      ? [{ label: "50% 선납", value: "50" }]
                      : []),
                  ]}
                />
              )}

              {cardDiscounts.length > 0 && (
                <CustomSelect
                  label="제휴카드"
                  value={selectedCardId}
                  onChange={setSelectedCardId}
                  options={[
                    { label: "혜택 선택", value: "" },
                    ...cardDiscounts.map((card) => ({
                      value: card.id,
                      label: `${
                        card.cardName
                      } (월 ${card.amount.toLocaleString()}원 할인)`,
                    })),
                  ]}
                />
              )}
            </OptionBox>

            {teacherPlans.length > 0 && isTeacherAvailable && (
              <TeacherBox>
                <TeacherTitle>구독교원</TeacherTitle>
                {teacherPlans.map((plan) => {
                  const seats = teacherSelections[plan.id] ?? 0;
                  return (
                    <TeacherRow key={plan.id}>
                      <TeacherType>{plan.type}</TeacherType>
                      <TeacherControls>
                        <TeacherButton
                          disabled={seats <= 0}
                          onClick={() =>
                            handleTeacherSeatsChange(
                              plan.id,
                              plan.maxSeats,
                              seats - 1,
                            )
                          }
                        >
                          -
                        </TeacherButton>
                        <TeacherSeats>{seats}</TeacherSeats>
                        <TeacherButton
                          disabled={seats >= plan.maxSeats}
                          onClick={() =>
                            handleTeacherSeatsChange(
                              plan.id,
                              plan.maxSeats,
                              seats + 1,
                            )
                          }
                        >
                          +
                        </TeacherButton>
                      </TeacherControls>
                    </TeacherRow>
                  );
                })}
              </TeacherBox>
            )}
          </OptionsPanel>
        )}

        <PriceBox>
          <PriceText>이용 요금</PriceText>
          <FlexBox>
            <div>
              {current ? (
                <>
                  <PriceLabel>
                    월
                    <PriceValue>
                      <b>{finalUsageFee.toLocaleString()}</b>원
                    </PriceValue>
                  </PriceLabel>
                  {prepayRate && prepayAmountDisplay && (
                    <PrepayText>
                      선납금액 {prepayAmountDisplay.toLocaleString()}원 기준
                    </PrepayText>
                  )}
                  <SalePriceBox>
                    총 체감요금 {finalBestPriceWithTeacher.toLocaleString()}원
                  </SalePriceBox>
                </>
              ) : (
                <PricePlaceholder>옵션을 선택해주세요</PricePlaceholder>
              )}
            </div>
            {current && voucher.total > 0 && (
              <>
                <PrepayText>
                  상품권 {voucher.total.toLocaleString()}원 지급
                </PrepayText>
                {voucher.details.length > 0 && (
                  <VoucherDetail>
                    {voucher.details.map((d, idx) => (
                      <p
                        key={`${(product[KEY.modelCode] as string) || ""}-voucher-${idx}`}
                      >
                        - {d.type}: {d.amount.toLocaleString()}원
                      </p>
                    ))}
                  </VoucherDetail>
                )}
              </>
            )}
            <Button
              onClick={() => {
                if (!current) {
                  alert("옵션을 모두 선택해주세요!");
                  return;
                }

                // 기준 월 요금(선납/카드/교원 할인 제외)
                // = usageFee (프로모션/계약기간/서비스유형/방문주기/프로모션유형 조합으로 결정)
                const baseMonthlyForCompare = usageFee || 0;

                // 선납 월 할인액 (기준월 - 선납반영월)
                // - 백원 단위 절삭
                // - 1,000원 이상일 때만 표시
                const rawPrepayMonthlyDiscount =
                  contractMonths === 72 && prepayRate
                    ? Math.max(baseMonthlyForCompare - finalUsageFee, 0)
                    : 0;

                const truncatedPrepayMonthlyDiscount =
                  Math.floor(rawPrepayMonthlyDiscount / 100) * 100;
                const prepayMonthlyDiscount =
                  truncatedPrepayMonthlyDiscount >= 1000
                    ? truncatedPrepayMonthlyDiscount
                    : 0;

                // 최종 혜택가: 선납 + 카드 + 교원 모두 반영
                const finalMonthlyForCompare =
                  finalBestPriceWithTeacher && finalBestPriceWithTeacher > 0
                    ? finalBestPriceWithTeacher
                    : baseMonthlyForCompare;

                // 카드/교원 할인액
                const monthlyCardDiscount = selectedCard
                  ? selectedCard.amount
                  : 0;
                const monthlyTeacherDiscount = isTeacherAvailable
                  ? teacherTotalDiscount
                  : 0;

                onAdd({
                  ...product,
                  [KEY.modelCode]: (product[KEY.modelCode] as string) || "",
                  [KEY.productName]: (product[KEY.productName] as string) || "",
                  thumbnailUrl: product.thumbnailUrl,
                  selectedVariant: current,

                  // 기준/최종
                  baseMonthly: baseMonthlyForCompare, // 선납/카드/교원 제외 기준 요금
                  finalPrice: finalMonthlyForCompare, // 총 체감 혜택가(선납 포함)

                  // 할인 내역(상세페이지 표시용)
                  cardDiscount: monthlyCardDiscount,
                  teacherDiscount: monthlyTeacherDiscount,
                  prepayMonthlyDiscount, // 선납 월 할인(표시 규칙 반영)

                  // 선납 정보
                  prepayRate: prepayRate || "",
                  prepayAmount: prepayAmountDisplay ?? 0,

                  // 제휴카드 정보
                  selectedCardId: selectedCard?.id || "",
                  selectedCardName: selectedCard?.cardName || "",
                  selectedCardAmount: selectedCard?.amount || 0,

                  // 구독교원 정보
                  teacherSelections: isTeacherAvailable
                    ? teacherSelections
                    : {},
                  teacherTotalSeats: isTeacherAvailable ? teacherTotalSeats : 0,
                  teacherSelectionDetails: isTeacherAvailable
                    ? teacherSelectionDetails
                    : [],

                  voucherTotal: voucher.total,
                  voucherDetails: voucher.details,
                  voucherMultiProductCount: multiProductCount,
                });
              }}
            >
              담기
            </Button>
          </FlexBox>
        </PriceBox>
      </InfoBox>
    </Card>
  );
}

//
//  styled-components ??의
//
const Card = styled.div`
  padding: 12px 30px 32px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 2px 4px 12px 0 rgba(0, 0, 0, 0.14);
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const ImageBox = styled.div`
  width: 100%;
  padding-bottom: 100%;
  position: relative;
  overflow: hidden;
`;

const StyledImage = styled(Image)`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const ImagePlaceholder = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #aaa;
  font-size: 14px;
`;

const InfoBox = styled.div`
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
`;

const Title = styled.p`
  max-height: 56px;
  font-size: 18px;
  line-height: 28px;
  font-weight: 700;
  overflow: hidden;
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  height: 56px;
`;
const Spec = styled.p`
  overflow: hidden;
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin-top: 6px;
  font-size: 13px;
  line-height: 13px;
  height: 26px;
`;

const Model = styled.p`
  display: inline-block;
  max-width: 100%;
  font-size: 14px;
  line-height: 24px;
  vertical-align: top;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #767676;
`;
const OptionBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 0;
`;

const PriceText = styled.p`
  margin-bottom: 7px;
  font-size: 16px;
`;

const PriceBox = styled.div`
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const OptionsToggle = styled.button`
  margin-bottom: 12px;
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 600;
  color: #666;
  cursor: pointer;
  white-space: nowrap;
  width: 100%;
  border-bottom: 1px solid #ddd;
  padding-bottom: 5px;

  &:hover {
    color: #333;
  }
`;

const OptionsPanel = styled.div`
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const PriceLabel = styled.span`
  font-size: 20px;
  line-height: 25px;
  font-weight: 400;
  vertical-align: middle;
`;

const PriceValue = styled.span`
  margin-left: 3px;
`;

const PricePlaceholder = styled.span`
  font-size: 14px;
  color: #999;
`;

const SalePriceBox = styled.div`
  font-size: 14px;
  line-height: 1.5;
  color: #ea1917;
  margin-top: 4px;
`;

const PrepayText = styled.div`
  margin-top: 4px;
  font-size: 13px;
  color: #666;
`;

const VoucherDetail = styled.div`
  margin-top: 2px;
  font-size: 12px;
  color: #666;

  p {
    margin: 2px 0;
  }
`;

const Button = styled.button`
  display: inline-block;
  width: 100%;
  font-size: 16px;
  line-height: 26px;
  text-align: center;
  vertical-align: top;
  font-weight: 500;
  padding: 11px 31px;
  border-width: 1px;
  border-style: solid;
  border-radius: 99px;
  cursor: pointer;

  &:hover {
    color: rgb(255, 255, 255);
    background: rgb(234, 25, 23);
    border-color: rgb(234, 25, 23) !important;
  }
`;
const FlexBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  > div {
    width: 100%;
  }
`;

// ??? 구독교원 UI ??????
const TeacherBox = styled.div`
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  background: #fafafa;
  border: 1px solid #eee;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TeacherTitle = styled.p`
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
`;

const TeacherRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const TeacherType = styled.span`
  font-size: 13px;
  font-weight: 500;
  min-width: 90px;
`;

const TeacherControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TeacherButton = styled.button`
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid #ddd;
  background: #fff;
  font-size: 18px;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`;

const TeacherSeats = styled.span`
  font-size: 15px;
  width: 26px;
  text-align: center;
`;

const TeacherSummary = styled.div`
  margin-top: 4px;
  font-size: 12px;
  color: #555;

  b {
    font-weight: 600;
  }
`;
