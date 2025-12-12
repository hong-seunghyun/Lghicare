/* eslint-disable @typescript-eslint/no-explicit-any */
import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";

import CustomSelect from "@/components/Select/CustomSelect";
import { classifyPrepayRate } from "@/utils/prepay/classifyPrepayRate";

interface ProductVariant {
  [key: string]: unknown;
  모델코드: string;
  상품명: string;
  계약기간?: string;
  서비스유형?: string;
  "서비스주기/월"?: string;
  프로모션유형?: string;
  프로모션명?: string;
  정상가?: string | number;
  할인전금액?: string | number;
  할인금액?: string | number;
  선입금할인금액?: string | number;
  할인후금액?: string | number;
  thumbnailUrl?: string;
}

interface Product {
  모델코드: string;
  상품명: string;

  제품기능?: string;
  thumbnailUrl?: string;
  variants?: ProductVariant[];
}

export interface SelectedProduct {
  모델코드: string;
  상품명: string;
  thumbnailUrl?: string;

  // 👉 제품 옵션
  selectedVariant?: ProductVariant;

  // 👉 계산 관련 값들
  baseMonthly?: number; // 기준 월 이용요금
  finalPrice?: number | string; // 최종 혜택가 월 이용요금

  // 👉 할인 정보
  cardDiscount?: number; // 제휴카드 월 할인 금액
  teacherDiscount?: number; // 구독교원 월 할인 금액

  // 👉 선납 정보
  prepayRate?: string; // "30" | "50" | ""
  prepayAmount?: number; // 선납금액
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
  amount: number; // 월 할인 금액
  allowTeacher: boolean;
}

// 🔥 선납 가능 여부 캐시 (middle/sub/model 조합 기준)
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
  const [contract, setContract] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [serviceCycle, setServiceCycle] = useState("");
  const [promoType, setPromoType] = useState("");

  // 🔥 선납 상태
  const [prepayRate, setPrepayRate] = useState<string>(""); // "30" | "50" | ""
  const [prepayAvailableRate, setPrepayAvailableRate] = useState<
    "30" | "30_50" | null
  >(null);
  const [prepayAmountDisplay, setPrepayAmountDisplay] = useState<number | null>(
    null
  );

  // 🔥 제휴카드 / 구독교원 상태
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [teacherSelections, setTeacherSelections] = useState<
    Record<string, number>
  >({});

  // ✅ 드롭다운 리스트 생성
  const contractList = useMemo(
    () =>
      Array.from(
        new Set(product.variants?.map((v) => v.계약기간).filter(Boolean))
      ),
    [product.variants]
  );
  const serviceTypeList = useMemo(
    () =>
      Array.from(
        new Set(product.variants?.map((v) => v.서비스유형).filter(Boolean))
      ),
    [product.variants]
  );
  const serviceCycleList = useMemo(
    () =>
      Array.from(
        new Set(
          product.variants?.map((v) => v["서비스주기/월"]).filter(Boolean)
        )
      ),
    [product.variants]
  );
  const promoTypeList = useMemo(
    () =>
      Array.from(
        new Set(product.variants?.map((v) => v.프로모션유형).filter(Boolean))
      ),
    [product.variants]
  );

  // ✅ 현재 조합에 맞는 옵션 찾기
  const current = useMemo(() => {
    if (!contract || !serviceType || !serviceCycle || !promoType)
      return undefined;
    return product.variants?.find(
      (v) =>
        v.계약기간 === contract &&
        v.서비스유형 === serviceType &&
        v["서비스주기/월"] === serviceCycle &&
        v.프로모션유형 === promoType
    );
  }, [contract, serviceType, serviceCycle, promoType, product.variants]);

  const toSafeNumber = (val?: string | number): number => {
    if (!val) return 0;
    if (typeof val === "number") return val;
    const cleaned = val.replace(/[^\d.-]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const normalizeNum = (v?: string | number) => {
    if (v == null) return "";
    return v
      .toString()
      .replace(/[^0-9]/g, "")
      .trim();
  };

  // ✅ 최저가 기준 기본 세팅
  useEffect(() => {
    if (product.variants && product.variants.length > 0) {
      const sorted = [...product.variants].sort((a, b) => {
        const priceA =
          toSafeNumber(a.할인후금액) ||
          toSafeNumber(a.할인전금액) ||
          toSafeNumber(a.정상가);
        const priceB =
          toSafeNumber(b.할인후금액) ||
          toSafeNumber(b.할인전금액) ||
          toSafeNumber(b.정상가);
        return priceA - priceB;
      });

      const cheapest = sorted[0];
      setContract(cheapest?.계약기간 || "");
      setServiceType(cheapest?.서비스유형 || "");
      setServiceCycle(cheapest?.["서비스주기/월"] || "");
      setPromoType(cheapest?.프로모션유형 || "");
      // 옵션이 변경되면 선납/카드/교원 선택도 초기화
      setPrepayRate("");
    }
  }, [product.variants]);

  // 🔥 구독교원 기본 선택값 0으로 초기화
  useEffect(() => {
    setTeacherSelections((prev) => {
      const next: Record<string, number> = { ...prev };
      teacherPlans.forEach((p) => {
        if (next[p.id] == null) next[p.id] = 0;
      });
      return next;
    });
  }, [teacherPlans]);

  // 🔥 선납 가능 여부 조회 (ProductDetail과 동일한 규칙)
  useEffect(() => {
    if (!product.variants || product.variants.length === 0) {
      setPrepayAvailableRate(null);
      return;
    }

    const firstVariant: any = product.variants[0] || {};
    const middle = (firstVariant["중분류"] || (product as any)["중분류"] || "")
      .toString()
      .trim();
    const sub = (firstVariant["소분류"] || (product as any)["소분류"] || "")
      .toString()
      .trim();
    const model = (product.모델코드 || "").toString().trim();

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
        console.error("❌ 선납 규칙 조회 오류(estimate):", err);
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

  // 🔢 계약기간(개월) 숫자
  const contractMonths = useMemo(() => {
    if (!contract) return 0;
    const num = Number(normalizeNum(contract));
    return isNaN(num) ? 0 : num;
  }, [contract]);

  // 🔢 현재 월 이용요금 (프로모션 반영)
  const usageFee = useMemo(() => {
    if (!current) return 0;
    return (
      toSafeNumber(current.할인후금액) ||
      toSafeNumber(current.할인전금액) ||
      toSafeNumber(current.정상가)
    );
  }, [current]);

  const floorTo10 = (v: number) => Math.floor(v / 100) * 100;

  // 🔥 선납금 계산 (72개월 & 선납 선택 시)
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

  // 🔥 제휴카드 선택
  const selectedCard = useMemo(() => {
    if (!selectedCardId) return null;
    return cardDiscounts.find((c) => c.id === selectedCardId) ?? null;
  }, [cardDiscounts, selectedCardId]);

  // 🔥 이 카드에서만 구독교원 사용 가능
  const isTeacherAvailable = !!selectedCard?.allowTeacher;

  // 🔥 구독교원 허용되지 않는 카드 선택 시, 좌수 초기화
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

  // 🔥 구독교원 총 구좌 / 총 할인액 (최대 4구좌)
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

  // 🔥 구독교원 좌수 변경 핸들러 (총 4구좌 제한)
  const handleTeacherSeatsChange = (
    planId: string,
    maxSeats: number,
    nextSeats: number
  ) => {
    if (nextSeats < 0 || nextSeats > maxSeats) return;

    setTeacherSelections((prev) => {
      const currentSeats = prev[planId] ?? 0;

      let totalSeats = 0;
      teacherPlans.forEach((p) => {
        const cnt = p.id === planId ? currentSeats : prev[p.id] ?? 0;
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

  // 🔥 선납/제휴카드/구독교원 반영된 최종 이용요금 & 최대혜택가

  // 1단계: 선납까지 반영된 월 이용요금
  const finalUsageFee = useMemo(() => {
    if (!current || !usageFee) return 0;

    // 6년 & 선납 선택된 경우 (ProductDetail과 동일 로직)
    if (contractMonths === 72 && prepayRate && prepayAmountDisplay) {
      const total = usageFee * 72;
      const discount = prepayAmountDisplay * 0.135; // 선납 할인 13.5%

      const newMonthlyRaw = (total - prepayAmountDisplay - discount) / 72;
      const newMonthly = floorTo10(newMonthlyRaw);
      return newMonthly;
    }

    return usageFee;
  }, [current, usageFee, contractMonths, prepayRate, prepayAmountDisplay]);

  // 2단계: 제휴카드까지 반영된 기본 최대혜택가
  const baseBestPrice = useMemo(() => {
    if (!current || !finalUsageFee) return 0;

    if (!selectedCard) {
      const bp = finalUsageFee > 13000 ? finalUsageFee - 13000 : finalUsageFee;
      return Math.max(bp, 0);
    }

    const discounted = finalUsageFee - selectedCard.amount;
    return Math.max(discounted, 0);
  }, [current, finalUsageFee, selectedCard]);

  // 3단계: 구독교원까지 반영된 최종 최대혜택가
  const finalBestPriceWithTeacher = useMemo(() => {
    if (!current) return 0;
    return Math.max(baseBestPrice - teacherTotalDiscount, 0);
  }, [current, baseBestPrice, teacherTotalDiscount]);

  // 담기용 최종 가격 (최대혜택가 우선, 없으면 이용요금)
  const finalPriceForCompare = useMemo(() => {
    if (finalBestPriceWithTeacher > 0) return finalBestPriceWithTeacher;
    if (finalUsageFee > 0) return finalUsageFee;
    if (!current) return 0;
    const base =
      current.할인후금액 || current.정상가 || current.할인전금액 || "0";
    return toSafeNumber(base);
  }, [current, finalBestPriceWithTeacher, finalUsageFee]);

  return (
    <Card>
      <ImageBox>
        {product.thumbnailUrl ? (
          <StyledImage
            src={product.thumbnailUrl}
            alt={product.상품명}
            width={280}
            height={280}
            loading="lazy"
          />
        ) : (
          <ImagePlaceholder>이미지 없음</ImagePlaceholder>
        )}
      </ImageBox>

      <InfoBox>
        <Title>{product.상품명}</Title>
        <Model>{product.모델코드}</Model>
        <Spec>{product.제품기능}</Spec>
        <OptionBox>
          <CustomSelect
            label="계약기간"
            value={contract}
            onChange={(val) => {
              setContract(val);
              setServiceType("");
              setServiceCycle("");
              setPromoType("");
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
              setPrepayRate("");
            }}
            options={promoTypeList.map((v) => ({
              label: v || "",
              value: v || "",
            }))}
          />

          {/* 🔥 선납 선택 (72개월 & 선납 가능할 때만 노출) */}
          {contractMonths === 72 && prepayAvailableRate && (
            <CustomSelect
              label="선납"
              value={prepayRate}
              onChange={setPrepayRate}
              options={[
                { label: "선택 안 함", value: "" },
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

          {/* 🔥 제휴카드 선택 */}
          {cardDiscounts.length > 0 && (
            <CustomSelect
              label="제휴카드"
              value={selectedCardId}
              onChange={setSelectedCardId}
              options={[
                { label: "선택 안 함", value: "" },
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

        {/* 🔥 구독교원 UI */}
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
                          seats - 1
                        )
                      }
                    >
                      −
                    </TeacherButton>
                    <TeacherSeats>{seats}</TeacherSeats>
                    <TeacherButton
                      disabled={seats >= plan.maxSeats}
                      onClick={() =>
                        handleTeacherSeatsChange(
                          plan.id,
                          plan.maxSeats,
                          seats + 1
                        )
                      }
                    >
                      +
                    </TeacherButton>
                  </TeacherControls>
                </TeacherRow>
              );
            })}

            <TeacherSummary>
              총 {teacherTotalSeats}구좌 선택, 총 교원 할인액{" "}
              <b>{teacherTotalDiscount.toLocaleString()}</b>원
            </TeacherSummary>
          </TeacherBox>
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
                    최대혜택가 월 {finalBestPriceWithTeacher.toLocaleString()}원
                  </SalePriceBox>
                </>
              ) : (
                <PricePlaceholder>옵션을 선택해주세요</PricePlaceholder>
              )}
            </div>
            <Button
              onClick={() => {
                if (!current) {
                  alert("옵션을 모두 선택해주세요!");
                  return;
                }

                // 1️⃣ 기준 월요금: 선납까지 반영된 월요금(finalUsageFee)을 기준으로,
                //    선납 없으면 그냥 usageFee 사용
                const baseMonthlyForCompare =
                  (finalUsageFee && finalUsageFee > 0
                    ? finalUsageFee
                    : usageFee) || 0;

                // 2️⃣ 혜택가 월요금: 구독교원까지 반영된 최종 값
                const finalMonthlyForCompare =
                  finalBestPriceWithTeacher && finalBestPriceWithTeacher > 0
                    ? finalBestPriceWithTeacher
                    : baseMonthlyForCompare;

                // 3️⃣ 제휴카드 / 구독교원 월 할인 금액
                const monthlyCardDiscount = selectedCard
                  ? selectedCard.amount
                  : 0;
                const monthlyTeacherDiscount = isTeacherAvailable
                  ? teacherTotalDiscount
                  : 0;

                onAdd({
                  ...product,
                  thumbnailUrl: product.thumbnailUrl,
                  selectedVariant: current,
                  baseMonthly: baseMonthlyForCompare,
                  finalPrice: finalMonthlyForCompare,
                  cardDiscount: monthlyCardDiscount,
                  teacherDiscount: monthlyTeacherDiscount,
                  prepayRate: prepayRate || "",
                  prepayAmount: prepayAmountDisplay ?? 0,
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
// ✅ styled-components 정의
//
const Card = styled.div`
  padding: 12px 30px 32px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 2px 4px 12px 0 rgba(0, 0, 0, 0.14);
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
  margin-top: 16px;
`;

const PriceText = styled.p`
  margin-bottom: 7px;
  font-size: 16px;
`;

const PriceBox = styled.div`
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
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

// 🔥 구독교원 UI 스타일
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
