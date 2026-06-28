"use client";

import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import EstimateProductCard from "@/components/Cards/ProductCard";
import EstimateModal, {
  SelectedProduct,
} from "@/components/Modal/EstimateModal";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  DEFAULT_PROMOTION_SET_CONFIG,
  PROMOTION_SET_CONFIG_COLLECTION,
  PROMOTION_SET_CONFIG_DOC_ID,
  ProductSearchResult,
  PromotionSetEstimateConfig,
  PromotionSetProduct,
  getDefaultPromotionVariant,
  getEnabledPromotionPackages,
  getPromotionPackageEntries,
  normalizePromotionSetConfig,
} from "@/lib/promotionSetEstimate";

type TeacherPlan = {
  id: string;
  type: string;
  maxSeats: number;
  discountPerSeat: number;
};

type CardDiscount = {
  id: string;
  cardName: string;
  amount: number;
  allowTeacher: boolean;
  isActive?: boolean;
};

const productListKey = (products: PromotionSetProduct[]) =>
  products
    .map((product) => `${product.category}:${product.modelCode}`)
    .sort()
    .join("|");

const parseMoney = (value: unknown) => {
  if (!value && value !== 0) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  const parsed = Number.parseInt(value.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatPrice = (value: number) => `${value.toLocaleString("ko-KR")}원`;

const PROMOTION_CARD_SEQUENCE = ["신한", "롯데", "하나"];

const isPlaceholderThumbnail = (thumbnailUrl?: string) =>
  !thumbnailUrl || thumbnailUrl === "/placeholder.png";

const getVariantMonthly = (variant: Record<string, unknown> | undefined) =>
  parseMoney(variant?.할인후금액) ||
  parseMoney(variant?.할인전금액) ||
  parseMoney(variant?.정상가);

const productResponseCache = new Map<string, ProductSearchResult[]>();

const fetchPromotionProducts = async (params: URLSearchParams) => {
  const key = params.toString();
  const cached = productResponseCache.get(key);
  if (cached) return cached;

  const response = await fetch(`/api/products?${key}`);
  const data = (await response.json()) as {
    options?: ProductSearchResult[];
  };
  const products = Array.isArray(data.options) ? data.options : [];
  productResponseCache.set(key, products);
  return products;
};

const findPromotionCard = (
  cardDiscounts: CardDiscount[],
  cardKeyword: string | undefined,
) => {
  if (!cardKeyword) return undefined;
  const normalizedKeyword = cardKeyword.replace(/\s+/g, "");

  return cardDiscounts.find((card) =>
    card.cardName.replace(/\s+/g, "").includes(normalizedKeyword),
  );
};

const getAllowedPromotionCards = (
  cardDiscounts: CardDiscount[],
  productCount: number,
) =>
  PROMOTION_CARD_SEQUENCE.slice(0, Math.min(productCount, 3))
    .map((keyword) => findPromotionCard(cardDiscounts, keyword))
    .filter((card): card is CardDiscount => Boolean(card));

const getDefaultPromotionCardForIndex = (
  cardDiscounts: CardDiscount[],
  productIndex: number,
  productCount: number,
) => {
  const allowedCards = getAllowedPromotionCards(cardDiscounts, productCount);
  if (!allowedCards.length) return undefined;

  const keyword =
    productIndex === 0 ? "신한" : productIndex === 1 ? "롯데" : "하나";

  return (
    findPromotionCard(allowedCards, keyword) ??
    allowedCards[allowedCards.length - 1] ??
    allowedCards[0]
  );
};

const getProductMonthlyBase = (product: SelectedProduct) =>
  parseMoney(product.baseMonthly) ||
  parseMoney(product.selectedVariant?.할인후금액) ||
  parseMoney(product.selectedVariant?.할인전금액) ||
  parseMoney(product.selectedVariant?.정상가) ||
  parseMoney(product.finalPrice);

const applyPromotionCardBundle = (
  products: SelectedProduct[],
  cardDiscounts: CardDiscount[],
  cardSelections: Record<string, string>,
) =>
  products.map((product) => {
    const allowedCards = getAllowedPromotionCards(
      cardDiscounts,
      products.length,
    );
    const selectedCardId = cardSelections[product.모델코드] || "";
    const card = allowedCards.find((item) => item.id === selectedCardId);
    const baseMonthly = getProductMonthlyBase(product);

    if (!card || !baseMonthly) {
      return {
        ...product,
        baseMonthly,
        finalPrice: baseMonthly,
        cardDiscount: 0,
        selectedCardId: "",
        selectedCardName: "",
        selectedCardAmount: 0,
        teacherDiscount: 0,
        teacherSelections: {},
        teacherTotalSeats: 0,
        teacherSelectionDetails: [],
      };
    }

    const teacherDiscount = card.allowTeacher
      ? parseMoney(product.teacherDiscount)
      : 0;
    const finalPrice = Math.max(baseMonthly - card.amount - teacherDiscount, 0);

    return {
      ...product,
      baseMonthly,
      finalPrice,
      cardDiscount: card.amount,
      selectedCardId: card.id,
      selectedCardName: card.cardName,
      selectedCardAmount: card.amount,
      teacherDiscount,
      teacherSelections: card.allowTeacher ? product.teacherSelections : {},
      teacherTotalSeats: card.allowTeacher ? product.teacherTotalSeats : 0,
      teacherSelectionDetails: card.allowTeacher
        ? product.teacherSelectionDetails
        : [],
    };
  });

const mergePromotionProductData = (
  apiProduct: ProductSearchResult | undefined,
  promotionProduct: PromotionSetProduct,
): ProductSearchResult | null => {
  if (!apiProduct) return null;

  const fixedVariant =
    promotionProduct.selectedVariant ??
    getDefaultPromotionVariant(apiProduct.variants);
  const thumbnailUrl =
    (isPlaceholderThumbnail(apiProduct.thumbnailUrl)
      ? undefined
      : apiProduct.thumbnailUrl) ||
    (isPlaceholderThumbnail(promotionProduct.thumbnailUrl)
      ? undefined
      : promotionProduct.thumbnailUrl) ||
    "/placeholder.png";
  const baseMonthly = getVariantMonthly(fixedVariant);

  return {
    ...apiProduct,
    모델코드: apiProduct.모델코드 || promotionProduct.modelCode,
    상품명: apiProduct.상품명 || promotionProduct.productName,
    중분류: apiProduct.중분류 || promotionProduct.category,
    thumbnailUrl,
    selectedVariant: fixedVariant,
    baseMonthly,
    finalPrice: baseMonthly,
    variants: apiProduct.variants?.map((variant) => ({
      ...variant,
      thumbnailUrl: variant.thumbnailUrl || thumbnailUrl,
    })),
  };
};

export default function PromotionSetEstimatePage() {
  const [config, setConfig] = useState<PromotionSetEstimateConfig>(
    DEFAULT_PROMOTION_SET_CONFIG,
  );
  const [loading, setLoading] = useState(true);
  const [productLoading, setProductLoading] = useState(false);
  const [activePackageId, setActivePackageId] = useState("");
  const [activeId, setActiveId] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [estimateModalOpen, setEstimateModalOpen] = useState(false);
  const [selectedEstimateProducts, setSelectedEstimateProducts] = useState<
    SelectedProduct[]
  >([]);
  const [summaryCardSelections, setSummaryCardSelections] = useState<
    Record<string, string>
  >({});
  const [estimateProducts, setEstimateProducts] = useState<
    ProductSearchResult[]
  >([]);
  const [teacherPlans, setTeacherPlans] = useState<TeacherPlan[]>([]);
  const [cardDiscounts, setCardDiscounts] = useState<CardDiscount[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const snap = await getDoc(
          doc(db, PROMOTION_SET_CONFIG_COLLECTION, PROMOTION_SET_CONFIG_DOC_ID),
        );
        if (!cancelled && snap.exists()) {
          setConfig(normalizePromotionSetConfig(snap.data()));
        }
      } catch (error) {
        console.error("프로모션 세트 설정 로드 오류:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchEstimateMeta = async () => {
      try {
        const [teacherSnap, cardSnap] = await Promise.all([
          getDocs(query(collection(db, "teacherPlans"), orderBy("type"))),
          getDocs(query(collection(db, "cardDiscounts"), orderBy("order"))),
        ]);

        if (cancelled) return;

        const nextTeacherPlans = teacherSnap.docs
          .map((item) => {
            const data = item.data();
            return {
              id: item.id,
              type: String(data.type || ""),
              maxSeats: Number(data.maxSeats ?? 0),
              discountPerSeat: Number(data.discountPerSeat ?? 0),
            };
          })
          .sort((a, b) => {
            const aNumber =
              Number.parseInt(a.type.replace(/[^0-9]/g, ""), 10) || 0;
            const bNumber =
              Number.parseInt(b.type.replace(/[^0-9]/g, ""), 10) || 0;
            return bNumber - aNumber;
          });

        const nextCardDiscounts = cardSnap.docs
          .map((item) => {
            const data = item.data();
            return {
              id: item.id,
              cardName: String(data.cardName || ""),
              amount: Number(data.amount ?? 0),
              allowTeacher: Boolean(data.allowTeacher),
              isActive: data.isActive !== false,
            };
          })
          .filter((card) => card.isActive);

        setTeacherPlans(nextTeacherPlans);
        setCardDiscounts(nextCardDiscounts);
      } catch (error) {
        console.error("프로모션 견적 메타데이터 로드 오류:", error);
      }
    };

    fetchEstimateMeta();

    return () => {
      cancelled = true;
    };
  }, []);

  const packages = useMemo(() => getEnabledPromotionPackages(config), [config]);
  const activePackage =
    packages.find((item) => item.id === activePackageId) ?? packages[0];
  const entries = useMemo(
    () => (activePackage ? getPromotionPackageEntries(activePackage) : []),
    [activePackage],
  );
  const activeEntry =
    entries.find((entry) => entry.id === activeId) ?? entries[0];
  const isDiy = activeEntry?.id === "diy";

  useEffect(() => {
    if (!activePackageId && packages[0]) {
      setActivePackageId(packages[0].id);
    }
  }, [activePackageId, packages]);

  useEffect(() => {
    if (!entries.some((entry) => entry.id === activeId) && entries[0]) {
      setActiveId(entries[0].id);
    }
  }, [activeId, entries]);

  const selectedPromotionProducts = useMemo(() => {
    if (!activeEntry) return [];
    return activeEntry.products;
  }, [activeEntry]);
  const selectedPromotionProductsKey = useMemo(
    () => productListKey(selectedPromotionProducts),
    [selectedPromotionProducts],
  );

  useEffect(() => {
    setSelectedEstimateProducts([]);
    setSummaryCardSelections({});
    setEstimateModalOpen(false);
  }, [selectedPromotionProductsKey]);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      if (!selectedPromotionProducts.length) {
        setEstimateProducts([]);
        return;
      }

      setProductLoading(true);
      try {
        const models = Array.from(
          new Set(
            selectedPromotionProducts
              .map((product) => product.modelCode.trim())
              .filter(Boolean),
          ),
        );
        const middles = Array.from(
          new Set(
            selectedPromotionProducts
              .map((product) => product.category.trim())
              .filter(Boolean),
          ),
        );
        const createProductParams = (includeImages: boolean) =>
          new URLSearchParams({
            middles: middles.join(","),
            models: models.join(","),
            groupBy: "modelCode",
            includeImages: includeImages ? "true" : "false",
          });
        const params = createProductParams(false);
        const products = models.length
          ? await fetchPromotionProducts(params)
          : [];

        if (cancelled) return;

        const productMap = new Map(
          products.map((product) => [product.모델코드, product]),
        );
        const mergedProducts = selectedPromotionProducts
          .map((product) =>
            mergePromotionProductData(
              productMap.get(product.modelCode),
              product,
            ),
          )
          .filter((product): product is ProductSearchResult =>
            Boolean(product),
          );

        setEstimateProducts(mergedProducts);

        const needsThumbnailFallback = mergedProducts.some((product) =>
          isPlaceholderThumbnail(product.thumbnailUrl),
        );
        if (!needsThumbnailFallback || !models.length) return;

        const productsWithImages = await fetchPromotionProducts(
          createProductParams(true),
        );
        if (cancelled) return;

        const imageProductMap = new Map(
          productsWithImages.map((product) => [product.모델코드, product]),
        );
        setEstimateProducts(
          selectedPromotionProducts
            .map((product) =>
              mergePromotionProductData(
                imageProductMap.get(product.modelCode) ??
                  productMap.get(product.modelCode),
                product,
              ),
            )
            .filter((product): product is ProductSearchResult =>
              Boolean(product),
            ),
        );
      } catch (error) {
        console.error("프로모션 구성 제품 로드 오류:", error);
        if (!cancelled) setEstimateProducts([]);
      } finally {
        if (!cancelled) setProductLoading(false);
      }
    };

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, [selectedPromotionProducts, selectedPromotionProductsKey]);

  const groupedProducts = useMemo(() => {
    if (!activeEntry) return [];
    const groups = new Map<string, PromotionSetProduct[]>();
    activeEntry.products.forEach((product) => {
      const category = product.category || "기타";
      groups.set(category, [...(groups.get(category) ?? []), product]);
    });
    return Array.from(groups.entries()).map(([category, products]) => ({
      category,
      products,
    }));
  }, [activeEntry]);
  const estimateProductByModel = useMemo(
    () =>
      new Map(
        estimateProducts.map((product) => [
          String(product.모델코드 || "").trim(),
          product,
        ]),
      ),
    [estimateProducts],
  );
  const allowedPromotionCards = useMemo(
    () =>
      getAllowedPromotionCards(cardDiscounts, selectedEstimateProducts.length),
    [cardDiscounts, selectedEstimateProducts.length],
  );
  const promotionCardAppliedProducts = useMemo(
    () =>
      applyPromotionCardBundle(
        selectedEstimateProducts,
        cardDiscounts,
        summaryCardSelections,
      ),
    [cardDiscounts, selectedEstimateProducts, summaryCardSelections],
  );
  const summaryBaseMonthly = useMemo(
    () =>
      promotionCardAppliedProducts.reduce(
        (sum, product) => sum + getProductMonthlyBase(product),
        0,
      ),
    [promotionCardAppliedProducts],
  );
  const summaryTotalMonthly = useMemo(
    () =>
      promotionCardAppliedProducts.reduce(
        (sum, product) =>
          sum +
          (parseMoney(product.finalPrice) ||
            parseMoney(product.baseMonthly) ||
            parseMoney(product.selectedVariant?.할인후금액) ||
            parseMoney(product.selectedVariant?.정상가)),
        0,
      ),
    [promotionCardAppliedProducts],
  );
  const summaryCardDiscountTotal = Math.max(
    summaryBaseMonthly - summaryTotalMonthly,
    0,
  );

  useEffect(() => {
    const allowedIds = new Set(allowedPromotionCards.map((card) => card.id));

    setSummaryCardSelections((prev) => {
      const next: Record<string, string> = {};
      selectedEstimateProducts.forEach((product, index) => {
        const currentCardId = prev[product.모델코드];
        const defaultCard = getDefaultPromotionCardForIndex(
          cardDiscounts,
          index,
          selectedEstimateProducts.length,
        );

        next[product.모델코드] =
          currentCardId && allowedIds.has(currentCardId)
            ? currentCardId
            : defaultCard?.id || "";
      });

      return Object.keys(next).length === Object.keys(prev).length &&
        Object.entries(next).every(([key, value]) => prev[key] === value)
        ? prev
        : next;
    });
  }, [allowedPromotionCards, cardDiscounts, selectedEstimateProducts]);

  const handleAddEstimateProduct = (product: SelectedProduct) => {
    setSelectedEstimateProducts((prev) => {
      const exists = prev.some((item) => item.모델코드 === product.모델코드);
      return exists
        ? prev.map((item) =>
            item.모델코드 === product.모델코드 ? product : item,
          )
        : [...prev, product];
    });
  };

  const handleRemoveEstimateProduct = (modelCode: string) => {
    setSelectedEstimateProducts((prev) =>
      prev.filter((product) => product.모델코드 !== modelCode),
    );
    setSummaryCardSelections((prev) => {
      const next = { ...prev };
      delete next[modelCode];
      return next;
    });
  };

  const handleResetEstimate = () => {
    setSelectedEstimateProducts([]);
    setSummaryCardSelections({});
    setEstimateModalOpen(false);
  };

  const handleSummaryCardSelect = (modelCode: string, cardId: string) => {
    setSummaryCardSelections((prev) => {
      const next = { ...prev };
      if (!cardId) {
        delete next[modelCode];
      } else {
        next[modelCode] = cardId;
      }
      return next;
    });
  };

  if (loading) {
    return <LoadingBox>프로모션 세트를 불러오는 중입니다...</LoadingBox>;
  }

  if (!activePackage || !activeEntry) {
    return <LoadingBox>현재 오픈된 프로모션 세트가 없습니다.</LoadingBox>;
  }

  return (
    <Page>
      <PageInner>
        <PackagePanel aria-label="프로모션 패키지 선택">
          <PackageTitle>패키지 종류</PackageTitle>
          <PackageList>
            {packages.map((promotionPackage) => (
              <PackageButton
                key={promotionPackage.id}
                type="button"
                $active={promotionPackage.id === activePackage.id}
                onClick={() => {
                  setActivePackageId(promotionPackage.id);
                  setActiveId("");
                }}
              >
                <strong>{promotionPackage.name}</strong>
              </PackageButton>
            ))}
          </PackageList>
        </PackagePanel>

        <MainPanel>
          <Header>
            <TitleBlock>
              <h1>{config.labels.pageTitle}</h1>
              <p>{config.labels.pageDescription}</p>
            </TitleBlock>
          </Header>

          <Tabs role="tablist" aria-label="프로모션 세트 선택">
            {entries.map((entry) => (
              <TabButton
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={activeEntry.id === entry.id}
                $active={activeEntry.id === entry.id}
                onClick={() => setActiveId(entry.id)}
              >
                {entry.name}
              </TabButton>
            ))}
          </Tabs>

          <SetMeta>
            <strong>{activeEntry.description}</strong>
            <span>
              {isDiy ? config.labels.diyHelpText : config.labels.fixedSetNotice}
            </span>
          </SetMeta>

          <ProductSections>
            {groupedProducts.map(({ category, products }) => (
              <CategorySection key={category}>
                <CategoryHeader>
                  <h2>{category}</h2>
                  <span>
                    {isDiy
                      ? "원하는 제품을 옵션 설정 후 담아보세요"
                      : config.labels.setProductsTitle}
                  </span>
                </CategoryHeader>

                {(() => {
                  const categoryProducts = products
                    .map((product) =>
                      estimateProductByModel.get(product.modelCode),
                    )
                    .filter((product): product is ProductSearchResult =>
                      Boolean(product),
                    );

                  if (productLoading) {
                    return (
                      <EmptyBox>
                        구성 모델의 옵션을 불러오는 중입니다...
                      </EmptyBox>
                    );
                  }

                  if (!categoryProducts.length) {
                    return (
                      <EmptyBox>
                        {isDiy
                          ? "DIY 구성 모델의 옵션 정보를 찾을 수 없습니다."
                          : "구성 모델의 옵션 정보를 찾을 수 없습니다."}
                      </EmptyBox>
                    );
                  }

                  return (
                    <EstimateProductGrid>
                      {categoryProducts.map((product) => (
                        <EstimateProductCard
                          key={product.모델코드}
                          product={product}
                          displayMode="promotion"
                          optionsLocked
                          onAdd={(product) =>
                            handleAddEstimateProduct(product as SelectedProduct)
                          }
                          teacherPlans={teacherPlans}
                          cardDiscounts={[]}
                        />
                      ))}
                    </EstimateProductGrid>
                  );
                })()}
              </CategorySection>
            ))}
          </ProductSections>
        </MainPanel>

        <SummaryBackdrop
          $open={summaryOpen}
          onClick={() => setSummaryOpen(false)}
        />
        <SummaryPanel $open={summaryOpen}>
          <MobileSummaryToggle
            type="button"
            onClick={() => setSummaryOpen((prev) => !prev)}
          >
            <span>
              선택한 제품
              <strong>
                {selectedEstimateProducts.length
                  ? `월 ${formatPrice(summaryTotalMonthly)}`
                  : "0개"}
              </strong>
            </span>
            <b>{summaryOpen ? "접기" : "펼치기"}</b>
          </MobileSummaryToggle>
          <SummaryCard $open={summaryOpen}>
            <SummaryTitle>{config.labels.summaryTitle}</SummaryTitle>
            <SummarySection>
              <SummaryLabel>선택 패키지</SummaryLabel>
              <SetName>{activePackage.name}</SetName>
            </SummarySection>

            <SummarySection>
              <SummaryLabel>선택 세트</SummaryLabel>
              <SetName>{activeEntry.name}</SetName>
            </SummarySection>

            <SummarySection>
              <SummaryHeaderLine>
                <SummaryLabel>담은 제품</SummaryLabel>
                <span>{selectedEstimateProducts.length}개</span>
              </SummaryHeaderLine>
              {selectedEstimateProducts.length === 0 ? (
                <EmptySelection>
                  옵션 설정 후 견적에 담은 제품이 없습니다.
                </EmptySelection>
              ) : (
                <SelectedList>
                  {promotionCardAppliedProducts.map((product) => {
                    const selectedCardId =
                      summaryCardSelections[product.모델코드] || "";
                    const baseMonthly = getProductMonthlyBase(product);
                    const finalMonthly =
                      parseMoney(product.finalPrice) || baseMonthly;
                    const hasCardDiscount =
                      Boolean(product.selectedCardName) &&
                      finalMonthly !== baseMonthly;

                    return (
                      <SelectedItem key={product.모델코드}>
                        <SelectedInfo>
                          <strong>{product.상품명}</strong>
                          <ProductMeta>{product.모델코드}</ProductMeta>
                          <ItemPriceRows>
                            <ItemPriceRow>
                              <span>월 렌탈료</span>
                              <b>{formatPrice(baseMonthly)}</b>
                            </ItemPriceRow>
                            {hasCardDiscount && (
                              <ItemPriceRow $accent>
                                <span>총 체감요금</span>
                                <b>{formatPrice(finalMonthly)}</b>
                              </ItemPriceRow>
                            )}
                          </ItemPriceRows>
                          {allowedPromotionCards.length > 0 && (
                            <CardSelectBox>
                              <label htmlFor={`promo-card-${product.모델코드}`}>
                                제휴카드
                              </label>
                              <select
                                id={`promo-card-${product.모델코드}`}
                                value={selectedCardId}
                                onChange={(event) =>
                                  handleSummaryCardSelect(
                                    product.모델코드,
                                    event.target.value,
                                  )
                                }
                              >
                                <option value="">선택 안함</option>
                                {allowedPromotionCards.map((card) => (
                                  <option key={card.id} value={card.id}>
                                    {card.cardName} / 월{" "}
                                    {formatPrice(card.amount)} 할인
                                  </option>
                                ))}
                              </select>
                            </CardSelectBox>
                          )}
                          {product.selectedCardName && (
                            <CardApplyText>
                              {product.selectedCardName} 월{" "}
                              {formatPrice(
                                parseMoney(product.selectedCardAmount),
                              )}
                              할인 반영
                            </CardApplyText>
                          )}
                        </SelectedInfo>
                        <RemoveButton
                          type="button"
                          aria-label={`${product.상품명} 제거`}
                          onClick={() =>
                            handleRemoveEstimateProduct(product.모델코드)
                          }
                        >
                          삭제
                        </RemoveButton>
                      </SelectedItem>
                    );
                  })}
                </SelectedList>
              )}
            </SummarySection>

            {selectedEstimateProducts.length > 0 && (
              <SummaryTotal>
                <SummaryTotalRows>
                  <SummaryTotalRow>
                    <span>월 렌탈료 합계</span>
                    <b>{formatPrice(summaryBaseMonthly)}</b>
                  </SummaryTotalRow>
                  {summaryCardDiscountTotal > 0 && (
                    <SummaryTotalRow>
                      <span>제휴카드 할인</span>
                      <b>-{formatPrice(summaryCardDiscountTotal)}</b>
                    </SummaryTotalRow>
                  )}
                </SummaryTotalRows>
                <SummaryFinalTotal>
                  <span>총 체감요금</span>
                  <strong>{formatPrice(summaryTotalMonthly)}</strong>
                </SummaryFinalTotal>
              </SummaryTotal>
            )}

            <RequestButton
              type="button"
              disabled={selectedEstimateProducts.length === 0}
              onClick={() => setEstimateModalOpen(true)}
            >
              {config.labels.estimateButton}
            </RequestButton>
          </SummaryCard>
        </SummaryPanel>
      </PageInner>
      {estimateModalOpen && selectedEstimateProducts.length > 0 && (
        <EstimateModal
          products={promotionCardAppliedProducts}
          onReset={handleResetEstimate}
          onConfirm={() => undefined}
          onRemove={handleRemoveEstimateProduct}
          saveMeta={{
            estimateSource: "promotion-set",
            promotionPackageId: activePackage.id,
            promotionPackageName: activePackage.name,
            promotionSetId: activeEntry.id,
            promotionSetName: activeEntry.name,
          }}
        />
      )}
    </Page>
  );
}

const accent = "rgb(234, 25, 23)";

const LoadingBox = styled.main`
  min-height: 50vh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: #555;
`;

const Page = styled.main`
  min-height: calc(100vh - 93px);
  background: #f4f5f7;
  padding: 38px 24px 72px;

  @media (max-width: 768px) {
    padding: 18px 14px 96px;
  }
`;

const PageInner = styled.div`
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr) minmax(320px, 360px);
  gap: 24px;
  max-width: 1420px;
  margin: 0 auto;
  align-items: start;

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;
  }
`;

const PackagePanel = styled.aside`
  position: sticky;
  top: 24px;
  background: #fff;
  border: 1px solid #e7e8eb;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 10px 28px rgba(16, 24, 40, 0.04);

  @media (max-width: 1180px) {
    position: static;
  }
`;

const PackageTitle = styled.h2`
  margin: 0 0 16px;
  font-size: 18px;
  line-height: 1.3;
  font-weight: 900;
  color: #111;
`;

const PackageList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;

  @media (max-width: 1180px) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
`;

const PackageButton = styled.button<{ $active: boolean }>`
  width: 100%;
  min-height: 45px;
  padding: 0 16px;
  border: 1px solid ${({ $active }) => ($active ? accent : "#e1e3e8")};
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;

  &:hover {
    border-color: ${({ $active }) => ($active ? accent : "#c9ccd3")};
  }

  strong {
    display: block;
    font-size: 14px;
    line-height: 1.25;
    font-weight: 900;
    color: ${({ $active }) => ($active ? accent : "#111")};
  }
`;

const MainPanel = styled.section`
  background: #fff;
  border: 1px solid #e7e8eb;
  border-radius: 8px;
  padding: 34px 34px 36px;
  box-shadow: 0 10px 28px rgba(16, 24, 40, 0.04);

  @media (max-width: 640px) {
    padding: 22px 16px 24px;
  }
`;

const Header = styled.header`
  margin-bottom: 26px;
`;

const TitleBlock = styled.div`
  h1 {
    margin: 0 0 10px;
    font-size: 32px;
    line-height: 1.2;
    font-weight: 800;
    color: #111;
  }

  p {
    margin: 0;
    font-size: 15px;
    line-height: 1.6;
    color: #666;
  }

  @media (max-width: 640px) {
    h1 {
      font-size: 25px;
    }
  }
`;

const Tabs = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin-bottom: 18px;
`;

const TabButton = styled.button<{ $active: boolean }>`
  min-height: 50px;
  border: 1px solid ${({ $active }) => ($active ? accent : "#ddd")};
  border-radius: 6px;
  background: ${({ $active }) => ($active ? accent : "#fff")};
  color: ${({ $active }) => ($active ? "#fff" : "#222")};
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease;

  &:hover {
    border-color: ${accent};
  }
`;

const SetMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 30px;
  font-size: 13px;
  line-height: 1.6;
  color: #777;

  strong {
    font-size: 14px;
    color: #333;
  }
`;

const ProductSections = styled.div`
  display: flex;
  flex-direction: column;
  gap: 34px;
`;

const CategorySection = styled.section``;

const CategoryHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;

  h2 {
    margin: 0;
    font-size: 21px;
    font-weight: 800;
    color: #111;
  }

  span {
    font-size: 13px;
    color: #888;
  }
`;

const EstimateProductGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
  align-items: start;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const EmptyBox = styled.div`
  padding: 22px;
  border: 1px dashed #d7dbe3;
  border-radius: 8px;
  background: #fafbfc;
  font-size: 14px;
  line-height: 1.55;
  color: #777;
`;

const SummaryBackdrop = styled.div<{ $open: boolean }>`
  display: none;

  @media (max-width: 768px) {
    display: ${({ $open }) => ($open ? "block" : "none")};
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgba(17, 24, 39, 0.4);
  }
`;

const SummaryPanel = styled.aside<{ $open: boolean }>`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  padding: 0 12px 12px;
  pointer-events: none;

  @media (min-width: 769px) {
    position: sticky;
    top: 24px;
    padding: 0;
    pointer-events: auto;
  }

  @media (min-width: 769px) and (max-width: 1180px) {
    position: static;
  }
`;

const SummaryCard = styled.div<{ $open: boolean }>`
  background: #fff;
  border: 1px solid #e7e8eb;
  border-width: ${({ $open }) => ($open ? "1px" : "0")};
  border-radius: 8px 8px 0 0;
  max-height: ${({ $open }) => ($open ? "calc(70vh - 76px)" : "0")};
  padding: ${({ $open }) => ($open ? "18px 18px 20px" : "0 18px")};
  overflow-y: auto;
  pointer-events: auto;
  box-shadow: 0 10px 28px rgba(16, 24, 40, 0.04);
  transition:
    max-height 0.22s ease,
    padding-top 0.22s ease,
    padding-bottom 0.22s ease;

  @media (min-width: 769px) {
    max-height: none;
    padding: 24px;
    border-width: 1px;
    border-radius: 8px;
    overflow: visible;
  }
`;

const MobileSummaryToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  padding: 12px 16px;
  border: 1px solid #e7e8eb;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 -10px 24px rgba(16, 24, 40, 0.14);
  pointer-events: auto;
  cursor: pointer;

  span {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    font-size: 12px;
    font-weight: 800;
    color: #777;
  }

  strong {
    font-size: 20px;
    line-height: 1.1;
    font-weight: 900;
    color: ${accent};
  }

  b {
    min-width: 54px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: ${accent};
    color: #fff;
    font-size: 13px;
    font-weight: 900;
  }

  @media (min-width: 769px) {
    display: none;
  }
`;

const SummaryTitle = styled.h2`
  font-size: 20px;
  font-weight: 800;
  color: #111;
  margin-bottom: 20px;
`;

const SummarySection = styled.div`
  padding: 16px 0;
  border-top: 1px solid #f0f0f0;
`;

const SummaryLabel = styled.div`
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 800;
  color: #777;
`;

const SetName = styled.div`
  font-size: 18px;
  font-weight: 800;
  color: #111;
`;

const SummaryHeaderLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const EmptySelection = styled.div`
  padding: 18px 0;
  font-size: 14px;
  color: #888;
`;

const SelectedList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const SelectedItem = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 10px 0;
  border-bottom: 1px solid #f3f3f3;
  flex-direction: column-reverse;
`;

const SelectedInfo = styled.div`
  flex: 1 1 auto;
  min-width: 0;

  strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    line-height: 1.35;
    color: #222;
  }
`;

const ProductMeta = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 3px;
  font-size: 12px;
  color: #888;
`;

const ItemPriceRows = styled.div`
  display: grid;
  gap: 4px;
  margin-top: 8px;
  padding: 9px 10px;
  border-radius: 6px;
  background: #fafafa;
`;

const ItemPriceRow = styled.div<{ $accent?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;

  span {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 700;
    color: ${({ $accent }) => ($accent ? accent : "#777")};
  }

  b {
    flex: 0 0 auto;
    color: ${({ $accent }) => ($accent ? accent : "#222")};
    font-size: ${({ $accent }) => ($accent ? "14px" : "12px")};
    font-weight: 900;
    white-space: nowrap;
  }
`;

const CardSelectBox = styled.div`
  display: grid;
  gap: 5px;
  min-width: 0;
  margin-top: 9px;

  label {
    font-size: 11px;
    line-height: 1.3;
    font-weight: 800;
    color: #666;
  }

  select {
    width: 100%;
    min-width: 0;
    min-height: 34px;
    padding: 0 9px;
    border: 1px solid #dfe2e8;
    border-radius: 6px;
    background: #fff;
    color: #222;
    font-size: 12px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const CardApplyText = styled.em`
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 4px;
  font-style: normal;
  font-size: 12px;
  line-height: 1.4;
  color: ${accent};
`;

const RemoveButton = styled.button`
  flex: 0 0 auto;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid #e2e2e2;
  border-radius: 6px;
  background: #fff;
  color: ${accent};
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
`;

const SummaryTotal = styled.div`
  display: grid;
  gap: 12px;
  padding: 18px 0 2px;
  border-top: 1px solid #f0f0f0;
`;

const SummaryTotalRows = styled.div`
  display: grid;
  gap: 7px;
  padding: 12px;
  border-radius: 6px;
  background: #fafafa;
`;

const SummaryTotalRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 800;
    color: #777;
  }

  b {
    flex: 0 0 auto;
    color: #333;
    font-size: 13px;
    font-weight: 900;
    white-space: nowrap;
  }

  &:last-child b {
    color: ${accent};
  }
`;

const SummaryFinalTotal = styled.div`
  span {
    display: block;
    margin-bottom: 5px;
    font-size: 13px;
    font-weight: 900;
    color: #555;
  }

  strong {
    display: block;
    color: ${accent};
    font-size: 28px;
    line-height: 1.2;
    font-weight: 900;
  }
`;

const RequestButton = styled.button`
  width: 100%;
  min-height: 52px;
  margin-top: 16px;
  border-radius: 6px;
  background: ${accent};
  color: #fff;
  font-size: 16px;
  font-weight: 900;
  cursor: pointer;

  &:disabled {
    background: #d8d8d8;
    cursor: not-allowed;
  }
`;
