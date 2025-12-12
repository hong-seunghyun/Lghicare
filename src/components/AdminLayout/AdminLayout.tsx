/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState } from "react";
import styled, { css } from "styled-components";
import { useRouter } from "next/router";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { app, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import Link from "next/link";

interface Props {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: Props) {
  const router = useRouter();
  const auth = getAuth(app);

  const [checking, setChecking] = useState(true); // 로그인+권한 체크 중
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // ✅ 로그인 여부 + users 컬렉션의 role=admin 권한 체크
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // 1) 로그인 안 되어 있으면 → /admin/login 으로
      if (!currentUser) {
        setIsAdmin(false);
        setChecking(false);
        router.replace("/admin/login");
        return;
      }

      // 2) users/{uid} 문서에서 role 확인 (admin인지)
      const checkAdmin = async () => {
        try {
          const userRef = doc(db, "users", currentUser.uid);
          const snap = await getDoc(userRef);
          const data = snap.exists() ? (snap.data() as any) : null;
          const role = data?.role as string | undefined;

          console.log("[AdminLayout] role:", role);

          if (role === "admin") {
            // ✅ 관리자 권한 OK
            setIsAdmin(true);
          } else {
            // ❌ 관리자 아님 (매니저/일반 유저 등)
            // 👉 로그인은 유지하고, 권한만 막고 메인으로 보냄
            setIsAdmin(false);
            setChecking(false);
            alert("권한이 없습니다.");
            router.replace("/");
            return;
          }
        } catch (error) {
          console.error("관리자 권한 확인 중 오류:", error);
          setIsAdmin(false);
          // 오류 시에는 세션 정리하고 관리자 로그인 페이지로
          await signOut(auth);
          router.replace("/admin/login");
        } finally {
          setChecking(false);
        }
      };

      checkAdmin();
    });

    return () => unsubscribe();
  }, [auth, router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/admin/login");
  };

  const navItems = [
    { label: "대시보드", path: "/admin" },
    { label: "제품 관리", path: "/admin/missing-images" },
    { label: "공지사항", path: "/admin/notices" },
    { label: "캐시 관리", path: "/admin/cache" },
    { label: "제휴카드 관리", path: "/admin/card" },
    { label: "선납 관리", path: "/admin/prepay" },
    { label: "구독교원 관리", path: "/admin/teacher" },
    { label: "매니저 관리", path: "/admin/manager" },
  ];

  // ✅ 체크 중에는 전체 레이아웃 대신 로딩 화면
  if (checking) {
    return (
      <FullScreenCenter>관리자 권한을 확인하는 중입니다...</FullScreenCenter>
    );
  }

  // ✅ 관리자 아님 (리다이렉트 중이거나, URL로 억지 접근한 경우)
  if (!isAdmin) {
    return (
      <FullScreenCenter>관리자만 접근할 수 있는 페이지입니다.</FullScreenCenter>
    );
  }

  // ✅ 여기까지 왔으면: 로그인 + admin 권한 OK
  return (
    <Container>
      <Sidebar>
        <Logo>
          <Link href="https://lghicaresolution.com/">
            <LogoImg src={"/images/logo.png"} alt="logo" />
            관리자 페이지
          </Link>
        </Logo>

        <Nav>
          {navItems.map((item) => {
            const isActive = router.pathname.startsWith(item.path);
            return (
              <NavItem
                key={item.path}
                onClick={() => router.push(item.path)}
                $active={isActive}
              >
                {item.label}
              </NavItem>
            );
          })}
        </Nav>
      </Sidebar>

      <MainArea>
        <TopBar>
          <TopLeft />
          <TopRight>
            <LogoutButton onClick={handleLogout}>로그아웃</LogoutButton>
          </TopRight>
        </TopBar>

        <Content>{children}</Content>
      </MainArea>
    </Container>
  );
}
// ================== styled-components ==================

const FullScreenCenter = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  background: #fff;
`;

const Container = styled.div`
  display: flex;
  width: 100%;
  min-height: 100vh;
  background: #fff;
`;

const Sidebar = styled.div`
  width: 240px;
  background: #fff;
  color: #fff;
  display: flex;
  flex-direction: column;
  padding: 20px 0;
  border-right: 1px solid #ccc;
`;

const Logo = styled.div`
  font-size: 14px;
  font-weight: 700;
  padding: 0 24px;
  margin-bottom: 32px;
`;

const Nav = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const NavItem = styled.div<{ $active?: boolean }>`
  padding: 12px 24px;
  cursor: pointer;
  font-size: 15px;
  transition: 0.2s;

  ${({ $active }) =>
    $active
      ? css`
          background: #bebebeff;
          font-weight: 600;
        `
      : css`
          &:hover {
            background: #e9e9e9ff;
          }
        `}
`;

const MainArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const TopBar = styled.div`
  height: 56px;
  background: #ffffff;
  border-bottom: 1px solid #e5e5e5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
`;

const TopLeft = styled.div``;

const TopRight = styled.div``;

const LogoutButton = styled.button`
  padding: 8px 14px;
  background: #333;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background: #111;
  }
`;

const Content = styled.div`
  padding: 24px;
  flex: 1;
`;

const LogoImg = styled.img`
  width: auto;
  height: 22px;

  @media (max-width: 499px) {
    height: 16px;
  }
`;
