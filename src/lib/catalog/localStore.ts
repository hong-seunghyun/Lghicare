import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { CatalogStore } from "./store";
import type { ArtifactRef, CatalogPointer, ImportJob } from "./types";
import { isSafeId } from "./types";

const state = globalThis as typeof globalThis & {
  __localCatalogWrites?: Promise<unknown>;
};
async function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = (state.__localCatalogWrites ?? Promise.resolve()).then(
    operation,
  );
  state.__localCatalogWrites = next.catch(() => {});
  return next;
}
export function localCatalogStore(): CatalogStore {
  const root = path.resolve(
    process.env.PRODUCT_CATALOG_LOCAL_DIR ||
      path.join(process.cwd(), ".product-catalog-local"),
  );
  const hash = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  function target(relative: string) {
    const resolved = path.resolve(root, relative);
    if (!resolved.startsWith(root + path.sep))
      throw new Error("Invalid local catalog path");
    return resolved;
  }
  async function json<T>(name: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(target(name), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async function save(name: string, value: unknown) {
    const file = target(name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(value));
    await fs.rename(temporary, file);
  }
  const pointer = async () =>
    (await json<CatalogPointer>("active.json")) ?? {
      id: null,
      generation: "legacy",
    };
  const check = (id: string) => {
    if (!isSafeId(id)) throw new Error("Invalid local catalog id");
    return id;
  };
  return {
    pointer,
    async version(id) {
      return json<ArtifactRef>(`versions/${check(id)}.json`);
    },
    async rememberVersion(id, ref) {
      await save(`versions/${check(id)}.json`, ref);
    },
    async activate(expected, next, audit) {
      await serialize(async () => {
        if ((await pointer()).generation !== expected)
          throw new Error("CATALOG_CONFLICT: 다른 변경이 있습니다.");
        if (next.id && next.manifest)
          await save(`versions/${check(next.id)}.json`, next.manifest);
        await save(`history/${check(next.generation)}.json`, {
          ...audit,
          ...next,
        });
        await save("active.json", next);
      });
    },
    async put(relative, data) {
      const bytes = gzipSync(Buffer.from(JSON.stringify(data))),
        file = target(relative);
      await fs.mkdir(path.dirname(file), { recursive: true });
      try {
        await fs.writeFile(file, bytes, { flag: "wx" });
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== "EEXIST" ||
          hash(await fs.readFile(file)) !== hash(bytes)
        )
          throw error;
      }
      return { path: relative, sha256: hash(bytes), bytes: bytes.length };
    },
    async get<T>(ref: ArtifactRef) {
      const bytes = await fs.readFile(target(ref.path));
      if (bytes.length !== ref.bytes || hash(bytes) !== ref.sha256)
        throw new Error("Local catalog integrity check failed");
      return JSON.parse(gunzipSync(bytes).toString("utf8")) as T;
    },
    async raw(relative, bytes) {
      const file = target(relative);
      if (!bytes) return fs.readFile(file);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes, { flag: "wx" });
      return { path: relative, bytes: bytes.length, sha256: hash(bytes) };
    },
    async job(id) {
      return json<ImportJob>(`jobs/${check(id)}.json`);
    },
    async saveJob(job) {
      await save(`jobs/${check(job.id)}.json`, job);
    },
    async changeJob(id, update) {
      return serialize(async () => {
        const current = await json<ImportJob>(`jobs/${check(id)}.json`);
        if (!current) throw new Error("업로드 내역을 찾지 못했습니다.");
        const next = update(current);
        await save(`jobs/${id}.json`, next);
        return next;
      });
    },
    async jobs() {
      let files: string[];
      try {
        files = await fs.readdir(target("jobs"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
      const jobs = await Promise.all(
        files
          .filter((file) => /^[a-zA-Z0-9-]+\.json$/.test(file))
          .map((file) => json<ImportJob>(`jobs/${file}`)),
      );
      return jobs
        .filter((job): job is ImportJob => Boolean(job))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 15);
    },
  };
}
