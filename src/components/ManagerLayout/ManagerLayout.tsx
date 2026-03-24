/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { useRouter } from "next/router";
import Link from "next/link";
import { db, app } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { getManagerSalesHubNavigationItems } from "@/config/boardCategories";

interface ManagerSession {
  id: string;
  managerId: string;
  name: string;
  branch: string;
  region: string;
  office: string;
  position: string;
  teamLeaderId: string;
}

interface Props {
  children: React.ReactNode;
}

type NavItemType =
  | { type: "link"; label: string; path: string }
  | {
      type: "group";
      label: string;
      path: string;
      children: { label: string; path: string }[];
    };

export default function ManagerLayout({ children }: Props) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [manager, setManager] = useState<ManagerSession | null>(null);
  const [boardOpen, setBoardOpen] = useState<boolean>(false);

  const auth = getAuth(app);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      try {
        if (!fbUser) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("managerSession");
          }
          setManager(null);
          setChecking(false);
          router.replace("/manager/login");
          return;
        }

        const ref = doc(db, "users", fbUser.uid);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("managerSession");
          }
          setManager(null);
          setChecking(false);
          alert("매니저 계정으로 로그인해 주세요.");
          router.replace("/manager/login");
          return;
        }

        const data = snap.data() as any;

        if (data.role !== "manager") {
          if (typeof window !== "undefined") {
            localStorage.removeItem("managerSession");
          }
          setManager(null);
          setChecking(false);
          if (typeof window !== "undefined") {
            alert("권한이 없습니다.");
            window.location.href = "https://lghicaresolution.com/";
          }
          return;
        }

        if (data.isActive === false) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("managerSession");
          }
          setManager(null);
          setChecking(false);
          alert("현재 비활성화된 매니저 계정입니다. 관리자에게 문의해주세요.");
          router.replace("/manager/login");
          return;
        }

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
          branch: data.branch || data.office || parsed?.branch || "",
          region: data.region || parsed?.region || "",
          office: data.office || data.branch || parsed?.office || "",
          position: data.position || parsed?.position || "",
          teamLeaderId: data.teamLeaderId || parsed?.teamLeaderId || "",
        };

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
      await signOut(auth);
    } catch (error) {
      console.error("매니저 로그아웃 오류:", error);
    } finally {
      router.replace("/manager/login");
    }
  };

  const boardChildren = useMemo(() => getManagerSalesHubNavigationItems(), []);

  const hasManagerManagementAccess = useMemo(() => {
    if (!manager?.position) return false;
    const position = manager.position;
    return (
      position.includes("리더사무소장") ||
      position.includes("사무소장") ||
      position.includes("팀장")
    );
  }, [manager]);

  const navItems: NavItemType[] = useMemo(() => {
    const items: NavItemType[] = [
      { type: "link", label: "대시보드", path: "/manager" },

      { type: "link", label: "견적내기", path: "/estimate" },
      {
        type: "group",
        label: "게시판",
        path: "/manager/boards",
        children: boardChildren,
      },
      { type: "link", label: "비밀번호 변경", path: "/manager/password" },
    ];

    if (hasManagerManagementAccess) {
      items.push({ type: "link", label: "매니저 관리", path: "/manager/management" });
    }

    return items;
  }, [boardChildren, hasManagerManagementAccess]);

  useEffect(() => {
    const isBoardRoute =
      typeof router.pathname === "string" &&
      router.pathname.startsWith("/manager/boards");
    if (isBoardRoute) setBoardOpen(true);
  }, [router.pathname]);

  if (checking) {
    return (
      <FullScreenCenter>매니저 권한을 확인하는 중입니다...</FullScreenCenter>
    );
  }

  if (!manager) {
    return (
      <FullScreenCenter>
        매니저 전용 페이지입니다. 다시 로그인해 주세요.
      </FullScreenCenter>
    );
  }

  return (
    <Container>
      <Sidebar>
        <Nav>
          {navItems.map((item) => {
            if (item.type === "link") {
              const isActive =
                item.path === "/manager"
                  ? router.pathname === "/manager"
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
            <Link href="/manager">
              <LogoImg src={"/images/logo.png"} alt="logo" />
              매니저 페이지
            </Link>
          </Logo>
          <TopLeft />
          <TopRight>
            <ManagerInfo>
              <span>{manager.office || manager.branch}</span>
              <strong>{manager.name}</strong>
            </ManagerInfo>
            <SiteLink
              href="https://lghicaresolution.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              사이트로 바로가기
            </SiteLink>
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

const SiteLink = styled.a`
  height: 35px;
  padding: 0 16px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  color: #000;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  text-decoration: none;

  &:hover {
    background: #f2f2f2;
  }
`;

const Content = styled.div`
  margin-left: 240px;
  flex: 1;
  border-left: 1px solid #ddd;
  padding: 25px;
`;

const LogoImg = styled.img`
  width: auto;
  height: 22px;

  @media (max-width: 499px) {
    height: 16px;
  }
`;
