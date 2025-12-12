// src/types/product.ts
export type Product = {
  No?: string;
  대분류?: string;
  중분류?: string;
  소분류?: string;
  상품명: string;
  모델코드: string;
  동일모델기준?: string;
  계약기간?: string;
  서비스유형?: string;
  서비스주기월?: string;
  정상가?: string;
  프로모션명?: string;
  프로모션유형?: string;
  지급수단?: string;
  금액적용유형?: string; // 정액 | 정률
  전회차할인값?: string; // % or 원
  할인금액?: string;
  할인후금액?: string;
  [key: string]: string | undefined; // 안전망
};
