/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import CategoryTabs from "@/components/Tabs/CategoryTabs";
import ProductGrid from "@/components/Grid/ProductGrid";
import EstimateModal from "@/components/Modal/EstimateModal";
import Loading from "@/components/loading/Loading";
import { useRouter } from "next/navigation";
import styled from "styled-components";

import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query as fsQuery,
  orderBy as fsOrderBy,
} from "firebase/firestore";

const categories = [
  "정수기",
  "TV",
  "의류건조기",
  "세탁기",
  "신발관리기",
  "냉장고",
  "김치냉장고",
  "식기세척기",
  "전기레인지",
  "광파오븐",
  "워시타워",
  "의류관리기",
  "청소기",
  "가습기",
  "바스에어시스템",
  "워시콤보",
  "에어컨",
  "제습기",
  "공기청정기",
  "안마의자",
  "마이컵",
];

interface ProductVariant {
  [key: string]: unknown;
  모델코드: string;
  상품명: string;
  계약기간: string;
  서비스유형: string;
  "서비스주기/월": string;
  프로모션유형: string;
  프로모션명: string;
  정상가: string;
  할인전금액: string;
  할인후금액: string;
  할인금액?: string;
  thumbnailUrl?: string;
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

  voucherTotal?: number;
  voucherDetails?: Array<{ type: string; amount: number; reason: string }>;
  voucherMultiProductCount?: number;
  voucherMultiProductCountOnly?: boolean;
  voucherMultiProductNote?: string;
}

interface Product {
  모델코드: string;
  상품명: string;
  thumbnailUrl?: string;
  variants?: ProductVariant[];
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
  amount: number;
  allowTeacher: boolean;
  isActive: boolean;
}

export default function EstimatePage() {
  const router = useRouter();

  const [selectedCategory, setSelectedCategory] = useState("정수기");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>(
    [],
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 🔥 구독교원 / 제휴카드 메타데이터 (페이지 전체에서 한 번만 로딩)
  const [teacherPlans, setTeacherPlans] = useState<TeacherPlan[]>([]);
  const [cardDiscounts, setCardDiscounts] = useState<CardDiscount[]>([]);

  const handleRemoveProduct = (modelCode: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p.모델코드 !== modelCode));
  };

  useEffect(() => {
    setIsLoading(false);
  }, [selectedCategory]);

  const handleAddCompare = (product: SelectedProduct) => {
    setSelectedProducts((prev) => {
      const exists = prev.find((p) => p.모델코드 === product.모델코드);
      return exists
        ? prev.filter((p) => p.모델코드 !== product.모델코드)
        : [...prev, product];
    });
    setIsModalOpen(true);
  };

  const handleResetCompare = () => setSelectedProducts([]);
  const handleConfirmCompare = () => router.push("/compare");

  // 🔥 메타데이터 병렬 로딩 (N+1 방지, 페이지 전체 1회 호출)
  useEffect(() => {
    let cancelled = false;

    const fetchMeta = async () => {
      try {
        const teacherRef = collection(db, "teacherPlans");
        const cardRef = collection(db, "cardDiscounts");

        const [teacherSnap, cardSnap] = await Promise.all([
          getDocs(fsQuery(teacherRef, fsOrderBy("type"))),
          getDocs(fsQuery(cardRef, fsOrderBy("order"))),
        ]);

        if (cancelled) return;

        const teacherList: TeacherPlan[] = teacherSnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            type: data.type || "",
            maxSeats: Number(data.maxSeats ?? 0),
            discountPerSeat: Number(data.discountPerSeat ?? 0),
          };
        });

        // type 안의 숫자 기준 내림차순 (예: 144 → 130 → 108 → ...)
        const sortedTeacher = [...teacherList].sort((a, b) => {
          const numA = parseInt(a.type.replace(/[^0-9]/g, ""), 10) || 0;
          const numB = parseInt(b.type.replace(/[^0-9]/g, ""), 10) || 0;
          return numB - numA;
        });

        const cardList: CardDiscount[] = cardSnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            cardName: data.cardName || "",
            amount: Number(data.amount ?? 0),
            allowTeacher: !!data.allowTeacher,
            isActive: data.isActive !== false,
          };
        });

        const activeCards = cardList.filter((c) => c.isActive);

        setTeacherPlans(sortedTeacher);
        setCardDiscounts(activeCards);
      } catch (err) {
        console.error("❌ 구독교원/제휴카드 메타데이터 불러오기 오류:", err);
      }
    };

    fetchMeta();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Container>
      <Title>가전 구독 요금확인</Title>

      <SubTitle>
        기존 가전 구독 / 케어십 고객이 다른 제품군을 추가 구독하거나,
        <br />
        2개 이상의 제품군을 동시에 신규 구독 시 결합할인 혜택을 드립니다. (최대
        5% 혜택, 제품별로 상이)
      </SubTitle>

      <SearchSection>
        <SearchInput
          type="text"
          placeholder="상품명 또는 모델명을 입력하세요"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setSearchQuery(searchTerm.trim());
            }
          }}
        />
        <SearchButton type="button" onClick={() => setSearchQuery(searchTerm.trim())}>
          검색
        </SearchButton>
      </SearchSection>

      <CategoryTabs
        categories={categories}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      <GridSection>
        <ProductGrid
          category={selectedCategory}
          search={searchQuery}
          onOpenModal={handleAddCompare}
          teacherPlans={teacherPlans}
          cardDiscounts={cardDiscounts}
        />
      </GridSection>

      {isModalOpen && selectedProducts.length > 0 && (
        <EstimateModal
          products={selectedProducts}
          onReset={handleResetCompare}
          onConfirm={handleConfirmCompare}
          onRemove={handleRemoveProduct}
        />
      )}

      {isLoading && <Loading />}
    </Container>
  );
}

/* --------------------------- styled-components --------------------------- */

const Container = styled.main`
  width: 95%;
  max-width: 1380px;
  margin: 0 auto;
  padding: 40px 0;
`;

const Title = styled.h6`
  font-weight: 700;
  font-size: 24px;
  line-height: 34px;
  color: #000;
  text-align: center;
  margin-bottom: 20px;
`;

const SubTitle = styled.div`
  font-size: 16px;
  border-radius: 8px;
  background: #f2f2f2;
  padding: 20px 20px;
  width: max-content;
  margin: 0 auto 40px;
  text-align: center;
  max-width: 95%;
  line-height: 1.5;

  @media (max-width: 1000px) {
    font-size: 14px;
    width: 100%;
  }

  @media (max-width: 499px) {
    font-size: 12px;
    padding: 20px 10px;
  }
`;

const SearchSection = styled.section`
  margin-bottom: 64px;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  gap: 12px;
`;

const SearchInput = styled.input`
  width: 100%;
  max-width: 708px;
  padding: 12px 16px;
  border-radius: 99px;
  border: 1px solid #ddd;
  font-size: 16px;

  @media (max-width: 1000px) {
    max-width: 100%;
  }
`;
const SearchButton = styled.button`
  border-radius: 99px;
  border: none;
  background: #1f2933;
  color: #fff;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #111827;
  }

  @media (max-width: 1000px) {
    padding: 12px 18px;
  }
`;

const GridSection = styled.section`
  margin-top: 32px;
`;

