/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef } from "react";
import useInfiniteProducts from "../../hooks/useInfiniteProducts";
import ProductCard from "@/components/Cards/ProductCard";
import Loading from "@/components/loading/Loading";

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

interface Product {
  모델코드: string;
  상품명: string;
  thumbnailUrl?: string;
  variants?: ProductVariant[];
}

interface SelectedProduct {
  모델코드: string;
  상품명: string;
  thumbnailUrl?: string;
  finalPrice?: string | number;
  selectedVariant?: ProductVariant;
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
}

interface Props {
  category: string;
  search?: string;
  onOpenModal: (item: SelectedProduct) => void;
  teacherPlans: TeacherPlan[];
  cardDiscounts: CardDiscount[];
}

export default function ProductGrid({
  category,
  search = "",
  onOpenModal,
  teacherPlans,
  cardDiscounts,
}: Props) {
  const { products, loadMore, hasMore, isLoading } = useInfiniteProducts(
    category,
    search
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  //  IntersectionObserver로 무한 스크롤 감시
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  return (
    <div style={styles.container}>
      {products.map((product) => (
        <ProductCard
          key={product.모델코드}
          product={product as any}
          onAdd={(itemWithOption: any) => onOpenModal(itemWithOption as any)}
          teacherPlans={teacherPlans}
          cardDiscounts={cardDiscounts}
        />
      ))}

      {isLoading && <Loading />}
      <div ref={sentinelRef} style={{ height: 1 }} />

      {!hasMore && products.length > 0 && <p style={styles.endText}></p>}
      {!isLoading && products.length === 0 && (
        <p style={styles.emptyText}>등록된 제품이 없습니다.</p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", //  반응형
    gap: 24,
    marginTop: 64,
    alignItems: "start",
    width: "100%",
    boxSizing: "border-box",
  },
  endText: {
    textAlign: "center",
    marginTop: 32,
    color: "#aaa",
    fontSize: 14,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 48,
    color: "#999",
    fontSize: 15,
  },
};
