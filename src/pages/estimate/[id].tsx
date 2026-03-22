/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Timestamp } from "firebase/firestore";
import Image from "next/image";
import styled from "styled-components";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
interface EstimateProduct {
  모델코드: string;
  상품명: string;
  thumbnailUrl?: string;

  // 👉 모달에서 저장한 값들
  baseMonthly?: number; // 기준 월 요금
  finalPrice?: number | string; // 혜택가 월 요금(총 체감 혜택)

  // ✅ 할인 내역 표시용(추가)
  // - Firestore에 저장돼 있으면 그대로 표기
  // - 없으면 0 처리되어 표시 안 됨
  cardDiscount?: number | string; // 제휴카드 월 할인액
  teacherDiscount?: number | string; // 구독교원 월 할인액
  prepayMonthlyDiscount?: number | string; // 선납으로 인한 월 할인액(기준월 - 선납반영월)

  prepayRate?: string; // "30" | "50" | ""
  prepayAmount?: number | string;

  // ✅ (저장된 값) 제휴카드 선택 정보
  selectedCardId?: string;
  selectedCardName?: string;
  selectedCardAmount?: number | string; // (예전 데이터 fallback 용도로만 사용)

  // ✅ (저장된 값) 구독교원 선택 정보
  teacherSelections?: Record<string, number>;
  teacherTotalSeats?: number;
  teacherSelectionDetails?: Array<{
    planId: string;
    type: string;
    seats: number;
    discountPerSeat: number;
    monthlyDiscount: number;
  }>;

  selectedVariant?: {
    계약기간?: string;
    서비스유형?: string;
    "서비스주기/월"?: string;
    프로모션유형?: string;
    프로모션명?: string;
    할인전금액?: string | number;
  };

  voucherTotal?: number | string;
  voucherDetails?: Array<{
    type: string;
    amount: number;
    reason: string;
  }>;
  voucherMultiProductCount?: number;
}

interface EstimateData {
  products: EstimateProduct[];

  totalBasePrice?: number;
  totalFinalPrice?: number;
  totalDiscount?: number;

  createdAt?: Timestamp;

  totalVoucher?: number;
  multiProductVoucherTotal?: number;
  multiProductVoucherDetails?: Array<{
    type: string;
    amount: number;
    reason: string;
  }>;
}

// 🔢 문자열/숫자 금액을 안전하게 숫자로 변환
function parseMoney(value: unknown): number {
  if (!value && value !== 0) return 0;
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9]/g, "");
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 0 : num;
  }

  return 0;
}

function getVoucherAmount(p: EstimateProduct): number {
  const v1 = parseMoney((p as any).voucherTotal);
  if (v1 > 0) return v1;

  const v2 = parseMoney((p as any).voucherTotal);
  if (v2 > 0) return v2;

  if (Array.isArray((p as any).voucherDetails)) {
    return (p as any).voucherDetails.reduce(
      (sum: number, d: any) => sum + parseMoney(d?.amount),
      0,
    );
  }

  return 0;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, "").replace(/[()]/g, "");
}

function includesAny(text: string, keywords: string[]) {
  const norm = normalizeText(text);
  return keywords.some((k) => norm.includes(normalizeText(k)));
}

function getVoucherDetails(p: EstimateProduct) {
  const details = Array.isArray(p.voucherDetails) ? p.voucherDetails : [];
  return details.filter((d) => parseMoney(d?.amount) > 0);
}

// 🔹 기준 월 요금 계산 (baseMonthly 우선)
function getBaseMonthly(p: EstimateProduct): number {
  if (typeof p.baseMonthly === "number") return p.baseMonthly;

  const variant = p.selectedVariant as any | undefined;
  const baseFromVariant = parseMoney(variant?.할인전금액);
  if (baseFromVariant > 0) return baseFromVariant;

  // 예전 데이터 대비: baseMonthly 없으면 finalPrice를 기준으로 사용
  const fromFinal = parseMoney(p.finalPrice);
  return fromFinal > 0 ? fromFinal : 0;
}

// 🔹 혜택가 월 요금 계산 (finalPrice 우선)
function getFinalMonthly(p: EstimateProduct): number {
  // ✅ A전략: 저장된 finalPrice가 진짜 총 체감 혜택
  const saved = parseMoney(p.finalPrice);
  if (saved || saved === 0) return Math.max(saved, 0);

  // ✅ 레거시 fallback: 저장된 finalPrice가 없던 문서만 재계산
  const base = getBaseMonthly(p);
  const b = getDiscountBreakdown(p);
  return Math.max(base - b.total, 0);
}

// ✅ 할인 내역 계산(표시용)
// - 저장값(cardDiscount/teacherDiscount/prepayMonthlyDiscount)이 있으면 그 값을 그대로 사용
// - 없으면 0 처리(표시 안 함)
// - 마지막으로 base-final과의 차이를 맞추기 위해 "기타 할인"을 표시하지는 않음(원하면 추가 가능)
function getDiscountBreakdown(p: EstimateProduct) {
  // 선납
  const prepayRaw = parseMoney((p as any).prepayMonthlyDiscount);

  // ✅ 선납: 백원단위 절삭 + 1000원 이상부터 표시
  const prepayTruncated = Math.floor(prepayRaw / 100) * 100;
  const prepay = prepayTruncated >= 1000 ? prepayTruncated : 0;

  // 카드/교원
  const card = parseMoney((p as any).cardDiscount);
  const teacher = parseMoney((p as any).teacherDiscount);

  // 예전 데이터 fallback: selectedCardAmount는 카드할인 없을 때만
  const cardFallback =
    card > 0 ? card : parseMoney((p as any).selectedCardAmount);

  const cardDiscount = card > 0 ? card : cardFallback;

  const total = Math.max(prepay + cardDiscount + teacher, 0);

  return {
    prepay,
    cardDiscount,
    teacher,
    total,
  };
}

function getVoucherBreakdown(p: EstimateProduct) {
  const details = getVoucherDetails(p);
  const byType = details.reduce(
    (acc, d) => {
      const key = d.type || "기타 상품권";
      acc[key] = (acc[key] || 0) + parseMoney(d.amount);
      return acc;
    },
    {} as Record<string, number>,
  );

  const baseVoucher = byType["기본 상품권"] ?? 0;
  const serviceVoucher = byType["서비스주기 상품권"] ?? 0;
  const promoVoucher = byType["프로모션 상품권"] ?? 0;
  const themeVoucher = byType["테마판촉 상품권"] ?? 0;
  const otherVoucher =
    Object.entries(byType)
      .filter(
        ([key]) =>
          ![
            "기본 상품권",
            "서비스주기 상품권",
            "프로모션 상품권",
            "테마판촉 상품권",
          ].includes(key),
      )
      .reduce((sum, [, val]) => sum + val, 0) || 0;

  const promoType = (p.selectedVariant?.프로모션유형 ?? "").toString();
  const isCombineOrResubscribe = includesAny(promoType, [
    "신규결합",
    "기존결합",
    "재가전구독",
    "재구독",
  ]);

  const combineOrResubscribe = isCombineOrResubscribe ? baseVoucher : 0;
  const additionalDiscount =
    promoVoucher +
    serviceVoucher +
    themeVoucher +
    otherVoucher +
    (isCombineOrResubscribe ? 0 : baseVoucher);

  return {
    combineOrResubscribe,
    additionalDiscount,
    byType,
  };
}

function getVoucherSummaryDetails(data: EstimateData | null) {
  if (!data) return [];
  const totals: Record<string, number> = {};
  const products = Array.isArray(data.products) ? data.products : [];

  products.forEach((p) => {
    getVoucherDetails(p).forEach((d) => {
      const key = d.type || "기타 상품권";
      totals[key] = (totals[key] || 0) + parseMoney(d.amount);
    });
  });

  if (Array.isArray(data.multiProductVoucherDetails)) {
    data.multiProductVoucherDetails.forEach((d) => {
      const key = d.type || "기타 상품권";
      totals[key] = (totals[key] || 0) + parseMoney(d.amount);
    });
  }

  return Object.entries(totals)
    .filter(([, amount]) => amount > 0)
    .map(([type, amount]) => ({ type, amount }));
}

export default function EstimateDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [data, setData] = useState<EstimateData | null>(null);
  const [loading, setLoading] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null); // ✅ PDF 캡처 대상 ref

  const variantKeysToShow = [
    "계약기간",
    "서비스유형",
    "서비스주기/월",
    "프로모션유형",
    "프로모션명",
  ] as const;

  const renderVariantInfo = (variant?: EstimateProduct["selectedVariant"]) => {
    if (!variant) return null;

    const filteredEntries = Object.entries(variant).filter(
      ([key, value]) =>
        variantKeysToShow.includes(key as (typeof variantKeysToShow)[number]) &&
        value !== undefined &&
        value !== "",
    );

    if (!filteredEntries.length) return null;

    return (
      <VariantBox>
        {filteredEntries.map(([key, value]) => {
          let displayValue = String(value);

          // ✅ 계약기간은 "개월" → "년" 단위로 변환
          if (key === "계약기간") {
            const months = Number(value);
            const years = months / 12;
            if (!isNaN(years) && years >= 1) {
              displayValue = `${years}년`;
            }
          }

          return (
            <p key={key}>
              {key}: {displayValue}
            </p>
          );
        })}
      </VariantBox>
    );
  };

  // ✅ 카드명 + 교원 type/구좌 (기존 유지)
  const renderDiscountInfo = (p: EstimateProduct) => {
    const cardName = (p.selectedCardName || "").trim();

    const details = Array.isArray(p.teacherSelectionDetails)
      ? p.teacherSelectionDetails
      : [];
    const filteredDetails = details.filter((d) => (d?.seats ?? 0) > 0);

    const teacherTotalSeats =
      typeof p.teacherTotalSeats === "number"
        ? p.teacherTotalSeats
        : filteredDetails.reduce((sum, d) => sum + (d.seats ?? 0), 0);

    const hasCard = !!cardName;
    const hasTeacher = filteredDetails.length > 0 && teacherTotalSeats > 0;

    if (!hasCard && !hasTeacher) return null;

    return (
      <VariantBox>
        {hasCard && <p>제휴카드: {cardName}</p>}

        {hasTeacher && (
          <>
            <p>구독교원: 총 {teacherTotalSeats}구좌</p>
            {filteredDetails.map((d) => (
              <p key={d.planId}>
                - {d.type} {d.seats}구좌
              </p>
            ))}
          </>
        )}
      </VariantBox>
    );
  };

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        const ref = doc(db, "estimates", id as string);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setData(snap.data() as EstimateData);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  // ✅ Hook은 early return 전에 항상 호출
  const { totalBasePrice, totalFinalPrice, totalDiscount } = useMemo(() => {
    if (!data) {
      return { totalBasePrice: 0, totalFinalPrice: 0, totalDiscount: 0 };
    }

    const products = Array.isArray(data.products) ? data.products : [];

    const base = products.reduce((sum, p) => sum + getBaseMonthly(p), 0);
    const final = products.reduce((sum, p) => sum + getFinalMonthly(p), 0);

    // ✅ 총 할인금액은 base-final로 계산 (항상 일관)
    const discount = Math.max(base - final, 0);

    return {
      totalBasePrice: base,
      totalFinalPrice: final,
      totalDiscount: discount,
    };
  }, [data]);

  const totalVoucher = useMemo(() => {
    if (!data) return 0;

    const products = Array.isArray(data.products) ? data.products : [];
    const baseTotal = products.reduce((sum, p) => sum + getVoucherAmount(p), 0);
    const multiProduct = parseMoney(data.multiProductVoucherTotal);
    return baseTotal + multiProduct;
  }, [data]);

  // ✅ PDF 생성 함수
  const handleDownloadPDF = async () => {
    if (!wrapperRef.current) return;
    const element = wrapperRef.current;

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "p",
      unit: "px",
      format: [canvas.width, canvas.height],
    });
    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save(`견적서_${id}.pdf`);
  };

  // ✅ 링크 복사 함수
  const handleCopyLink = async () => {
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      alert("📋 견적서 링크가 복사되었습니다!");
    } catch {
      alert("복사 중 오류가 발생했습니다.");
    }
  };

  if (loading) return <p>로딩 중...</p>;
  if (!data) return <p>견적 데이터를 찾을 수 없습니다.</p>;

  return (
    <>
      {/* ✅ PDF에 포함될 메인 콘텐츠 */}
      <Wrapper ref={wrapperRef}>
        <FlexTitle>
          <h2>견적서</h2>
          <p>
            {data.createdAt?.toDate().toLocaleString("ko-KR", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })}
          </p>
        </FlexTitle>

        <ProductList>
          {data.products.map((p) => {
            const base = getBaseMonthly(p);
            const final = getFinalMonthly(p);

            // ✅ 할인 내역
            const breakdown = getDiscountBreakdown(p);
            const voucherBreakdown = getVoucherBreakdown(p);
            const hasDiscountDetail =
              breakdown.prepay > 0 ||
              breakdown.cardDiscount > 0 ||
              breakdown.teacher > 0 ||
              voucherBreakdown.combineOrResubscribe > 0 ||
              voucherBreakdown.additionalDiscount > 0;

            return (
              <Item key={p.모델코드}>
                <Image
                  src={p.thumbnailUrl || "/placeholder.png"}
                  width={120}
                  height={120}
                  alt={p.상품명}
                  unoptimized
                />

                <Info>
                  <h4>{p.상품명}</h4>
                  <p>{p.모델코드}</p>

                  {renderVariantInfo(p.selectedVariant)}
                  {renderDiscountInfo(p)}

                  {/* ✅ 기준 월 요금 */}
                  <PriceRow>
                    <span>기준 월 요금 (할인전금액)</span>
                    <strong>월 {base.toLocaleString()}원</strong>
                  </PriceRow>

                  {/* ✅ (추가) 할인 내역 */}
                  {hasDiscountDetail && (
                    <DiscountBlock>
                      <DiscountTitle>할인/지원금 내역</DiscountTitle>

                      {breakdown.prepay > 0 && (
                        <DiscountRow>
                          <span>
                            선납
                            {p.prepayRate ? ` (${p.prepayRate}%)` : ""}
                          </span>
                          <b>- {breakdown.prepay.toLocaleString()}원</b>
                        </DiscountRow>
                      )}

                      {breakdown.cardDiscount > 0 && (
                        <DiscountRow>
                          <span>제휴카드 할인 금액</span>
                          <b>- {breakdown.cardDiscount.toLocaleString()}원</b>
                        </DiscountRow>
                      )}

                      {breakdown.teacher > 0 && (
                        <DiscountRow>
                          <span>교원 할인 금액</span>
                          <b>- {breakdown.teacher.toLocaleString()}원</b>
                        </DiscountRow>
                      )}
                      {/* ✅ 상품권 표시 */}
                      {getVoucherAmount(p) > 0 && (
                        <VoucherBox>
                          <VoucherTitle>상품권 지급</VoucherTitle>
                          <VoucherAmount>
                            {getVoucherAmount(p).toLocaleString()}원
                          </VoucherAmount>
                        </VoucherBox>
                      )}
                      {getVoucherDetails(p).length > 0 && (
                        <VoucherDetail>
                          {getVoucherDetails(p).map((d, idx) => (
                            <p key={`${p.모델코드}-voucher-${idx}`}>
                              - {d.type}:{" "}
                              {parseMoney(d.amount).toLocaleString()}원
                            </p>
                          ))}
                        </VoucherDetail>
                      )}
                    </DiscountBlock>
                  )}

                  {!hasDiscountDetail && getVoucherAmount(p) > 0 && (
                      <DiscountBlock>
                        <DiscountTitle>상품권 지급</DiscountTitle>
                        <VoucherBox>
                          <VoucherTitle>총 지급</VoucherTitle>
                          <VoucherAmount>
                            {getVoucherAmount(p).toLocaleString()}원
                          </VoucherAmount>
                        </VoucherBox>
                        {getVoucherDetails(p).length > 0 && (
                          <VoucherDetail>
                            {getVoucherDetails(p).map((d, idx) => (
                              <p key={`${p.모델코드}-voucher-only-${idx}`}>
                                - {d.type}:{" "}
                                {parseMoney(d.amount).toLocaleString()}원
                              </p>
                            ))}
                          </VoucherDetail>
                        )}
                      </DiscountBlock>
                    )}

                  {/* ✅ 총 체감 혜택 */}
                  <PriceRow className="benefit">
                    <span>월 체감요금 </span>
                    <strong>월 {final.toLocaleString()}원</strong>
                  </PriceRow>
                </Info>
              </Item>
            );
          })}
        </ProductList>

        <Summary>
          <SummaryFlex>
            <div>기준 이용 요금</div>
            <strong>월 {totalBasePrice.toLocaleString()}원</strong>
          </SummaryFlex>

          <SummaryFlex
            style={{ color: "#b3b3b3", fontSize: "16px", marginBottom: 5 }}
          >
            <div style={{ color: "#b3b3b3" }}>총 할인/지원 금액</div>
            <span>- {totalDiscount.toLocaleString()}원</span>
          </SummaryFlex>

          <SummaryFlex>
            <div style={{ color: "#ea1917" }}>월 체감요금</div>
            <strong style={{ color: "#ea1917" }}>
              월 {totalFinalPrice.toLocaleString()}원
            </strong>
          </SummaryFlex>
          {(
            <SummaryFlex
              style={{
                color: "#666",
                fontWeight: "400",
                fontSize: "14px",
                marginBottom: 5,
              }}
            >
              <div>총 상품권</div>
              <span>{totalVoucher.toLocaleString()}원</span>
            </SummaryFlex>
          )}
          {getVoucherSummaryDetails(data).length > 0 && (
            <VoucherDetail>
              {getVoucherSummaryDetails(data).map((d, idx) => (
                <p key={`summary-voucher-${idx}`}>
                  - {d.type}: {d.amount.toLocaleString()}원
                </p>
              ))}
            </VoucherDetail>
          )}
        </Summary>

        <SummaryBottom>
          <b>유의사항</b>
          <br />
          혜택가는 가전 구독 / 케어십 이용금액에 제휴카드 및 구독교원 할인
          혜택을 계산하여 안내하며, 사용하시는 제휴카드의 종류, 전월 카드 실적,
          구독교원 이용 여부 등에 따라 실제 적용 시 혜택가와 다를 수 있습니다.
          <br />
          제휴카드 및 구독교원 할인 혜택 상세 내용은 고객 혜택 &gt; 카드 할인
          혜택에서 확인 가능합니다.
        </SummaryBottom>
      </Wrapper>

      {/* ✅ 하단 고정 버튼 영역 (PDF 캡처 제외) */}
      <ButtonWrap>
        <Button onClick={handleDownloadPDF}>PDF로 저장</Button>
        <Button onClick={handleCopyLink}>링크 복사</Button>
      </ButtonWrap>
    </>
  );
}

/**
 * ⚠️ 아래 styled-components는 “원본 그대로 유지”가 원칙이야.
 * 네 파일에 이미 정의돼 있으면, 아래 3개만 추가해서 사용하면 돼.
 * (기존 스타일은 절대 건드리지 말고 그대로 둬)
 */
const DiscountBlock = styled.div`
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #e9e9e9;
  border-radius: 8px;
  background: #fafafa;
`;

const DiscountTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #222;
`;

const DiscountRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  margin-bottom: 6px;

  span {
    color: #666;
  }
  b {
    color: #ea1917;
    font-weight: 700;
  }
`;

const DiscountTotalRow = styled(DiscountRow)`
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #ddd;

  span {
    color: #444;
    font-weight: 700;
  }
  b {
    color: #ea1917;
    font-weight: 800;
  }
`;

const Wrapper = styled.div`
  max-width: 900px;
  margin: 50px auto;
  background: #fff;
  padding: 20px;
  border-radius: 8px;

  h2 {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 15px;
  }

  p {
    font-size: 14px;
  }
`;
const FlexTitle = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;
const ProductList = styled.div`
  margin-top: 20px;
`;
const Item = styled.div`
  display: flex;
  gap: 20px;
  border-bottom: 1px solid #eee;
  padding: 20px 0;
`;
const Info = styled.div`
  flex: 1;
  h4 {
    font-size: 18px;
    font-weight: 700;
  }
`;
const VariantBox = styled.div`
  color: #666;
  font-size: 14px;
  margin-top: 10px;
`;
const PriceRow = styled.div`
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  font-size: 16px;

  &.benefit {
    color: #ea1917;

    strong {
      color: #ea1917;
    }
  }

  span {
    font-size: 14px;
    color: #444;
  }

  strong {
    font-size: 18px;
    font-weight: bold;
  }
`;
const Summary = styled.div`
  margin-top: 40px;
  background: #f8f8f8;
  padding: 24px;
  border-radius: 6px;
  font-size: 18px;
  font-weight: bold;
`;
const SummaryFlex = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
`;
const SummaryBottom = styled.div`
  font-size: 12px;
  color: #000;
  margin-top: 30px;
`;
const ButtonWrap = styled.div`
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  background: #fff;
  border-top: 1px solid #eee;
`;
const Button = styled.button`
  background: #222;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 12px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: #444;
  }
`;

const VoucherBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #666;
`;

const VoucherTitle = styled.div`
  font-size: 12px;
`;

const VoucherAmount = styled.div`
  font-size: 14px;
  font-weight: 500;
`;

const VoucherDetail = styled.div`
  margin-top: 8px;
  font-size: 13px;
  color: #666;

  p {
    margin: 2px 0;
  }
`;
