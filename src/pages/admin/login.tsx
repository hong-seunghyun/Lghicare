/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/login.tsx

import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import styled from "styled-components";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { app, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

const LoginPage: React.FC = () => {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true); // 로그인 상태 확인중
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false); // 로그인 버튼 로딩
  const [error, setError] = useState<string | null>(null);

  const auth = getAuth(app);

  // ✅ 로그인 상태 확인 (이미 로그인되어 있으면 role 확인 후 /admin 으로 보냄)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setAuthChecking(false);
        return;
      }

      try {
        // users/{uid} 에서 role 확인
        const userRef = doc(db, "users", currentUser.uid);
        const snap = await getDoc(userRef);
        const data = snap.exists() ? (snap.data() as any) : null;
        const role = data?.role as string | undefined;
        console.log(role);
        if (role === "admin") {
          // 관리자 계정만 통과
          setUser(currentUser);
          router.replace("/admin");
        } else {
          setUser(currentUser);
          setError("관리자 권한이 없는 계정입니다.");
        }
      } catch (err) {
        console.error("로그인 상태 확인 중 오류:", err);
        setUser(null);
        setError("로그인 상태 확인 중 오류가 발생했습니다.");
      } finally {
        setAuthChecking(false);
      }
    });

    return () => unsubscribe();
  }, [auth, router]);

  // ✅ 로그인 처리
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      setError("이메일과 비밀번호를 모두 입력해주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1) Firebase Auth 로그인
      const cred = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const fbUser = cred.user;

      // 2) users/{uid} 문서에서 role 확인
      const userRef = doc(db, "users", fbUser.uid);
      const snap = await getDoc(userRef);
      const data = snap.exists() ? (snap.data() as any) : null;
      const role = data?.role as string | undefined;

      if (role !== "admin") {
        // 관리자 전용 로그인 페이지이므로, admin 이 아니면 바로 로그아웃 + 에러 처리
        await signOut(auth);
        setError("관리자 권한이 없는 계정입니다.");
        return;
      }

      // 3) role === "admin" 인 경우에만 관리자 대시보드로 이동
      router.replace("/admin");
    } catch (err: any) {
      console.error("로그인 실패:", err);
      let message = "로그인 중 오류가 발생했습니다.";

      if (err.code === "auth/user-not-found") {
        message = "등록되지 않은 이메일입니다.";
      } else if (err.code === "auth/wrong-password") {
        message = "비밀번호를 다시 확인해주세요.";
      } else if (err.code === "auth/invalid-email") {
        message = "유효한 이메일 형식이 아닙니다.";
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ 로그인 상태 확인중 로딩 UI
  if (authChecking) {
    return (
      <FullScreenCenter>
        <LoadingText>로그인 상태를 확인하고 있어요...</LoadingText>
      </FullScreenCenter>
    );
  }

  return (
    <PageWrapper>
      <Card>
        <Title>
          <LogoImg src={"/images/logo.png"} alt="logo" />
          <br />
          관리자 로그인
        </Title>

        <LoginForm onSubmit={handleLogin}>
          <Field>
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="email"
            />
          </Field>

          <Field>
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              autoComplete="current-password"
            />
          </Field>

          {error && <ErrorText>{error}</ErrorText>}

          <SubmitButton type="submit" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </SubmitButton>
        </LoginForm>
      </Card>
    </PageWrapper>
  );
};

export default LoginPage;

// === 아래 styled-components는 기존 것 그대로 둔다고 가정 ===

const FullScreenCenter = styled.div`
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LoadingText = styled.div`
  font-size: 14px;
  color: #555;
`;

const PageWrapper = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f6f8;
`;

const Card = styled.div`
  width: 360px;
  padding: 24px 28px 28px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
`;

const Title = styled.h1`
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 16px;
  text-align: center;
`;

const LoginForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
`;

const Label = styled.label`
  font-size: 13px;
  margin-bottom: 4px;
`;

const Input = styled.input`
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 13px;
`;

const ErrorText = styled.div`
  margin-top: 4px;
  font-size: 12px;
  color: #e74c3c;
`;

const SubmitButton = styled.button`
  margin-top: 8px;
  padding: 9px 12px;
  border-radius: 8px;
  border: none;
  background: #333;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;

  &:hover {
    background: #111;
  }

  &:disabled {
    background: #aaa;
    cursor: default;
  }
`;

const LogoImg = styled.img`
  width: auto;
  height: 22px;

  @media (max-width: 499px) {
    height: 16px;
  }
`;
