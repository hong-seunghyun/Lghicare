/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  PRODUCT_CATEGORY_OPTIONS,
  fetchThemeCategoryPreviews,
  parseModelNames,
} from "@/lib/mainThemeProducts";
import type { ThemeCategoryConfig, ThemeCategoryPreview } from "@/types/mainPage";

type ThemeCategoryForm = ThemeCategoryConfig & {
  modelText: string;
};

const createCategory = (index: number): ThemeCategoryForm => ({
  id: `theme-${Date.now()}-${index}`,
  label: PRODUCT_CATEGORY_OPTIONS[0],
  sheetName: PRODUCT_CATEGORY_OPTIONS[0],
  status: "active",
  priority: index + 1,
  modelNames: [],
  modelText: "",
});

const toConfig = (category: ThemeCategoryForm): ThemeCategoryConfig => ({
  id: category.id,
  label: category.label.trim() || category.sheetName,
  sheetName: category.sheetName,
  status: category.status,
  priority: Number(category.priority) || 1,
  modelNames: parseModelNames(category.modelText),
});

export default function ThemeProductsAdminPage() {
  const [categories, setCategories] = useState<ThemeCategoryForm[]>([]);
  const [previews, setPreviews] = useState<ThemeCategoryPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const configCategories = useMemo(
    () => categories.map(toConfig).sort((a, b) => a.priority - b.priority),
    [categories],
  );

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const snap = await getDoc(doc(db, "mainThemeProducts", "config"));
      if (!snap.exists()) {
        setCategories([createCategory(0)]);
        return;
      }

      const data = snap.data() as { categories?: ThemeCategoryConfig[] };
      const nextCategories = (data.categories ?? []).map((category, index) => ({
        ...category,
        id: category.id || `theme-${index}`,
        status: category.status ?? "active",
        priority: category.priority ?? index + 1,
        modelText: (category.modelNames ?? []).join("\n"),
      }));
      setCategories(nextCategories.length > 0 ? nextCategories : [createCategory(0)]);
    } catch (err) {
      console.error("theme config load error:", err);
      setError("금주의 테마상품 설정을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const updateCategory = (
    id: string,
    updater: (category: ThemeCategoryForm) => ThemeCategoryForm,
  ) => {
    setCategories((prev) =>
      prev.map((category) => (category.id === id ? updater(category) : category)),
    );
  };

  const addCategory = () => {
    setCategories((prev) => [...prev, createCategory(prev.length)]);
  };

  const removeCategory = (id: string) => {
    if (!window.confirm("카테고리를 삭제하시겠습니까?")) return;
    setCategories((prev) => prev.filter((category) => category.id !== id));
  };

  const handlePreview = async () => {
    try {
      setPreviewLoading(true);
      setError(null);
      setMessage(null);
      const nextPreviews = await fetchThemeCategoryPreviews(configCategories);
      setPreviews(nextPreviews);
    } catch (err) {
      console.error("theme preview error:", err);
      setError("상품 미리보기를 불러오지 못했습니다.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      await setDoc(doc(db, "mainThemeProducts", "config"), {
        categories: configCategories,
        updatedAt: serverTimestamp(),
      });
      setMessage("저장되었습니다. 메인 페이지에 즉시 반영됩니다.");
      await handlePreview();
    } catch (err) {
      console.error("theme config save error:", err);
      setError("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <HeaderRow>
        <div>
          <Title>금주의 테마상품 관리</Title>
          <SubTitle>
            활성화된 카테고리와 입력한 모델명 순서대로 메인에 노출됩니다.
          </SubTitle>
        </div>
        <ButtonGroup>
          <SecondaryButton type="button" onClick={handlePreview} disabled={previewLoading}>
            {previewLoading ? "미리보기 중..." : "상품 미리보기"}
          </SecondaryButton>
          <PrimaryButton type="button" onClick={handleSave} disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </PrimaryButton>
        </ButtonGroup>
      </HeaderRow>

      {loading ? (
        <InfoText>설정을 불러오는 중입니다...</InfoText>
      ) : (
        <LayoutGrid>
          <ConfigPanel>
            <SectionHeader>
              <SectionTitle>카테고리 설정</SectionTitle>
              <SmallButton type="button" onClick={addCategory}>
                카테고리 추가
              </SmallButton>
            </SectionHeader>

            <CategoryList>
              {categories.map((category) => (
                <CategoryCard key={category.id}>
                  <CardTop>
                    <StatusButton
                      type="button"
                      $active={category.status === "active"}
                      onClick={() =>
                        updateCategory(category.id, (item) => ({
                          ...item,
                          status:
                            item.status === "active" ? "inactive" : "active",
                        }))
                      }
                    >
                      {category.status === "active" ? "활성" : "비활성"}
                    </StatusButton>
                    <DangerTextButton
                      type="button"
                      onClick={() => removeCategory(category.id)}
                    >
                      삭제
                    </DangerTextButton>
                  </CardTop>

                  <FieldGrid>
                    <Field>
                      <Label>노출명</Label>
                      <Input
                        value={category.label}
                        onChange={(event) =>
                          updateCategory(category.id, (item) => ({
                            ...item,
                            label: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <Label>상품 카테고리</Label>
                      <Select
                        value={category.sheetName}
                        onChange={(event) =>
                          updateCategory(category.id, (item) => ({
                            ...item,
                            sheetName: event.target.value,
                            label:
                              item.label === item.sheetName
                                ? event.target.value
                                : item.label,
                          }))
                        }
                      >
                        {PRODUCT_CATEGORY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label>노출 순서</Label>
                      <Input
                        type="number"
                        min="1"
                        value={category.priority}
                        onChange={(event) =>
                          updateCategory(category.id, (item) => ({
                            ...item,
                            priority: Number(event.target.value) || 1,
                          }))
                        }
                      />
                    </Field>
                  </FieldGrid>

                  <Field>
                    <Label>모델명 입력</Label>
                    <Textarea
                      value={category.modelText}
                      placeholder={"WD321ACB\nWU823AS\nAS205NGJAM"}
                      onChange={(event) =>
                        updateCategory(category.id, (item) => ({
                          ...item,
                          modelText: event.target.value,
                        }))
                      }
                    />
                    <Hint>줄바꿈 또는 쉼표로 여러 모델명을 입력할 수 있습니다.</Hint>
                  </Field>
                </CategoryCard>
              ))}
            </CategoryList>

            {error && <ErrorText>{error}</ErrorText>}
            {message && <SuccessText>{message}</SuccessText>}
          </ConfigPanel>

          <PreviewPanel>
            <SectionTitle>상품 미리보기</SectionTitle>
            {previews.length === 0 ? (
              <InfoText>미리보기를 실행하면 모델명 조회 결과가 표시됩니다.</InfoText>
            ) : (
              <PreviewList>
                {previews.map((category) => (
                  <PreviewBlock key={category.id}>
                    <PreviewTitle>
                      {category.label}
                      <span>{category.status === "active" ? "활성" : "비활성"}</span>
                    </PreviewTitle>
                    <PreviewGrid>
                      {category.previews.map((preview) =>
                        preview.found && preview.product ? (
                          <ProductPreview key={preview.modelName}>
                            <ProductThumb>
                              {preview.product.thumbnailUrl ? (
                                <img src={preview.product.thumbnailUrl} alt="" />
                              ) : (
                                <LogoPlaceholder>이미지 없음</LogoPlaceholder>
                              )}
                            </ProductThumb>
                            <ProductInfo>
                              <ProductName>{preview.product.productName}</ProductName>
                              <ProductModel>{preview.product.modelCode}</ProductModel>
                              <ProductPrice>
                                월 {preview.product.monthlyPrice.toLocaleString()}원
                              </ProductPrice>
                            </ProductInfo>
                          </ProductPreview>
                        ) : (
                          <MissingPreview key={preview.modelName}>
                            <b>{preview.modelName}</b>
                            <span>{preview.error}</span>
                          </MissingPreview>
                        ),
                      )}
                    </PreviewGrid>
                  </PreviewBlock>
                ))}
              </PreviewList>
            )}
          </PreviewPanel>
        </LayoutGrid>
      )}
    </Page>
  );
}

const Page = styled.div`
  min-height: calc(100vh - 93px);
  padding: 25px;
  background: #f8fafc;
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 18px;
  flex-wrap: wrap;
`;

const Title = styled.h1`
  font-size: 22px;
  font-weight: 800;
  color: #111827;
`;

const SubTitle = styled.p`
  margin-top: 5px;
  font-size: 13px;
  color: #64748b;
`;

const LayoutGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(420px, 520px) minmax(0, 1fr);
  gap: 18px;

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;
  }
`;

const panelStyle = css`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
`;

const ConfigPanel = styled.div`
  ${panelStyle}
`;

const PreviewPanel = styled.div`
  ${panelStyle}
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
`;

const SectionTitle = styled.h2`
  font-size: 15px;
  font-weight: 800;
  color: #111827;
`;

const CategoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const CategoryCard = styled.div`
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px;
  background: #fff;
`;

const CardTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 7px;
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 700;
  color: #4b5563;
`;

const inputStyle = css`
  width: 100%;
  min-height: 40px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  color: #111827;
  background: #fff;
`;

const Input = styled.input`
  ${inputStyle}
`;

const Select = styled.select`
  ${inputStyle}
`;

const Textarea = styled.textarea`
  ${inputStyle}
  min-height: 118px;
  padding: 10px 12px;
  resize: vertical;
  line-height: 1.5;
`;

const Hint = styled.span`
  font-size: 12px;
  color: #64748b;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 8px;
`;

const buttonStyle = css`
  height: 38px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`;

const PrimaryButton = styled.button`
  ${buttonStyle}
  background: #111827;
  color: #fff;
`;

const SecondaryButton = styled.button`
  ${buttonStyle}
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
`;

const SmallButton = styled(SecondaryButton)`
  height: 32px;
  padding: 0 10px;
`;

const StatusButton = styled.button<{ $active: boolean }>`
  height: 30px;
  min-width: 58px;
  border-radius: 999px;
  padding: 0 10px;
  background: ${(p) => (p.$active ? "#eff6ff" : "#f3f4f6")};
  color: ${(p) => (p.$active ? "#1d4ed8" : "#6b7280")};
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
`;

const DangerTextButton = styled.button`
  color: #dc2626;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
`;

const InfoText = styled.div`
  font-size: 13px;
  color: #64748b;
`;

const ErrorText = styled.div`
  margin-top: 12px;
  color: #dc2626;
  font-size: 13px;
`;

const SuccessText = styled.div`
  margin-top: 12px;
  color: #15803d;
  font-size: 13px;
  font-weight: 700;
`;

const PreviewList = styled.div`
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const PreviewBlock = styled.div`
  border-top: 1px solid #e5e7eb;
  padding-top: 14px;
`;

const PreviewTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 800;
  color: #111827;
  margin-bottom: 10px;

  span {
    border-radius: 999px;
    background: #f1f5f9;
    color: #475569;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 800;
  }
`;

const PreviewGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
`;

const ProductPreview = styled.div`
  display: flex;
  gap: 10px;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  padding: 10px;
`;

const ProductThumb = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 8px;
  background: #f8fafc;
  overflow: hidden;
  flex: 0 0 auto;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const LogoPlaceholder = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 11px;
`;

const ProductInfo = styled.div`
  min-width: 0;
`;

const ProductName = styled.div`
  font-size: 13px;
  font-weight: 800;
  color: #111827;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ProductModel = styled.div`
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
`;

const ProductPrice = styled.div`
  margin-top: 6px;
  font-size: 13px;
  font-weight: 800;
  color: #e31b23;
`;

const MissingPreview = styled.div`
  border: 1px solid #fecaca;
  background: #fff7f7;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  b {
    color: #991b1b;
    font-size: 13px;
  }

  span {
    color: #dc2626;
    font-size: 12px;
  }
`;
