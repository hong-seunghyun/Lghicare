/* eslint-disable @typescript-eslint/no-explicit-any */
// src/contexts/UserContext.tsx

"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { app, db } from "@/lib/firebase";

type UserRole = "admin" | "manager" | "user" | "normal" | null;

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  raw: FirebaseUser;
  profile?: any; // Firestore users 문서 데이터
}

interface UserContextValue {
  user: AppUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

const auth = getAuth(app);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 🔥 Firestore users/{uid}에서 role 포함 프로필 가져오기
  const loadUserProfile = async (fbUser: FirebaseUser | null) => {
    if (!fbUser) {
      setUser(null);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const userRef = doc(db, "users", fbUser.uid);
      const snap = await getDoc(userRef);

      let role: UserRole = null;
      let profile: any = null;

      if (snap.exists()) {
        const data = snap.data() as any;
        profile = data;
        role =
          (data.role as UserRole) ??
          null; /* role이 없으면 null로 두고, 라우트 가드에서 막을 수 있음 */
      }

      const appUser: AppUser = {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
        role,
        raw: fbUser,
        profile,
      };

      setUser(appUser);
    } catch (err: any) {
      console.error("UserContext: 프로필 로드 오류:", err);
      setError("사용자 정보를 불러오는 중 오류가 발생했습니다.");
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // 🔄 외부에서 강제로 리프레시하고 싶을 때 사용
  const refresh = async () => {
    const fbUser = auth.currentUser;
    await loadUserProfile(fbUser);
  };

  // 🔐 로그아웃
  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setError(null);
    } catch (err: any) {
      console.error("UserContext: 로그아웃 오류:", err);
      setError("로그아웃 중 오류가 발생했습니다.");
    }
  };

  // 최초 마운트 시 onAuthStateChanged 구독
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      // auth 상태 변경마다 Firestore users/{uid}까지 함께 로딩
      loadUserProfile(fbUser);
    });

    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: UserContextValue = useMemo(
    () => ({
      user,
      loading,
      error,
      refresh,
      logout,
    }),
    [user, loading, error]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export const useUser = (): UserContextValue => {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser는 UserProvider 안에서만 사용할 수 있습니다.");
  }
  return ctx;
};
