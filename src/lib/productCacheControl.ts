import { randomUUID } from "node:crypto";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";

export type CacheTarget = "sheets" | "drive" | "all";
type Scope = Exclude<CacheTarget, "all">;
type Revision = Record<Scope, string>;
type State = {
  revision: Revision;
  checkedAt: number;
  mutation: number;
  pending?: Promise<void>;
  listeners: Map<string, { scope: CacheTarget; clear: () => void }>;
};
const globalCache = globalThis as typeof globalThis & { __productCacheControl?: State };
const state: State = globalCache.__productCacheControl ??= {
  revision: { sheets: "", drive: "" }, checkedAt: 0, mutation: 0, listeners: new Map(),
};
const revisionDocument = () => initFirebaseAdmin().doc("_system/productCache");

export function registerCacheInvalidator(key: string, scope: CacheTarget, clear: () => void) {
  state.listeners.set(key, { scope, clear });
}

function clearLocal(target: CacheTarget) {
  for (const listener of state.listeners.values()) {
    if (target === "all" || listener.scope === "all" || listener.scope === target) listener.clear();
  }
}
export function clearLocalProductCaches(target: CacheTarget) { clearLocal(target); }

// Every instance observes the same revision; an admin request need not reach every server.
export async function syncProductCacheRevision() {
  if (state.pending) return state.pending;
  if (Date.now() - state.checkedAt < 5_000) return;
  const mutation = state.mutation;
  const request = (async () => {
    try {
      const snapshot = await revisionDocument().get();
      if (mutation !== state.mutation) return;
      const data = snapshot.data();
      for (const scope of ["sheets", "drive"] as const) {
        const revision = typeof data?.[scope] === "string" ? data[scope] : "";
        if (revision !== state.revision[scope]) {
          clearLocal(scope);
          state.revision[scope] = revision;
        }
      }
    } catch (error) {
      // Keep serving the bounded local cache if the revision store is temporarily unavailable.
      console.warn("상품 캐시 갱신 상태를 확인하지 못했습니다.", error instanceof Error ? error.message : error);
    } finally {
      state.checkedAt = Date.now();
    }
  })();
  state.pending = request;
  try { await request; } finally { if (state.pending === request) state.pending = undefined; }
}

export async function invalidateProductCaches(target: CacheTarget) {
  const revision = randomUUID();
  const changes = target === "all" ? { sheets: revision, drive: revision } : { [target]: revision };
  // Publish first. A failed shared invalidation must not be reported as a successful reset.
  await revisionDocument().set({ ...changes, updatedAt: new Date().toISOString() }, { merge: true });
  state.mutation += 1;
  clearLocal(target);
  Object.assign(state.revision, changes);
  state.checkedAt = Date.now();
  return revision;
}
