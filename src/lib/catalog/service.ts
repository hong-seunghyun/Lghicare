import { randomUUID, createHash } from "node:crypto";
import type { CatalogStore } from "./store";
import type {
  ArtifactRef,
  CatalogRelease,
  ImportDiff,
  ImportJob,
  ImportSelection,
  ParsedCatalog,
  ProductRow,
  VoucherBundle,
  ChangeItem,
  ImportSection,
} from "./types";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_FIELDS,
  isSafeId,
  isSafeModel,
} from "./types";
import { contentHash, parseCatalogWorkbook } from "./parse";
import {
  defaultVariant,
  lowestVariant,
  normalizeProduct,
} from "@/lib/renewalTest";
import {
  mergeWorkbookVouchers,
  normalizedVoucherModel,
} from "./voucherEditing";

type LegacySource = {
  rows: (category: string, fresh?: boolean) => Promise<ProductRow[]>;
  disclaimers: () => Promise<Record<string, string>>;
  vouchers: () => Promise<VoucherBundle>;
};
type Prepared = {
  release: CatalogRelease;
  categories: Record<string, ArtifactRef>;
  disclaimers?: ArtifactRef;
  vouchers?: ArtifactRef;
  before: {
    categories: Record<string, ArtifactRef>;
    disclaimers?: ArtifactRef;
    vouchers?: ArtifactRef;
    legacy: { categories: string[]; disclaimers: boolean; vouchers: boolean };
  };
};
type StoredAnalysis = Omit<ParsedCatalog, "products"> & {
  productRefs: Record<string, ArtifactRef>;
};
export const modelGroups = (rows: ProductRow[]) =>
  rows.reduce<Record<string, ProductRow[]>>((groups, row) => {
    if (row.모델코드) (groups[row.모델코드] ??= []).push(row);
    return groups;
  }, {});
const canonicalRows = (rows: ProductRow[]) =>
  rows
    .map((row) =>
      PRODUCT_FIELDS.map((field) => [
        field,
        /금액/.test(field)
          ? (row[field] ?? "").replace(/,/g, "").trim()
          : (row[field] ?? "").trim(),
      ]),
    )
    .map((row) => JSON.stringify(row))
    .sort();
export function differences(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  products = false,
): ImportDiff {
  const diff = { added: 0, changed: 0, unchanged: 0, removed: 0 };
  for (const [id, value] of Object.entries(after)) {
    if (!(id in before)) diff.added++;
    else if (
      contentHash(
        products ? canonicalRows(before[id] as ProductRow[]) : before[id],
      ) === contentHash(products ? canonicalRows(value as ProductRow[]) : value)
    )
      diff.unchanged++;
    else diff.changed++;
  }
  diff.removed = Object.keys(before).filter((id) => !(id in after)).length;
  return diff;
}
export function validateSelection(
  selection: ImportSelection,
  parsed: ParsedCatalog,
) {
  if (
    !selection ||
    !["merge", "replace"].includes(selection.mode) ||
    ![selection.products, selection.disclaimers, selection.vouchers].every(
      (value) => typeof value === "boolean",
    ) ||
    ![selection.products, selection.disclaimers, selection.vouchers].some(
      Boolean,
    )
  )
    throw new Error("반영할 항목을 선택해 주세요.");
  if (
    !Array.isArray(selection.categories) ||
    new Set(selection.categories).size !== selection.categories.length ||
    selection.categories.some(
      (category) =>
        !(PRODUCT_CATEGORIES as readonly string[]).includes(category) ||
        (selection.products && !parsed.products[category]?.length),
    )
  )
    throw new Error("반영할 제품 분류를 확인해 주세요.");
  if (selection.products && !selection.categories.length)
    throw new Error("제품 분류를 선택해 주세요.");
  for (const section of ["products", "disclaimers", "vouchers"] as const)
    if (selection[section] && parsed.issueCounts[section].errors)
      throw new Error(
        `${section === "products" ? "제품" : section === "vouchers" ? "상품권" : "디스클레이머"} 데이터에 오류가 있습니다. 원본을 수정하거나 해당 항목을 선택 해제해 주세요.`,
      );
}
const safePart = (text: string) => Buffer.from(text).toString("base64url");
function changeItems(
  section: ImportSection,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  category?: string,
): ChangeItem[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(
    (model) => {
      const diff = differences(
        model in before ? { [model]: before[model] } : {},
        model in after ? { [model]: after[model] } : {},
        section === "products",
      );
      return diff.added || diff.changed || diff.removed
        ? [
            {
              section,
              ...(category ? { category } : {}),
              model,
              change: diff.added
                ? ("added" as const)
                : diff.removed
                  ? ("removed" as const)
                  : ("changed" as const),
            },
          ]
        : [];
    },
  );
}
function comparableVoucherModels(models: VoucherBundle["models"]) {
  return Object.fromEntries(
    Object.entries(models).map(([id, model]) => {
      try {
        return [id, normalizedVoucherModel(id, model)];
      } catch {
        return [id, model];
      }
    }),
  );
}
export class CatalogImporter {
  constructor(
    private store: CatalogStore,
    private legacy: LegacySource,
    private parse = parseCatalogWorkbook,
  ) {}
  async upload(bytes: Buffer, fileName: string, owner: string) {
    if (
      !/\.xlsx$/i.test(fileName) ||
      bytes.length > 25 * 1024 * 1024 ||
      bytes.length < 4 ||
      bytes[0] !== 0x50 ||
      bytes[1] !== 0x4b
    )
      throw new Error("25MB 이하의 올바른 .xlsx 파일을 선택해 주세요.");
    const id = randomUUID(),
      now = new Date().toISOString();
    const source = (await this.store.raw(
      `product-catalog/uploads/${id}/source.xlsx`,
      bytes,
    )) as ArtifactRef;
    const job: ImportJob = {
      id,
      owner,
      fileName: fileName.replace(/^.*[\\/]/, "").slice(0, 180),
      sourceHash: source.sha256,
      source,
      createdAt: now,
      updatedAt: now,
      state: "uploaded",
    };
    await this.store.saveJob(job);
    return job;
  }
  private async claim(
    id: string,
    phase: string,
    allowed: ImportJob["state"][],
  ) {
    if (!isSafeId(id)) throw new Error("올바르지 않은 업로드 번호입니다.");
    const token = randomUUID();
    const job = await this.store.changeJob(id, (current) => {
      if (!allowed.includes(current.state))
        throw new Error(
          "현재 상태에서는 이 작업을 실행할 수 없습니다. 상태를 새로 확인해 주세요.",
        );
      if (current.leaseUntil && current.leaseUntil > Date.now())
        throw new Error(
          "다른 요청에서 처리 중입니다. 잠시 후 상태를 다시 확인해 주세요.",
        );
      return {
        ...current,
        phase,
        updatedAt: new Date().toISOString(),
        leaseUntil: Date.now() + 300000,
        leaseToken: token,
        error: "",
      };
    });
    return { job, token };
  }
  private async done(id: string, token: string, patch: Partial<ImportJob>) {
    return this.store.changeJob(id, (current) => {
      if (current.leaseToken !== token)
        throw new Error(
          "작업 소유권이 변경됐습니다. 상태를 다시 확인해 주세요.",
        );
      const next = {
        ...current,
        ...patch,
        leaseUntil: 0,
        leaseToken: "",
        updatedAt: new Date().toISOString(),
      };
      return next;
    });
  }
  private async failed(id: string, token: string, error: unknown) {
    await this.done(id, token, {
      state: "failed",
      error: error instanceof Error ? error.message : "작업 실패",
    });
  }
  async analyze(id: string) {
    const current = await this.store.job(id);
    if (current?.parsed) return current;
    const { job, token } = await this.claim(id, "엑셀 분석", [
      "uploaded",
      "failed",
      "analyzing",
    ]);
    try {
      await this.store.changeJob(id, (current) => ({
        ...current,
        state: "analyzing",
      }));
      const bytes = (await this.store.raw(job.source.path)) as Buffer;
      if (
        bytes.length !== job.source.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== job.sourceHash
      )
        throw new Error("업로드 원본 검증에 실패했습니다.");
      const data = await this.parse(bytes, job.fileName);
      const productRefs: Record<string, ArtifactRef> = {};
      for (const category of Object.keys(data.products)) {
        productRefs[category] = await this.store.put(
          `product-catalog/uploads/${id}/${token}-${safePart(category)}.json.gz`,
          data.products[category],
        );
        delete data.products[category];
      }
      const { products: _products, ...summary } = data;
      void _products;
      const parsed = await this.store.put(
        `product-catalog/uploads/${id}/analysis-${token}.json.gz`,
        { ...summary, productRefs } satisfies StoredAnalysis,
      );
      const { issues, issueCounts, statistics, sheets } = data;
      return await this.done(id, token, {
        state: "analyzed",
        parsed,
        analysis: { issues, issueCounts, statistics, sheets },
        phase: "분석 완료",
      });
    } catch (error) {
      await this.failed(id, token, error);
      throw error;
    }
  }
  async prepare(id: string, selection: ImportSelection, owner: string) {
    const { job, token } = await this.claim(id, "운영 데이터와 비교", [
      "analyzed",
      "preparing",
      "ready",
      "failed",
    ]);
    try {
      await this.store.changeJob(id, (current) => {
        if (current.leaseToken !== token)
          throw new Error("작업 소유권이 변경됐습니다.");
        return {
          ...current,
          state: "preparing",
          manifest: undefined,
          releaseId: undefined,
          preview: undefined,
          prepared: undefined,
          preparedKeys: [],
          warmup: undefined,
        };
      });
      if (job.state === "published" || !job.parsed)
        throw new Error("분석을 완료한 새 업로드를 선택해 주세요.");
      const stored = await this.store.get<StoredAnalysis>(job.parsed);
      if (!selection || !Array.isArray(selection.categories))
        throw new Error("반영할 항목을 확인해 주세요.");
      const products: Record<string, ProductRow[]> = {};
      if (selection.products)
        for (const category of selection.categories)
          if (stored.productRefs[category])
            products[category] = await this.store.get<ProductRow[]>(
              stored.productRefs[category],
            );
      const parsed = { ...stored, products };
      validateSelection(selection, parsed);
      const pointer = await this.store.pointer();
      const parent = pointer.manifest
        ? await this.store.get<CatalogRelease>(pointer.manifest)
        : null;
      const releaseId = randomUUID(),
        prefix = `product-catalog/releases/${releaseId}`;
      const prepared: Prepared = {
        release: {
          schema: 1,
          id: releaseId,
          parentId: pointer.id,
          source: { name: job.fileName, sha256: job.sourceHash },
          createdAt: new Date().toISOString(),
          createdBy: owner,
          categories: { ...(parent?.categories ?? {}) },
          ...(parent?.disclaimers ? { disclaimers: parent.disclaimers } : {}),
          ...(parent?.vouchers ? { vouchers: parent.vouchers } : {}),
        },
        categories: {},
        before: {
          categories: {},
          legacy: { categories: [], disclaimers: false, vouchers: false },
        },
      };
      const baseline: CatalogRelease = parent
        ? { ...parent, categories: { ...parent.categories } }
        : {
            ...prepared.release,
            categories: {},
            source: { name: "기존 운영 데이터 백업", sha256: job.sourceHash },
          };
      let backupNeeded = !parent;
      const diff: Record<string, ImportDiff> = {},
        warnings: string[] = [];
      const changes: ChangeItem[] = [];
      if (selection.products) {
        for (const category of selection.categories) {
          const beforeRows = parent?.categories[category]
            ? await this.store.get<ProductRow[]>(
                parent.categories[category].rows,
              )
            : await this.legacy.rows(category);
          const before = modelGroups(beforeRows),
            incoming = modelGroups(parsed.products[category]);
          if (!parent?.categories[category]) {
            prepared.before.legacy.categories.push(category);
            const backup = await this.store.put(
              `${prefix}/backup-${safePart(category)}.json.gz`,
              beforeRows,
            );
            baseline.categories[category] = {
              rows: backup,
              summary: backup,
              models: {},
              rowCount: beforeRows.length,
            };
            backupNeeded = true;
          }
          const after =
            selection.mode === "merge" ? { ...before, ...incoming } : incoming;
          prepared.before.categories[category] =
            parent?.categories[category]?.rows ??
            baseline.categories[category].rows;
          diff[category] = differences(before, after, true);
          changes.push(...changeItems("products", before, after, category));
          prepared.categories[category] = await this.store.put(
            `${prefix}/draft-${safePart(category)}.json.gz`,
            Object.values(after).flat(),
          );
        }
      }
      if (selection.disclaimers) {
        const before = parent?.disclaimers
          ? await this.store.get<Record<string, string>>(parent.disclaimers)
          : await this.legacy.disclaimers();
        if (!parent?.disclaimers) {
          baseline.disclaimers = await this.store.put(
            `${prefix}/backup-disclaimers.json.gz`,
            before,
          );
          backupNeeded = true;
        }
        prepared.before.legacy.disclaimers = !parent?.disclaimers;
        const after =
          selection.mode === "merge"
            ? { ...before, ...parsed.disclaimers }
            : parsed.disclaimers;
        diff.디스클레이머 = differences(before, after);
        prepared.before.disclaimers =
          parent?.disclaimers ?? baseline.disclaimers;
        changes.push(...changeItems("disclaimers", before, after));
        prepared.disclaimers = await this.store.put(
          `${prefix}/disclaimers.json.gz`,
          after,
        );
      }
      if (selection.vouchers) {
        const before = parent?.vouchers
          ? await this.store.get<VoucherBundle>(parent.vouchers)
          : await this.legacy.vouchers();
        if (!parent?.vouchers) {
          baseline.vouchers = await this.store.put(
            `${prefix}/backup-vouchers.json.gz`,
            before,
          );
          backupNeeded = true;
        }
        prepared.before.legacy.vouchers = !parent?.vouchers;
        const after = mergeWorkbookVouchers(
          before,
          parsed.vouchers,
          selection.mode === "replace",
        );
        const previousModels = comparableVoucherModels(before.models),
          nextModels = comparableVoucherModels(after.models);
        diff.상품권 = differences(previousModels, nextModels);
        prepared.before.vouchers = parent?.vouchers ?? baseline.vouchers;
        changes.push(...changeItems("vouchers", previousModels, nextModels));
        const ruleValues = (rules: VoucherBundle["rules"]) =>
          Object.fromEntries(
            Object.entries(rules).filter(
              ([key]) =>
                ![
                  "version",
                  "generatedFrom",
                  "createdAt",
                  "updatedAt",
                ].includes(key),
            ),
          );
        if (
          contentHash(ruleValues(before.rules)) !==
          contentHash(ruleValues(after.rules))
        ) {
          warnings.push(
            "상품권 공통 규칙과 다품목 지급 구간이 변경됩니다. 금액과 적용 기간을 확인해 주세요.",
          );
          changes.push({ section: "vouchers", model: "", change: "changed" });
        }
        prepared.vouchers = await this.store.put(
          `${prefix}/vouchers.json.gz`,
          after,
        );
      }
      for (const section of ["products", "disclaimers", "vouchers"] as const)
        if (selection[section] && parsed.issueCounts[section].warnings)
          warnings.push(
            `${section}: 확인할 항목 ${parsed.issueCounts[section].warnings}건`,
          );
      if (backupNeeded) {
        const id = randomUUID();
        const reference = await this.store.put(
          `product-catalog/releases/${id}/manifest.json.gz`,
          {
            ...baseline,
            id,
            parentId: parent?.id ?? null,
            createdAt: new Date().toISOString(),
            createdBy: owner,
          },
        );
        await this.store.rememberVersion(id, reference);
        prepared.release.parentId = id;
      }
      const reference = await this.store.put(
        `${prefix}/prepared.json.gz`,
        prepared,
      );
      const changeReference = await this.store.put(
        `${prefix}/changes.json.gz`,
        changes,
      );
      return await this.done(id, token, {
        state: "preparing",
        prepared: reference,
        preparedKeys: [],
        preview: {
          baseGeneration: pointer.generation,
          selection,
          differences: diff,
          warnings,
          changes: changeReference,
        },
        phase: "운영 파일 준비",
      });
    } catch (error) {
      await this.failed(id, token, error);
      throw error;
    }
  }
  async step(id: string) {
    const { job, token } = await this.claim(id, "운영 파일 준비", [
      "preparing",
      "failed",
    ]);
    try {
      if (!job.prepared || !job.preview || job.state === "published")
        throw new Error("변경 내역을 먼저 준비해 주세요.");
      if (
        (await this.store.pointer()).generation !== job.preview.baseGeneration
      )
        throw new Error(
          "다른 관리자가 운영 데이터를 변경했습니다. 비교를 다시 실행해 주세요.",
        );
      const prepared = await this.store.get<Prepared>(job.prepared);
      const keys = job.preparedKeys ?? [];
      const next = Object.keys(prepared.categories).find(
        (category) => !keys.includes(category),
      );
      const prefix = `product-catalog/releases/${prepared.release.id}`;
      if (next) {
        const rows = await this.store.get<ProductRow[]>(
          prepared.categories[next],
        );
        const groups = Object.entries(modelGroups(rows));
        const models: Record<string, ArtifactRef> = {},
          summaries: ProductRow[] = [];
        for (let index = 0; index < groups.length; index += 8) {
          await Promise.all(
            groups.slice(index, index + 8).map(async ([model, variants]) => {
              models[model] = await this.store.put(
                `${prefix}/models/${safePart(next)}/${safePart(model)}.json.gz`,
                variants,
              );
            }),
          );
        }
        // Preserve input ordering even when object uploads finish in a different order.
        for (const [, variants] of groups) {
          const product = normalizeProduct({ ...variants[0], variants });
          if (!product) throw new Error("제품 옵션이 비어 있습니다.");
          const selected = [defaultVariant(product), lowestVariant(product)];
          for (const row of selected.filter(
            (value, index) => index === 0 || value !== selected[0],
          ))
            summaries.push({
              ...row,
              __summary: "1",
              __optionCount: String(variants.length),
            } as ProductRow);
        }
        const entry = {
          rows: prepared.categories[next],
          summary: await this.store.put(
            `${prefix}/summary-${safePart(next)}.json.gz`,
            summaries,
          ),
          models: Object.fromEntries(
            groups.map(([model]) => [model, models[model]]),
          ),
          rowCount: rows.length,
        };
        // Each completed category is saved independently, so a disconnected browser can resume.
        const reference = await this.store.put(
          `${prefix}/progress-${randomUUID()}.json.gz`,
          {
            ...prepared,
            release: {
              ...prepared.release,
              categories: { ...prepared.release.categories, [next]: entry },
            },
          },
        );
        return await this.done(id, token, {
          state: "preparing",
          prepared: reference,
          preparedKeys: [...keys, next],
          phase: `${next} 준비 완료 (${keys.length + 1}/${Object.keys(prepared.categories).length})`,
        });
      }
      const release = {
        ...prepared.release,
        ...(prepared.disclaimers ? { disclaimers: prepared.disclaimers } : {}),
        ...(prepared.vouchers ? { vouchers: prepared.vouchers } : {}),
      };
      const manifest = await this.store.put(
        `${prefix}/manifest.json.gz`,
        release,
      );
      return await this.done(id, token, {
        state: "ready",
        manifest,
        releaseId: release.id,
        phase: "검증 완료 · 반영 대기",
      });
    } catch (error) {
      await this.failed(id, token, error);
      throw error;
    }
  }
  async publish(id: string, owner: string, acknowledged: boolean) {
    const current = await this.store.job(id);
    if (current?.state === "published") return current;
    const { job, token } = await this.claim(id, "활성 버전 전환", [
      "ready",
      "failed",
    ]);
    try {
      if (!job.manifest || !job.preview)
        throw new Error("운영 파일 준비를 완료해 주세요.");
      const active = await this.store.pointer();
      if (
        active.id === job.releaseId &&
        active.manifest?.sha256 === job.manifest.sha256
      )
        return await this.done(id, token, {
          state: "published",
          phase: "반영 완료",
        });
      if (job.preview.warnings.length && !acknowledged)
        throw new Error("변경된 규칙과 확인 항목을 검토해 주세요.");
      const release = await this.store.get<CatalogRelease>(job.manifest);
      const refs = Object.values(release.categories).flatMap((category) => [
        category.rows,
        category.summary,
        ...Object.values(category.models),
      ]);
      if (release.disclaimers) refs.push(release.disclaimers);
      if (release.vouchers) refs.push(release.vouchers);
      for (let offset = 0; offset < refs.length; offset += 8)
        await Promise.all(
          refs.slice(offset, offset + 8).map((ref) => this.store.get(ref)),
        );
      if (job.prepared) {
        const draft = await this.store.get<Prepared>(job.prepared),
          legacy = draft.before.legacy;
        for (const category of legacy.categories) {
          const previous = await this.store.get<ProductRow[]>(
            draft.before.categories[category],
          );
          if (
            contentHash(canonicalRows(previous)) !==
            contentHash(canonicalRows(await this.legacy.rows(category, true)))
          )
            throw new Error(
              `${category} 원본 시트가 비교 이후 변경됐습니다. 변경 내역을 다시 확인해 주세요.`,
            );
        }
        if (
          legacy.disclaimers &&
          draft.before.disclaimers &&
          contentHash(await this.store.get(draft.before.disclaimers)) !==
            contentHash(await this.legacy.disclaimers())
        )
          throw new Error(
            "기존 디스클레이머가 변경됐습니다. 변경 내역을 다시 확인해 주세요.",
          );
        if (legacy.vouchers && draft.before.vouchers) {
          const previous = await this.store.get<VoucherBundle>(
              draft.before.vouchers,
            ),
            latest = await this.legacy.vouchers();
          const business = (bundle: VoucherBundle) => ({
            rules: Object.fromEntries(
              Object.entries(bundle.rules).filter(
                ([key]) =>
                  ![
                    "createdAt",
                    "updatedAt",
                    "generatedFrom",
                    "version",
                  ].includes(key),
              ),
            ),
            models: comparableVoucherModels(bundle.models),
          });
          if (contentHash(business(previous)) !== contentHash(business(latest)))
            throw new Error(
              "기존 상품권 설정이 비교 이후 변경됐습니다. 변경 내역을 다시 확인해 주세요.",
            );
        }
      }
      await this.store.activate(
        job.preview.baseGeneration,
        {
          id: release.id,
          manifest: job.manifest,
          generation: randomUUID(),
          previousId: release.parentId,
        },
        {
          owner,
          importId: job.id,
          sourceHash: job.sourceHash,
          differences: job.preview.differences,
        },
      );
      return await this.done(id, token, {
        state: "published",
        phase: "반영 완료",
      });
    } catch (error) {
      await this.failed(id, token, error);
      throw error;
    }
  }
  async rollback(expected: string, target: string | null, owner: string) {
    const current = await this.store.pointer();
    if (
      current.generation !== expected ||
      current.id === target ||
      current.previousId !== target
    )
      throw new Error(
        "현재 버전 또는 되돌릴 버전이 변경됐습니다. 상태를 다시 확인해 주세요.",
      );
    if (!target) {
      await this.store.activate(
        expected,
        { id: null, generation: randomUUID(), previousId: current.id },
        { owner, action: "rollback-to-legacy" },
      );
      return;
    }
    if (!isSafeId(target)) throw new Error("잘못된 버전입니다.");
    // History contains the exact immutable manifest reference, including its hash.
    const manifest = await this.store.version(target);
    if (!manifest) throw new Error("이전 버전 정보를 찾지 못했습니다.");
    await this.store.get<CatalogRelease>(manifest);
    await this.store.activate(
      expected,
      {
        id: target,
        manifest,
        generation: randomUUID(),
        previousId: current.id,
      },
      { owner, action: "rollback" },
    );
  }
  async review(
    id: string,
    section: ImportSection,
    category: string,
    model: string | undefined,
    offset = 0,
  ) {
    const job = await this.store.job(id);
    if (
      !job?.prepared ||
      !job.preview?.changes ||
      !["products", "disclaimers", "vouchers"].includes(section)
    )
      throw new Error("변경 내역을 먼저 준비해 주세요.");
    if (
      section === "products" &&
      !(PRODUCT_CATEGORIES as readonly string[]).includes(category)
    )
      throw new Error("분류를 확인해 주세요.");
    const start = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    if (model === undefined) {
      const items = (
        await this.store.get<ChangeItem[]>(job.preview.changes)
      ).filter(
        (item) =>
          item.section === section &&
          (section !== "products" || item.category === category),
      );
      return {
        items: items.slice(start, start + 25),
        total: items.length,
        offset: start,
      };
    }
    if (!isSafeModel(model) && !(section === "vouchers" && model === ""))
      throw new Error("모델코드를 확인해 주세요.");
    const draft = await this.store.get<Prepared>(job.prepared);
    if (section === "products") {
      if (!draft.categories[category] || !draft.before.categories[category])
        throw new Error("선택한 분류의 변경 내역이 없습니다.");
      const [before, after] = await Promise.all([
        this.store.get<ProductRow[]>(draft.before.categories[category]),
        this.store.get<ProductRow[]>(draft.categories[category]),
      ]);
      const fields = [
        "프로모션 대분류",
        "계약기간",
        "서비스유형",
        "서비스주기/월",
        "프로모션유형",
        "프로모션명",
      ];
      const options = (rows: ProductRow[]) =>
        new Map(
          rows
            .filter((row) => row.모델코드 === model)
            .map((row) => [
              JSON.stringify(fields.map((field) => row[field])),
              row,
            ]),
        );
      const previous = options(before),
        next = options(after),
        keys = [...new Set([...previous.keys(), ...next.keys()])];
      return {
        kind: "products",
        total: keys.length,
        offset: start,
        rows: keys
          .slice(start, start + 25)
          .map((key) => ({
            conditions: Object.fromEntries(
              fields.map((field, index) => [field, JSON.parse(key)[index]]),
            ),
            before: previous.get(key)?.할인후금액 ?? null,
            after: next.get(key)?.할인후금액 ?? null,
            beforeNormal: previous.get(key)?.할인전금액 ?? null,
            afterNormal: next.get(key)?.할인전금액 ?? null,
          })),
      };
    }
    if (section === "disclaimers") {
      const before = draft.before.disclaimers
        ? await this.store.get<Record<string, string>>(draft.before.disclaimers)
        : {};
      const after = draft.disclaimers
        ? await this.store.get<Record<string, string>>(draft.disclaimers)
        : {};
      return {
        kind: section,
        before: before[model] ?? null,
        after: after[model] ?? null,
      };
    }
    const before = draft.before.vouchers
      ? await this.store.get<VoucherBundle>(draft.before.vouchers)
      : { rules: {}, models: {} };
    const after = draft.vouchers
      ? await this.store.get<VoucherBundle>(draft.vouchers)
      : { rules: {}, models: {} };
    return {
      kind: section,
      before: model ? (before.models[model] ?? null) : before.rules,
      after: model ? (after.models[model] ?? null) : after.rules,
    };
  }
}
