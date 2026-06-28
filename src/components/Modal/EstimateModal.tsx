/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import Image from "next/image";
import React, { useState, useEffect } from "react";
import styled from "styled-components";

import { db } from "@/lib/firebase";
import { useRouter } from "next/router";

import { calcMultiProductVoucher } from "@/utils/voucher/calcVoucher";
import { fetchVoucherRules } from "@/lib/voucherMaster";

import {
  addDoc,
  collection,
  serverTimestamp,
  enableNetwork,
  getDocs,
  doc,
  getDoc,
  setDoc,
  increment,
} from "firebase/firestore";

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
  할인후금액?: string | number;
  할인금액?: string | number;
  thumbnailUrl?: string;
}

export interface SelectedProduct {
  모델코드: string;
  상품명: string;
  thumbnailUrl?: string;

  selectedVariant?: ProductVariant;

  baseMonthly?: number;
  finalPrice?: number | string;

  cardDiscount?: number;
  teacherDiscount?: number;

  prepayRate?: string; // "30" | "50" | ""
  prepayAmount?: number;

  selectedCardId?: string;
  selectedCardName?: string;
  selectedCardAmount?: number;

  teacherSelections?: Record<string, number>;
  teacherTotalSeats?: number;
  teacherSelectionDetails?: Array<{
    planId: string;
    type: string;
    seats: number;
    discountPerSeat: number;
    monthlyDiscount: number;
  }>;

  prepayMonthlyDiscount?: number;

  voucherTotal?: number;
  voucherDetails?: Array<{ type: string; amount: number; reason: string }>;
  voucherMultiProductCount?: number;
  voucherMultiProductCountOnly?: boolean;
  voucherMultiProductNote?: string;
}

export type EstimateSaveMeta = {
  estimateSource?: string;
  promotionPackageId?: string;
  promotionPackageName?: string;
  promotionSetId?: string;
  promotionSetName?: string;
};

interface Props {
  products: SelectedProduct[];
  onReset: () => void;
  onConfirm: () => void;
  onRemove: (modelCode: string) => void;
  saveMeta?: EstimateSaveMeta;
}

function parseMoney(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;

  const cleaned = value.replace(/[^0-9]/g, "");
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

function normalizePrepayMonthlyDiscount(raw: unknown): number {
  const v = parseMoney(raw);
  const truncated = Math.floor(v / 100) * 100; // 100원 단위 절삭
  return truncated >= 1000 ? truncated : 0; // 1000원 미만 0 처리
}

const normalizeText = (value: unknown) => String(value ?? "").trim();

const getProductCategory = (product: SelectedProduct) => {
  const anyProduct = product as any;
  const variant = product.selectedVariant as any | undefined;

  return (
    normalizeText(anyProduct.중분류) ||
    normalizeText(anyProduct.category) ||
    normalizeText(anyProduct.categoryName) ||
    normalizeText(anyProduct.type) ||
    normalizeText(variant?.중분류) ||
    normalizeText(variant?.category) ||
    normalizeText(variant?.categoryName) ||
    normalizeText(variant?.type) ||
    "unknown"
  );
};

const getModelName = (product: SelectedProduct) => {
  const anyProduct = product as any;
  const variant = product.selectedVariant as any | undefined;

  return (
    normalizeText(anyProduct.모델명) ||
    normalizeText(anyProduct.modelName) ||
    normalizeText(anyProduct.모델코드) ||
    normalizeText(anyProduct.modelCode) ||
    normalizeText(variant?.모델명) ||
    normalizeText(variant?.modelName) ||
    normalizeText(variant?.모델코드) ||
    normalizeText(variant?.modelCode) ||
    "unknown"
  );
};

function getSaveDiscounts(p: SelectedProduct) {
  const v = p.selectedVariant as any | undefined;

  // 카드할인: 선택값 우선
  const card = parseMoney(
    (p as any).cardDiscount ??
      (p as any).selectedCardAmount ??
      v?.cardDiscount ??
      v?.카드할인금액 ??
      v?.제휴카드할인금액,
  );

  // 교원할인: 선택값 우선
  const teacher = parseMoney(
    (p as any).teacherDiscount ?? v?.teacherDiscount ?? v?.구독교원할인금액,
  );

  // 선결제 월할인: 다른 컴포넌트 계산값 반영 (없으면 0)
  const prepay = normalizePrepayMonthlyDiscount(
    (p as any).prepayMonthlyDiscount,
  );

  // 카드/교원/선결제 할인 선택이 없으면 기본 카드 13,000 적용
  const hasAny = card > 0 || teacher > 0 || prepay > 0;
  const cardEffective = hasAny ? card : 0;

  return {
    cardDiscount: cardEffective,
    teacherDiscount: teacher,
    prepayMonthlyDiscount: prepay,
    totalDiscount: Math.max(cardEffective + teacher + prepay, 0),
  };
}

// 기본 월 요금 계산 (할인후금액 -> 정상가 -> 할인전금액)
function calcBaseMonthly(p: SelectedProduct): number {
  // ProductCard에서 baseMonthly가 있으면 우선 사용
  if (typeof (p as any).baseMonthly === "number") {
    return (p as any).baseMonthly;
  }

  const variant = p.selectedVariant;
  if (!variant) return 0;

  return (
    parseMoney(variant.할인후금액) ||
    parseMoney(variant.정상가) ||
    parseMoney(variant.할인전금액) ||
    0
  );
}

function calcFinalMonthlyForSave(p: SelectedProduct): number {
  const savedFinal = (p as any).finalPrice;
  if (savedFinal !== undefined && savedFinal !== null && savedFinal !== "") {
    return Math.max(parseMoney(savedFinal), 0);
  }

  const base = calcBaseMonthly(p);
  if (!base) return 0;

  const { totalDiscount } = getSaveDiscounts(p);

  // 0원 이하는 0원 처리
  const final = base - Math.min(totalDiscount, base);
  return final > 0 ? final : 0;
}

function getVoucherTotal(p: SelectedProduct): number {
  const v = (p as any).voucherTotal;
  const n = parseMoney(v);
  return n > 0 ? n : 0;
}

function getVoucherSummaryDetails(
  products: SelectedProduct[],
  multiProductVoucher: {
    details: Array<{ type: string; amount: number; reason: string }>;
  },
) {
  const totals: Record<string, number> = {};

  products.forEach((product) => {
    const details = Array.isArray(product.voucherDetails)
      ? product.voucherDetails
      : [];
    details.forEach((detail) => {
      const type = detail?.type?.trim() || "기타 상품권";
      const amount = parseMoney(detail?.amount);
      if (amount <= 0) return;
      totals[type] = (totals[type] || 0) + amount;
    });
  });

  const multiDetails = Array.isArray(multiProductVoucher?.details)
    ? multiProductVoucher.details
    : [];
  multiDetails.forEach((detail) => {
    const type = detail?.type?.trim() || "다품목 상품권";
    const amount = parseMoney(detail?.amount);
    if (amount <= 0) return;
    totals[type] = (totals[type] || 0) + amount;
  });

  return Object.entries(totals).map(([type, amount]) => ({
    type,
    amount,
  }));
}

function getProductMultiProductReward(
  product: SelectedProduct,
  multiProductVoucher: {
    perUnitReward: number;
  },
) {
  const perUnitReward = multiProductVoucher?.perUnitReward ?? 0;
  const count = Number(product.voucherMultiProductCount ?? 0);
  const eligible = !product.voucherMultiProductCountOnly;
  if (perUnitReward <= 0 || count <= 0 || !eligible) {
    return { amount: 0, perUnitReward, count, eligible };
  }
  return {
    amount: perUnitReward * count,
    perUnitReward,
    count,
    eligible,
  };
}

export default function EstimateModal({
  products,
  onReset,
  onConfirm,
  onRemove,
  saveMeta,
}: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [productList, setProductList] = useState(products);
  const [multiProductVoucher, setMultiProductVoucher] = useState<{
    total: number;
    details: Array<{ type: string; amount: number; reason: string }>;
    perUnitReward: number;
    totalUnits: number;
    eligibleUnits: number;
  }>({
    total: 0,
    details: [],
    perUnitReward: 0,
    totalUnits: 0,
    eligibleUnits: 0,
  });
  const router = useRouter();

  useEffect(() => {
    setProductList(products);
  }, [products]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const rules = await fetchVoucherRules();
        if (!rules || cancelled) return;
        const multiProduct = calcMultiProductVoucher({
          voucherRules: rules as any,
          products: productList.map((p) => ({
            modelCode: p.모델코드,
            multiProductCount: p.voucherMultiProductCount ?? 0,
            multiProductCountOnly: p.voucherMultiProductCountOnly ?? false,
            multiProductNote: p.voucherMultiProductNote,
          })),
        });
        if (!cancelled) {
          setMultiProductVoucher(multiProduct);
        }
      } catch (err) {
        console.error("다품목 상품권 계산 오류:", err);
        if (!cancelled) {
          setMultiProductVoucher({
            total: 0,
            details: [],
            perUnitReward: 0,
            totalUnits: 0,
            eligibleUnits: 0,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [productList]);

  // 합계 계산
  const totalBasePrice = productList.reduce(
    (sum, p) => sum + calcBaseMonthly(p),
    0,
  );

  const totalVoucher = productList.reduce(
    (sum, p) => sum + getVoucherTotal(p),
    0,
  );
  const totalVoucherWithMultiProduct =
    totalVoucher + (multiProductVoucher?.total ?? 0);
  const voucherSummary = getVoucherSummaryDetails(
    productList,
    multiProductVoucher,
  );

  const totalFinalPrice = productList.reduce(
    (sum, p) => sum + calcFinalMonthlyForSave(p),
    0,
  );

  const totalDiscount = productList.reduce((sum, p) => {
    const base = calcBaseMonthly(p);
    const final = calcFinalMonthlyForSave(p);
    return sum + Math.max(base - final, 0);
  }, 0);

  const handleConfirmEstimate = async () => {
    try {
      await enableNetwork(db);

      if (!productList || productList.length === 0) {
        alert("선택된 제품이 없습니다.");
        return;
      }

      function cleanData<T extends Record<string, unknown>>(
        obj: T,
      ): Partial<T> {
        const cleaned: Partial<T> = {};
        (Object.entries(obj) as [keyof T, T[keyof T]][]).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") {
            (cleaned as Record<keyof T, T[keyof T]>)[k] = v;
          }
        });
        return cleaned;
      }

      const safeProducts = productList.map((p) => {
        const base = calcBaseMonthly(p);
        const discounts = getSaveDiscounts(p);
        const final = calcFinalMonthlyForSave(p);
        const category = getProductCategory(p);
        const modelName = getModelName(p);

        return cleanData({
          모델코드: p.모델코드,
          상품명: p.상품명,
          category,
          categoryName: category,
          productName: p.상품명,
          modelName,
          quantity: 1,
          thumbnailUrl: p.thumbnailUrl || "",
          baseMonthly: base,
          finalPrice: final,
          cardDiscount: discounts.cardDiscount,
          teacherDiscount: discounts.teacherDiscount,
          prepayMonthlyDiscount: discounts.prepayMonthlyDiscount,
          selectedCardId: (p as any).selectedCardId ?? "",
          selectedCardName: (p as any).selectedCardName ?? "",
          selectedCardAmount: (p as any).selectedCardAmount ?? 0,
          teacherSelections: (p as any).teacherSelections ?? {},
          teacherTotalSeats: (p as any).teacherTotalSeats ?? 0,
          teacherSelectionDetails: (p as any).teacherSelectionDetails ?? [],
          prepayRate: (p as any).prepayRate ?? "",
          prepayAmount: (p as any).prepayAmount ?? 0,
          selectedVariant: p.selectedVariant
            ? cleanData(p.selectedVariant as Record<string, unknown>)
            : undefined,
          voucherTotal: getVoucherTotal(p),
          voucherDetails: (p as any).voucherDetails ?? [],
          voucherMultiProductCount: (p as any).voucherMultiProductCount ?? 0,
          voucherMultiProductCountOnly:
            (p as any).voucherMultiProductCountOnly ?? false,
          voucherMultiProductNote:
            (p as any).voucherMultiProductNote ?? undefined,
        });
      });

      const typeList = productList.map((p) => {
        const anyP = p as any;
        return anyP?.중분류 || anyP?.type || "unknown";
      });

      const estimateTypes = Array.from(new Set(typeList));
      const primaryEstimateType = estimateTypes[0] || "unknown";
      const selectedProductCount = productList.length;
      const productSelectionType =
        selectedProductCount >= 2 ? "multi" : "single";
      const estimateProductList = productList.map((p) => {
        const category = getProductCategory(p);
        const modelName = getModelName(p);
        return cleanData({
          category,
          categoryName: category,
          productName: p.상품명,
          modelName,
          modelCode: p.모델코드,
          quantity: 1,
        });
      });
      const selectedAffiliateCardNames = Array.from(
        new Set(
          productList
            .map((p) => normalizeText((p as any).selectedCardName))
            .filter(Boolean),
        ),
      );
      const affiliateCardUsed = selectedAffiliateCardNames.length > 0;

      const { getAuth } = await import("firebase/auth");
      const auth = getAuth();
      const currentUser = auth.currentUser;

      let managerMeta: {
        uid: string;
        managerId: string;
        name: string;
        branch: string;
        region: string;
        office: string;
      } | null = null;

      if (currentUser) {
        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (userSnap.exists()) {
          const userData = userSnap.data() as any;
          if (userData.role === "manager") {
            managerMeta = {
              uid: currentUser.uid,
              managerId: userData.managerId ?? "",
              name: userData.name ?? "",
              branch: userData.branch ?? "",
              region: userData.region ?? "",
              office: userData.office ?? userData.branch ?? "",
            };
          }
        }
      }

      const safeTotalFinal = productList.reduce(
        (sum, p) => sum + calcFinalMonthlyForSave(p),
        0,
      );
      const safeTotalBase = productList.reduce(
        (sum, p) => sum + calcBaseMonthly(p),
        0,
      );
      const safeTotalDiscount = Math.max(safeTotalBase - safeTotalFinal, 0);

      const multiProductExceptionUnits = Math.max(
        (multiProductVoucher?.totalUnits ?? 0) -
          (multiProductVoucher?.eligibleUnits ?? 0),
        0,
      );

      const payload: any = {
        ...cleanData(saveMeta ?? {}),
        products: safeProducts,
        estimateProducts: estimateProductList,
        selectedProductCount,
        productSelectionType,
        isMultiProductEstimate: productSelectionType === "multi",
        affiliateCardUsed,
        selectedAffiliateCardName: selectedAffiliateCardNames[0] ?? "",
        selectedAffiliateCardNames,
        totalBasePrice: safeTotalBase,
        totalFinalPrice: safeTotalFinal,
        totalDiscount: safeTotalDiscount,
        estimateTypes,
        primaryEstimateType,
        createdAt: new Date(),
        estimateCreatedAt: new Date(),
        totalVoucher: totalVoucherWithMultiProduct,
        multiProductVoucherTotal: multiProductVoucher?.total ?? 0,
        multiProductVoucherPerUnitReward:
          multiProductVoucher?.perUnitReward ?? 0,
        multiProductTotalUnits: multiProductVoucher?.totalUnits ?? 0,
        multiProductEligibleUnits: multiProductVoucher?.eligibleUnits ?? 0,
        multiProductExceptionUnits,
        multiProductVoucherDetails: multiProductVoucher?.details ?? [],
      };

      if (managerMeta) {
        payload.managerUid = managerMeta.uid;
        payload.managerId = managerMeta.managerId;
        payload.managerName = managerMeta.name;
        payload.managerBranch = managerMeta.branch;
      }

      const docRef = await addDoc(collection(db, "estimates"), payload);

      const analyticsTasks: Promise<unknown>[] = [];
      const estimatesCountCol = collection(db, "estimatesCount");
      const managerCategoryStatsCol = collection(db, "managerCategoryStats");
      const managerProductStatsCol = collection(db, "managerProductStats");
      const now = new Date();

      estimateTypes.forEach((type) => {
        const safeType = type || "unknown";

        analyticsTasks.push(
          setDoc(
            doc(estimatesCountCol, `type_${safeType}`),
            {
              type: safeType,
              totalCount: increment(1),
              lastEstimateId: docRef.id,
              updatedAt: now,
            },
            { merge: true },
          ),
        );

        if (managerMeta) {
          const { uid, managerId, name, branch } = managerMeta;

          analyticsTasks.push(
            setDoc(
              doc(estimatesCountCol, `manager_${uid}_${safeType}`),
              {
                type: safeType,
                managerUid: uid,
                managerId,
                managerName: name,
                branch,
                managerCount: increment(1),
                lastEstimateId: docRef.id,
                updatedAt: now,
              },
              { merge: true },
            ),
          );

          if (branch) {
            analyticsTasks.push(
              setDoc(
                doc(estimatesCountCol, `branch_${branch}_${safeType}`),
                {
                  type: safeType,
                  branch,
                  branchCount: increment(1),
                  lastEstimateId: docRef.id,
                  updatedAt: now,
                },
                { merge: true },
              ),
            );
          }
        }
      });

      if (managerMeta) {
        const { uid, managerId, name, branch, region, office } = managerMeta;

        productList.forEach((p) => {
          const anyP = p as any;
          const productType = anyP?.중분류 || anyP?.type || primaryEstimateType;
          const safeProductType = productType || "unknown";
          const modelCode = anyP?.모델코드 || "unknown";
          const productName = anyP?.상품명 || "";

          analyticsTasks.push(
            setDoc(
              doc(
                managerCategoryStatsCol,
                `manager_${uid}_category_${safeProductType}`,
              ),
              {
                type: safeProductType,
                managerUid: uid,
                managerId,
                managerName: name,
                branch,
                region,
                office,
                estimateCount: increment(1),
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            ),
          );

          analyticsTasks.push(
            setDoc(
              doc(
                managerProductStatsCol,
                `manager_${uid}_product_${modelCode}`,
              ),
              {
                type: safeProductType,
                modelCode,
                productName,
                managerUid: uid,
                managerId,
                managerName: name,
                branch,
                region,
                office,
                estimateCount: increment(1),
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            ),
          );
        });
      }

      if (analyticsTasks.length > 0) {
        await Promise.all(analyticsTasks);
      }

      router.push(`/estimate/${docRef.id}`);
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.error("❌ Firestore 저장 실패:", e.message);
      } else {
        console.error("❌ Firestore 저장 실패 (비정상 오류):", e);
      }
    }
  };

  return (
    <ModalContainer>
      <ToggleButton onClick={() => setIsOpen((prev) => !prev)}>
        {isOpen ? (
          <Image src="/images/ico_select.png" alt="" width={22} height={13} />
        ) : (
          <Image
            style={{ transform: "rotate(180deg)" }}
            src="/images/ico_select.png"
            alt=""
            width={22}
            height={13}
          />
        )}
      </ToggleButton>
      <ModalWrap>
        <Header>
          <HeaderTop>
            <Title>상품 견적 비교하기</Title>
          </HeaderTop>
          <Desc>
            기존 가전 구독/케어십 고객이 다른 상품군을 추가 구독하거나 2개
            이상의 상품군을 동시에 구독할 때 결합할인 혜택을 드립니다. (최대 5%
            할인, 상품별 상이)
          </Desc>
        </Header>

        <Content isOpen={isOpen}>
          <ProductList>
            <ProductSlide>
              {productList.map((p) => {
                const base = calcBaseMonthly(p);
                const final = calcFinalMonthlyForSave(p);

                const multiProductReward = getProductMultiProductReward(
                  p,
                  multiProductVoucher,
                );
                const multiProductNote =
                  p.voucherMultiProductNote ||
                  (p.voucherMultiProductCountOnly
                    ? "대수만 인정, 상품권 미적용"
                    : undefined);
                return (
                  <ProductItem key={p.모델코드}>
                    <ImageWrap>
                      <StyledImage
                        src={p.thumbnailUrl || "/placeholder.png"}
                        alt={p.상품명 || "상품 이미지"}
                        width={120}
                        height={120}
                        unoptimized
                      />
                    </ImageWrap>
                    <ProductInfo>
                      <ProductName>{p.상품명}</ProductName>
                      <ProductModel>{p.모델코드}</ProductModel>

                      <ProductBenefit>
                        기본 월 요금 <b>{base.toLocaleString()}</b>원
                        <br />
                        <span style={{ color: "#ea1917" }}>
                          월 청구금액 <b>{final.toLocaleString()}</b>원
                        </span>
                        {/* 상품권 표시 */}
                        {getVoucherTotal(p) > 0 && (
                          <>
                            <VoucherLine>
                              지급 상품권{" "}
                              <b>{getVoucherTotal(p).toLocaleString()}</b>원
                            </VoucherLine>
                            {Array.isArray((p as any).voucherDetails) &&
                              (p as any).voucherDetails.length > 0 && (
                                <VoucherDetail>
                                  {(p as any).voucherDetails
                                    .filter(
                                      (d: any) => parseMoney(d?.amount) > 0,
                                    )
                                    .map((d: any, idx: number) => (
                                      <p key={`${p.모델코드}-voucher-${idx}`}>
                                        - {d.type}:{" "}
                                        {parseMoney(d.amount).toLocaleString()}
                                        원
                                      </p>
                                    ))}
                                </VoucherDetail>
                              )}
                          </>
                        )}
                        {(multiProductReward.amount > 0 ||
                          multiProductNote) && (
                          <>
                            {multiProductReward.amount > 0 && (
                              <VoucherLine>
                                다품목 상품권{" "}
                                <b>
                                  {multiProductReward.amount.toLocaleString()}원
                                </b>
                              </VoucherLine>
                            )}
                            {multiProductNote && (
                              <MultiProductNote>
                                {multiProductNote}
                              </MultiProductNote>
                            )}
                          </>
                        )}
                      </ProductBenefit>
                    </ProductInfo>
                    <RemoveButton onClick={() => onRemove(p.모델코드)}>
                      ×
                    </RemoveButton>
                  </ProductItem>
                );
              })}
              {productList.length === 0 && (
                <EmptyBox>선택된 상품이 없습니다.</EmptyBox>
              )}
            </ProductSlide>
          </ProductList>

          <Summary>
            <Total>
              <span>기본 월 요금</span>
              <b>{totalBasePrice.toLocaleString()}원</b>
            </Total>

            <SaleWrap>
              <CardsSale>
                <p>총 할인 금액</p>
                <p>-{totalDiscount.toLocaleString()}원</p>
              </CardsSale>
              <TotalSale>
                <p>월 청구금액</p>
                <p>{totalFinalPrice.toLocaleString()}원</p>
              </TotalSale>

              {
                <VoucherTotalBox>
                  <span>총 지급 상품권</span>
                  <b>{totalVoucherWithMultiProduct.toLocaleString()}원</b>
                </VoucherTotalBox>
              }
              {voucherSummary.length > 0 && (
                <VoucherDetail>
                  {voucherSummary.map((item) => (
                    <p key={`summary-voucher-${item.type}`}>
                      - {item.type}: {item.amount.toLocaleString()}원
                    </p>
                  ))}
                </VoucherDetail>
              )}
            </SaleWrap>

            <ConfirmButton onClick={handleConfirmEstimate}>
              견적 확인하기
            </ConfirmButton>
          </Summary>
        </Content>
      </ModalWrap>
    </ModalContainer>
  );
}

/* Styled Components */

const ModalContainer = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  z-index: 9999;
  padding-bottom: 20px;

  @media (max-width: 499px) {
    max-height: 80vh;
    overflow-y: auto;
    padding-top: 20px;
  }
`;

const ModalWrap = styled.div`
  width: 95%;
  max-width: 1380px;
  margin: auto;
`;

const Header = styled.div`
  padding: 20px 0 12px;
  display: flex;
  flex-direction: column;
`;

const HeaderTop = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Title = styled.strong`
  color: #000;
  font-size: 20px;
  font-weight: 700;
  line-height: 28px;
`;

const ToggleButton = styled.button`
  position: absolute;
  left: 50%;
  top: 0;
  transform: translate(-50%, -100%);
  z-index: 99;
  width: 45px !important;
  height: 22px;
  background: #fff;
  border-radius: 8px 8px 0 0;
  box-shadow: 0 -5px 7px 0 rgba(0, 0, 0, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  @media (max-width: 499px) {
    transform: translate(-50%, 0%);
    box-shadow: none;
    top: 10px;
  }
`;

const Desc = styled.span`
  margin-top: 8px;
  color: #000;
  font-size: 14px;
  line-height: 26px;
  opacity: 0.7;
  line-height: 1.4;

  @media (max-width: 1000px) {
    font-size: 12px;
  }
`;

const Content = styled.div<{ isOpen: boolean }>`
  overflow: hidden;
  transition: max-height 0.3s ease;
  max-height: ${({ isOpen }) => (isOpen ? "650px" : "0px")};
  display: flex;
  justify-content: space-between;
  gap: 30px;

  @media (max-width: 1000px) {
    flex-direction: column;
  }
`;

const ProductList = styled.div`
  width: calc(100% - 410px);
  overflow-x: auto;
  @media (max-width: 1000px) {
    width: 100%;
  }
`;

const ProductSlide = styled.div`
  display: flex;
  gap: 10px;
`;

const ProductItem = styled.div`
  border: 1px solid #ddd;
  padding: 16px 20px 20px;
  border-radius: 8px;
  min-height: 202px;
  margin: 14px 0 0 0;
  display: flex;
  width: 380px;
  align-items: center;
  position: relative;

  @media (max-width: 499px) {
    width: 360;
    padding: 16px;
  }
`;

const ImageWrap = styled.div`
  position: relative;
`;

const StyledImage = styled(Image)`
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 4px;
`;

const RemoveButton = styled.button`
  position: absolute;
  top: 5px;
  right: 5px;
  background: #fff;
  border-radius: 50%;
  color: #444;
  width: 22px;
  height: 22px;
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
  transition: all 0.2s ease;
`;

const EmptyBox = styled.div`
  width: 100%;
  color: #888;
  text-align: center;
  font-size: 14px;
  padding: 40px 0;
`;

const ProductInfo = styled.div`
  float: left;
  padding-left: 16px;
  min-width: 199px;
  width: calc(100% - 120px);
`;

const ProductName = styled.div`
  max-height: 40px;
  font-size: 14px;
  line-height: 20px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: keep-all;
  -webkit-line-clamp: 2;
`;

const ProductModel = styled.div`
  color: #666;
  font-size: 12px;
  line-height: 17px;
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ProductPrice = styled.div`
  font-size: 13px;
  font-weight: 400;
  line-height: 18px;
  margin-top: 8px;
  color: #777;
`;

const ProductBenefit = styled.div`
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  margin-top: 2px;
`;

const Summary = styled.div`
  width: 380px;
  padding: 24px 32px;
  background: #f6f6f6;
  border-radius: 8px;
  height: 270px;
  display: flex;
  gap: 0px;
  flex-direction: column;
  justify-content: space-between;

  @media (max-width: 1000px) {
    width: 100%;
    padding: 16px;
  }
`;

const Total = styled.div`
  font-size: 15px;

  span {
    font-size: 14px;
    font-weight: 500;
    color: #0f0f0f;
  }

  b {
    font-size: 24px;
    color: #000;
    font-weight: bold;
    display: block;
  }
`;

const SaleWrap = styled.div`
  border-top: 1px solid #ccc;
  margin-top: 5px;
  padding-top: 5px;
  overflow-y: auto;
  padding-bottom: 10px;
`;

const CardsSale = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #888;
  font-size: 16px;
  font-weight: 500;
`;

const TotalSale = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 18px;
  text-align: right;
  color: #ea1917;
  font-weight: bold;
  margin-bottom: 5px;
  margin-top: 5px;
`;

const ConfirmButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 50px;
  font-size: 16px;
  border: 1px solid #ea1917;
  border-radius: 26px;
  background-color: #ea1917;
  color: #fff;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 1px;

  &:hover {
    background-color: #c91515;
  }
`;

const SummaryBottom = styled.div`
  font-size: 12px;
  margin-top: 10px;

  ul {
    padding-left: 10px;
  }

  @media (max-width: 499px) {
    font-size: 12px;
  }
`;

const VoucherLine = styled.div`
  margin-top: 6px;
  font-size: 13px;
  color: #666;

  b {
    font-weight: 500;
  }
`;

const VoucherTotalBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;

  span {
    font-size: 14px;
    color: #666;
  }

  b {
    font-size: 16px;
    font-weight: 500;
    color: #666;
  }
`;

const VoucherDetail = styled.div`
  margin-top: 6px;
  font-size: 12px;
  color: #666;

  p {
    margin: 2px 0;
  }
`;

const MultiProductNote = styled.div`
  margin-top: 4px;
  font-size: 12px;
  color: #777;
`;
