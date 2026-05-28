import React, { useMemo, useState } from "react";
import Image from "next/image";
import styled from "styled-components";

type PromotionSetId = "basic" | "pro" | "super" | "custom";

type ProductCategoryId =
  | "water"
  | "cleaner"
  | "massage"
  | "air"
  | "styler"
  | "dishwasher";

type Product = {
  id: string;
  categoryId: ProductCategoryId;
  categoryName: string;
  name: string;
  modelName: string;
  monthlyFee: number;
  imageSrc: string;
  promotion: string;
  availableIn: PromotionSetId[];
};

type CategoryRule = {
  categoryId: ProductCategoryId;
  name: string;
  minSelections: number;
  maxSelections?: number;
  allowMultiple: boolean;
};

type PromotionSet = {
  id: PromotionSetId;
  name: string;
  description: string;
  mode: "curated" | "free";
  benefitSummary: string;
  minTotalSelections?: number;
  categories: CategoryRule[];
};

const PROMOTION_SETS: PromotionSet[] = [
  {
    id: "basic",
    name: "Basic 세트",
    description: "필수 생활가전 중심으로 구성한 기본 프로모션 세트",
    mode: "curated",
    benefitSummary: "기본 프로모션 적용, 결합 상담 시 추가 혜택 확인",
    categories: [
      {
        categoryId: "water",
        name: "정수기",
        minSelections: 1,
        maxSelections: 1,
        allowMultiple: false,
      },
      {
        categoryId: "cleaner",
        name: "청소기",
        minSelections: 1,
        maxSelections: 1,
        allowMultiple: false,
      },
    ],
  },
  {
    id: "pro",
    name: "Pro 세트",
    description: "생활 관리 제품을 함께 담은 확장형 프로모션 세트",
    mode: "curated",
    benefitSummary: "Pro 전용 결합 혜택 및 월요금 상담 적용",
    categories: [
      {
        categoryId: "water",
        name: "정수기",
        minSelections: 1,
        maxSelections: 1,
        allowMultiple: false,
      },
      {
        categoryId: "cleaner",
        name: "청소기",
        minSelections: 1,
        maxSelections: 2,
        allowMultiple: true,
      },
      {
        categoryId: "air",
        name: "공기청정기",
        minSelections: 1,
        maxSelections: 1,
        allowMultiple: false,
      },
    ],
  },
  {
    id: "super",
    name: "Super 세트",
    description: "프리미엄 제품군까지 포함한 고급형 프로모션 세트",
    mode: "curated",
    benefitSummary: "Super 전용 혜택, 프리미엄 제품군 상담 우선 적용",
    categories: [
      {
        categoryId: "water",
        name: "정수기",
        minSelections: 1,
        maxSelections: 1,
        allowMultiple: false,
      },
      {
        categoryId: "cleaner",
        name: "청소기",
        minSelections: 1,
        maxSelections: 2,
        allowMultiple: true,
      },
      {
        categoryId: "massage",
        name: "안마의자",
        minSelections: 1,
        maxSelections: 1,
        allowMultiple: false,
      },
      {
        categoryId: "air",
        name: "공기청정기",
        minSelections: 1,
        maxSelections: 2,
        allowMultiple: true,
      },
    ],
  },
  {
    id: "custom",
    name: "골라담기",
    description: "세트 제한 없이 원하는 제품을 자유롭게 선택",
    mode: "free",
    benefitSummary: "선택 제품 기준으로 상담 후 적용 가능한 혜택 안내",
    minTotalSelections: 1,
    categories: [],
  },
];

const PRODUCTS: Product[] = [
  {
    id: "wd521awb",
    categoryId: "water",
    categoryName: "정수기",
    name: "오브제 정수기",
    modelName: "WD521AWB",
    monthlyFee: 29900,
    imageSrc: "/images/main-category-1.png",
    promotion: "기본 프로모션 적용",
    availableIn: ["basic", "pro", "super", "custom"],
  },
  {
    id: "wd720a",
    categoryId: "water",
    categoryName: "정수기",
    name: "퓨리케어 정수기",
    modelName: "WD720A",
    monthlyFee: 26900,
    imageSrc: "/images/main-category-18.png",
    promotion: "방문관리 프로모션 적용",
    availableIn: ["basic", "pro", "custom"],
  },
  {
    id: "as9200ba",
    categoryId: "cleaner",
    categoryName: "청소기",
    name: "코드제로 A9S",
    modelName: "AS9200BA",
    monthlyFee: 22900,
    imageSrc: "/images/main-category-20.png",
    promotion: "청소기 결합 혜택",
    availableIn: ["basic", "pro", "super", "custom"],
  },
  {
    id: "b95awbh",
    categoryId: "cleaner",
    categoryName: "청소기",
    name: "코드제로 오브제컬렉션",
    modelName: "B95AWBH",
    monthlyFee: 24900,
    imageSrc: "/images/main-category-9.png",
    promotion: "Pro/Super 전용 구성",
    availableIn: ["pro", "super", "custom"],
  },
  {
    id: "as303dwfa",
    categoryId: "air",
    categoryName: "공기청정기",
    name: "퓨리케어 360° 공기청정기",
    modelName: "AS303DWFA",
    monthlyFee: 19900,
    imageSrc: "/images/main-category-7.png",
    promotion: "공기청정 케어 혜택",
    availableIn: ["pro", "super", "custom"],
  },
  {
    id: "as065cwha",
    categoryId: "air",
    categoryName: "공기청정기",
    name: "퓨리케어 미니 공기청정기",
    modelName: "AS065CWHA",
    monthlyFee: 16900,
    imageSrc: "/images/main-category-23.png",
    promotion: "소형 공간 추천 구성",
    availableIn: ["super", "custom"],
  },
  {
    id: "mhb0g",
    categoryId: "massage",
    categoryName: "안마의자",
    name: "힐링 안마의자",
    modelName: "MHB0G",
    monthlyFee: 49900,
    imageSrc: "/images/main-category-2.png",
    promotion: "Super 전용 프리미엄 혜택",
    availableIn: ["super", "custom"],
  },
  {
    id: "s5mbua",
    categoryId: "styler",
    categoryName: "의류관리기",
    name: "오브제 스타일러",
    modelName: "S5MBUA",
    monthlyFee: 32900,
    imageSrc: "/images/main-category-8.png",
    promotion: "골라담기 추천 제품",
    availableIn: ["custom"],
  },
  {
    id: "dee6ewe",
    categoryId: "dishwasher",
    categoryName: "식기세척기",
    name: "디오스 식기세척기",
    modelName: "DEE6EWE",
    monthlyFee: 27900,
    imageSrc: "/images/main-category-13.png",
    promotion: "골라담기 주방 구성",
    availableIn: ["custom"],
  },
];

const EMPTY_SELECTED_IDS: string[] = [];

const formatPrice = (value: number) => `${value.toLocaleString()}원`;

const getProductsForSet = (set: PromotionSet) =>
  PRODUCTS.filter((product) => product.availableIn.includes(set.id));

const CheckIcon = () => (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <path d="M7.3 12.2 4.1 9l1.2-1.2 2 2 5.2-5.2L13.8 6z" />
  </svg>
);

export default function PromotionSetEstimatePage() {
  const [activeSetId, setActiveSetId] = useState<PromotionSetId>("basic");
  const [selectedBySet, setSelectedBySet] = useState<
    Record<PromotionSetId, string[]>
  >({
    basic: ["wd521awb"],
    pro: [],
    super: [],
    custom: [],
  });

  const activeSet =
    PROMOTION_SETS.find((set) => set.id === activeSetId) ?? PROMOTION_SETS[0];
  const visibleProducts = useMemo(() => getProductsForSet(activeSet), [activeSet]);
  const selectedIds = selectedBySet[activeSet.id] || EMPTY_SELECTED_IDS;

  const selectedProducts = useMemo(
    () =>
      selectedIds
        .map((id) => PRODUCTS.find((product) => product.id === id))
        .filter((product): product is Product => Boolean(product)),
    [selectedIds],
  );

  const visibleCategoryIds = useMemo(
    () => new Set(visibleProducts.map((product) => product.categoryId)),
    [visibleProducts],
  );

  const categoryRules = useMemo<CategoryRule[]>(() => {
    if (activeSet.mode === "free") {
      return Array.from(
        new Map(
          visibleProducts.map((product) => [
            product.categoryId,
            {
              categoryId: product.categoryId,
              name: product.categoryName,
              minSelections: 0,
              allowMultiple: true,
            } satisfies CategoryRule,
          ]),
        ).values(),
      );
    }

    return activeSet.categories.filter((rule) =>
      visibleCategoryIds.has(rule.categoryId),
    );
  }, [activeSet, visibleProducts, visibleCategoryIds]);

  const selectedCategoryCount = new Set(
    selectedProducts.map((product) => product.categoryId),
  ).size;
  const totalMonthlyFee = selectedProducts.reduce(
    (sum, product) => sum + product.monthlyFee,
    0,
  );

  const unmetRequirements = categoryRules.filter((rule) => {
    if (rule.minSelections <= 0) return false;
    const selectedCount = selectedProducts.filter(
      (product) => product.categoryId === rule.categoryId,
    ).length;
    return selectedCount < rule.minSelections;
  });

  const freeModeUnmet =
    activeSet.mode === "free" &&
    selectedProducts.length < (activeSet.minTotalSelections ?? 1);
  const canRequestEstimate = unmetRequirements.length === 0 && !freeModeUnmet;

  const groupedProducts = useMemo(
    () =>
      categoryRules.map((rule) => ({
        rule,
        products: visibleProducts.filter(
          (product) => product.categoryId === rule.categoryId,
        ),
      })),
    [categoryRules, visibleProducts],
  );

  const handleSetChange = (setId: PromotionSetId) => {
    setActiveSetId(setId);
  };

  const toggleProduct = (product: Product) => {
    setSelectedBySet((prev) => {
      const current = prev[activeSet.id] ?? [];
      const isSelected = current.includes(product.id);

      if (isSelected) {
        return {
          ...prev,
          [activeSet.id]: current.filter((id) => id !== product.id),
        };
      }

      const rule = categoryRules.find(
        (category) => category.categoryId === product.categoryId,
      );

      if (!rule || activeSet.mode === "free") {
        return { ...prev, [activeSet.id]: [...current, product.id] };
      }

      const idsInCategory = current.filter((id) => {
        const target = PRODUCTS.find((item) => item.id === id);
        return target?.categoryId === product.categoryId;
      });

      if (!rule.allowMultiple || rule.maxSelections === 1) {
        return {
          ...prev,
          [activeSet.id]: [
            ...current.filter((id) => {
              const target = PRODUCTS.find((item) => item.id === id);
              return target?.categoryId !== product.categoryId;
            }),
            product.id,
          ],
        };
      }

      if (rule.maxSelections && idsInCategory.length >= rule.maxSelections) {
        return prev;
      }

      return { ...prev, [activeSet.id]: [...current, product.id] };
    });
  };

  const removeProduct = (productId: string) => {
    setSelectedBySet((prev) => ({
      ...prev,
      [activeSet.id]: (prev[activeSet.id] ?? []).filter((id) => id !== productId),
    }));
  };

  const clearActiveSet = () => {
    setSelectedBySet((prev) => ({ ...prev, [activeSet.id]: [] }));
  };

  const handleRequestEstimate = () => {
    if (!canRequestEstimate) return;
    alert("선택한 프로모션 세트로 견적 문의가 준비되었습니다.");
  };

  return (
    <Page>
      <PageInner>
        <MainPanel>
          <Header>
            <TitleBlock>
              <h1>프로모션 세트 견적</h1>
              <p>관리자가 지정한 프로모션 세트로 간편하게 견적을 받아보세요</p>
            </TitleBlock>
            <AdminNotice>관리자 전용 임시 페이지</AdminNotice>
          </Header>

          <Tabs role="tablist" aria-label="프로모션 세트 선택">
            {PROMOTION_SETS.map((set) => (
              <TabButton
                key={set.id}
                type="button"
                role="tab"
                aria-selected={activeSet.id === set.id}
                $active={activeSet.id === set.id}
                onClick={() => handleSetChange(set.id)}
              >
                {set.name}
              </TabButton>
            ))}
          </Tabs>

          <SetMeta>
            <strong>{activeSet.description}</strong>
            <span>
              세트는 관리자 지정 구성이며, 제품별 조건과 월요금은 선택 옵션에
              따라 달라질 수 있습니다.
            </span>
          </SetMeta>

          <ProductSections>
            {groupedProducts.map(({ rule, products }) => (
              <CategorySection key={rule.categoryId}>
                <CategoryHeader>
                  <h2>{rule.name}</h2>
                  {rule.minSelections > 0 ? (
                    <span>최소 {rule.minSelections}개 이상 선택</span>
                  ) : (
                    <span>자유 선택</span>
                  )}
                </CategoryHeader>

                <ProductGrid>
                  {products.map((product) => {
                    const selected = selectedIds.includes(product.id);

                    return (
                      <ProductCard
                        key={product.id}
                        $selected={selected}
                        onClick={() => toggleProduct(product)}
                      >
                        <SelectionMark $selected={selected}>
                          {selected && <CheckIcon />}
                        </SelectionMark>

                        <ProductImageBox>
                          <Image
                            src={product.imageSrc}
                            alt={product.name}
                            width={116}
                            height={116}
                          />
                        </ProductImageBox>

                        <ProductInfo>
                          <h3>{product.name}</h3>
                          <ModelName>{product.modelName}</ModelName>
                          <MonthlyFee>월 {formatPrice(product.monthlyFee)}</MonthlyFee>
                          <PromotionText>{product.promotion}</PromotionText>
                        </ProductInfo>

                        <SelectButton
                          type="button"
                          $selected={selected}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleProduct(product);
                          }}
                        >
                          {selected && <CheckIcon />}
                          {selected ? "선택됨" : "선택하기"}
                        </SelectButton>
                      </ProductCard>
                    );
                  })}
                </ProductGrid>
              </CategorySection>
            ))}
          </ProductSections>

          <BottomHelp>
            <HelpText>
              <strong>안내사항</strong>
              <span>
                각 세트별 요금과 혜택은 상담 시점의 프로모션 정책에 따라
                달라질 수 있습니다.
              </span>
              <span>카테고리 최소 선택 조건을 충족하면 견적 문의가 가능합니다.</span>
            </HelpText>
            <HelpIcon aria-hidden="true">
              <span />
            </HelpIcon>
          </BottomHelp>
        </MainPanel>

        <SummaryPanel>
          <SummaryCard>
            <SummaryTitle>선택한 견적 요약</SummaryTitle>

            <SummarySection>
              <SummaryLabel>선택 세트</SummaryLabel>
              <SetName>{activeSet.name}</SetName>
            </SummarySection>

            <SummarySection>
              <SummaryLabel>선택한 카테고리</SummaryLabel>
              <CategoryCount>
                {selectedCategoryCount}개
                {activeSet.mode === "curated" && (
                  <span> / 최소 {activeSet.categories.length}개 카테고리</span>
                )}
              </CategoryCount>
              {!canRequestEstimate && (
                <RequirementList>
                  {freeModeUnmet && <li>제품을 최소 1개 이상 선택해주세요.</li>}
                  {unmetRequirements.map((rule) => (
                    <li key={rule.categoryId}>
                      {rule.name} {rule.minSelections}개 이상 선택 필요
                    </li>
                  ))}
                </RequirementList>
              )}
            </SummarySection>

            <SummarySection>
              <SummaryHeaderLine>
                <SummaryLabel>선택한 제품</SummaryLabel>
                {selectedProducts.length > 0 && (
                  <ClearButton type="button" onClick={clearActiveSet}>
                    전체 삭제
                  </ClearButton>
                )}
              </SummaryHeaderLine>

              {selectedProducts.length === 0 ? (
                <EmptySelection>아직 선택한 제품이 없습니다.</EmptySelection>
              ) : (
                <SelectedList>
                  {selectedProducts.map((product) => (
                    <SelectedItem key={product.id}>
                      <SelectedThumb>
                        <Image
                          src={product.imageSrc}
                          alt={product.name}
                          width={54}
                          height={54}
                        />
                      </SelectedThumb>
                      <SelectedInfo>
                        <strong>{product.name}</strong>
                        <span>{product.modelName}</span>
                        <b>월 {formatPrice(product.monthlyFee)}</b>
                      </SelectedInfo>
                      <RemoveButton
                        type="button"
                        aria-label={`${product.name} 선택 해제`}
                        onClick={() => removeProduct(product.id)}
                      >
                        ×
                      </RemoveButton>
                    </SelectedItem>
                  ))}
                </SelectedList>
              )}
            </SummarySection>

            <TotalSection>
              <SummaryLabel>월 예상 구독료</SummaryLabel>
              <TotalPrice>{formatPrice(totalMonthlyFee)}</TotalPrice>
            </TotalSection>

            <SummarySection>
              <SummaryLabel>프로모션 혜택 요약</SummaryLabel>
              <BenefitText>{activeSet.benefitSummary}</BenefitText>
            </SummarySection>

            <RequestButton
              type="button"
              disabled={!canRequestEstimate}
              onClick={handleRequestEstimate}
            >
              견적 문의하기
            </RequestButton>

            <FinePrint>
              <li>월 금액은 예상 금액이며, 실제 금액은 상담을 통해 확정됩니다.</li>
              <li>프로모션 혜택은 변경될 수 있습니다.</li>
            </FinePrint>
          </SummaryCard>
        </SummaryPanel>
      </PageInner>
    </Page>
  );
}

const accent = "rgb(234, 25, 23)";

const Page = styled.main`
  min-height: calc(100vh - 93px);
  background: #f6f7f9;
  padding: 32px;

  @media (max-width: 768px) {
    padding: 18px;
  }
`;

const PageInner = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(300px, 3fr);
  gap: 28px;
  max-width: 1360px;
  margin: 0 auto;
  align-items: start;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }
`;

const MainPanel = styled.section`
  background: #ffffff;
  border: 1px solid #ededed;
  border-radius: 8px;
  padding: 34px;

  @media (max-width: 640px) {
    padding: 22px 18px;
  }
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;

  @media (max-width: 640px) {
    flex-direction: column;
    margin-bottom: 22px;
  }
`;

const TitleBlock = styled.div`
  h1 {
    margin: 0 0 10px;
    font-size: 32px;
    line-height: 1.2;
    font-weight: 800;
    letter-spacing: 0;
    color: #111111;
  }

  p {
    margin: 0;
    font-size: 15px;
    line-height: 1.6;
    color: #666666;
  }

  @media (max-width: 640px) {
    h1 {
      font-size: 25px;
    }

    p {
      font-size: 14px;
    }
  }
`;

const AdminNotice = styled.div`
  flex: 0 0 auto;
  padding: 8px 12px;
  border: 1px solid #eeeeee;
  border-radius: 6px;
  color: #777777;
  font-size: 13px;
  font-weight: 700;
  background: #fafafa;
`;

const Tabs = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const TabButton = styled.button<{ $active: boolean }>`
  height: 52px;
  border: 1px solid ${({ $active }) => ($active ? accent : "#dddddd")};
  border-radius: 6px;
  background: ${({ $active }) => ($active ? accent : "#ffffff")};
  color: ${({ $active }) => ($active ? "#ffffff" : "#222222")};
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    border-color: ${accent};
  }
`;

const SetMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 30px;
  padding-left: 2px;
  font-size: 13px;
  line-height: 1.6;
  color: #777777;

  strong {
    font-size: 14px;
    color: #333333;
  }
`;

const ProductSections = styled.div`
  display: flex;
  flex-direction: column;
  gap: 30px;
`;

const CategorySection = styled.section``;

const CategoryHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;

  h2 {
    margin: 0;
    color: #111111;
    font-size: 22px;
    font-weight: 800;
    line-height: 1.35;
  }

  span {
    flex: 0 0 auto;
    color: #777777;
    font-size: 13px;
    font-weight: 700;
  }

  @media (max-width: 640px) {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;

    h2 {
      font-size: 20px;
    }
  }
`;

const ProductGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const ProductCard = styled.article<{ $selected: boolean }>`
  position: relative;
  display: grid;
  grid-template-columns: 118px minmax(0, 1fr);
  gap: 20px;
  min-height: 210px;
  padding: 24px 18px 72px;
  border: 1px solid ${({ $selected }) => ($selected ? accent : "#e7e7e7")};
  border-radius: 8px;
  background: #ffffff;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    transform: translateY(-3px);
    border-color: ${({ $selected }) => ($selected ? accent : "#d5d5d5")};
    box-shadow: 0 12px 26px rgba(0, 0, 0, 0.06);
  }

  @media (max-width: 520px) {
    grid-template-columns: 86px minmax(0, 1fr);
    gap: 14px;
    min-height: 190px;
    padding: 20px 14px 68px;
  }
`;

const SelectionMark = styled.div<{ $selected: boolean }>`
  position: absolute;
  top: 16px;
  right: 16px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${({ $selected }) => ($selected ? accent : "#d8d8d8")};
  border-radius: 5px;
  background: ${({ $selected }) => ($selected ? accent : "#ffffff")};

  svg {
    width: 16px;
    height: 16px;
    fill: #ffffff;
  }
`;

const ProductImageBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 122px;

  img {
    object-fit: contain;
  }

  @media (max-width: 520px) {
    height: 96px;
  }
`;

const ProductInfo = styled.div`
  min-width: 0;
  padding-right: 22px;

  h3 {
    margin: 8px 0 6px;
    font-size: 16px;
    line-height: 1.4;
    color: #151515;
    font-weight: 800;
  }
`;

const ModelName = styled.div`
  color: #777777;
  font-size: 13px;
  font-weight: 700;
`;

const MonthlyFee = styled.div`
  margin-top: 16px;
  color: ${accent};
  font-size: 21px;
  line-height: 1.25;
  font-weight: 900;
`;

const PromotionText = styled.div`
  margin-top: 10px;
  color: #666666;
  font-size: 13px;
  line-height: 1.5;
`;

const SelectButton = styled.button<{ $selected: boolean }>`
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 16px;
  height: 42px;
  border: 1px solid ${({ $selected }) => ($selected ? accent : "#dedede")};
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: ${({ $selected }) => ($selected ? accent : "#ffffff")};
  color: ${({ $selected }) => ($selected ? "#ffffff" : "#222222")};
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease;

  svg {
    width: 17px;
    height: 17px;
    fill: currentColor;
  }

  &:hover {
    border-color: ${accent};
  }
`;

const BottomHelp = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 30px;
  padding: 20px 22px;
  border: 1px solid #ececec;
  border-radius: 8px;
  background: #ffffff;
`;

const HelpText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  line-height: 1.55;
  color: #666666;

  strong {
    color: #222222;
    font-size: 14px;
  }
`;

const HelpIcon = styled.div`
  flex: 0 0 58px;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: #f2f3f5;
  position: relative;

  span {
    position: absolute;
    inset: 14px 17px 12px;
    border: 3px solid #aab3c2;
    border-radius: 5px;

    &::after {
      content: "";
      position: absolute;
      right: -8px;
      bottom: -8px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: ${accent};
    }
  }

  @media (max-width: 520px) {
    display: none;
  }
`;

const SummaryPanel = styled.aside`
  position: sticky;
  top: 116px;

  @media (max-width: 1100px) {
    position: static;
  }
`;

const SummaryCard = styled.div`
  background: #ffffff;
  border: 1px solid #eeeeee;
  border-radius: 8px;
  padding: 28px 24px;
`;

const SummaryTitle = styled.h2`
  margin: 0 0 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid #ededed;
  color: #111111;
  font-size: 20px;
  line-height: 1.35;
  font-weight: 900;
`;

const SummarySection = styled.section`
  padding: 18px 0;
  border-bottom: 1px solid #f0f0f0;
`;

const SummaryLabel = styled.div`
  margin-bottom: 8px;
  color: #555555;
  font-size: 13px;
  font-weight: 800;
`;

const SetName = styled.div`
  color: ${accent};
  font-size: 22px;
  font-weight: 900;
`;

const CategoryCount = styled.div`
  color: ${accent};
  font-size: 20px;
  font-weight: 900;

  span {
    color: #777777;
    font-size: 13px;
    font-weight: 700;
  }
`;

const RequirementList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 10px 0 0;
  padding: 0;

  li {
    color: #8b8b8b;
    font-size: 12px;
    line-height: 1.45;
  }
`;

const SummaryHeaderLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const ClearButton = styled.button`
  color: #888888;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    color: ${accent};
  }
`;

const EmptySelection = styled.div`
  padding: 18px 0 4px;
  color: #999999;
  font-size: 13px;
`;

const SelectedList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
`;

const SelectedItem = styled.div`
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) 26px;
  gap: 12px;
  align-items: center;
`;

const SelectedThumb = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  background: #f7f7f7;
  border-radius: 6px;

  img {
    object-fit: contain;
  }
`;

const SelectedInfo = styled.div`
  min-width: 0;

  strong {
    display: block;
    color: #222222;
    font-size: 14px;
    line-height: 1.35;
    font-weight: 800;
  }

  span {
    display: block;
    margin-top: 3px;
    color: #777777;
    font-size: 12px;
    font-weight: 700;
  }

  b {
    display: block;
    margin-top: 7px;
    color: ${accent};
    font-size: 14px;
    font-weight: 900;
  }
`;

const RemoveButton = styled.button`
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: #444444;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;

  &:hover {
    color: ${accent};
    background: #fff3f3;
  }
`;

const TotalSection = styled.section`
  padding: 22px 0;
  border-bottom: 1px solid #f0f0f0;
`;

const TotalPrice = styled.div`
  color: ${accent};
  font-size: 28px;
  line-height: 1.2;
  font-weight: 900;
`;

const BenefitText = styled.p`
  margin: 0;
  color: #555555;
  font-size: 13px;
  line-height: 1.6;
`;

const RequestButton = styled.button`
  width: 100%;
  height: 52px;
  margin-top: 24px;
  border-radius: 6px;
  background: ${accent};
  color: #ffffff;
  font-size: 16px;
  font-weight: 900;
  cursor: pointer;
  transition:
    background 0.18s ease,
    opacity 0.18s ease;

  &:hover:not(:disabled) {
    background: #c91515;
  }

  &:disabled {
    cursor: not-allowed;
    background: #d8d8d8;
    color: #ffffff;
  }
`;

const FinePrint = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 18px 0 0;
  padding: 0;

  li {
    color: #777777;
    font-size: 12px;
    line-height: 1.5;
  }
`;
