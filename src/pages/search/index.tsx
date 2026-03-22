// pages/products/search.tsx
import Link from "next/link";
import { useRouter } from "next/router";
import styled from "styled-components";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

import Loading from "@/components/loading/Loading";
import { colorMap } from "@/constants/colorMap";

type Variant = {
  모델코드: string;
  제품색상: string;
  상품명: string;
  가격?: string;
  thumbnailUrl?: string;
};

type Product = { [key: string]: string };

type ProductCard = Product & {
  thumbnailUrl: string;
  variants: Variant[];
};

type SearchResponse = {
  total: number;
  groups: ProductCard[];
  nextCursor: string | null;
};

export default function ProductSearchPage() {
  const searchCache = new Map<string, { ts: number; data: SearchResponse }>();
  const router = useRouter();
  const initialQ = Array.isArray(router.query.q)
    ? router.query.q[0]
    : router.query.q || "";
  const [q, setQ] = useState<string>(String(initialQ || ""));
  const [appliedQ, setAppliedQ] = useState<string>(String(initialQ || ""));

  const [groups, setGroups] = useState<ProductCard[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSticky, setIsSticky] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Sticky
  useEffect(() => {
    const onScroll = () => setIsSticky(window.scrollY > 0);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  //  디바운스 검색 트리거 (입력 시 기존 결과 유지)
  useEffect(() => {
    const h = setTimeout(() => {
      const url = { pathname: "/search", query: q ? { q } : {} };
      router.replace(url, undefined, { shallow: true });
      setAppliedQ(q);
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  //  실제 API 호출 (appliedQ 변경 시 실행)
  useEffect(() => {
    const doFetch = async () => {
      const trimmed = appliedQ.trim();
      if (!trimmed) return;

      // 1️⃣ 캐시 확인
      const cached = searchCache.get(trimmed);
      const now = Date.now();
      const ttl = 5 * 60 * 1000; // 5분 TTL

      if (cached && now - cached.ts < ttl) {
        //  캐시된 데이터 즉시 렌더
        setGroups(cached.data.groups || []);
        setTotal(cached.data.total || 0);
        setNextCursor(cached.data.nextCursor || null);
        setLoading(false);

        // ⚙️ 백그라운드 갱신 (선택)
        fetchFreshData(trimmed, true);
        return;
      }

      // 2️⃣ 캐시에 없으면 새로 fetch
      fetchFreshData(trimmed);
    };

    const fetchFreshData = async (query: string, silent = false) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      if (!silent) setLoading(true);

      try {
        const params = new URLSearchParams({ q: query, limit: "9" });
        const res = await fetch(`/api/search-products?${params.toString()}`, {
          signal: ac.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("fetch failed");

        const data: SearchResponse = await res.json();

        //  캐시 저장
        searchCache.set(query, { ts: Date.now(), data });

        //  상태 반영
        setGroups(data.groups || []);
        setTotal(data.total || 0);
        setNextCursor(data.nextCursor || null);
      } catch (err) {
        console.warn("❌ search fetch error:", err);
      } finally {
        if (!silent) setLoading(false);
      }
    };

    doFetch();
  }, [appliedQ]);

  //  2️⃣ 무한 스크롤 (cursor 기반 추가 요청)
  useEffect(() => {
    if (!sentinelRef.current || !appliedQ) return;

    const el = sentinelRef.current;
    let timeout: NodeJS.Timeout | null = null;

    const io = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting || loadingMore || !nextCursor) return;

        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(async () => {
          setLoadingMore(true);
          try {
            const params = new URLSearchParams({
              q: appliedQ,
              cursor: String(nextCursor),
              limit: "9",
            });
            const res = await fetch(
              `/api/search-products?${params.toString()}`,
              {
                headers: { Accept: "application/json" },
              },
            );
            if (res.ok) {
              const data: SearchResponse = await res.json();
              setGroups((prev) => [...prev, ...(data.groups || [])]);
              setNextCursor(data.nextCursor || null);
            }
          } catch (err) {
            console.warn("❌ load more error:", err);
          } finally {
            setLoadingMore(false);
          }
        }, 300);
      },
      { rootMargin: "600px 0px" },
    );

    io.observe(el);
    return () => {
      io.disconnect();
      if (timeout) clearTimeout(timeout);
    };
  }, [appliedQ, nextCursor, loadingMore]);

  const visibleGroups = groups;

  return (
    <Container>
      <h6
        style={{
          fontSize: "28px",
          textAlign: "center",
          margin: "50px 0 30px",
        }}
      >
        제품검색
      </h6>
      <SearchBar className={isSticky ? "sticky" : ""}>
        <SearchInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="모델명 / 제품명 / 기능으로 검색"
          aria-label="제품 검색"
        />
      </SearchBar>

      {/*  로딩 중엔 기존 목록 유지 + 오버레이 */}
      {loading && <Loading />}

      <ListWrap>
        <CountText>
          {appliedQ ? (
            <>
              “<b>{appliedQ}</b>” 검색 결과 총 <b>{total}</b>개
            </>
          ) : (
            <></>
          )}
        </CountText>

        {!loading && (
          <Grid>
            {groups.map((card, i) => (
              <ProductCardItem key={i} card={card} />
            ))}
          </Grid>
        )}
        <div ref={sentinelRef} />
        {loadingMore && <Loading />}
      </ListWrap>
    </Container>
  );
}

// ====== 카드 아이템 (리스트 페이지와 동일 UI/로직 유지) ======
function ProductCardItem({ card }: { card: ProductCard }) {
  const representative = card;
  const [activeThumb, setActiveThumb] = useState(
    representative.thumbnailUrl || "",
  );
  const [selectedCode, setSelectedCode] = useState(
    representative["모델코드"] || "",
  );

  const safeVariants = Array.isArray(representative.variants)
    ? representative.variants
    : [];

  //  색상 클릭 시 썸네일 변경 함수
  const handleColorClick = async (variant: Variant) => {
    const code = (variant["모델코드"] || "").trim();
    const thumb = variant.thumbnailUrl?.trim();

    setSelectedCode(code);

    console.log("🟢 variant thumbnail:", variant.thumbnailUrl);

    // 1️⃣ 썸네일이 바로 있으면 즉시 교체
    if (thumb && thumb !== "") {
      setActiveThumb(thumb);
      return;
    }

    // 2️⃣ 없으면 백엔드에서 fetch
    try {
      const middle = encodeURIComponent(representative["중분류"]);
      const res = await fetch(
        `/api/product-thumbnail?middle=${middle}&id=${code}`,
        {
          headers: { Accept: "application/json" },
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.thumbnailUrl && data.thumbnailUrl.trim() !== "") {
          setActiveThumb(data.thumbnailUrl);
        } else {
          setActiveThumb(""); // placeholder 유지
        }
      } else {
        setActiveThumb("");
      }
    } catch (err) {
      console.warn("썸네일 불러오기 실패:", err);
      setActiveThumb("");
    }
  };

  const uniqueVariants = useMemo(() => {
    return Array.from(
      new Map(
        safeVariants
          .filter((v) => {
            const color = (v.제품색상 || "").trim();
            return color !== "" && color !== "-" && !color.includes("무드업");
          })
          .map((v) => [v.제품색상, v]),
      ).values(),
    );
  }, [safeVariants]);

  const modelCodes = useMemo(
    () =>
      Array.from(new Set(safeVariants.map((v) => v.모델코드).filter(Boolean))),
    [safeVariants],
  );

  const prices = useMemo(() => {
    return safeVariants
      .map((v) => {
        const rawPrice = v.가격 || "0";
        const num = Number(rawPrice.replace(/[^0-9]/g, ""));
        return isNaN(num) || num <= 0 ? null : num;
      })
      .filter((n): n is number => n !== null);
  }, [safeVariants]);

  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const bestPrice = minPrice > 0 ? Math.max(minPrice - 13000, 0) : 0;

  return (
    <Card>
      <Link
        href={`/products/${representative["중분류"]}/${encodeURIComponent(
          selectedCode,
        )}`}
      >
        {activeThumb ? (
          <Thumbnail
            src={activeThumb}
            alt="썸네일"
            width={300}
            height={300}
            quality={70}
            placeholder="blur"
            blurDataURL="/images/placeholder.png"
            style={{ objectFit: "cover", borderRadius: "8px" }}
          />
        ) : (
          <ThumbnailPlaceholder>
            <Logo src={"/images/logo.png"} alt="logo" />
            <p>이미지 준비중입니다.</p>
          </ThumbnailPlaceholder>
        )}

        <ProductName>{representative["상품명"] || "상품명 미정"}</ProductName>

        <Dec>
          <ButtonGroup>
            {uniqueVariants.map((variant) => {
              const code = (variant["모델코드"] || "").trim();
              const colorName = variant["제품색상"] || code;
              const colors = colorName
                .split(/[/|]/)
                .map((c) => c.replace(/\s+/g, ""))
                .map((c) =>
                  c.includes("무드업") ? "rainbow" : colorMap[c] || "#fff",
                );
              return (
                <OptionButton
                  key={code}
                  selected={code === selectedCode}
                  onClick={(e) => {
                    e.preventDefault();
                    handleColorClick(variant);
                  }}
                  style={{ position: "relative", borderRadius: "50%" }}
                >
                  <ColorChipBox colors={colors} data-colorname={colorName} />
                </OptionButton>
              );
            })}
          </ButtonGroup>

          <DecInfo>주요기능 {representative["제품기능"] || "-"}</DecInfo>
          <Models>{modelCodes.join(", ")}</Models>

          <Price>
            월 <b>{minPrice.toLocaleString()}</b>원 <br />
            <span style={{ color: "#e60023", fontSize: "15px" }}>
              총 체감 혜택 월 <b>{bestPrice.toLocaleString()}</b>원
            </span>
          </Price>
        </Dec>

        <ButtonWrap>
          <CompareButton
            onClick={() => {
              alert("준비중 입니다.");
            }}
          >
            <Icon src={"/images/icon_plus_btn.svg"} alt="icon" />
            비교하기
          </CompareButton>
        </ButtonWrap>
      </Link>
    </Card>
  );
}

// ====== 스타일 (기존과 동일 유지) ======
const Container = styled.div`
  padding: 0px;
`;

const TopBar = styled.div<{ $sticky: boolean }>`
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 16px;
  width: ${({ $sticky }) => ($sticky ? "100%" : "1130px")};
  background: #fff;
  border-bottom: 1px solid #ddd;
  margin: 0 auto;
  transition: width 0.3s;

  @media (max-width: 1200px) {
    width: ${({ $sticky }) => ($sticky ? "100%" : "1024px")};
  }
  @media (max-width: 1024px) {
    width: ${({ $sticky }) => ($sticky ? "100%" : "768px")};
  }
  @media (max-width: 780px) {
    width: 100%;
  }
`;

const ListWrap = styled.div`
  width: 1130px;
  margin: auto;
  @media (max-width: 1200px) {
    width: 1024px;
  }
  @media (max-width: 1024px) {
    width: 768px;
  }
  @media (max-width: 780px) {
    width: 100%;
  }
`;

const CountText = styled.div`
  font-size: 14px;
  color: #000;
  margin: auto;
  margin-top: 56px;
  margin-bottom: 16px;
  width: 100%;
  @media (max-width: 499px) {
    margin-top: 36px;
    font-size: 12px;
    padding: 0 12px;
  }
`;

const Grid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0px;
  width: 100%;
  margin: auto;
`;

const Card = styled.div`
  padding: 0px;
  padding-top: 50px;
  background: #fff;
  width: 33.33%;
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-right: none;
  border-top: none;
  &:nth-child(3n),
  &:last-child {
    border-right: 1px solid #ddd;
  }
  &:nth-child(1),
  &:nth-child(2),
  &:nth-child(3) {
    border-top: 1px solid #ddd;
  }

  @media (max-width: 1024px) {
    width: 50%;
    &:nth-child(3) {
      border-top: none;
    }
    &:nth-child(3n) {
      border-right: none;
    }
    &:nth-child(2n),
    &:last-child {
      border-right: 1px solid #ddd;
    }
  }
  @media (max-width: 780px) {
    padding-top: 34px;
  }
  @media (max-width: 499px) {
    padding-top: 24px;
  }
`;

const Thumbnail = styled(Image)`
  width: 230px;
  height: 230px;
  object-fit: cover;
  margin: auto;
  display: block;
  border-radius: 8px;
  @media (max-width: 780px) {
    width: 180px;
    height: 180px;
  }
  @media (max-width: 499px) {
    width: 150px;
    height: 150px;
  }
`;

const ThumbnailPlaceholder = styled.div`
  width: 230px;
  height: 230px;
  background: #fff;
  border: 1px solid #ddd;
  color: #888;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  margin: auto;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  font-weight: 400;

  @media (max-width: 780px) {
    width: 180px;
    height: 180px;
    img {
      height: 14px;
    }
  }
  @media (max-width: 499px) {
    width: 150px;
    height: 150px;
  }
`;

const ProductName = styled.h3`
  font-size: 20px;
  padding: 0 24px;
  margin-bottom: 12px;
  margin-top: 24px;
  height: 58px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;

  @media (max-width: 780px) {
    font-size: 16px;
    height: 48px;
    margin-top: 12px;
    padding: 0 16px;
  }
  @media (max-width: 499px) {
    font-size: 14px;
    height: auto;
    -webkit-line-clamp: 2;
  }
`;

const Models = styled.p`
  font-size: 12px;
  color: #666;
  margin-top: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  @media (max-width: 499px) {
    font-size: 10px;
    margin-top: 4px;
  }
`;

const Dec = styled.div`
  padding: 0 24px;
  margin-bottom: 24px;
  @media (max-width: 780px) {
    padding: 0 16px;
    margin-bottom: 16px;
  }
`;

const DecInfo = styled.p`
  font-size: 12px;
  color: #666;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap; /*  한 줄로 제한 */
  display: block; /*  flex → block으로 변경 */

  @media (max-width: 499px) {
    gap: 2px 4px;
    font-size: 10px;
    margin-top: 4px;
  }
`;

const Price = styled.div`
  margin-top: 24px;
  font-size: 20px;
  border-top: 1px solid #f3f3f3;
  padding-top: 24px;
  line-height: 1.5;
  font-weight: 500;
  @media (max-width: 780px) {
    margin-top: 14px;
    padding-top: 14px;
    font-size: 16px;
    span {
      font-size: 12px !important;
    }
  }
`;

const ButtonWrap = styled.div`
  margin-top: auto;
  padding: 11px 24px;
  background: #f7f7f7;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 40px;
  justify-content: flex-end;
  @media (max-width: 499px) {
    padding: 8px 16px;
    height: 32px;
  }
`;

const CompareButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 500;
  @media (max-width: 499px) {
    font-size: 12px;
  }
`;

const Icon = styled.img`
  width: 16px;
  margin-top: 2px;
  background: none;
  @media (max-width: 499px) {
    width: 14px;
  }
`;

const Logo = styled.img`
  width: auto;
  height: 18px;
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  min-height: 20px;
`;

const OptionButton = styled.button<{ selected: boolean }>`
  border-radius: 6px;
  font-size: 14px;
  border: 1px solid ${({ selected }) => (selected ? "#000" : "#dee1e5")};
  color: ${({ selected }) => (selected ? "#111" : "#444")};
  font-weight: ${({ selected }) => (selected ? "700" : "400")};
  background: #fff;
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
  width: fit-content;
`;

const ColorChipBox = styled.div<{ colors: string[] }>`
  position: relative;
  width: 18px;
  height: 18px;
  overflow: hidden;
  cursor: pointer;
  border-radius: 100%;

  ${({ colors }) =>
    colors.length === 1
      ? `background: ${colors[0]};`
      : colors.length === 2
        ? `background: linear-gradient(to bottom, ${colors[0]} 50%, ${colors[1]} 50%);`
        : `background: linear-gradient(to right, red, orange, yellow, green, blue, indigo, violet);`}

  &:hover::after {
    content: attr(data-colorname);
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 4px;
    padding: 2px 6px;
    font-size: 12px;
    color: #fff;
    background: rgba(0, 0, 0, 0.75);
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
  }
`;

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: auto;

  font-weight: 400;
  font-size: 16px;
  line-height: 24px;

  @media (max-width: 780px) {
    max-width: 90%;
    gap: 6px;
  }
`;

const SearchInput = styled.input`
  flex: 1;
  max-width: 680px;
  width: 100%;
  height: 56px;
  border-radius: 99px;
  padding: 0 24px;
  font-size: 16px;
  outline: none;
  margin: auto;
  transition: border-color 0.2s ease;
  background-color: #f3f3f3;

  &:focus {
    border-color: #111;
    background-color: #f3f3f3;
  }

  &::placeholder {
    color: #aaa;
  }

  @media (max-width: 780px) {
    height: 38px;
    font-size: 14px;
  }
`;
