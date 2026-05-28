import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "firebase/storage";
import { app } from "@/lib/firebase";
import { sanitizeFileName } from "@/lib/popups";

export const uploadPopupMainImage = async (popupId: string, file: File) => {
  const storage = getStorage(app);
  const storagePath = `popups/${popupId}/main/${Date.now()}_${sanitizeFileName(
    file.name,
  )}`;
  const storageRef = ref(storage, storagePath);
  const snapshot = await uploadBytes(storageRef, file);
  const imageUrl = await getDownloadURL(snapshot.ref);
  return { imageUrl, imageStoragePath: storagePath };
};

export const deletePopupStorageFile = async (storagePath?: string | null) => {
  if (!storagePath) return;
  try {
    const storage = getStorage(app);
    await deleteObject(ref(storage, storagePath));
  } catch (err) {
    console.warn("popup storage delete error:", err);
  }
};
