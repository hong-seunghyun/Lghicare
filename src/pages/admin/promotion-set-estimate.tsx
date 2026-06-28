"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  DEFAULT_PROMOTION_SET_CONFIG,
  PROMOTION_SET_CATEGORIES,
  PROMOTION_SET_CONFIG_COLLECTION,
  PROMOTION_SET_CONFIG_DOC_ID,
  PROMOTION_SET_TYPE_NAMES,
  ProductSearchResult,
  ProductSearchVariant,
  PromotionSetEstimateConfig,
  PromotionSetProduct,
  PromotionSetPackage,
  PromotionSetType,
  compactPromotionSetConfig,
  createPromotionSetProduct,
  getDefaultPromotionVariant,
  getPromotionPackageDiyProducts,
  getVariantLabel,
  getVariantMonthly,
  normalizePromotionSetConfig,
} from "@/lib/promotionSetEstimate";

type ProductTarget =
  | { type: "set"; packageId: string; setId: string }
  | { type: "diy"; packageId: string };

type ProductSearchResponse = {
  options?: ProductSearchResult[];
  error?: string;
};

const cloneConfig = (config: PromotionSetEstimateConfig) =>
  JSON.parse(JSON.stringify(config)) as PromotionSetEstimateConfig;

const productListKey = (products: PromotionSetProduct[]) =>
  products
    .map((product) => `${product.category}:${product.modelCode}`)
    .sort()
    .join("|");

const getVariantOptionKey = (variant: ProductSearchVariant, index: number) =>
  [
    index,
    variant.계약기간 || "",
    variant.서비스유형 || "",
    variant["서비스주기/월"] || "",
    variant["프로모션 대분류"] || "",
    variant.프로모션유형 || "",
    variant.프로모션명 || "",
    variant.할인후금액 || "",
    variant.할인전금액 || "",
    variant.정상가 || "",
  ].join("::");

const findVariantIndex = (
  variants: ProductSearchVariant[] | undefined,
  selectedVariant: ProductSearchVariant | undefined,
) => {
  if (!variants?.length || !selectedVariant) return -1;
  return variants.findIndex(
    (variant) =>
      String(variant.계약기간 || "") === String(selectedVariant.계약기간 || "") &&
      String(variant.서비스유형 || "") ===
        String(selectedVariant.서비스유형 || "") &&
      String(variant["서비스주기/월"] || "") ===
        String(selectedVariant["서비스주기/월"] || "") &&
      String(variant["프로모션 대분류"] || "") ===
        String(selectedVariant["프로모션 대분류"] || "") &&
      String(variant.프로모션유형 || "") ===
        String(selectedVariant.프로모션유형 || "") &&
      String(variant.프로모션명 || "") ===
        String(selectedVariant.프로모션명 || "") &&
      String(variant.할인후금액 || "") ===
        String(selectedVariant.할인후금액 || ""),
  );
};

const parseProductSearchResponse = (bodyText: string, contentType: string) => {
  if (!contentType.includes("application/json") || !bodyText) {
    return {} as ProductSearchResponse;
  }

  try {
    return JSON.parse(bodyText) as ProductSearchResponse;
  } catch {
    return {
      error: bodyText.trim().slice(0, 160) || "검색 응답을 해석할 수 없습니다.",
    };
  }
};

const createSetTemplates = (): PromotionSetType[] =>
  PROMOTION_SET_TYPE_NAMES.map((name) => ({
    id: name.toLowerCase(),
    name,
    description: `${name} 세트 구성`,
    enabled: true,
    products: [],
  }));

const createNewPackage = (): PromotionSetPackage => ({
  id: `package-${Date.now()}`,
  name: "새 프로모션",
  description: "프로모션 설명을 입력하세요.",
  enabled: true,
  sets: createSetTemplates(),
  diy: {
    enabled: true,
    name: "DIY",
    description: "원하는 제품을 자유롭게 선택",
    minSelections: 1,
    products: [],
  },
});

export default function AdminPromotionSetEstimatePage() {
  const [config, setConfig] = useState<PromotionSetEstimateConfig>(
    DEFAULT_PROMOTION_SET_CONFIG,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activePackageId, setActivePackageId] = useState(
    DEFAULT_PROMOTION_SET_CONFIG.packages[0]?.id ?? "",
  );
  const [activeSetId, setActiveSetId] = useState(
    DEFAULT_PROMOTION_SET_CONFIG.packages[0]?.sets[0]?.id ?? "",
  );
  const [target, setTarget] = useState<ProductTarget>({
    type: "set",
    packageId: DEFAULT_PROMOTION_SET_CONFIG.packages[0]?.id ?? "",
    setId: DEFAULT_PROMOTION_SET_CONFIG.packages[0]?.sets[0]?.id ?? "",
  });
  const [category, setCategory] = useState(PROMOTION_SET_CATEGORIES[0]);
  const [keyword, setKeyword] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [productOptionsByModel, setProductOptionsByModel] = useState<
    Record<string, ProductSearchResult>
  >({});
  const searchCacheRef = useRef<Record<string, ProductSearchResult[]>>({});
  const productOptionsCacheRef = useRef<Record<string, ProductSearchResult[]>>({});

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const snap = await getDoc(
          doc(
            db,
            PROMOTION_SET_CONFIG_COLLECTION,
            PROMOTION_SET_CONFIG_DOC_ID,
          ),
        );
        const nextConfig = snap.exists()
          ? normalizePromotionSetConfig(snap.data())
          : DEFAULT_PROMOTION_SET_CONFIG;

        if (!cancelled) {
          setConfig(nextConfig);
          const firstPackage = nextConfig.packages[0];
          const firstSetId = firstPackage?.sets[0]?.id ?? "";
          setActivePackageId(firstPackage?.id ?? "");
          setActiveSetId(firstSetId);
          setTarget(
            firstPackage && firstSetId
              ? {
                  type: "set",
                  packageId: firstPackage.id,
                  setId: firstSetId,
                }
              : { type: "diy", packageId: firstPackage?.id ?? "" },
          );
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

  const activePackage =
    config.packages.find((item) => item.id === activePackageId) ??
    config.packages[0];
  const activeSet = activePackage?.sets.find((set) => set.id === activeSetId);
  const targetProducts = useMemo(() => {
    const targetPackage = config.packages.find(
      (promotionPackage) => promotionPackage.id === target.packageId,
    );
    if (!targetPackage) return [];
    if (target.type === "diy") return getPromotionPackageDiyProducts(targetPackage);
    return targetPackage.sets.find((set) => set.id === target.setId)?.products ?? [];
  }, [config, target]);
  const targetProductsKey = useMemo(
    () => productListKey(targetProducts),
    [targetProducts],
  );

  const updateConfig = useCallback((updater: (draft: PromotionSetEstimateConfig) => void) => {
    setConfig((prev) => {
      const draft = cloneConfig(prev);
      updater(draft);
      return draft;
    });
  }, []);

  const updateActivePackage = (patch: Partial<PromotionSetPackage>) => {
    updateConfig((draft) => {
      draft.packages = draft.packages.map((promotionPackage) =>
        promotionPackage.id === activePackageId
          ? { ...promotionPackage, ...patch }
          : promotionPackage,
      );
    });
  };

  const updateActiveSet = (patch: Partial<PromotionSetType>) => {
    updateConfig((draft) => {
      draft.packages = draft.packages.map((promotionPackage) =>
        promotionPackage.id === activePackageId
          ? {
              ...promotionPackage,
              sets: promotionPackage.sets.map((set) =>
                set.id === activeSetId ? { ...set, ...patch } : set,
              ),
            }
          : promotionPackage,
      );
    });
  };

  useEffect(() => {
    if (target.type === "diy" || targetProducts.length === 0) return;

    let cancelled = false;

    const loadTargetProductOptions = async () => {
      try {
        const models = Array.from(
          new Set(
            targetProducts
              .map((product) => product.modelCode.trim())
              .filter(Boolean),
          ),
        );
        const middles = Array.from(
          new Set(
            targetProducts
              .map((product) => product.category.trim())
              .filter(Boolean),
          ),
        );
        if (!models.length || !middles.length) return;

        const params = new URLSearchParams({
          middles: middles.join(","),
          models: models.join(","),
          groupBy: "modelCode",
          includeImages: "false",
        });
        const cacheKey = params.toString();
        const cached = productOptionsCacheRef.current[cacheKey];
        let products = cached;

        if (!products) {
          const response = await fetch(`/api/products?${params.toString()}`);
          const contentType = response.headers.get("content-type") || "";
          const bodyText = await response.text();
          const data = parseProductSearchResponse(bodyText, contentType);
          if (!response.ok) {
            throw new Error(
              data.error ||
                bodyText.trim().slice(0, 160) ||
                `HTTP ${response.status}`,
            );
          }
          products = Array.isArray(data.options) ? data.options : [];
          productOptionsCacheRef.current[cacheKey] = products;
        }

        if (cancelled) return;

        const optionMap = Object.fromEntries(
          products.map((product) => [product.모델코드, product]),
        ) as Record<string, ProductSearchResult>;
        setProductOptionsByModel((prev) => ({ ...prev, ...optionMap }));

        const needsHydration = targetProducts.some((product) => {
          const optionProduct = optionMap[product.modelCode];
          return Boolean(
            optionProduct?.variants?.length &&
              (!product.selectedVariant || !product.variants?.length),
          );
        });

        if (!needsHydration) return;

        updateConfig((draft) => {
          draft.packages = draft.packages.map((promotionPackage) => {
            if (promotionPackage.id !== target.packageId) {
              return promotionPackage;
            }

            return {
              ...promotionPackage,
              sets: promotionPackage.sets.map((set) => {
                if (target.type !== "set" || set.id !== target.setId) {
                  return set;
                }

                return {
                  ...set,
                  products: set.products.map((product) => {
                    const optionProduct = optionMap[product.modelCode];
                    const variants = optionProduct?.variants ?? product.variants;
                    const selectedVariant =
                      product.selectedVariant ??
                      getDefaultPromotionVariant(variants);
                    const monthly = getVariantMonthly(selectedVariant);

                    if (!variants && !selectedVariant) return product;

                    return {
                      ...product,
                      variants,
                      selectedVariant,
                      ...(monthly
                        ? { baseMonthly: monthly, finalMonthly: monthly }
                        : {}),
                    };
                  }),
                };
              }),
            };
          });
        });
      } catch (error) {
        console.error("프로모션 구성 상품 옵션 로드 오류:", error);
      }
    };

    loadTargetProductOptions();

    return () => {
      cancelled = true;
    };
  }, [target, targetProducts, targetProductsKey, updateConfig]);

  const selectPackage = (packageId: string) => {
    const nextPackage = config.packages.find((item) => item.id === packageId);
    const firstSetId = nextPackage?.sets[0]?.id ?? "";
    setActivePackageId(packageId);
    setActiveSetId(firstSetId);
    setTarget(
      firstSetId
        ? { type: "set", packageId, setId: firstSetId }
        : { type: "diy", packageId },
    );
  };

  const addPackage = () => {
    const nextPackage = createNewPackage();
    updateConfig((draft) => {
      draft.packages.push(nextPackage);
    });
    setActivePackageId(nextPackage.id);
    setActiveSetId(nextPackage.sets[0]?.id ?? "");
    setTarget({
      type: "set",
      packageId: nextPackage.id,
      setId: nextPackage.sets[0]?.id ?? "",
    });
  };

  const removeActivePackage = () => {
    if (
      !activePackage ||
      !confirm(`${activePackage.name} 프로모션을 삭제하시겠어요?`)
    ) {
      return;
    }
    const remaining = config.packages.filter(
      (promotionPackage) => promotionPackage.id !== activePackage.id,
    );
    updateConfig((draft) => {
      draft.packages = remaining;
    });
    const nextPackage = remaining[0];
    const nextSetId = nextPackage?.sets[0]?.id ?? "";
    setActivePackageId(nextPackage?.id ?? "");
    setActiveSetId(nextSetId);
    setTarget(
      nextPackage && nextSetId
        ? { type: "set", packageId: nextPackage.id, setId: nextSetId }
        : { type: "diy", packageId: nextPackage?.id ?? "" },
    );
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const nextConfig = compactPromotionSetConfig(cloneConfig(config));
      await setDoc(
        doc(db, PROMOTION_SET_CONFIG_COLLECTION, PROMOTION_SET_CONFIG_DOC_ID),
        {
          ...nextConfig,
          updatedAt: new Date(),
        },
      );
      setConfig(nextConfig);
      alert("프로모션 세트 설정이 저장되었습니다.");
    } catch (error) {
      console.error("프로모션 세트 설정 저장 오류:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const searchProducts = async () => {
    setSearching(true);
    try {
      const params = new URLSearchParams({
        middle: category,
        groupBy: "modelCode",
        includeImages: "false",
      });
      const trimmed = keyword.trim();
      if (trimmed) params.set("q", trimmed);
      const cacheKey = params.toString();
      const cached = searchCacheRef.current[cacheKey];
      if (cached) {
        setResults(cached);
        setSearching(false);
        return;
      }

      const response = await fetch(`/api/products?${params.toString()}`);
      const contentType = response.headers.get("content-type") || "";
      const bodyText = await response.text();
      const data = parseProductSearchResponse(bodyText, contentType);

      if (!response.ok) {
        const message =
          data.error ||
          bodyText.trim().slice(0, 160) ||
          `HTTP ${response.status}`;
        throw new Error(message);
      }

      const nextResults = Array.isArray(data.options) ? data.options : [];
      searchCacheRef.current[cacheKey] = nextResults;
      setResults(nextResults);
    } catch (error) {
      console.error("제품 검색 오류:", error);
      const message = error instanceof Error ? error.message : String(error);
      alert(`제품 검색 중 오류가 발생했습니다.\n${message}`);
    } finally {
      setSearching(false);
    }
  };

  const addProduct = (result: ProductSearchResult) => {
    const product = createPromotionSetProduct(result);
    if (result.모델코드) {
      setProductOptionsByModel((prev) => ({
        ...prev,
        [result.모델코드]: result,
      }));
    }

    updateConfig((draft) => {
      draft.packages = draft.packages.map((promotionPackage) => {
        if (promotionPackage.id !== target.packageId) return promotionPackage;
        if (target.type === "diy") {
          const exists = promotionPackage.diy.products.some(
            (item) => item.modelCode === product.modelCode,
          );
          if (exists) return promotionPackage;

          return {
            ...promotionPackage,
            diy: {
              ...promotionPackage.diy,
              products: [...promotionPackage.diy.products, product],
            },
          };
        }

        return {
          ...promotionPackage,
          sets: promotionPackage.sets.map((set) =>
            set.id === target.setId &&
            !set.products.some((item) => item.modelCode === product.modelCode)
              ? { ...set, products: [...set.products, product] }
              : set,
          ),
        };
      });
    });
  };

  const updateProductVariant = (
    productId: string,
    variant: ProductSearchVariant,
  ) => {
    const monthly = getVariantMonthly(variant);

    updateConfig((draft) => {
      draft.packages = draft.packages.map((promotionPackage) => {
        if (promotionPackage.id !== target.packageId) return promotionPackage;
        if (target.type === "diy") return promotionPackage;

        return {
          ...promotionPackage,
          sets: promotionPackage.sets.map((set) =>
            set.id === target.setId
              ? {
                  ...set,
                  products: set.products.map((product) =>
                    product.id === productId
                      ? {
                          ...product,
                          selectedVariant: variant,
                          ...(monthly
                            ? { baseMonthly: monthly, finalMonthly: monthly }
                            : {}),
                        }
                      : product,
                  ),
                }
              : set,
          ),
        };
      });
    });
  };

  const removeProduct = (productId: string) => {
    updateConfig((draft) => {
      draft.packages = draft.packages.map((promotionPackage) => {
        if (promotionPackage.id !== target.packageId) return promotionPackage;
        if (target.type === "diy") {
          return {
            ...promotionPackage,
            diy: {
              ...promotionPackage.diy,
              products: promotionPackage.diy.products.filter(
                (product) => product.id !== productId,
              ),
            },
          };
        }

        return {
          ...promotionPackage,
          sets: promotionPackage.sets.map((set) =>
            set.id === target.setId
              ? {
                  ...set,
                  products: set.products.filter(
                    (product) => product.id !== productId,
                  ),
                }
              : set,
          ),
        };
      });
    });
  };

  if (loading) {
    return <Page>프로모션 세트 설정을 불러오는 중입니다...</Page>;
  }

  return (
    <Page>
      <Header>
        <TitleBlock>
          <h1>프로모션 세트 견적 관리</h1>
          <p>
            공개 페이지에서 노출할 프로모션, 세트 유형, 구성 모델을 관리합니다.
          </p>
        </TitleBlock>
        <ActionGroup>
          <PreviewLink href="/promotion-set-estimate" target="_blank">
            공개 페이지 보기
          </PreviewLink>
          <SaveButton type="button" disabled={saving} onClick={saveConfig}>
            {saving ? "저장 중..." : "저장"}
          </SaveButton>
        </ActionGroup>
      </Header>

      <Grid>
        <Panel>
          <PanelTitle>공개 문구</PanelTitle>
          <FormGrid>
            <Field>
              <label>페이지 제목</label>
              <input
                value={config.labels.pageTitle}
                onChange={(event) =>
                  updateConfig((draft) => {
                    draft.labels.pageTitle = event.target.value;
                  })
                }
              />
            </Field>
            <Field>
              <label>페이지 설명</label>
              <input
                value={config.labels.pageDescription}
                onChange={(event) =>
                  updateConfig((draft) => {
                    draft.labels.pageDescription = event.target.value;
                  })
                }
              />
            </Field>
            <Field>
              <label>견적 버튼명</label>
              <input
                value={config.labels.estimateButton}
                onChange={(event) =>
                  updateConfig((draft) => {
                    draft.labels.estimateButton = event.target.value;
                  })
                }
              />
            </Field>
            <Field>
              <label>요약 타이틀</label>
              <input
                value={config.labels.summaryTitle}
                onChange={(event) =>
                  updateConfig((draft) => {
                    draft.labels.summaryTitle = event.target.value;
                  })
                }
              />
            </Field>
            <Field>
              <label>고정 세트 안내</label>
              <input
                value={config.labels.fixedSetNotice}
                onChange={(event) =>
                  updateConfig((draft) => {
                    draft.labels.fixedSetNotice = event.target.value;
                  })
                }
              />
            </Field>
            <Field>
              <label>DIY 안내</label>
              <input
                value={config.labels.diyHelpText}
                onChange={(event) =>
                  updateConfig((draft) => {
                    draft.labels.diyHelpText = event.target.value;
                  })
                }
              />
            </Field>
          </FormGrid>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>프로모션명</PanelTitle>
            <SmallButton type="button" onClick={addPackage}>
              프로모션 추가
            </SmallButton>
          </PanelHeader>

          <SetTabs>
            {config.packages.map((promotionPackage) => (
              <SetTab
                key={promotionPackage.id}
                type="button"
                $active={promotionPackage.id === activePackageId}
                onClick={() => selectPackage(promotionPackage.id)}
              >
                {promotionPackage.name}
              </SetTab>
            ))}
          </SetTabs>

          {activePackage && (
            <FormGrid>
              <Field>
                <label>프로모션명</label>
                <input
                  value={activePackage.name}
                  onChange={(event) =>
                    updateActivePackage({ name: event.target.value })
                  }
                />
              </Field>
              <Field>
                <label>프로모션 설명</label>
                <input
                  value={activePackage.description}
                  onChange={(event) =>
                    updateActivePackage({ description: event.target.value })
                  }
                />
              </Field>
              <CheckField>
                <input
                  id="active-package-enabled"
                  type="checkbox"
                  checked={activePackage.enabled}
                  onChange={(event) =>
                    updateActivePackage({ enabled: event.target.checked })
                  }
                />
                <label htmlFor="active-package-enabled">공개 페이지에 노출</label>
              </CheckField>
              <DangerButton type="button" onClick={removeActivePackage}>
                현재 프로모션 삭제
              </DangerButton>
            </FormGrid>
          )}
        </Panel>

        <Panel>
          <PanelTitle>세트 타입 구성</PanelTitle>
          {activePackage && (
            <SetTabs>
              {activePackage.sets.map((set) => (
                <SetTab
                  key={set.id}
                  type="button"
                  $active={target.type === "set" && set.id === activeSetId}
                  onClick={() => {
                    setActiveSetId(set.id);
                    setTarget({
                      type: "set",
                      packageId: activePackage.id,
                      setId: set.id,
                    });
                  }}
                >
                  {set.name}
                </SetTab>
              ))}
              <SetTab
                type="button"
                $active={target.type === "diy"}
                onClick={() =>
                  setTarget({ type: "diy", packageId: activePackage.id })
                }
              >
                {activePackage.diy.name}
              </SetTab>
            </SetTabs>
          )}

          {activeSet && target.type === "set" && (
            <FormGrid>
              <Field>
                <label>세트명</label>
                <input
                  value={activeSet.name}
                  onChange={(event) => updateActiveSet({ name: event.target.value })}
                />
              </Field>
              <Field>
                <label>세트 설명</label>
                <input
                  value={activeSet.description}
                  onChange={(event) =>
                    updateActiveSet({ description: event.target.value })
                  }
                />
              </Field>
              <CheckField>
                <input
                  id="active-set-enabled"
                  type="checkbox"
                  checked={activeSet.enabled}
                  onChange={(event) =>
                    updateActiveSet({ enabled: event.target.checked })
                  }
                />
                <label htmlFor="active-set-enabled">공개 페이지에 노출</label>
              </CheckField>
            </FormGrid>
          )}

          {activePackage && target.type === "diy" && (
            <FormGrid>
              <CheckField>
                <input
                  id="diy-enabled"
                  type="checkbox"
                  checked={activePackage.diy.enabled}
                  onChange={(event) =>
                    updateConfig((draft) => {
                      draft.packages = draft.packages.map((promotionPackage) =>
                        promotionPackage.id === activePackage.id
                          ? {
                              ...promotionPackage,
                              diy: {
                                ...promotionPackage.diy,
                                enabled: event.target.checked,
                              },
                            }
                          : promotionPackage,
                      );
                    })
                  }
                />
                <label htmlFor="diy-enabled">DIY 골라담기 사용</label>
              </CheckField>
              <Field>
                <label>DIY 명칭</label>
                <input
                  value={activePackage.diy.name}
                  onChange={(event) =>
                    updateConfig((draft) => {
                      draft.packages = draft.packages.map((promotionPackage) =>
                        promotionPackage.id === activePackage.id
                          ? {
                              ...promotionPackage,
                              diy: {
                                ...promotionPackage.diy,
                                name: event.target.value,
                              },
                            }
                          : promotionPackage,
                      );
                    })
                  }
                />
              </Field>
              <Field>
                <label>DIY 설명</label>
                <input
                  value={activePackage.diy.description}
                  onChange={(event) =>
                    updateConfig((draft) => {
                      draft.packages = draft.packages.map((promotionPackage) =>
                        promotionPackage.id === activePackage.id
                          ? {
                              ...promotionPackage,
                              diy: {
                                ...promotionPackage.diy,
                                description: event.target.value,
                              },
                            }
                          : promotionPackage,
                      );
                    })
                  }
                />
              </Field>
              <Field>
                <label>최소 선택 수</label>
                <input
                  type="number"
                  min={1}
                  value={activePackage.diy.minSelections}
                  onChange={(event) =>
                    updateConfig((draft) => {
                      draft.packages = draft.packages.map((promotionPackage) =>
                        promotionPackage.id === activePackage.id
                          ? {
                              ...promotionPackage,
                              diy: {
                                ...promotionPackage.diy,
                                minSelections: Math.max(
                                  Number(event.target.value) || 1,
                                  1,
                                ),
                              },
                            }
                          : promotionPackage,
                      );
                    })
                  }
                />
              </Field>
            </FormGrid>
          )}
        </Panel>

        <Panel>
          <PanelTitle>담긴 제품</PanelTitle>
          {target.type === "diy" && (
            <EmptyBox>
              DIY는 Essential, Value, Premium 세트에 담긴 전 제품이 자동으로
              노출됩니다. 모델 관리는 각 세트 탭에서 진행하세요.
            </EmptyBox>
          )}
          {targetProducts.length === 0 ? (
            <EmptyBox>아직 담긴 제품이 없습니다.</EmptyBox>
          ) : (
            <SelectedProductList>
              {targetProducts.map((product) => {
                const optionProduct = productOptionsByModel[product.modelCode];
                const variants = optionProduct?.variants ?? product.variants ?? [];
                const selectedVariant =
                  (product.selectedVariant as ProductSearchVariant | undefined) ??
                  getDefaultPromotionVariant(variants);
                const selectedIndex = findVariantIndex(
                  variants,
                  selectedVariant,
                );

                return (
                  <SelectedProductItem key={product.id}>
                    <ImageBox>
                      <Image
                        src={product.thumbnailUrl || "/placeholder.png"}
                        alt={product.productName}
                        width={84}
                        height={84}
                        unoptimized
                      />
                    </ImageBox>
                    <SelectedInfo>
                      <strong>{product.productName}</strong>
                      <span>{product.category} · {product.modelCode}</span>
                      {target.type !== "diy" && (
                        <VariantSelectWrap>
                          <label htmlFor={`promotion-option-${product.id}`}>
                            고정 옵션
                          </label>
                          <select
                            id={`promotion-option-${product.id}`}
                            value={selectedIndex >= 0 ? String(selectedIndex) : ""}
                            disabled={!variants.length}
                            onChange={(event) => {
                              const nextVariant =
                                variants[Number(event.target.value)];
                              if (nextVariant) {
                                updateProductVariant(product.id, nextVariant);
                              }
                            }}
                          >
                            {!variants.length && (
                              <option value="">옵션을 불러오는 중</option>
                            )}
                            {variants.map((variant, index) => (
                              <option
                                key={getVariantOptionKey(variant, index)}
                                value={index}
                              >
                                {getVariantLabel(variant)}
                              </option>
                            ))}
                          </select>
                        </VariantSelectWrap>
                      )}
                      {target.type === "diy" && selectedVariant && (
                        <FixedOptionText>
                          {getVariantLabel(selectedVariant)}
                        </FixedOptionText>
                      )}
                    </SelectedInfo>
                    {target.type !== "diy" && (
                      <DangerButton
                        type="button"
                        onClick={() => removeProduct(product.id)}
                      >
                        삭제
                      </DangerButton>
                    )}
                  </SelectedProductItem>
                );
              })}
            </SelectedProductList>
          )}
        </Panel>

        {target.type !== "diy" && (
          <Panel>
            <PanelTitle>제품 추가</PanelTitle>
            <SearchBar>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {PROMOTION_SET_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <input
                value={keyword}
                placeholder="상품명 또는 모델코드"
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    searchProducts();
                  }
                }}
              />
              <SmallButton type="button" disabled={searching} onClick={searchProducts}>
                {searching ? "검색 중..." : "검색"}
              </SmallButton>
            </SearchBar>

            <ResultList>
              {results.map((result) => (
                <ResultItem key={result.모델코드}>
                  <ImageBox>
                    <Image
                      src={result.thumbnailUrl || "/placeholder.png"}
                      alt={result.상품명}
                      width={88}
                      height={88}
                      unoptimized
                    />
                  </ImageBox>
                  <ResultInfo>
                    <strong>{result.상품명}</strong>
                    <span>{result.중분류 || category} · {result.모델코드}</span>
                  </ResultInfo>
                  <SmallButton type="button" onClick={() => addProduct(result)}>
                    담기
                  </SmallButton>
                </ResultItem>
              ))}
            </ResultList>
          </Panel>
        )}
      </Grid>
    </Page>
  );
}

const accent = "rgb(234, 25, 23)";

const Page = styled.main`
  min-height: 100%;
  padding: 30px 28px 48px;
  background: #f4f5f7;
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  max-width: 1280px;
  margin: 0 auto 24px;

  @media (max-width: 720px) {
    flex-direction: column;
  }
`;

const TitleBlock = styled.div`
  h1 {
    margin: 0 0 8px;
    font-size: 28px;
    font-weight: 800;
    color: #111;
  }

  p {
    font-size: 14px;
    color: #666;
  }
`;

const ActionGroup = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const PreviewLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  font-size: 14px;
  font-weight: 700;
  color: #222;
`;

const SaveButton = styled.button`
  min-height: 42px;
  padding: 0 22px;
  border-radius: 6px;
  background: ${accent};
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    background: #ccc;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  max-width: 1280px;
  margin: 0 auto;

  > section:first-child,
  > section:nth-child(4),
  > section:last-child {
    grid-column: 1 / -1;
  }

  @media (max-width: 980px) {
    grid-template-columns: minmax(0, 1fr);

    > section:first-child,
    > section:nth-child(4),
    > section:last-child {
      grid-column: auto;
    }
  }
`;

const Panel = styled.section`
  background: #fff;
  border: 1px solid #e7e8eb;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 10px 28px rgba(16, 24, 40, 0.04);
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;

  h2 {
    margin-bottom: 0;
  }
`;

const PanelTitle = styled.h2`
  margin-bottom: 16px;
  font-size: 18px;
  font-weight: 800;
  color: #111;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 7px;

  label {
    font-size: 13px;
    font-weight: 800;
    color: #555;
  }

  input,
  select {
    height: 42px;
    border: 1px solid #dcdfe5;
    border-radius: 6px;
    padding: 0 12px;
    background: #fff;
    color: #222;
  }
`;

const CheckField = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;

  input {
    width: 16px;
    height: 16px;
  }

  label {
    font-size: 14px;
    font-weight: 700;
    color: #333;
  }
`;

const SetTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
`;

const SetTab = styled.button<{ $active: boolean }>`
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid ${({ $active }) => ($active ? accent : "#ddd")};
  border-radius: 6px;
  background: ${({ $active }) => ($active ? accent : "#fff")};
  color: ${({ $active }) => ($active ? "#fff" : "#222")};
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
`;

const SmallButton = styled.button`
  min-height: 38px;
  padding: 0 14px;
  border-radius: 6px;
  background: #222;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    background: #bbb;
  }
`;

const DangerButton = styled.button`
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #e2e2e2;
  border-radius: 6px;
  background: #fff;
  color: ${accent};
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
`;

const EmptyBox = styled.div`
  padding: 18px;
  border: 1px dashed #d6d9df;
  border-radius: 8px;
  background: #fafbfc;
  color: #777;
  font-size: 14px;
  line-height: 1.55;

  & + div {
    margin-top: 12px;
  }
`;

const SelectedProductList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SelectedProductItem = styled.div`
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) auto;
  gap: 16px;
  align-items: start;
  padding: 16px;
  border: 1px solid #e8eaee;
  border-radius: 8px;
  background: #fff;

  @media (max-width: 720px) {
    grid-template-columns: 84px minmax(0, 1fr);

    > button {
      grid-column: 2;
      width: fit-content;
    }
  }
`;

const ImageBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  border-radius: 6px;
  background: #f8f9fb;

  img {
    object-fit: contain;
  }
`;

const SelectedInfo = styled.div`
  min-width: 0;

  strong {
    display: block;
    font-size: 15px;
    line-height: 1.35;
    font-weight: 900;
    color: #111;
  }

  span {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: #777;
  }

`;

const VariantSelectWrap = styled.div`
  display: grid;
  gap: 6px;
  margin-top: 10px;

  label {
    font-size: 12px;
    font-weight: 800;
    color: #555;
  }

  select {
    width: 100%;
    min-height: 38px;
    border: 1px solid #dcdfe5;
    border-radius: 6px;
    padding: 0 10px;
    background: #fff;
    color: #222;
    font-size: 13px;
  }
`;

const FixedOptionText = styled.em`
  display: block;
  margin-top: 8px;
  color: #555;
  font-size: 12px;
  font-style: normal;
  line-height: 1.45;
`;

const SearchBar = styled.div`
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) auto;
  gap: 8px;
  margin-bottom: 14px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }

  input,
  select {
    height: 42px;
    border: 1px solid #dcdfe5;
    border-radius: 6px;
    padding: 0 12px;
    background: #fff;
  }
`;

const ResultList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ResultItem = styled.div`
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr) auto;
  gap: 16px;
  align-items: start;
  padding: 16px;
  border: 1px solid #e8eaee;
  border-radius: 8px;
  background: #fff;

  @media (max-width: 820px) {
    grid-template-columns: 96px minmax(0, 1fr);

    > button {
      grid-column: 2;
      width: fit-content;
    }
  }
`;

const ResultInfo = styled.div`
  min-width: 0;

  strong {
    display: block;
    font-size: 14px;
    color: #111;
  }

  span {
    display: block;
    margin: 4px 0 8px;
    font-size: 12px;
    color: #777;
  }

  select {
    width: 100%;
    height: 36px;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 0 10px;
    background: #fff;
  }
`;
