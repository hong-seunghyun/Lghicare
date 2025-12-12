"use client";
import { useEffect, useRef, useState } from "react";
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
  finalPrice?: number | string; // 혜택가 월 요금

  selectedVariant?: {
    계약기간?: string;
    서비스유형?: string;
    "서비스주기/월"?: string;
    프로모션유형?: string;
  };
}

interface EstimateData {
  products: EstimateProduct[];

  // 👉 모달에서 저장한 합계 값들
  totalBasePrice?: number; // 기준 이용 요금(월 합계)
  totalFinalPrice?: number; // 혜택가 월 합계
  totalDiscount?: number; // 총 할인 금액

  createdAt?: Timestamp;
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

// 🔹 기준 월 요금 계산 (baseMonthly 우선)
function getBaseMonthly(p: EstimateProduct): number {
  if (typeof p.baseMonthly === "number") return p.baseMonthly;
  // 예전 데이터 대비: baseMonthly 없으면 finalPrice를 기준으로 사용
  const fromFinal = parseMoney(p.finalPrice);
  return fromFinal > 0 ? fromFinal : 0;
}

// 🔹 혜택가 월 요금 계산 (finalPrice 우선)
function getFinalMonthly(p: EstimateProduct): number {
  // finalPrice가 정의되어 있다면 (0도 유효한 값)
  if (p.finalPrice !== undefined && p.finalPrice !== null) {
    return parseMoney(p.finalPrice);
  }

  // finalPrice가 아예 없는 예전 데이터라면 기준 금액 사용
  return getBaseMonthly(p);
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
  ] as const;

  const renderVariantInfo = (variant?: EstimateProduct["selectedVariant"]) => {
    if (!variant) return null;

    const filteredEntries = Object.entries(variant).filter(
      ([key, value]) =>
        variantKeysToShow.includes(key as (typeof variantKeysToShow)[number]) &&
        value !== undefined &&
        value !== ""
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
              displayValue = `${years}년`; // 예: 2년 (24개월)
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

  // ✅ 합계 계산 (필드가 없으면 products 기준으로 재계산)
  const totalBasePrice =
    typeof data.totalBasePrice === "number"
      ? data.totalBasePrice
      : data.products.reduce((sum, p) => sum + getBaseMonthly(p), 0);

  const totalFinalPrice =
    typeof data.totalFinalPrice === "number"
      ? data.totalFinalPrice
      : data.products.reduce((sum, p) => sum + getFinalMonthly(p), 0);

  const totalDiscount =
    typeof data.totalDiscount === "number"
      ? data.totalDiscount
      : Math.max(totalBasePrice - totalFinalPrice, 0);

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

                  {/* 기준 월 요금 */}
                  <PriceRow>
                    <span>기준 월 요금</span>
                    <strong>월 {base.toLocaleString()}원</strong>
                  </PriceRow>

                  {/* 혜택가 월 요금 */}
                  <PriceRow className="benefit">
                    <span>최대 혜택가</span>
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
            <div style={{ color: "#b3b3b3" }}>총 할인 금액</div>
            <span>- {totalDiscount.toLocaleString()}원</span>
          </SummaryFlex>
          <SummaryFlex>
            <div style={{ color: "#ea1917" }}>최대 혜택가</div>
            <strong style={{ color: "#ea1917" }}>
              월 {totalFinalPrice.toLocaleString()}원
            </strong>
          </SummaryFlex>
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

/* ---------- Styled Components ---------- */

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
