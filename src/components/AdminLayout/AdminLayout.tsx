/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { useRouter } from "next/router";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { app, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import Link from "next/link";
import {
  getAdminBoardNavigationItems,
  getAdminStandardEstimateNavigationItem,
} from "@/config/boardCategories";

interface Props {
  children: React.ReactNode;
}

type NavItemType =
  | { type: "link"; label: string; path: string }
  | {
      type: "group";
      label: string;
      path: string; // 그룹 대표 path (active 판단용)
      children: { label: string; path: string }[];
    };

export default function AdminLayout({ children }: Props) {
  const router = useRouter();
  const auth = getAuth(app);

  const [checking, setChecking] = useState(true); // 권한 체크 중
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // 게시판 펼침 상태
  const [boardOpen, setBoardOpen] = useState<boolean>(false);

  // 로그인 상태 + users 컬렉션 role=admin 권한 체크
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // 로그인 안되어 있으면 /admin/login
      if (!currentUser) {
        setIsAdmin(false);
        setChecking(false);
        router.replace("/admin/login");
        return;
      }

      // users/{uid} 문서에서 role 확인 (admin인지)
      const checkAdmin = async () => {
        try {
          const userRef = doc(db, "users", currentUser.uid);
          const snap = await getDoc(userRef);
          const data = snap.exists() ? (snap.data() as any) : null;
          const role = data?.role as string | undefined;

          if (role === "admin") {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
            setChecking(false);
            if (typeof window !== "undefined") {
              alert("권한이 없습니다.");
              window.location.href = "https://lghicaresolution.com/";
            }
            return;
          }
        } catch (error) {
          console.error("관리자 권한 확인 오류:", error);
          setIsAdmin(false);
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

  // 게시판 하위 카테고리 구성 (코드에서 확장 가능)
  const boardChildren = useMemo(() => getAdminBoardNavigationItems(), []);
  const standardEstimateNav = useMemo(
    () => getAdminStandardEstimateNavigationItem(),
    [],
  );

  const navItems: NavItemType[] = useMemo(
    () => {
      const items: NavItemType[] = [
        { type: "link", label: "대시보드", path: "/admin" },
        { type: "link", label: "상세 분석", path: "/admin/analytics" },
        { type: "link", label: "견적내기", path: "/estimate" },
        ...(standardEstimateNav
          ? [{ type: "link" as const, ...standardEstimateNav }]
          : []),
        { type: "link", label: "메인 배너 관리", path: "/admin/main-banners" },
        {
          type: "link",
          label: "금주의 테마상품 관리",
          path: "/admin/theme-products",
        },
        {
          type: "link",
          label: "프로모션 세트 견적 관리",
          path: "/admin/promotion-set-estimate",
        },
        {
          type: "group",
          label: "게시판 관리",
          path: "/admin/boards", // active 판단용(prefix)
          children: boardChildren,
        },
        { type: "link", label: "팝업 관리", path: "/admin/popups" },
        { type: "link", label: "제휴카드 관리", path: "/admin/card" },
        { type: "link", label: "선결제 관리", path: "/admin/prepay" },
        { type: "link", label: "구독교원 관리", path: "/admin/teacher" },
        { type: "link", label: "상품 관리", path: "/admin/missing-images" },
        { type: "link", label: "상품권 관리", path: "/admin/voucher" },
        { type: "link", label: "매니저 관리", path: "/admin/manager" },
        { type: "link", label: "캐시 관리", path: "/admin/cache" },
      ];

      return items;
    },
    [boardChildren, standardEstimateNav],
  );

  // 현재 경로가 게시판 하위 페이지면 자동으로 펼침
  useEffect(() => {
    const isBoardRoute =
      typeof router.pathname === "string" &&
      router.pathname.startsWith("/admin/boards");
    if (isBoardRoute) setBoardOpen(true);
  }, [router.pathname]);

  // 체크 중 전체 로딩 화면
  if (checking) {
    return (
      <FullScreenCenter>관리자 권한을 확인하는 중입니다...</FullScreenCenter>
    );
  }

  // 관리자 아님
  if (!isAdmin) {
    return (
      <FullScreenCenter>관리자만 접근할 수 있는 페이지입니다.</FullScreenCenter>
    );
  }

  // 로그인 + admin 권한 OK
  return (
    <Container>
      <Sidebar>
        <Nav>
          {navItems.map((item) => {
            if (item.type === "link") {
              const isActive =
                item.path === "/admin"
                  ? router.pathname === "/admin"
                  : router.pathname.startsWith(item.path);
              return (
                <NavItem
                  key={item.path}
                  onClick={() => router.push(item.path)}
                  $active={isActive}
                >
                  {item.label}
                </NavItem>
              );
            }

            const groupActive =
              router.pathname.startsWith(item.path) ||
              item.children.some((c) => router.pathname.startsWith(c.path));

            const open = boardOpen || groupActive;

            return (
              <div key={item.path}>
                <NavItem
                  onClick={() => {
                    setBoardOpen((prev) => !prev);
                    if (item.children.length > 0) {
                      router.push(item.children[0].path);
                    }
                  }}
                  $active={groupActive}
                >
                  <GroupRow>
                    <span>{item.label}</span>
                  </GroupRow>
                </NavItem>

                <SubNav $open={open}>
                  {item.children.map((child) => {
                    const childActive = router.pathname.startsWith(child.path);
                    return (
                      <SubNavItem
                        key={child.path}
                        onClick={() => router.push(child.path)}
                        $active={childActive}
                      >
                        {child.label}
                      </SubNavItem>
                    );
                  })}
                </SubNav>
              </div>
            );
          })}
        </Nav>
      </Sidebar>

      <MainArea>
        <TopBar>
          <Logo>
            <Link href="https://lghicaresolution.com/">
              <LogoImg src={"/images/logo.png"} alt="logo" />
              관리자 페이지
            </Link>
          </Logo>
          <TopLeft />
          <TopRight>
            <SiteLinkButton href="https://lghicaresolution.com/">
              사이트로 이동
            </SiteLinkButton>
            <SiteLinkButton href="/manager">매니저 페이지</SiteLinkButton>
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
  position: relative;
`;

const Container = styled.div`
  display: flex;
  width: 100%;
  min-height: 100vh;
  background: #fff;
`;

const Sidebar = styled.div`
  position: absolute;
  left: 0;
  top: 93px;
  width: 240px;
  background: #fff;
  color: #fff;
  display: flex;
  flex-direction: column;
  padding: 20px 15px;
`;

const Logo = styled.div`
  font-size: 14px;
  font-weight: 700;
  > a {
    display: flex;
    align-items: center;
    flex-direction: column;
    justify-content: center;
  }
`;

const Nav = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const NavItem = styled.div<{ $active?: boolean }>`
  padding: 12px 40px;
  cursor: pointer;
  font-size: 16px;
  border-radius: 99px;
  transition: 0.2s;
  background: #fff;

  ${({ $active }) =>
    $active
      ? css`
          background: #e7eff9;
          font-weight: 600;
        `
      : css`
          &:hover {
            background: #d5e4f5;
          }
        `}
`;

const GroupRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`;

const SubNav = styled.div<{ $open: boolean }>`
  overflow: hidden;
  max-height: ${(p) => (p.$open ? "900px" : "0")};
  transition: max-height 0.2s ease;
`;

const SubNavItem = styled.div<{ $active?: boolean }>`
  padding: 10px 0px 10px 55px;
  cursor: pointer;
  font-size: 14px;

  ${(p) =>
    p.$active &&
    css`
      font-weight: 700;
    `}
`;

const MainArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const TopBar = styled.div`
  height: 93px;
  background: #ffffff;
  border-bottom: 1px solid #e5e5e5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 30px;
`;

const TopLeft = styled.div``;

const TopRight = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
`;

const LogoutButton = styled.button`
  width: 120px;
  height: 35px;
  background: #000;
  border: 1px solid #000;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
`;
const SiteLinkButton = styled.a`
  width: 120px;
  height: 35px;
  background: #ffffff;
  border: 1px solid #dddddd;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  color: #484848;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Content = styled.div`
  margin-left: 240px;
  flex: 1;
  border-left: 1px solid #ddd;
`;

const LogoImg = styled.img`
  width: auto;
  height: 22px;

  @media (max-width: 499px) {
    height: 16px;
  }
`;
