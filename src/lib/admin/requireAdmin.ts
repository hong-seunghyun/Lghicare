import type { NextApiRequest } from "next";
import { getAuth } from "firebase-admin/auth";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";

export class AdminRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireAdmin(req: NextApiRequest): Promise<string> {
  const bearer = req.headers.authorization;
  if (!bearer?.startsWith("Bearer ") || bearer.length > 8192)
    throw new AdminRequestError(401, "관리자 로그인이 필요합니다.");
  const db = initFirebaseAdmin();
  let uid: string;
  try {
    uid = (await getAuth().verifyIdToken(bearer.slice(7), true)).uid;
  } catch {
    throw new AdminRequestError(
      401,
      "로그인이 만료되었습니다. 다시 로그인해 주세요.",
    );
  }
  const user = await db.doc(`users/${uid}`).get();
  if (user.data()?.role !== "admin")
    throw new AdminRequestError(403, "관리자만 사용할 수 있습니다.");
  return uid;
}
export function adminError(error: unknown) {
  if (error instanceof AdminRequestError)
    return { status: error.status, message: error.message };
  console.error(
    "상품 관리 요청 실패",
    error instanceof Error ? error.message : error,
  );
  return {
    status: 503,
    message:
      "처리를 완료하지 못했습니다. 기존 운영 데이터는 유지됩니다. 상태를 확인한 뒤 다시 시도해 주세요.",
  };
}
