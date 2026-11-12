import { getAuth } from "firebase/auth";
import { app } from "@/lib/firebase";

export async function adminCatalogRequest<T>(
  path: string,
  body?: unknown,
  file?: File,
): Promise<T> {
  const user = getAuth(app).currentUser;
  if (!user) throw new Error("관리자 로그인이 필요합니다.");
  const response = await fetch(path, {
    method: file || body !== undefined ? "POST" : "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(file
        ? {
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
          }
        : body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
    },
    body: file || (body === undefined ? undefined : JSON.stringify(body)),
  });
  const data = await response.json();
  if (!response.ok || data.ok === false)
    throw new Error(data.message || "처리를 완료하지 못했습니다.");
  return data as T;
}
