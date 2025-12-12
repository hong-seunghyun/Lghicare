/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import Image from "next/image";
import React, { useState, useEffect } from "react";
import styled from "styled-components";

import { db } from "@/lib/firebase";
import { useRouter } from "next/router";

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
}

interface Props {
  products: SelectedProduct[];
  onReset: () => void;
  onConfirm: () => void;
  onRemove: (modelCode: string) => void;
}

// 💰 공통 숫자 파서
function parseMoney(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;

  const cleaned = value.replace(/[^0-9]/g, "");
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

// 🔹 기준 이용요금 계산 (할인후금액 → 정상가 까지 우선순위)
function calcBaseMonthly(p: SelectedProduct): number {
  // ProductCard에서 baseMonthly를 직접 넣어준 경우 우선 사용
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

// 🔹 혜택가(최종 월 요금) 계산
function calcFinalMonthly(p: SelectedProduct): number {
  const base = calcBaseMonthly(p);
  if (!base) return 0;

  const v = p.selectedVariant as any | undefined;

  // ✅ ProductCard에서 넣어준 월 할인 금액 우선 사용
  const cardDiscount = parseMoney(
    (p as any).cardDiscount ??
      v?.cardDiscount ??
      v?.카드할인금액 ??
      v?.제휴카드할인금액
  );
  const teacherDiscount = parseMoney(
    (p as any).teacherDiscount ?? v?.teacherDiscount ?? v?.구독교원할인금액
  );

  // 🔥 진짜로 선택된 할인(제휴카드/구독교원)이 있는지 체크
  const hasAnyDiscount = cardDiscount > 0 || teacherDiscount > 0;

  // 👉 둘 다 0이면 기본 제휴카드 할인 13,000원을 적용
  const discountSum = hasAnyDiscount ? cardDiscount + teacherDiscount : 13000;

  // 👉 할인합이 월 이용요금을 넘지 않도록 캡핑
  const effectiveDiscount = Math.min(discountSum, base);

  const final = base - effectiveDiscount;
  return final > 0 ? final : 0;
}

export default function EstimateModal({
  products,
  onReset,
  onConfirm,
  onRemove,
}: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [productList, setProductList] = useState(products);
  const router = useRouter();

  useEffect(() => {
    setProductList(products);
  }, [products]);

  // ✅ 전체 합계
  const totalBasePrice = productList.reduce(
    (sum, p) => sum + calcBaseMonthly(p),
    0
  );
  const totalFinalPrice = productList.reduce(
    (sum, p) => sum + calcFinalMonthly(p),
    0
  );

  // ✅ 총 할인 금액 = 각 상품별 (기준 - 혜택가)의 합
  const totalDiscount = productList.reduce((sum, p) => {
    const base = calcBaseMonthly(p);
    const final = calcFinalMonthly(p);
    return sum + Math.max(base - final, 0);
  }, 0);

  const handleConfirmEstimate = async () => {
    try {
      // 🔌 오프라인 상태였다면 네트워크 재활성화
      await enableNetwork(db);

      // ⚠️ 선택된 제품이 없으면 저장 진행 X
      if (!productList || productList.length === 0) {
        alert("선택된 제품이 없습니다.");
        return;
      }

      function cleanData<T extends Record<string, unknown>>(
        obj: T
      ): Partial<T> {
        const cleaned: Partial<T> = {};
        (Object.entries(obj) as [keyof T, T[keyof T]][]).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") {
            (cleaned as Record<keyof T, T[keyof T]>)[k] = v;
          }
        });
        return cleaned;
      }

      // 🔢 저장용도도 혜택가 합계 기준 (👉 productList 기준)
      const safeTotalPrice = productList.reduce(
        (sum, p) => sum + calcFinalMonthly(p),
        0
      );

      const safeProducts = productList.map((p) =>
        cleanData({
          모델코드: p.모델코드,
          상품명: p.상품명,
          thumbnailUrl: p.thumbnailUrl || "",
          baseMonthly: calcBaseMonthly(p), // 기준 월 요금
          finalPrice: calcFinalMonthly(p), // 혜택가 월 요금(최대혜택가)
          selectedVariant: p.selectedVariant
            ? cleanData(p.selectedVariant as Record<string, unknown>)
            : undefined,
        })
      );

      // ✅ 견적 type(중분류) 추출 (여러 개 가능)
      //    - 각 상품에서 중분류(or type)를 뽑아서, 중복 제거한 배열로 관리
      const typeList = productList.map((p) => {
        const anyP = p as any;
        return anyP?.중분류 || anyP?.type || "unknown";
      });

      // 중복 제거
      const estimateTypes = Array.from(new Set(typeList));
      // 이전 호환용: 첫 번째 type도 같이 남겨두고 싶으면
      const primaryEstimateType = estimateTypes[0] || "unknown";

      // ✅ 현재 로그인 유저 정보에서 매니저인지 확인
      const { getAuth } = await import("firebase/auth");
      const auth = getAuth();
      const currentUser = auth.currentUser;

      let managerMeta: {
        uid: string;
        managerId: string;
        name: string;
        branch: string;
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
            };
          }
        }
      }

      // 🔹 기본 payload + 매니저 정보 포함
      const payload: any = {
        products: safeProducts,
        totalBasePrice, // 기준 이용 요금(월 합계) → 이미 productList 기준으로 계산된 값
        totalFinalPrice: safeTotalPrice, // 혜택가 월 합계
        totalDiscount: Math.max(totalBasePrice - safeTotalPrice, 0),
        estimateTypes, // ✅ 이 견적에 포함된 전체 type 리스트
        primaryEstimateType, // ✅ 대표 type (기존 단일 타입이 필요할 수 있어서)
        createdAt: new Date(),
      };

      if (managerMeta) {
        payload.managerUid = managerMeta.uid;
        payload.managerId = managerMeta.managerId;
        payload.managerName = managerMeta.name;
        payload.managerBranch = managerMeta.branch;
      }

      // ✅ 견적 본문 저장
      const docRef = await addDoc(collection(db, "estimates"), payload);

      // ✅ 애널리틱스: estimatesCount 컬렉션 업데이트
      //    👉 여러 type이 있을 수 있으니, 각 type마다 카운트 증가
      const analyticsTasks: Promise<unknown>[] = [];
      const estimatesCountCol = collection(db, "estimatesCount");
      const now = new Date();

      estimateTypes.forEach((type) => {
        const safeType = type || "unknown";

        // 1) 전체 type 기준 카운트
        analyticsTasks.push(
          setDoc(
            doc(estimatesCountCol, `type_${safeType}`),
            {
              type: safeType,
              totalCount: increment(1),
              lastEstimateId: docRef.id,
              updatedAt: now,
            },
            { merge: true }
          )
        );

        if (managerMeta) {
          const { uid, managerId, name, branch } = managerMeta;

          // 2) 매니저별 type 카운트
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
              { merge: true }
            )
          );

          // 3) 지점별 type 카운트
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
                { merge: true }
              )
            );
          }
        }
      });

      // 🔄 애널리틱스 병렬 처리 (UI 반응성 위해 한 번에)
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
            <Title>제품 견적 비교하기</Title>
          </HeaderTop>
          <Desc>
            ※ 기존 가전 구독/케어십 고객이 다른 제품군을 추가 구독하거나, 2개
            이상의 제품군을 동시에 신규 구독 시 결합할인 혜택을 드립니다. (최대
            5% 혜택, 제품 별로 상이)
          </Desc>
        </Header>

        <Content isOpen={isOpen}>
          <ProductList>
            <ProductSlide>
              {productList.map((p) => {
                const base = calcBaseMonthly(p); // 👉 월 기준 이용요금

                return (
                  <ProductItem key={p.모델코드}>
                    <ImageWrap>
                      <StyledImage
                        src={p.thumbnailUrl || "/placeholder.png"}
                        alt={p.상품명 || "제품 이미지"}
                        width={120}
                        height={120}
                        unoptimized
                      />
                    </ImageWrap>
                    <ProductInfo>
                      <ProductName>{p.상품명}</ProductName>
                      <ProductModel>{p.모델코드}</ProductModel>

                      {/* 👉 월 기준 이용요금만 노출 */}
                      <ProductBenefit>
                        월 <b>{base.toLocaleString()}</b>원
                      </ProductBenefit>
                    </ProductInfo>
                    <RemoveButton onClick={() => onRemove(p.모델코드)}>
                      ✕
                    </RemoveButton>
                  </ProductItem>
                );
              })}
              {productList.length === 0 && (
                <EmptyBox>선택된 제품이 없습니다.</EmptyBox>
              )}
            </ProductSlide>
          </ProductList>

          <Summary>
            <Total>
              <span>기준 이용 요금</span>
              <b>월 {totalBasePrice.toLocaleString()}원</b>
            </Total>

            <SaleWrap>
              <CardsSale>
                <p>총 할인 금액</p>
                <p>-{totalDiscount.toLocaleString()}원</p>
              </CardsSale>
              <TotalSale>
                <p>최대 혜택가 월</p>
                <p>{totalFinalPrice.toLocaleString()}원</p>
              </TotalSale>
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

/* ✅ Styled Components (디자인 완전 유지) */

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
  height: 250px;
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
