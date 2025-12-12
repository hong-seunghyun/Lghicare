/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { app, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export function useAdminGuard() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();
  const auth = getAuth(app);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      try {
        if (!fbUser) {
          // 로그인 안 된 상태 → 메인으로
          setIsAdmin(false);
          setChecking(false);
          alert("관리자 로그인이 필요합니다.");
          router.replace("/");
          return;
        }

        const ref = doc(db, "users", fbUser.uid);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          // users 문서 없음 → 권한 없음 처리
          setIsAdmin(false);
          setChecking(false);
          alert("권한이 없습니다.");
          router.replace("/");
          return;
        }

        const data = snap.data() as any;
        const role = data.role as string | undefined;

        if (role !== "admin") {
          // 🔥 여기서 매니저/일반유저가 admin 페이지에 접근했을 때 걸러짐
          setIsAdmin(false);
          setChecking(false);
          alert("권한이 없습니다.");
          router.replace("/");
          return;
        }

        // ✅ 진짜 관리자
        setIsAdmin(true);
        setChecking(false);
      } catch (error) {
        console.error("어드민 권한 체크 오류:", error);
        setIsAdmin(false);
        setChecking(false);
        alert("권한이 없습니다.");
        router.replace("/");
      }
    });

    return () => unsubscribe();
  }, [auth, router]);

  return { checking, isAdmin };
}
