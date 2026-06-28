/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import styled from "styled-components";
import { categories } from "@/constants/categories";
import Image from "next/image";
import HeaderSearch from "@/components/Search/HeaderSearch";
import {
  SALES_HUB_ID,
  getBoardCategoryLabel,
} from "@/config/boardCategories";

// 🔥 Firebase Auth 추가
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { app, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function Header() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false); // ✅ 로그인 여부
  const [userRole, setUserRole] = useState<string | null>(null); // ✅ admin / manager
  const [userName, setUserName] = useState<string | null>(null); // ✅ 이름
  const [managerId, setManagerId] = useState<string | null>(null); // ✅ 매니저 아이디

  const router = useRouter();

  const auth = getAuth(app);
  const mobileTalkLabel = getBoardCategoryLabel(SALES_HUB_ID);

  // ✅ 라우트 변경 시 서브네비 닫기
  useEffect(() => {
    const handleRouteChange = () => {
      setActiveMenu(null);
    };
    router.events.on("routeChangeStart", handleRouteChange);
    return () => {
      router.events.off("routeChangeStart", handleRouteChange);
    };
  }, [router]);

  // ✅ 로그인 상태 감시
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsLoggedIn(false);
        setUserRole(null);
        setUserName(null);
        setManagerId(null);
        return;
      }

      setIsLoggedIn(true);

      try {
        // users/{uid} 에서 role / name / managerId 확인
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setUserRole(null);
          setUserName(null);
          setManagerId(null);
          return;
        }

        const data = snap.data() as any;
        const role = data.role as string | undefined;

        setUserRole(role ?? null);
        setUserName((data.name as string) || null);
        setManagerId((data.managerId as string) || null);
      } catch (error) {
        console.error("헤더 유저 정보 로딩 오류:", error);
        setUserRole(null);
        setUserName(null);
        setManagerId(null);
      }
    });

    return () => unsubscribe();
  }, [auth]);

  // ✅ 로그아웃 처리
  const handleLogout = async () => {
    try {
      await signOut(auth);
      // 원하면 /admin/login 으로 보내도 되고, 지금은 메인으로
      router.replace("/");
    } catch (error) {
      console.error("로그아웃 중 오류:", error);
    }
  };

  let greeting: string | null = null;

  if (isLoggedIn) {
    if (userRole === "admin") {
      greeting = "관리자님 환영합니다.";
    } else if (userRole === "manager") {
      if (userName) {
        greeting = `${userName} 매니저님 환영합니다.`;
      } else if (managerId) {
        greeting = `${managerId} 매니저님 환영합니다.`;
      } else {
        greeting = "매니저님 환영합니다.";
      }
    }
  }

  return (
    <HeaderWrap>
      <Nav>
        <LogoBox>
          <Link href="https://lghicaresolution.com/">
            <Logo src={"/images/logo.png"} alt="logo" />
          </Link>
          <AccountBox>
            {isLoggedIn && greeting && (
              <>
                <GreetingText>{greeting}</GreetingText>
                {userRole === "admin" && (
                  <>
                    {mobileTalkLabel && (
                      <SalesHubLink href={`/admin/boards/${SALES_HUB_ID}`}>
                        {mobileTalkLabel}
                      </SalesHubLink>
                    )}
                  </>
                )}
                {userRole === "manager" && (
                  <>
                    {mobileTalkLabel && (
                      <SalesHubLink href={`/manager/boards/${SALES_HUB_ID}`}>
                        {mobileTalkLabel}
                      </SalesHubLink>
                    )}
                  </>
                )}
                <LogoutButton type="button" onClick={handleLogout}>
                  로그아웃
                </LogoutButton>
              </>
            )}
            {!isLoggedIn && (
              <ManagerLoginLink href="/portal">로그인</ManagerLoginLink>
            )}
          </AccountBox>
        </LogoBox>
        <FlexWrap>
          <NavWrap>
            {categories.map((cat) => (
              <NavItem
                key={cat.name}
                onMouseEnter={() => setActiveMenu(cat.name)}
                onMouseLeave={() => setActiveMenu(null)}
              >
                <span>{cat.name}</span>
                {activeMenu === cat.name && (
                  <Dropdown>
                    <DropdownWrap>
                      {cat.subCategories.map((sub) => (
                        <SubWrap key={sub.name}>
                          {sub.url ? (
                            sub.external ? (
                              <a
                                href={sub.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setActiveMenu(null)} // ✅ 클릭 시 닫기
                              >
                                <SubTitle>
                                  {sub.name}
                                  <Image
                                    src="/images/mic_arrow.svg"
                                    alt=""
                                    width={7}
                                    height={10}
                                  />
                                </SubTitle>
                              </a>
                            ) : (
                              <Link
                                href={sub.url}
                                onClick={() => setActiveMenu(null)}
                              >
                                <SubTitle>
                                  {sub.name}
                                  <Image
                                    src="/images/mic_arrow.svg"
                                    alt=""
                                    width={7}
                                    height={10}
                                  />
                                </SubTitle>
                              </Link>
                            )
                          ) : (
                            <SubTitle>
                              {sub.name}
                              <Image
                                src="/images/mic_arrow.svg"
                                alt=""
                                width={7}
                                height={10}
                              />
                            </SubTitle>
                          )}

                          <SubList>
                            {sub.items.map((item) =>
                              item.external ? (
                                <li key={item.label}>
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setActiveMenu(null)} // ✅ 클릭 시 닫기
                                  >
                                    {item.label}
                                  </a>
                                </li>
                              ) : (
                                <li key={item.label}>
                                  <Link
                                    href={item.url}
                                    onClick={() => setActiveMenu(null)}
                                  >
                                    {item.label}
                                  </Link>
                                </li>
                              ),
                            )}
                          </SubList>
                        </SubWrap>
                      ))}
                    </DropdownWrap>
                  </Dropdown>
                )}
              </NavItem>
            ))}
          </NavWrap>

          <RightWrap>
            <HeaderSearch />
          </RightWrap>
        </FlexWrap>
      </Nav>
    </HeaderWrap>
  );
}

const HeaderWrap = styled.header`
  width: 100%;
  background: #fff;
  border-bottom: 1px solid #ddd;
  position: relative;
  z-index: 100;
`;

const LogoBox = styled.div`
  padding: 30px 0 10px;
  padding-left: 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;

  @media (max-width: 850px) {
    padding: 20px 2.5% 10px;
  }

  @media (max-width: 650px) {
    align-items: flex-start;
    gap: 8px;
    padding: 26px 8px 8px;
  }
`;

const Logo = styled.img`
  width: auto;
  height: 22px;
  flex: 0 0 auto;

  @media (max-width: 499px) {
    height: 16px;
    max-width: 145px;
  }
`;

const Nav = styled.nav`
  max-width: 1775px;
  width: 100%;
  margin: 0 auto;
`;

const NavWrap = styled.div`
  display: flex;
  padding: 0 40px;
  gap: 18px;
  @media (max-width: 850px) {
    padding: 0px 2.5%;
  }
  @media (max-width: 650px) {
    flex: 1 1 auto;
    justify-content: flex-start;
    gap: 16px;
    min-width: 0;
    overflow-x: auto;
    padding: 0 8px;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`;

const NavItem = styled.div`
  cursor: pointer;
  display: inline-block;
  font-size: 16px;
  font-weight: 500;
  color: #000;
  transition: all 0.5s;
  height: 60px;
  display: flex;
  align-items: center;
  @media (max-width: 650px) {
    flex: 0 0 auto;
    font-size: 14px;
    height: 50px;
    line-height: 1.25;
  }
`;

const Dropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  background: #fff;
  border-bottom: 1px solid #ddd;
  display: flex;
  width: 100%;
`;

const DropdownWrap = styled.div`
  max-width: 1775px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  gap: 80px;
  padding-left: 40px;
  padding-top: 20px;
  padding-bottom: 30px;
  min-height: 400px;

  @media (max-width: 1024px) {
    flex-wrap: wrap;
    width: 100vw;
    min-width: initial;
  }

  @media (max-width: 768px) {
    padding: 20px 2.5% 30px;
  }

  @media (max-width: 499px) {
    min-height: 200px;
    gap: 40px;
  }
`;

const SubWrap = styled.div`
  display: flex;
  flex-direction: column;
`;

const SubTitle = styled.div`
  font-weight: bold;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 5px;
`;

const SubList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;

  a {
    width: max-content;
    display: inline-block;
    font-size: 16px;
    font-weight: 400;
    color: #777;
    padding: 7px 0px;
    position: relative;
    transition: all 0.5s;

    &:hover {
      color: #333;
      font-weight: 500;
    }
  }

  @media (max-width: 650px) {
    a {
      font-size: 12px;
      padding: 5px 0px;
    }
  }
`;

const FlexWrap = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;

  @media (max-width: 650px) {
    gap: 4px;
  }
`;

// 🔥 우측 영역 (검색 + 로그아웃 버튼)
const RightWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;

  @media (max-width: 650px) {
    flex: 0 0 auto;
    padding-right: 8px;
  }
`;

const AccountBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;

  @media (max-width: 650px) {
    flex: 1 1 auto;
    max-width: calc(100% - 150px);
    row-gap: 5px;
  }
`;

// 🔥 로그아웃 버튼 스타일
const LogoutButton = styled.button`
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid #ddd;
  background: #f9f9f9;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: #eee;
  }

  @media (max-width: 650px) {
    padding: 5px 10px;
    font-size: 12px;
  }
`;

const SalesHubLink = styled(Link)`
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid #ddd;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  margin-right: 5px;

  &:hover {
    background: #f4f4f4;
  }

  @media (max-width: 650px) {
    padding: 5px 10px;
    margin-right: 0;
    font-size: 12px;
  }
`;

const ManagerLoginLink = styled(Link)`
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid #ddd;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: #f4f4f4;
  }

  @media (max-width: 650px) {
    padding: 5px 10px;
    font-size: 12px;
  }
`;

const GreetingText = styled.span`
  margin-left: 16px;
  margin-right: 8px;
  font-size: 14px;
  color: #333;
  white-space: nowrap;

  @media (max-width: 650px) {
    flex: 0 0 100%;
    margin: 0;
    text-align: right;
    font-size: 12px;
    line-height: 1.25;
    white-space: normal;
    word-break: keep-all;
  }
`;
