/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/manager/login.tsx

"use client";

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";
import { db, app } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
} from "firebase/firestore";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";

// 🔐 매니저 Auth 규칙 상수
const MANAGER_AUTH_EMAIL_SUFFIX = "@co.kr";
const MANAGER_AUTH_COMMON_PASSWORD = "q1w2e3r4@@!!@@";

const ManagerLoginPage: React.FC = () => {
  const router = useRouter();
  const auth = getAuth(app);

  const [managerId, setManagerId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // 이미 로그인된 상태면 role 확인 후 매니저면 /manager 로, 아니면 로그아웃
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setCurrentUser(null);
        setAuthChecking(false);
        return;
      }

      try {
        const userRef = doc(db, "users", fbUser.uid);
        const snap = await getDoc(userRef);
        const data = snap.exists() ? (snap.data() as any) : null;
        const role = data?.role as string | undefined;

        if (role === "manager" || role === "admin") {
          setCurrentUser(fbUser);

          // 기존 managerSession 유지 (users 문서 기준으로 구성)
          if (typeof window !== "undefined") {
            const isAdmin = role === "admin";
            const session = {
              id: fbUser.uid,
              managerId: isAdmin ? "admin" : data?.managerId ?? "",
              name:
                data?.name ??
                fbUser.displayName ??
                fbUser.email ??
                (isAdmin ? "관리자" : ""),
              branch: isAdmin ? "관리자" : data?.branch ?? "",
              region: isAdmin ? "" : data?.region ?? "",
              office: isAdmin ? "관리자" : data?.office ?? data?.branch ?? "",
              position: isAdmin ? "관리자" : data?.position ?? "",
              teamLeaderId: isAdmin ? "" : data?.teamLeaderId ?? "",
              role,
            };
            localStorage.setItem("managerSession", JSON.stringify(session));
          }

          router.replace("/manager");
        } else {
          // 매니저 전용 페이지이므로 다른 role 이면 강제 로그아웃
          await signOut(auth);
          setCurrentUser(null);
        }
      } catch (err) {
        console.error("매니저 로그인 상태 확인 오류:", err);
      } finally {
        setAuthChecking(false);
      }
    });

    return () => unsubscribe();
  }, [auth, router]);

  // 매니저 로그인 처리 (managerId + 개인 비번 → 공통 비번으로 Auth 로그인)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!managerId || !password) {
      setError("아이디와 패스워드를 모두 입력해주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const trimmedId = managerId.trim();

      if (trimmedId.includes("@")) {
        const cred = await signInWithEmailAndPassword(auth, trimmedId, password);
        const fbUser = cred.user;
        const userRef = doc(db, "users", fbUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? (userSnap.data() as any) : null;

        if (!userData || userData.role !== "admin") {
          await signOut(auth);
          setError("관리자 권한이 없는 계정입니다.");
          setLoading(false);
          return;
        }

        if (typeof window !== "undefined") {
          const session = {
            id: fbUser.uid,
            managerId: "admin",
            name:
              userData.name ??
              fbUser.displayName ??
              fbUser.email ??
              "관리자",
            branch: "관리자",
            region: "",
            office: "관리자",
            position: "관리자",
            teamLeaderId: "",
            role: "admin",
          };
          localStorage.setItem("managerSession", JSON.stringify(session));
        }

        router.replace("/manager");
        return;
      }

      const normalizedManagerId = trimmedId.toUpperCase();

      // 1) managerId로 users 컬렉션에서 매니저 계정 찾기
      const q = query(
        collection(db, "users"),
        where("role", "==", "manager"),
        where("managerId", "==", normalizedManagerId),
        limit(1),
      );

      const snap = await getDocs(q);

      if (snap.empty) {
        setError("아이디 또는 패스워드를 다시 확인해주세요.");
        setLoading(false);
        return;
      }

      const userDoc = snap.docs[0];
      const userData = userDoc.data() as any;

      // 2) Firestore에 저장된 로그인용 비밀번호와 비교
      const savedPassword = userData.password as string | undefined;
      if (!savedPassword || savedPassword !== password) {
        setError("아이디 또는 패스워드를 다시 확인해주세요.");
        setLoading(false);
        return;
      }

      // 3) 계정 활성 상태 체크
      if (userData.isActive === false) {
        setError("정지된 매니저 계정입니다. 관리자에게 문의해주세요.");
        setLoading(false);
        return;
      }

      // 4) 규칙에 따라 Auth용 이메일/비밀번호 구성
      const authEmail = `${normalizedManagerId}${MANAGER_AUTH_EMAIL_SUFFIX}`;
      const commonPassword = MANAGER_AUTH_COMMON_PASSWORD;

      // 5) Firebase Auth로 로그인 (공통 비밀번호 사용)
      const cred = await signInWithEmailAndPassword(
        auth,
        authEmail,
        commonPassword,
      );
      const fbUser = cred.user;

      // 🔍 추가 안전 체크: role 재검증
      const userRef = doc(db, "users", fbUser.uid);
      const userSnap = await getDoc(userRef);
      const latestUserData = userSnap.exists()
        ? (userSnap.data() as any)
        : userData;
      const role = latestUserData?.role as string | undefined;

      if (!latestUserData || role !== "manager") {
        await signOut(auth);
        setError("매니저 권한이 없는 계정입니다.");
        setLoading(false);
        return;
      }

      if (latestUserData.isActive === false) {
        await signOut(auth);
        setError("정지된 매니저 계정입니다. 관리자에게 문의해주세요.");
        setLoading(false);
        return;
      }

      // managerSession 로컬 스토리지 유지
      if (typeof window !== "undefined") {
        const session = {
          id: fbUser.uid,
          managerId: latestUserData.managerId ?? normalizedManagerId,
          name: latestUserData.name ?? "",
          branch: latestUserData.branch ?? "",
          region: latestUserData.region ?? "",
          office: latestUserData.office ?? latestUserData.branch ?? "",
          position: latestUserData.position ?? "",
          teamLeaderId: latestUserData.teamLeaderId ?? "",
        };
        localStorage.setItem("managerSession", JSON.stringify(session));
      }

      router.replace("/manager");
    } catch (err: any) {
      console.error("매니저 로그인 오류:", err);
      let message = "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";

      if (err.code === "auth/user-not-found") {
        message = "등록되지 않은 아이디입니다.";
      } else if (err.code === "auth/wrong-password") {
        // 여기서는 공통 비밀번호가 틀린 경우이므로 일반 메시지로 처리
        message = "로그인 정보를 다시 확인해주세요.";
      } else if (err.code === "auth/invalid-email") {
        message = "아이디 형식을 다시 확인해주세요.";
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (authChecking) {
    return (
      <PageWrapper>
        <LoginCard>
          <Title>
            <LogoImg src={"/images/logo.png"} alt="logo" />
            <br />
            매니저 로그인
          </Title>
          <LoadingText>로그인 상태를 확인하고 있어요..</LoadingText>
        </LoginCard>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <LoginCard>
        <Title>
          <LogoImg src={"/images/logo.png"} alt="logo" />
          <br />
          매니저 로그인
        </Title>
        <form onSubmit={handleSubmit}>
          <Field>
            <Label>업무등록번호 또는 관리자 이메일</Label>
            <Input
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              placeholder="예: H01064 또는 admin@example.com"
            />
          </Field>
          <Field>
            <Label>비밀번호</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="예: 900101"
            />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
          <SubmitButton type="submit" disabled={loading}>
            {loading ? "로그인 중.." : "로그인"}
          </SubmitButton>
        </form>
      </LoginCard>
    </PageWrapper>
  );
};

export default ManagerLoginPage;

// ========== styled-components (기존 그대로 사용) ==========

const PageWrapper = styled.div`
  min-height: 100vh;
  background: #f7f7f7;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LoginCard = styled.div`
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 12px;
  padding: 24px 24px 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 18px;
  text-align: center;
`;

const LogoImg = styled.img`
  height: 22px;
  margin-bottom: 8px;
`;

const Field = styled.div`
  margin-bottom: 12px;
`;

const Label = styled.div`
  font-size: 13px;
  margin-bottom: 4px;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 13px;
`;

const ErrorText = styled.div`
  margin-top: 4px;
  margin-bottom: 10px;
  font-size: 12px;
  color: #e74c3c;
`;

const SubmitButton = styled.button`
  width: 100%;
  padding: 9px 0;
  border-radius: 6px;
  border: none;
  background: #333;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  margin-top: 4px;

  &:hover {
    background: #111;
  }

  &:disabled {
    background: #aaa;
    cursor: default;
  }
`;

const LoadingText = styled.div`
  font-size: 13px;
  color: #555;
  text-align: center;
  margin-top: 8px;
`;
