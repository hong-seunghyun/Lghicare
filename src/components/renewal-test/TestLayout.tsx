/* eslint-disable @next/next/no-img-element */
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import s from "./renewal.module.css";
import { useUser } from "@/contexts/UserContext";
import { categories } from "@/constants/categories";
import Footer from "@/components/Footer/Footer";

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    chevron: <path d="m8 4 8 8-8 8" />,
    save: (
      <>
        <path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8" />
      </>
    ),
    print: (
      <>
        <path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6Z" />
        <path d="M17 11h1" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    card: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M6 15h4" />
      </>
    ),
    care: (
      <>
        <path d="M3 15h4l4 2h5l4-5c2-1 3 1 2 2l-4 7H8l-5-2M3 13v9M12 11s-6-3-6-6c0-4 5-4 6-1 2-3 7-3 7 1 0 3-7 6-7 6Z" />
      </>
    ),
    trophy: (
      <>
        <path d="M7 3h10v6a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 14v5m-4 2h8M9 19h6v2" />
        <path d="m12 5 .7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.7-1.4.7.3-1.6-1.2-1.1 1.6-.2L12 5Z" />
      </>
    ),
    award: (
      <>
        <path d="m9 14-2 8 5-3 5 3-2-8" />
        <circle cx="12" cy="8" r="6" />
        <path d="m12 5 1 2 2 .3-1.5 1.5.4 2.2-1.9-1-1.9 1 .4-2.2L9 7.3l2-.3Z" />
      </>
    ),
    sparkle: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />
        <path d="M21 2v4m-2-2h4" />
      </>
    ),
    fridge: (
      <>
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M5 11h14M8 6v2m0 6v3" />
      </>
    ),
    dishwasher: (
      <>
        <rect x="3" y="3" width="18" height="19" rx="2" />
        <path d="M3 8h18M6 5.5h1m3 0h1M7 12h10v6H7Z" />
      </>
    ),
    tv: (
      <>
        <rect x="2" y="4" width="20" height="14" rx="2" />
        <path d="M8 22h8m-4-4v4M5 8h4" />
      </>
    ),
    gift: (
      <>
        <path d="M4 11h16v10H4ZM2 7h20v4H2ZM12 7v14" />
        <path d="M12 7C3 8 4-2 9 2c2 1 3 5 3 5Zm0 0c9 1 8-9 3-5-2 1-3 5-3 5Z" />
      </>
    ),
    support: (
      <>
        <path d="M4 14v-3a8 8 0 0 1 16 0v3M5 11H3v7h4v-7Zm14 0h2v7h-4v-7ZM19 18c0 3-3 4-7 4" />
      </>
    ),
    document: (
      <>
        <path d="M6 3h9l4 4v14H5V3ZM14 3v5h5M8 12h8M8 16h6" />
      </>
    ),
    compare: (
      <>
        <path d="M4 5h6v14H4ZM14 5h6v14h-6M8 2h8M8 22h8" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    oven: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="2" />
        <path d="M3 9h18M6 12h12v5H6ZM6 7h1m3 0h1" />
      </>
    ),
    wind: (
      <>
        <path d="M3 7h12c5 0 5-6 1-5M3 12h17c4 0 4 6 0 6M3 17h8c4 0 4 6 0 5" />
      </>
    ),
    cup: (
      <>
        <path d="M5 4h11v13a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V4ZM16 6h3a3 3 0 0 1 0 6h-3M3 4h15" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.arrow}
    </svg>
  );
}

const menuGroups = categories.slice(0, 3).map((group) => ({
  name: group.name,
  items: group.subCategories.map((c) => c.name),
}));

export default function TestLayout({
  children,
  workspace = false,
  originalFooter = false,
}: {
  children: ReactNode;
  workspace?: boolean;
  originalFooter?: boolean;
}) {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useUser();
  const [menu, setMenu] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mobile, setMobile] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const close = () => {
      setMenu(null);
      setMobile(false);
      setSearchOpen(false);
    };
    router.events.on("routeChangeStart", close);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const outside = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      router.events.off("routeChangeStart", close);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
    };
  }, [router.events]);
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    void router.push(
      {
        pathname: "/renewal-test",
        query: search.trim() ? { search: search.trim() } : {},
      },
      "/renewal-test" +
        (search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "") +
        "#products",
    );
    setSearchOpen(false);
  };
  return (
    <div className={s.root}>
      <Head>
        <title>{`${workspace ? "통합 견적 작성" : "우리 집에 맞는 가전 구독"} | LG 하이케어솔루션`}</title>
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta
          name="description"
          content="LG 하이케어솔루션 가전 구독. 제품별 요금과 혜택을 확인하고 우리 집에 맞는 견적을 구성하세요."
        />
      </Head>
      <a className={s.skip} href="#renewal-content">
        본문 바로가기
      </a>
      <header className={s.header} ref={headerRef}>
        <div className={`${s.container} ${s.headerInner}`}>
          <Link
            href="/renewal-test"
            className={s.logo}
            aria-label="LG 하이케어솔루션 홈"
          >
            <img src="/images/logo.png" alt="LG전자 하이케어솔루션" />
          </Link>
          <nav
            className={`${s.nav} ${mobile ? s.mobileOpen : ""}`}
            aria-label="주 메뉴"
          >
            {workspace ? (
              <>
                <Link className={s.navActive} href="/renewal-test/estimate">
                  견적 작성
                </Link>
                <Link href="/renewal-test/estimate?view=saved">
                  저장한 견적
                </Link>
                <Link href="/renewal-test">고객용 메인</Link>
              </>
            ) : (
              <>
                {menuGroups.map((group) => (
                  <div key={group.name} className={s.menuGroup}>
                    <button
                      type="button"
                      aria-expanded={menu === group.name}
                      aria-controls={`menu-${group.name}`}
                      onClick={() =>
                        setMenu(menu === group.name ? null : group.name)
                      }
                    >
                      {group.name}
                    </button>
                    {menu === group.name && (
                      <div id={`menu-${group.name}`} className={s.dropdown}>
                        <small>제품 카테고리</small>
                        {group.items.map((name) => (
                          <Link
                            key={name}
                            href={{
                              pathname: "/renewal-test",
                              query: { category: name },
                              hash: "products",
                            }}
                          >
                            {name}
                            <Icon name="chevron" size={14} />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <Link href="/renewal-test?category=TV#products">TV</Link>
                <Link href="/renewal-test#benefits">구독혜택</Link>
                <Link href="/renewal-test#consult">상담 안내</Link>
              </>
            )}
          </nav>
          <div className={s.headerActions}>
            {!workspace && (
              <button
                className={s.iconButton}
                aria-label="제품 검색 열기"
                aria-expanded={searchOpen}
                onClick={() => {
                  setSearchOpen(!searchOpen);
                  setMenu(null);
                }}
              >
                <Icon name="search" />
              </button>
            )}
            <Link className={s.managerLink} href="/renewal-test/estimate">
              <Icon name={workspace ? "user" : "document"} size={16} />
              {workspace
                ? authLoading
                  ? "확인 중"
                  : user?.profile?.name || "견적내기"
                : "견적내기"}
            </Link>
            {user ? (
              <button
                className={s.accountButton}
                onClick={async () => {
                  await logout();
                  localStorage.removeItem("managerSession");
                }}
              >
                로그아웃
              </button>
            ) : (
              <Link
                className={s.accountButton}
                href="/manager/login?next=%2Frenewal-test%2Festimate"
              >
                로그인
              </Link>
            )}
            <button
              className={`${s.iconButton} ${s.mobileMenuButton}`}
              aria-label="메뉴 열기"
              aria-expanded={mobile}
              onClick={() => setMobile(!mobile)}
            >
              <Icon name={mobile ? "close" : "menu"} />
            </button>
          </div>
        </div>
        {searchOpen && (
          <form
            onSubmit={submitSearch}
            className={`${s.container} ${s.headerSearch}`}
          >
            <Icon name="search" />
            <input
              autoFocus
              aria-label="제품명 또는 모델명"
              placeholder="어떤 가전을 찾으세요? 제품명 또는 모델명 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className={s.primary} type="submit">
              검색
            </button>
          </form>
        )}
      </header>
      <main id="renewal-content">{children}</main>
      {originalFooter ? (
        <div className={s.originalFooter}>
          <Footer />
        </div>
      ) : (
        <footer className={s.footer}>
          <div className={s.container}>
            <div className={s.footerTop}>
              <Link href="/renewal-test">
                <img src="/images/logo.png" alt="LG전자 하이케어솔루션" />
              </Link>
              <span>좋은 가전을 넘어, 더 나은 일상으로.</span>
              <a href="/" target="_blank" rel="noreferrer">
                기존 사이트 ↗
              </a>
            </div>
            <div className={s.footerBottom}>
              <p>
                제품별 구독 조건과 혜택은 선택한 계약 조건에 따라 달라집니다.
                견적은 로그인한 계정별로 이 브라우저에 저장됩니다.
              </p>
              <span>© LG Hi-Care Solution</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key !== "Tab") return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex="0"]',
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === ref.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === ref.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className={s.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`${s.modal} ${wide ? s.modalWide : ""} ${className}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="renewal-dialog-title"
        aria-describedby={
          description ? "renewal-dialog-description" : undefined
        }
        tabIndex={-1}
      >
        <div className={s.modalHeading}>
          <div>
            <h2 id="renewal-dialog-title">{title}</h2>
            {description && (
              <p id="renewal-dialog-description">{description}</p>
            )}
          </div>
          <button className={s.iconButton} aria-label="닫기" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
