import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const APP_NAME = "published-catalog-reader";

// Reuse the credentials already available to next dev without changing its
// environment files or configuring the default admin app used by mutations.
export function developmentCatalogAccess() {
  let app = getApps().find((entry) => entry.name === APP_NAME);
  if (!app) {
    const hasFirebaseCredentials = Boolean(
      process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY,
    );
    const projectId = process.env.FIREBASE_PROJECT_ID || "lghicare-861b3";
    const clientEmail = hasFirebaseCredentials
      ? process.env.FIREBASE_CLIENT_EMAIL
      : process.env.GOOGLE_SERVICE_EMAIL;
    const privateKey = (hasFirebaseCredentials
      ? process.env.FIREBASE_PRIVATE_KEY
      : process.env.GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, "\n");
    if (!clientEmail || !privateKey)
      throw new Error("공개 상품 조회에 사용할 서버 인증이 설정되지 않았습니다.");
    app = initializeApp(
      { projectId, credential: cert({ projectId, clientEmail, privateKey }) },
      APP_NAME,
    );
  }
  return {
    db: getFirestore(app),
    bucket: getStorage(app).bucket(
      process.env.PRODUCT_CATALOG_BUCKET ||
      process.env.FIREBASE_STORAGE_BUCKET ||
      "lghicare-861b3.firebasestorage.app",
    ),
  };
}
