/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/admin/voucher.tsx
import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  writeBatch,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import promoRulesFinal from "@/data/promo_rules_final.json";

type VoucherRules = {
  version?: number;
  generatedFrom?: string;
  basePromoTypeKeywords?: string[];
  baseDefaultKeyword?: string;
  baseResubscribeKeyword?: string;
  combineKeywords?: string[];
  normalPromoTypeKeyword?: string;
  promoNameKeywordMap?: Record<string, string[]>;
  stackingPolicy?: {
    stackAcrossCategories?: boolean;
    categories?: {
      base?: { allowMultiple?: boolean };
      serviceCycle?: { allowMultiple?: boolean };
      promo?: { allowMultiple?: boolean };
      themePromo?: { allowMultiple?: boolean };
      multiProduct?: { allowMultiple?: boolean };
    };
  };
  multiProductRule?: {
    tiers?: Array<{
      minUnits: number;
      maxUnits?: number | null;
      rewardPerUnit: number;
    }>;
    rounding?: "floor" | "round" | "ceil";
  };
  themePromo?: {
    events?: Array<{
      name: string;
      startDate?: string;
      endDate?: string;
      reward?: number;
    }>;
  };
};

type VoucherModel = {
  id: string;
  modelCode: string;
  base: {
    default?: number;
    combine_new_existing: number;
    resubscribe: number;
    priority?: string[];
  };
  serviceCycle: Record<string, number>;
  promo: Record<string, number>;
  themePromo?:
    | Record<string, number>
    | { name?: string; amount?: number; startDate?: string; endDate?: string }
    | Array<{ name?: string; amount?: number; startDate?: string; endDate?: string }>;
  multiProductCount?: number;
  excludeWhenPromoTypeIsNormalN?: boolean;
};

const RULES_COLLECTION = "voucherRules";
const RULES_DOC_ID = "current";
const MODELS_COLLECTION = "voucherModels";

const safeNumber = (v: any) => {
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
};

const normalizeKeyword = (value: string | null | undefined) =>
  (value || "").toString().replace(/\s+/g, "").toLowerCase();

const matchesKeyword = (text: string, keywords: string[]) => {
  const normalized = normalizeKeyword(text);
  return keywords.some((keyword) =>
    normalized.includes(normalizeKeyword(keyword)),
  );
};

const normalizeNumberMap = (input: any): Record<string, number> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: Record<string, number> = {};
  Object.entries(input).forEach(([key, value]) => {
    result[key] = safeNumber(value);
  });
  return result;
};

const normalizePromoMap = (input: any): Record<string, number> => {
  if (Array.isArray(input)) {
    return input.reduce<Record<string, number>>((acc, item) => {
      const key = (item?.criterion || item?.name || "").toString().trim();
      if (!key) return acc;
      acc[key] = safeNumber(item?.amount);
      return acc;
    }, {});
  }
  return normalizeNumberMap(input);
};

const normalizeThemePromo = (input: any): Record<string, number> | any => {
  if (!input || typeof input !== "object") return {};
  if (Array.isArray(input)) {
    return input
      .map((item) => ({
        name: (item?.name || "테마판촉").toString(),
        amount: safeNumber(item?.amount),
        startDate: item?.startDate,
        endDate: item?.endDate,
      }))
      .filter((item) => item.amount > 0);
  }

  if (!Array.isArray(input)) {
    const hasDateFields =
      Object.prototype.hasOwnProperty.call(input, "startDate") ||
      Object.prototype.hasOwnProperty.call(input, "endDate");
    const hasAmountField = Object.prototype.hasOwnProperty.call(input, "amount");
    if (hasDateFields || hasAmountField) {
      const amount = safeNumber(input?.amount);
      return amount > 0
        ? {
            name: (input?.name || "테마판촉").toString(),
            amount,
            startDate: input?.startDate,
            endDate: input?.endDate,
          }
        : {};
    }
  }
  return normalizeNumberMap(input);
};

export default function VoucherAdminPage() {
  const [rulesJson, setRulesJson] = useState<string>("");
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);

  const [models, setModels] = useState<VoucherModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [filter, setFilter] = useState("");

  const [editing, setEditing] = useState<VoucherModel | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const [serviceCycleText, setServiceCycleText] = useState("");
  const [promoText, setPromoText] = useState("");
  const [themePromoText, setThemePromoText] = useState("");

  const [importing, setImporting] = useState(false);

  const loadRules = async () => {
    setRulesLoading(true);
    try {
      const snap = await getDoc(doc(db, RULES_COLLECTION, RULES_DOC_ID));
      if (!snap.exists()) {
        setRulesJson(
          JSON.stringify(
            {
              version: 1,
              generatedFrom: "",
              baseDefaultKeyword: "기본",
              baseResubscribeKeyword: "재구독",
              combineKeywords: ["신규결합", "기존결합", "기존결합/신규결합"],
              normalPromoTypeKeyword: "일반(N)",
              stackingPolicy: {
                stackAcrossCategories: true,
                categories: {
                  base: { allowMultiple: false },
                  serviceCycle: { allowMultiple: false },
                  promo: { allowMultiple: true },
                  themePromo: { allowMultiple: false },
                  multiProduct: { allowMultiple: false },
                },
              },
              multiProductRule: {
                tiers: [],
                rounding: "floor",
              },
              themePromo: { events: [] },
            },
            null,
            2,
          ),
        );
        return;
      }
      const data = snap.data() as VoucherRules & {
        createdAt?: unknown;
        updatedAt?: unknown;
      };
      const { createdAt, updatedAt, ...rest } = data;
      setRulesJson(JSON.stringify(rest, null, 2));
    } catch (err) {
      console.error("상품권 규칙 불러오기 오류:", err);
      alert("상품권 규칙을 불러오지 못했습니다.");
    } finally {
      setRulesLoading(false);
    }
  };

  const loadModels = async () => {
    setModelsLoading(true);
    try {
      const colRef = collection(db, MODELS_COLLECTION);
      const q = query(colRef, orderBy("modelCode"));
      const snap = await getDocs(q);
      const items: VoucherModel[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          modelCode: data.modelCode || d.id,
          base: {
            default: safeNumber(data?.base?.default),
            combine_new_existing: safeNumber(
              data?.base?.combine_new_existing,
            ),
            resubscribe: safeNumber(data?.base?.resubscribe),
            priority: Array.isArray(data?.base?.priority)
              ? data.base.priority
              : undefined,
          },
          serviceCycle: normalizeNumberMap(data?.serviceCycle),
          promo: normalizeNumberMap(data?.promo),
          themePromo: normalizeThemePromo(data?.themePromo),
          multiProductCount: safeNumber(data?.multiProductCount),
          excludeWhenPromoTypeIsNormalN:
            data?.excludeWhenPromoTypeIsNormalN ?? false,
        };
      });
      setModels(items);
    } catch (err) {
      console.error("상품권 모델 불러오기 오류:", err);
      alert("상품권 모델을 불러오지 못했습니다.");
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
    loadModels();
  }, []);

  const filteredModels = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return models;
    return models.filter((m) => m.modelCode.toLowerCase().includes(keyword));
  }, [filter, models]);

const getPromoLabel = (promo: Record<string, number>) => {
  const labels = Object.entries(promo)
    .filter(([, value]) => safeNumber(value) > 0)
    .map(([key]) => key);
  return labels.length ? labels.join(" / ") : "-";
};

const getThemePromoLabel = (
  themePromo?:
    | Record<string, number>
    | { name?: string; amount?: number; startDate?: string; endDate?: string }
    | Array<{ name?: string; amount?: number; startDate?: string; endDate?: string }>,
) => {
  if (!themePromo) return "-";
  if (Array.isArray(themePromo)) {
    const labels = themePromo
      .filter((item) => safeNumber(item?.amount) > 0)
      .map((item) => (item?.name || "테마판촉").toString());
    return labels.length ? labels.join(" / ") : "-";
  }
  if (
    typeof themePromo === "object" &&
    ("amount" in themePromo ||
      "startDate" in themePromo ||
      "endDate" in themePromo)
  ) {
    const amount = safeNumber((themePromo as any)?.amount);
    if (amount <= 0) return "-";
    return ((themePromo as any)?.name || "테마판촉").toString();
  }
  return getPromoLabel(themePromo as Record<string, number>);
};

  const startNew = () => {
    setEditing({
      id: "",
      modelCode: "",
      base: { default: 0, combine_new_existing: 0, resubscribe: 0 },
      serviceCycle: {},
      promo: {},
      themePromo: {},
      multiProductCount: 0,
      excludeWhenPromoTypeIsNormalN: false,
    });
    setServiceCycleText("{}");
    setPromoText("{}");
    setThemePromoText("{}");
  };

  const startEdit = (model: VoucherModel) => {
    setEditing({ ...model });
    setServiceCycleText(JSON.stringify(model.serviceCycle, null, 2));
    setPromoText(JSON.stringify(model.promo, null, 2));
    setThemePromoText(JSON.stringify(model.themePromo ?? {}, null, 2));
  };

  const saveRules = async () => {
    if (!rulesJson.trim()) {
      alert("규칙 JSON을 입력해 주세요.");
      return;
    }
    try {
      setRulesSaving(true);
      const parsed = JSON.parse(rulesJson) as VoucherRules;
      if (!parsed || typeof parsed !== "object") {
        alert("규칙 JSON 형식이 올바르지 않습니다.");
        return;
      }
      const { createdAt, updatedAt, ...rest } = parsed as any;
      await setDoc(
        doc(db, RULES_COLLECTION, RULES_DOC_ID),
        {
          ...rest,
          updatedAt: new Date(),
          createdAt: new Date(),
        },
        { merge: true },
      );
      alert("규칙이 저장되었습니다.");
    } catch (err) {
      console.error("상품권 규칙 저장 오류:", err);
      alert("규칙 저장 중 오류가 발생했습니다.");
    } finally {
      setRulesSaving(false);
    }
  };

  const saveModel = async () => {
    if (!editing) return;
    const modelCode = editing.modelCode.trim();
    if (!modelCode) {
      alert("모델 코드를 입력해 주세요.");
      return;
    }

    try {
      setSavingModel(true);
      let serviceCycleParsed = {};
      let promoParsed = {};
      let themePromoParsed = {};
      try {
        serviceCycleParsed = serviceCycleText.trim()
          ? JSON.parse(serviceCycleText)
          : {};
      } catch {
        alert("서비스주기 JSON 형식이 올바르지 않습니다.");
        return;
      }
      try {
        promoParsed = promoText.trim() ? JSON.parse(promoText) : {};
      } catch {
        alert("프로모션 JSON 형식이 올바르지 않습니다.");
        return;
      }
      try {
        themePromoParsed = themePromoText.trim()
          ? JSON.parse(themePromoText)
          : {};
      } catch {
        alert("테마판촉 JSON 형식이 올바르지 않습니다.");
        return;
      }

      const payload = {
        modelCode,
        base: {
          default: safeNumber(editing.base.default),
          combine_new_existing: safeNumber(
            editing.base.combine_new_existing,
          ),
          resubscribe: safeNumber(editing.base.resubscribe),
          priority: Array.isArray(editing.base.priority)
            ? editing.base.priority
            : undefined,
        },
        serviceCycle: normalizeNumberMap(serviceCycleParsed),
        promo: normalizeNumberMap(promoParsed),
        themePromo: normalizeThemePromo(themePromoParsed),
        multiProductCount: safeNumber(editing.multiProductCount),
        excludeWhenPromoTypeIsNormalN:
          editing.excludeWhenPromoTypeIsNormalN ?? false,
        updatedAt: new Date(),
        createdAt: new Date(),
      };
      await setDoc(doc(db, MODELS_COLLECTION, modelCode), payload, {
        merge: true,
      });

      setModels((prev) => {
        const exists = prev.find((m) => m.modelCode === modelCode);
        if (exists) {
          return prev.map((m) =>
            m.modelCode === modelCode
              ? { ...m, ...payload, id: modelCode }
              : m,
          );
        }
        return [{ ...payload, id: modelCode }, ...prev];
      });

      setEditing(null);
      setServiceCycleText("");
      setPromoText("");
      setThemePromoText("");
      alert("저장 완료");
    } catch (err) {
      console.error("상품권 모델 저장 오류:", err);
      alert("모델 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingModel(false);
    }
  };

  const deleteModel = async (modelCode: string) => {
    const confirmDelete = window.confirm(
      `${modelCode} 모델을 삭제하시겠습니까?`,
    );
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, MODELS_COLLECTION, modelCode));
      setModels((prev) => prev.filter((m) => m.modelCode !== modelCode));
    } catch (err) {
      console.error("상품권 모델 삭제 오류:", err);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  const deleteMissingModels = async (keepSet: Set<string>) => {
    if (keepSet.size === 0) return;
    try {
      const colRef = collection(db, MODELS_COLLECTION);
      const snap = await getDocs(colRef);
      const toDelete = snap.docs.filter((doc) => !keepSet.has(doc.id));
      const chunkSize = 400;
      for (let i = 0; i < toDelete.length; i += chunkSize) {
        const batch = writeBatch(db);
        toDelete
          .slice(i, i + chunkSize)
          .forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
    } catch (err) {
      console.error("상품권 모델 정리 오류:", err);
    }
  };

  const importJsonData = async (data: any) => {
    const hasLegacyShape = data?.rules && data?.models;
    const hasNewShape = data?.products;
    const hasExcelRulesShape =
      data?.models &&
      !data?.rules &&
      !data?.products &&
      (data?.promoNameKeywordMap ||
        data?.baseDefaultKeyword ||
        data?.baseResubscribeKeyword);

    if (!hasLegacyShape && !hasNewShape && !hasExcelRulesShape) {
      return false;
    }

    if (hasLegacyShape) {
      await setDoc(
        doc(db, RULES_COLLECTION, RULES_DOC_ID),
        {
          ...data.rules,
          version: data.version ?? 1,
          generatedFrom: data.generatedFrom ?? "",
          updatedAt: new Date(),
          createdAt: new Date(),
        },
        { merge: true },
      );
    }

    if (hasNewShape) {
      const rulesPayload: Record<string, unknown> = {
        version: data.version ?? 1,
        generatedFrom: data.meta?.source_file ?? data.generatedFrom ?? "",
        baseDefaultKeyword: "기본",
        baseResubscribeKeyword: "재구독",
        combineKeywords: ["신규결합", "기존결합", "기존결합/신규결합"],
        normalPromoTypeKeyword: "일반(N)",
        updatedAt: new Date(),
        createdAt: new Date(),
      };
      if (typeof data.basePromoTypeKeywords !== "undefined") {
        rulesPayload.basePromoTypeKeywords = data.basePromoTypeKeywords;
      }
      if (typeof data.promoNameKeywordMap !== "undefined") {
        rulesPayload.promoNameKeywordMap = data.promoNameKeywordMap;
      }
      if (typeof data.stackingPolicy !== "undefined") {
        rulesPayload.stackingPolicy = data.stackingPolicy;
      }
      if (typeof data.multiProductRule !== "undefined") {
        rulesPayload.multiProductRule = data.multiProductRule;
      }
      if (typeof data.themePromo !== "undefined") {
        rulesPayload.themePromo = data.themePromo;
      }
      await setDoc(doc(db, RULES_COLLECTION, RULES_DOC_ID), rulesPayload, {
        merge: true,
      });
    }

    if (hasExcelRulesShape) {
      const rulesPayload: Record<string, unknown> = {
        version: data.version ?? 1,
        generatedFrom: data.generatedFrom ?? "",
        baseDefaultKeyword: data.baseDefaultKeyword ?? "기본",
        baseResubscribeKeyword: data.baseResubscribeKeyword ?? "재구독",
        combineKeywords:
          data.combineKeywords ?? ["신규결합", "기존결합", "기존결합/신규결합"],
        normalPromoTypeKeyword: data.normalPromoTypeKeyword ?? "일반(N)",
        updatedAt: new Date(),
        createdAt: new Date(),
      };
      if (typeof data.basePromoTypeKeywords !== "undefined") {
        rulesPayload.basePromoTypeKeywords = data.basePromoTypeKeywords;
      }
      if (typeof data.promoNameKeywordMap !== "undefined") {
        rulesPayload.promoNameKeywordMap = data.promoNameKeywordMap;
      }
      if (typeof data.stackingPolicy !== "undefined") {
        rulesPayload.stackingPolicy = data.stackingPolicy;
      }
      if (typeof data.multiProductRule !== "undefined") {
        rulesPayload.multiProductRule = data.multiProductRule;
      }
      if (typeof data.themePromo !== "undefined") {
        rulesPayload.themePromo = data.themePromo;
      }
      await setDoc(doc(db, RULES_COLLECTION, RULES_DOC_ID), rulesPayload, {
        merge: true,
      });
    }

    const baseDefaultKeyword =
      data.baseDefaultKeyword ||
      data?.rules?.baseDefaultKeyword ||
      "기본";
    const baseResubscribeKeyword =
      data.baseResubscribeKeyword ||
      data?.rules?.baseResubscribeKeyword ||
      "재구독";
    const combineKeywords =
      data.combineKeywords ||
      data?.rules?.combineKeywords ||
      ["신규결합", "기존결합", "기존결합/신규결합"];

    const entries = Object.entries<any>(
      hasLegacyShape
        ? data.models
        : hasNewShape
        ? data.products
        : data.models,
    );
    const importedModelCodes = new Set<string>();
    const batchSize = 400;

    for (let i = 0; i < entries.length; i += batchSize) {
      const slice = entries.slice(i, i + batchSize);
      const batch = writeBatch(db);
      slice.forEach(([key, value]) => {
        const modelCode = (value?.modelCode || key || "").toString().trim();
        if (!modelCode) return;
        importedModelCodes.add(modelCode);
        const baseSource =
          value?.base && typeof value.base === "object" && !Array.isArray(value.base)
            ? { ...value.base }
            : {};
        const basePriority = Array.isArray(baseSource.priority)
          ? baseSource.priority
          : undefined;
        if (basePriority) {
          delete baseSource.priority;
        }
        const basePayload: Record<string, number | string | string[] | undefined> = {
          default: safeNumber(baseSource.default),
          combine_new_existing: safeNumber(baseSource.combine_new_existing),
          resubscribe: safeNumber(baseSource.resubscribe),
        };
        Object.entries(baseSource)
          .filter(
            ([baseKey]) =>
              !["default", "combine_new_existing", "resubscribe", "priority"].includes(
                baseKey,
              ),
          )
          .forEach(([baseKey, baseAmount]) => {
            const amount = safeNumber(baseAmount);
            if (!amount) return;
            if (matchesKeyword(baseKey, [baseDefaultKeyword])) {
              basePayload.default = amount;
            }
            if (matchesKeyword(baseKey, combineKeywords)) {
              basePayload.combine_new_existing = amount;
            }
            if (matchesKeyword(baseKey, [baseResubscribeKeyword])) {
              basePayload.resubscribe = amount;
            }
          });
        if (basePriority) {
          basePayload.priority = basePriority;
        }
        batch.set(
          doc(db, MODELS_COLLECTION, modelCode),
          {
            modelCode,
            base: {
              ...basePayload,
            },
            serviceCycle: normalizeNumberMap(value?.serviceCycle),
            promo: normalizePromoMap(value?.promo),
            themePromo: normalizeThemePromo(value?.themePromo),
            multiProductCount: safeNumber(
              value?.multiProductCount ?? value?.multiProduct?.recognizedUnits,
            ),
            excludeWhenPromoTypeIsNormalN:
              value?.excludeWhenPromoTypeIsNormalN ?? false,
            updatedAt: new Date(),
            createdAt: new Date(),
          },
          { merge: true },
        );
      });
      await batch.commit();
    }

    await deleteMissingModels(importedModelCodes);
    await loadRules();
    await loadModels();
    return true;
  };

  const handleImport = async (file: File) => {
    try {
      setImporting(true);
      const text = await file.text();
      const data = JSON.parse(text) as any;

      const success = await importJsonData(data);
      if (!success) {
        alert("JSON 형식이 올바르지 않습니다.");
        return;
      }

      alert("가져오기가 완료되었습니다.");
    } catch (err) {
      console.error("상품권 JSON 가져오기 오류:", err);
      alert("가져오기 중 오류가 발생했습니다.");
    } finally {
      setImporting(false);
    }
  };

  const importFromPromoRulesFinal = async () => {
    try {
      setImporting(true);
      const success = await importJsonData(promoRulesFinal);
      if (!success) {
        alert("JSON 형식이 올바르지 않습니다.");
        return;
      }
      alert("가져오기가 완료되었습니다.");
    } catch (err) {
      console.error("상품권 JSON 가져오기 오류:", err);
      alert("가져오기 중 오류가 발생했습니다.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Wrapper>
      <Header>
        <h1>상품권 관리</h1>
        <HeaderRight>
          <button onClick={startNew}>신규 등록</button>
          <button onClick={loadModels}>새로고침</button>
        </HeaderRight>
      </Header>

      <Section>
        <SectionTitle>규칙 관리</SectionTitle>
        <SectionHelp>
          규칙 JSON에는 baseDefaultKeyword, baseResubscribeKeyword,
          combineKeywords, normalPromoTypeKeyword, stackingPolicy,
          multiProductRule, themePromo 등이 포함될 수 있습니다.
        </SectionHelp>
        <Textarea
          value={rulesJson}
          onChange={(e) => setRulesJson(e.target.value)}
          placeholder="규칙 JSON"
        />
        <PrimaryButton onClick={saveRules} disabled={rulesSaving || rulesLoading}>
          {rulesSaving ? "저장 중.." : "규칙 저장"}
        </PrimaryButton>
      </Section>

      <Section>
        <SectionTitle>JSON 가져오기</SectionTitle>
        <SectionHelp>
          기존 voucherMaster.json 또는 promo_rules_final.json을 선택하거나 버튼을 눌러 규칙 + 모델을 파이어베이스에 저장합니다.
        </SectionHelp>
        <ImportRow>
          <input
            type="file"
            accept="application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
            }}
            disabled={importing}
          />
          <SecondaryButton
            onClick={importFromPromoRulesFinal}
            disabled={importing}
          >
            promo_rules_final.json 불러오기
          </SecondaryButton>
        </ImportRow>
      </Section>

      <Section>
        <SectionTitle>모델 목록</SectionTitle>
        <FilterRow>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="모델 코드 검색"
          />
          <span>총 {filteredModels.length}건</span>
        </FilterRow>

        {modelsLoading ? (
          <div>불러오는 중..</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>모델</th>
                <th>기본(결합)</th>
                <th>기본(재구독)</th>
                <th>서비스주기</th>
                <th>프로모션</th>
                <th>테마판촉</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredModels.map((m) => (
                <tr key={m.modelCode}>
                  <td>{m.modelCode}</td>
                  <td>{m.base.combine_new_existing.toLocaleString()}</td>
                  <td>{m.base.resubscribe.toLocaleString()}</td>
                  <td>{Object.keys(m.serviceCycle).length}</td>
                  <td>{getPromoLabel(m.promo)}</td>
                  <td>{getThemePromoLabel(m.themePromo)}</td>
                  <td>
                    <RowButton onClick={() => startEdit(m)}>수정</RowButton>
                    <RowButton onClick={() => deleteModel(m.modelCode)}>
                      삭제
                    </RowButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {editing && (
        <ModalOverlay
          onClick={() => {
            setEditing(null);
            setServiceCycleText("");
            setPromoText("");
            setThemePromoText("");
          }}
        >
          <ModalCard onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <h2>{editing.id ? "모델 수정" : "모델 신규 등록"}</h2>
              <CloseButton
                onClick={() => {
                  setEditing(null);
                  setServiceCycleText("");
                  setPromoText("");
                  setThemePromoText("");
                }}
              >
                X
              </CloseButton>
            </ModalHeader>

            <FormGrid>
              <label>모델 코드</label>
              <input
                type="text"
                value={editing.modelCode}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev ? { ...prev, modelCode: e.target.value } : prev,
                  )
                }
                disabled={!!editing.id}
              />

              <label>기본(기본)</label>
              <input
                type="number"
                value={editing.base.default ?? 0}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          base: {
                            ...prev.base,
                            default: Number(e.target.value),
                          },
                        }
                      : prev,
                  )
                }
              />

              <label>기본(결합)</label>
              <input
                type="number"
                value={editing.base.combine_new_existing}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          base: {
                            ...prev.base,
                            combine_new_existing: Number(e.target.value),
                          },
                        }
                      : prev,
                  )
                }
              />

              <label>기본(재구독)</label>
              <input
                type="number"
                value={editing.base.resubscribe}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          base: {
                            ...prev.base,
                            resubscribe: Number(e.target.value),
                          },
                        }
                      : prev,
                  )
                }
              />

              <label>다품목 인정수</label>
              <input
                type="number"
                step="0.1"
                value={editing.multiProductCount ?? 0}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          multiProductCount: Number(e.target.value),
                        }
                      : prev,
                  )
                }
              />

              <label>일반(N) 제외</label>
              <input
                type="checkbox"
                checked={!!editing.excludeWhenPromoTypeIsNormalN}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          excludeWhenPromoTypeIsNormalN: e.target.checked,
                        }
                      : prev,
                  )
                }
              />
            </FormGrid>

            <FormBlock>
              <label>서비스주기 JSON</label>
              <Textarea
                value={serviceCycleText}
                onChange={(e) => setServiceCycleText(e.target.value)}
              />
            </FormBlock>

            <FormBlock>
              <label>프로모션 JSON</label>
              <Textarea
                value={promoText}
                onChange={(e) => setPromoText(e.target.value)}
              />
            </FormBlock>

            <FormBlock>
              <label>테마판촉 JSON</label>
              <Textarea
                value={themePromoText}
                onChange={(e) => setThemePromoText(e.target.value)}
              />
            </FormBlock>

            <ButtonRow>
              <PrimaryButton onClick={saveModel} disabled={savingModel}>
                {savingModel ? "저장 중.." : "저장"}
              </PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  setEditing(null);
                  setServiceCycleText("");
                  setPromoText("");
                  setThemePromoText("");
                }}
              >
                취소
              </SecondaryButton>
            </ButtonRow>
          </ModalCard>
        </ModalOverlay>
      )}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  max-width: 980px;
  margin: 40px auto;
  padding: 0 16px 40px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;

  h1 {
    font-size: 22px;
    font-weight: 600;
  }
`;

const HeaderRight = styled.div`
  display: flex;
  gap: 8px;

  button {
    padding: 8px 12px;
    border-radius: 4px;
    border: none;
    background: #111;
    color: #fff;
    cursor: pointer;
    font-size: 13px;
  }
`;

const Section = styled.section`
  border: 1px solid #eee;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  background: #fff;
`;

const SectionTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
`;

const SectionHelp = styled.p`
  font-size: 12px;
  color: #666;
  margin: 4px 0 10px;
`;

const Textarea = styled.textarea`
  width: 100%;
  min-height: 160px;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 12px;
  margin-bottom: 8px;
`;

const PrimaryButton = styled.button`
  padding: 8px 14px;
  border-radius: 4px;
  border: none;
  background: #111;
  color: #fff;
  cursor: pointer;
  font-size: 13px;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const SecondaryButton = styled.button`
  padding: 8px 14px;
  border-radius: 4px;
  border: 1px solid #ddd;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
`;

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  input {
    padding: 6px 10px;
    border-radius: 4px;
    border: 1px solid #ddd;
    min-width: 220px;
  }
`;

const ImportRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;

  input {
    flex: 1;
    min-width: 220px;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    border: 1px solid #eee;
    padding: 8px;
    text-align: center;
    font-size: 13px;
  }

  th {
    background: #fafafa;
    font-weight: 600;
  }
`;

const RowButton = styled.button`
  padding: 4px 8px;
  margin: 0 4px;
  border-radius: 4px;
  border: 1px solid #ddd;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 8px 12px;
  align-items: center;
  margin-bottom: 12px;

  input {
    padding: 6px 10px;
    border-radius: 4px;
    border: 1px solid #ddd;
  }
`;

const FormBlock = styled.div`
  margin-bottom: 12px;

  label {
    display: block;
    font-size: 12px;
    margin-bottom: 6px;
  }
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 2000;
`;

const ModalCard = styled.div`
  width: min(860px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border-radius: 10px;
  padding: 18px 18px 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  h2 {
    font-size: 18px;
    font-weight: 600;
  }
`;

const CloseButton = styled.button`
  border: none;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
`;




