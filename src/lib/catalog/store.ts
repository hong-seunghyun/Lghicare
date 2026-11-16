import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { getStorage } from "firebase-admin/storage";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";
import type { ArtifactRef, CatalogPointer, ImportJob } from "./types";
import { isSafeId } from "./types";
import { localCatalogStore } from "./localStore";
import { developmentCatalogAccess } from "./developmentRead";
export const localCatalogMode = () => process.env.NODE_ENV !== "production";

export interface CatalogStore {
  pointer(): Promise<CatalogPointer>;
  version(id: string): Promise<ArtifactRef | null>;
  rememberVersion(id: string, manifest: ArtifactRef): Promise<void>;
  activate(
    expected: string,
    pointer: CatalogPointer,
    audit: Record<string, unknown>,
  ): Promise<void>;
  put(path: string, data: unknown): Promise<ArtifactRef>;
  get<T>(reference: ArtifactRef): Promise<T>;
  raw(path: string, bytes?: Buffer): Promise<Buffer | ArtifactRef>;
  job(id: string): Promise<ImportJob | null>;
  saveJob(job: ImportJob): Promise<void>;
  changeJob(
    id: string,
    update: (job: ImportJob) => ImportJob,
  ): Promise<ImportJob>;
  jobs(): Promise<ImportJob[]>;
}
export type CatalogReadStore = Pick<CatalogStore, "pointer" | "version" | "get">;
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export function catalogBucket() {
  initFirebaseAdmin();
  const name =
    process.env.PRODUCT_CATALOG_BUCKET ||
    process.env.FIREBASE_STORAGE_BUCKET ||
    "lghicare-861b3.firebasestorage.app";
  return getStorage().bucket(name);
}
function safePath(path: string) {
  if (
    !path.startsWith("product-catalog/") ||
    path.includes("..") ||
    path.startsWith("/") ||
    path.includes("\\")
  )
    throw new Error("Invalid catalog artifact path");
  return path;
}
const document = () => initFirebaseAdmin().doc("_system/productCatalog");
const jobs = () => initFirebaseAdmin().collection("productImports");

export function createCatalogStore(options: { readOnly: true }): CatalogReadStore;
export function createCatalogStore(): CatalogStore;
export function createCatalogStore(options?: { readOnly: true }): CatalogStore | CatalogReadStore {
  // Public reads follow the published release in every environment. Keep the
  // development admin's uploads and mutations isolated in the local store.
  if (localCatalogMode() && !options?.readOnly) return localCatalogStore();
  const developmentAccess = () => options?.readOnly && localCatalogMode()
    ? developmentCatalogAccess()
    : undefined;
  const readDocument = (path: string) =>
    (developmentAccess()?.db ?? initFirebaseAdmin()).doc(path);
  const store: CatalogStore = {
    async pointer() {
      const data = (await readDocument("_system/productCatalog").get()).data();
      return data
        ? (data as CatalogPointer)
        : { id: null, generation: "legacy" };
    },
    async version(id) {
      if (!isSafeId(id)) throw new Error("Invalid release id");
      return (
        (
          await readDocument(`productCatalogVersions/${id}`).get()
        ).data()?.manifest ?? null
      );
    },
    async rememberVersion(id, manifest) {
      if (!isSafeId(id)) throw new Error("Invalid release id");
      await initFirebaseAdmin()
        .doc(`productCatalogVersions/${id}`)
        .create({ manifest });
    },
    async activate(expected, pointer, audit) {
      await initFirebaseAdmin().runTransaction(async (transaction) => {
        const active = await transaction.get(document());
        if ((active.data()?.generation ?? "legacy") !== expected)
          throw new Error(
            "CATALOG_CONFLICT: 다른 관리자가 변경했습니다. 변경 내역을 다시 확인해 주세요.",
          );
        transaction.set(document(), pointer);
        transaction.set(
          initFirebaseAdmin()
            .collection("productCatalogHistory")
            .doc(pointer.generation),
          { ...audit, ...pointer, activatedAt: new Date().toISOString() },
        );
        if (pointer.id && pointer.manifest)
          transaction.set(
            initFirebaseAdmin().doc(`productCatalogVersions/${pointer.id}`),
            { manifest: pointer.manifest },
          );
      });
    },
    async put(path, data) {
      const bytes = gzipSync(Buffer.from(JSON.stringify(data)), { level: 6 });
      const ref = {
        path: safePath(path),
        sha256: hash(bytes),
        bytes: bytes.length,
      };
      // Immutable artifacts: never overwrite a previously prepared release.
      try {
        await catalogBucket()
          .file(ref.path)
          .save(bytes, {
            resumable: false,
            preconditionOpts: { ifGenerationMatch: 0 },
            metadata: {
              contentType: "application/gzip",
              cacheControl: "private, max-age=0",
            },
          });
      } catch (error) {
        if ((error as { code?: number }).code !== 412) throw error;
        const [existing] = await catalogBucket().file(ref.path).download();
        if (hash(existing) !== ref.sha256)
          throw new Error("Immutable catalog artifact conflict");
      }
      return ref;
    },
    async get<T>(ref: ArtifactRef) {
      const [bytes] = await (developmentAccess()?.bucket ?? catalogBucket())
        .file(safePath(ref.path))
        .download({ validation: "crc32c" });
      if (bytes.length !== ref.bytes || hash(bytes) !== ref.sha256)
        throw new Error("상품 데이터 무결성 검증에 실패했습니다.");
      return JSON.parse(
        gunzipSync(bytes, { maxOutputLength: 180 * 1024 * 1024 }).toString(
          "utf8",
        ),
      ) as T;
    },
    async raw(path, bytes) {
      if (!bytes)
        return (
          await catalogBucket()
            .file(safePath(path))
            .download({ validation: "crc32c" })
        )[0];
      const reference = {
        path: safePath(path),
        sha256: hash(bytes),
        bytes: bytes.length,
      };
      await catalogBucket()
        .file(reference.path)
        .save(bytes, {
          resumable: false,
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: {
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            cacheControl: "private, no-store",
          },
        });
      return reference;
    },
    async job(id) {
      if (!isSafeId(id)) throw new Error("Invalid import id");
      const snap = await jobs().doc(id).get();
      return snap.exists ? (snap.data() as ImportJob) : null;
    },
    async saveJob(job) {
      await jobs()
        .doc(job.id)
        .create(JSON.parse(JSON.stringify(job)));
    },
    async changeJob(id, update) {
      return initFirebaseAdmin().runTransaction(async (transaction) => {
        const ref = jobs().doc(id),
          snap = await transaction.get(ref);
        if (!snap.exists) throw new Error("업로드 내역을 찾지 못했습니다.");
        const next = update(snap.data() as ImportJob);
        transaction.set(ref, JSON.parse(JSON.stringify(next)));
        return next;
      });
    },
    async jobs() {
      const snap = await jobs().orderBy("createdAt", "desc").limit(15).get();
      return snap.docs.map((doc) => doc.data() as ImportJob);
    },
  };
  return options?.readOnly
    ? { pointer: store.pointer, version: store.version, get: store.get }
    : store;
}
export const newGeneration = () => randomUUID();
