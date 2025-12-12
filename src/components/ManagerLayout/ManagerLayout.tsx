/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";
import { db, app } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";

interface ManagerSession {
  id: string;
  managerId: string;
  name: string;
  branch: string;
}

interface Props {
  children: React.ReactNode;
}

export default function ManagerLayout({ children }: Props) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [manager, setManager] = useState<ManagerSession | null>(null);

  const auth = getAuth(app);

  // ✅ 네비 아이템 정의
  const navItems = [
    { label: "대시보드", path: "/manager" },
    { label: "견적서 관리", path: "/manager/estimates" },
    { label: "공지사항", path: "/manager/notices" },
  ];

  useEffect(() => {
    // ✅ 현재 Firebase Auth 유저 기준으로 매니저 권한 체크
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      try {
        if (!fbUser) {
          // 로그인 자체가 안 되어 있으면 세션 지우고 로그인 페이지로
          if (typeof window !== "undefined") {
            localStorage.removeItem("managerSession");
          }
          setManager(null);
          setChecking(false);
          router.replace("/manager/login");
          return;
        }

        // users/{uid} 에서 role / isActive 확인
        const ref = doc(db, "users", fbUser.uid);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("managerSession");
          }
          setManager(null);
          setChecking(false);
          alert("매니저 계정으로 로그인해주세요.");
          router.replace("/manager/login");
          return;
        }

        const data = snap.data() as any;

        // 🔐 role이 manager가 아니면 접근 차단
        if (data.role !== "manager") {
          if (typeof window !== "undefined") {
            localStorage.removeItem("managerSession");
          }
          setManager(null);
          setChecking(false);
          alert("매니저 계정으로 로그인해주세요.");
          router.replace("/manager/login");
          return;
        }

        // 🔐 비활성 계정이면 차단
        if (data.isActive === false) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("managerSession");
          }
          setManager(null);
          setChecking(false);
          alert("정지된 매니저 계정입니다. 관리자에게 문의해주세요.");
          router.replace("/manager/login");
          return;
        }

        // ✅ 여기까지 통과하면 정상 매니저
        const stored =
          typeof window !== "undefined"
            ? localStorage.getItem("managerSession")
            : null;
        let parsed: ManagerSession | null = null;

        if (stored) {
          try {
            parsed = JSON.parse(stored) as ManagerSession;
          } catch {
            parsed = null;
          }
        }

        const session: ManagerSession = {
          id: fbUser.uid,
          managerId: data.managerId || parsed?.managerId || "",
          name: data.name || parsed?.name || "",
          branch: data.branch || parsed?.branch || "",
        };

        // 최신 세션 정보 로컬에도 저장
        if (typeof window !== "undefined") {
          localStorage.setItem("managerSession", JSON.stringify(session));
        }

        setManager(session);
        setChecking(false);
      } catch (error) {
        console.error("매니저 세션 확인 오류:", error);
        if (typeof window !== "undefined") {
          localStorage.removeItem("managerSession");
        }
        setManager(null);
        setChecking(false);
        router.replace("/manager/login");
      }
    });

    return () => unsubscribe();
  }, [auth, router]);

  const handleLogout = async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("managerSession");
      }
      await signOut(auth); // ✅ 실제 Firebase 로그아웃
    } catch (error) {
      console.error("매니저 로그아웃 오류:", error);
    } finally {
      router.replace("/manager/login");
    }
  };

  if (checking) {
    return (
      <FullScreenCenter>매니저 권한을 확인하는 중입니다...</FullScreenCenter>
    );
  }

  if (!manager) {
    return (
      <FullScreenCenter>
        매니저 전용 페이지입니다. 다시 로그인해주세요.
      </FullScreenCenter>
    );
  }

  return (
    <Container>
      <TopBar>
        <TopLeft>
          <Title>매니저 대시보드</Title>
        </TopLeft>
        <TopRight>
          <ManagerInfo>
            <span>{manager.branch}</span>
            <strong>{manager.name}</strong>
          </ManagerInfo>
          <LogoutButton type="button" onClick={handleLogout}>
            로그아웃
          </LogoutButton>
        </TopRight>
      </TopBar>

      {/* 🔥 매니저 네비게이션 (견적서 관리 / 공지사항) */}
      <SubNavBar>
        {navItems.map((item) => {
          const isActive = router.pathname.startsWith(item.path);
          return (
            <SubNavItem
              key={item.path}
              type="button"
              $active={isActive}
              onClick={() => router.push(item.path)}
            >
              {item.label}
            </SubNavItem>
          );
        })}
      </SubNavBar>

      <Content>{children}</Content>
    </Container>
  );
}

// =============== styled-components ===============

const FullScreenCenter = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  background: #f7f7f7;
`;

const Container = styled.div`
  min-height: 100vh;
  background: #f7f7f7;
  display: flex;
  flex-direction: column;
`;

const TopBar = styled.div`
  height: 56px;
  background: #ffffff;
  border-bottom: 1px solid #e5e5e5;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const TopLeft = styled.div``;

const TopRight = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Title = styled.h1`
  font-size: 18px;
  font-weight: 600;
`;

const ManagerInfo = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  span {
    font-size: 11px;
    color: #888;
  }
  strong {
    font-size: 13px;
  }
`;

const LogoutButton = styled.button`
  padding: 7px 12px;
  border-radius: 6px;
  border: 1px solid #ddd;
  background: #fff;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: #f5f5f5;
  }
`;

// 🔥 매니저 네비게이션 바
const SubNavBar = styled.div`
  height: 44px;
  background: #fdfdfd;
  border-bottom: 1px solid #e5e5e5;
  padding: 0 24px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SubNavItem = styled.button<{ $active?: boolean }>`
  padding: 7px 12px;
  border-radius: 999px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  background: ${({ $active }) => ($active ? "#333" : "transparent")};
  color: ${({ $active }) => ($active ? "#fff" : "#555")};

  &:hover {
    background: ${({ $active }) => ($active ? "#222" : "#f1f1f1")};
  }
`;

const Content = styled.div`
  padding: 24px;
  flex: 1;
`;
