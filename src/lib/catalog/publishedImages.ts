import { initFirebaseAdmin } from "@/lib/firebaseAdmin";
import { readArtifact } from "./read";
import type { ArtifactRef } from "./types";
export type PublishedImageIndex = {
  id: string;
  ts: number;
  subFolders: Array<{ id?: string | null; name?: string | null }>;
  images: Record<string, string[]>;
  imageIndex: Record<string, string[]>;
  thumbnailIndex?: Record<string, string>;
};
type ImagePointer = { categories: Record<string, ArtifactRef> };
const globalCache = globalThis as typeof globalThis & {
  __publishedImages?: {
    checked: number;
    epoch: number;
    pointer?: ImagePointer;
    pending?: Promise<ImagePointer>;
  };
};
const state: NonNullable<typeof globalCache.__publishedImages> =
  (globalCache.__publishedImages ??= { checked: 0, epoch: 0 });
state.epoch ??= 0;
export function clearPublishedImages() {
  state.checked = 0;
  state.epoch++;
  state.pending = undefined;
}
export async function imagePointer(fresh = false): Promise<ImagePointer> {
  if (!fresh && state.pointer && Date.now() - state.checked < 15_000)
    return state.pointer;
  if (state.pending) return state.pending;
  const epoch = state.epoch;
  const pending = (async () => {
    try {
      const data = (
        await initFirebaseAdmin().doc("_system/productImageCatalog").get()
      ).data();
      const pointer = { categories: data?.categories ?? {} };
      if (epoch === state.epoch) {
        state.pointer = pointer;
        state.checked = Date.now();
      }
      return pointer;
    } catch (error) {
      if (state.pointer && !fresh) return state.pointer;
      // Images retain the legacy Drive fallback when the index is unavailable.
      if (!fresh) return { categories: {} };
      throw error;
    }
  })();
  state.pending = pending;
  try {
    return await pending;
  } finally {
    if (state.pending === pending) state.pending = undefined;
  }
}
export async function publishedImageIndex(
  category: string,
  fresh = false,
): Promise<PublishedImageIndex | null> {
  const reference = (await imagePointer(fresh)).categories[category];
  return reference ? readArtifact<PublishedImageIndex>(reference) : null;
}
