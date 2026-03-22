import Link from "next/link";
import { useRouter } from "next/router";
import styled from "styled-components";
import { useEffect, useState } from "react";
import Image from "next/image";

import Loading from "@/components/loading/Loading";
import { colorMap } from "@/constants/colorMap";
import CompareModal from "@/components/Modal/CompareModal";

type Variant = {
  모델코드: string;
  제품색상: string;
  상품명: string;
  가격?: string;
  thumbnailUrl?: string;
  프로모션유형?: string;
};

type Product = { [key: string]: string }; // 기존 Product

type ProductCard = Product & {
  thumbnailUrl: string;
  variants: Variant[];
};

export default function Products() {
  const router = useRouter();
  const { middle, sub } = router.query;

  const [products, setProducts] = useState<Product[]>([]);
  const [subCategories, setSubCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const [visibleGroupCount, setVisibleGroupCount] = useState(9);

  const [selectedProducts, setSelectedProducts] = useState<ProductCard[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(true);

  // 🔹 데이터 불러오기
  useEffect(() => {
    if (!middle) return;

    const fetchProducts = async () => {
      setLoading(true);
      const url = sub
        ? `/api/products?middle=${middle}&sub=${sub}`
        : `/api/products?middle=${middle}`;
      const res = await fetch(url);
      const data = await res.json();
      setProducts(data.options || []);
      setSubCategories(data.subCategories || []);
      setLoading(false);

      //  새 데이터 로딩 시 그룹 카운트 초기화
      setVisibleGroupCount(9);
    };

    fetchProducts();
  }, [middle, sub]);

  const normalizeKey = (val: string | undefined) => {
    if (!val) return "";
    return val.replace(/[\s-/]/g, "").toLowerCase();
  };

  // ✅ (추가) 모델코드는 하이픈을 제거하지 않고, 최소한의 공백만 정리
  const normalizeModelCodeKey = (val: string | undefined) => {
    if (!val) return "";
    return val.trim().toUpperCase(); // 하이픈은 유지
  };

  // ✅ (추가) 동일모델기준 유효값 체크 (빈값/공백/'-' 등은 무시)
  const isValidSameModelKey = (val: string | undefined) => {
    const v = (val ?? "").trim();
    return v !== "" && v !== "-";
  };

  // 🔹 동일모델 기준으로 그룹핑
  const grouped = products.reduce((acc: Record<string, Product[]>, cur) => {
    const sameModelRaw = cur["동일모델기준"];
    const modelCodeRaw = cur["모델코드"];

    // ✅ 동일모델기준이 있으면 normalizeKey 사용 (포맷 차이 무시하고 묶기)
    // ✅ 없으면 모델코드 원본 기반(하이픈 유지)으로 묶기
    const baseKey = isValidSameModelKey(sameModelRaw)
      ? normalizeKey(sameModelRaw)
      : normalizeModelCodeKey(modelCodeRaw);

    if (!baseKey) return acc;

    if (!acc[baseKey]) acc[baseKey] = [];
    acc[baseKey].push(cur);

    return acc;
  }, {});

  const groups = Object.values(grouped);

  // 비교하기 클릭
  const handleSelectCompare = (product: ProductCard) => {
    setSelectedProducts((prev) => {
      const exists = prev.find((p) => p["모델코드"] === product["모델코드"]);
      if (exists) {
        return prev.filter((p) => p["모델코드"] !== product["모델코드"]);
      }
      if (prev.length >= 3) {
        alert("비교는 최대 3개까지만 선택할 수 있습니다.");
        return prev;
      }
      return [...prev, product];
    });
  };

  const handleRemoveCompare = (code: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p["모델코드"] !== code));
  };

  // 🔹 스크롤 감지 → 9개씩 추가
  useEffect(() => {
    const handleScroll = () => {
      if (loadingMore || loading) return;
      if (visibleGroupCount >= groups.length) return;

      const scrollPosition = window.innerHeight + window.scrollY;
      const threshold = document.body.offsetHeight * 0.9;

      if (scrollPosition >= threshold) {
        setLoadingMore(true);
        setTimeout(() => {
          setVisibleGroupCount((prev) => Math.min(prev + 9, groups.length));
          setLoadingMore(false);
        }, 300);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [groups.length, visibleGroupCount, loading, loadingMore]);

  // 🔹 네비 Sticky
  useEffect(() => {
    const onScroll = () => setIsSticky(window.scrollY > 0);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (loading) return <Loading />;

  function ProductCardItem({
    group,
    onSelectCompare,
    selectedProducts,
  }: {
    group: Product[];
    onSelectCompare: (p: ProductCard) => void;
    selectedProducts: ProductCard[];
  }) {
    const representative = group[0] as ProductCard;
    const [activeThumb, setActiveThumb] = useState(representative.thumbnailUrl);

    const [selectedCode, setSelectedCode] = useState(
      representative["모델코드"],
    );

    const uniqueVariants = Array.from(
      new Map(
        representative.variants
          .filter((v) => {
            const color = (v.제품색상 || "").trim();
            return color !== "" && color !== "-" && !color.includes("무드업");
            //  공백, '-' 또는 무드업이면 제외
          })
          .map((v) => [v.제품색상, v]),
      ).values(),
    );

    const modelCodes = Array.from(
      new Set(representative.variants.map((v) => v.모델코드).filter(Boolean)),
    );

    const prices = (() => {
      const normalizePromo = (v?: string) =>
        (v || "")
          .replace(/\s+/g, "") // 공백 제거
          .replace(/\u3164/g, "") // 특수공백 제거
          .trim();

      // ① 정확히 "신규결합"인 variant
      const exactNewJoin = representative.variants.filter(
        (v) => normalizePromo(v["프로모션유형"]) === "신규결합",
      );

      // ② 복합형 "신규결합" 포함 variant
      const mixedNewJoin = representative.variants.filter(
        (v) =>
          normalizePromo(v["프로모션유형"]).includes("신규결합") &&
          normalizePromo(v["프로모션유형"]) !== "신규결합",
      );

      // ③ 최종 타겟 리스트 결정
      const targetList =
        exactNewJoin.length > 0
          ? exactNewJoin
          : mixedNewJoin.length > 0
            ? mixedNewJoin
            : representative.variants;

      // ④ 숫자만 추출
      const extractPrices = (list: Variant[]) =>
        list
          .map((v) => {
            const rawPrice = v.가격 || "0";
            const num = Number(rawPrice.replace(/[^0-9]/g, ""));
            return isNaN(num) || num <= 0 ? null : num;
          })
          .filter((n): n is number => n !== null);

      // ⑤ 최종 가격 리스트 반환
      return extractPrices(targetList);
    })();

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
              <p>이미지 준비중 입니다.</p>
            </ThumbnailPlaceholder>
          )}

          <ProductName>{representative["상품명"]}</ProductName>

          <Dec>
            <ButtonGroup>
              {uniqueVariants
                .filter((v) => {
                  const color = (v.제품색상 || "").trim();
                  return color !== "" && color !== "-"; //  조건 추가
                }) //  색상 없는 경우 제외
                .map((variant) => {
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
                        setActiveThumb(
                          variant.thumbnailUrl || representative.thumbnailUrl,
                        );
                        setSelectedCode(code);
                      }}
                      style={{
                        position: "relative",
                        borderRadius: "50%",
                      }}
                    >
                      <ColorChipBox
                        colors={colors}
                        data-colorname={colorName}
                      />
                    </OptionButton>
                  );
                })}
            </ButtonGroup>

            <DecInfo>주요기능 {representative["제품기능"]}</DecInfo>
            {/*  그룹 모델코드 전체 */}
            <Models>{modelCodes.join(", ")}</Models>

            <Price>
              월 <b>{minPrice.toLocaleString()}</b>원 <br />
              <span style={{ color: "#e60023", fontSize: "15px" }}>
                월 체감요금 <b>{bestPrice.toLocaleString()}</b>원
              </span>
            </Price>
          </Dec>
          <ButtonWrap>
            <CompareButton
              onClick={(e) => {
                e.preventDefault();
                onSelectCompare(representative);
              }}
            >
              {/*  선택된 상태에 따라 아이콘과 텍스트 토글 */}
              <Icon
                src={
                  selectedProducts.some(
                    (item) => item["모델코드"] === representative["모델코드"],
                  )
                    ? "/images/icon_minus_btn.svg"
                    : "/images/icon_plus_btn.svg"
                }
                alt="compare-icon"
              />
              {selectedProducts.some(
                (item) => item["모델코드"] === representative["모델코드"],
              )
                ? "비교하기"
                : "비교하기"}
            </CompareButton>
          </ButtonWrap>
        </Link>
      </Card>
    );
  }

  return (
    <Container>
      <TopBar $sticky={isSticky}>
        <SubNav>
          {(() => {
            const middleValue = Array.isArray(middle)
              ? middle[0]
              : (middle ?? "");
            const subValue = Array.isArray(sub) ? sub[0] : (sub ?? "");

            return (
              <>
                <NavItem
                  href={`/products/${encodeURIComponent(middleValue)}`}
                  className={!subValue ? "active" : ""}
                >
                  전체
                </NavItem>
                {subCategories.map((s) => (
                  <NavItem
                    key={s}
                    href={`/products/${encodeURIComponent(
                      middleValue,
                    )}/sub?name=${encodeURIComponent(s)}`}
                    className={subValue === s ? "active" : ""}
                  >
                    {s}
                  </NavItem>
                ))}
              </>
            );
          })()}
        </SubNav>
      </TopBar>

      <ListWrap>
        <CountText>
          총 <b>{groups.length}</b>개
        </CountText>

        <Grid>
          {groups.slice(0, visibleGroupCount).map((group, i) => (
            <ProductCardItem
              key={i}
              group={group}
              onSelectCompare={handleSelectCompare}
              selectedProducts={selectedProducts}
            />
          ))}
        </Grid>
      </ListWrap>

      {selectedProducts.length > 0 && (
        <CompareModal
          products={selectedProducts.map((p) => ({
            thumbnailUrl: p.thumbnailUrl,
            상품명: p["상품명"],
            모델코드: p["모델코드"],
          }))}
          isOpen={isModalOpen}
          onToggle={() => setIsModalOpen((prev) => !prev)}
          onReset={() => setSelectedProducts([])}
          onComplete={() => {
            if (selectedProducts.length < 2) {
              alert("2개 이상 선택해야 비교할 수 있습니다.");
              return;
            }

            const compareData = selectedProducts.map((p) => ({
              thumbnailUrl: p.thumbnailUrl,
              상품명: p["상품명"],
              모델코드: p["모델코드"],
              중분류: p["중분류"],
              가격: p["할인후금액"] || p["정상가"] || "가격정보 없음",
            }));

            //  세션스토리지에 저장 후 페이지 이동
            sessionStorage.setItem(
              "compareProducts",
              JSON.stringify(compareData),
            );
            router.push("/compare");
          }}
          onRemove={handleRemoveCompare}
        />
      )}
      {loadingMore && <Loading />}
    </Container>
  );
}

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

const NavItem = styled(Link)`
  font-size: 18px;
  color: #666;
  font-weight: 500;
  padding: 17px 0;
  position: relative;

  &.active {
    font-weight: bold;
    color: #000;

    &::after {
      content: "";
      width: 100%;
      position: absolute;
      height: 3px;
      background: #000;
      bottom: 0;
      left: 0;
    }
  }
  @media (max-width: 780px) {
    font-size: 16px;
  }

  @media (max-width: 499px) {
    font-size: 14px;
    padding: 12px 0;
  }
`;

const Container = styled.div`
  padding: 0px;
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
    &:nth-child(2n) {
      border-right: 1px solid #ddd;
    }
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
  border-radius: 8px; /*  기존 style에 포함시킴 */

  @media (max-width: 780px) {
    width: 180px;
    height: 180px;
  }

  @media (max-width: 499px) {
    width: 150px;
    height: 150px;
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

  display: -webkit-box; /*  플렉스 기반 박스 */
  -webkit-line-clamp: 2; /*  최대 2줄 */
  -webkit-box-orient: vertical; /*  수직 방향으로 자르기 */
  overflow: hidden; /*  넘친 텍스트 숨김 */
  text-overflow: ellipsis; /*  ... 표시 */

  @media (max-width: 780px) {
    font-size: 16px;
    height: 48px;
    margin-top: 12px;
    padding: 0 16px;
  }

  @media (max-width: 499px) {
    font-size: 14px;
    height: auto; /*  높이 자동 */
    -webkit-line-clamp: 2; /* 모바일에서도 두 줄 처리 유지 */
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
  cursor: pointer;

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
        ? `
        background: linear-gradient(to bottom, ${colors[0]} 50%, ${colors[1]} 50%);
      `
        : `background: linear-gradient(
          to right,
          red, orange, yellow, green, blue, indigo, violet
        );`}

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

const SubNav = styled.div`
  display: flex;
  gap: 12px;
  overflow-x: auto; /*  가로 스크롤 가능 */
  white-space: nowrap; /*  줄바꿈 방지 */
  -ms-overflow-style: none; /* IE/Edge */
  scrollbar-width: none; /* Firefox */

  padding: 0 10px;
  &::-webkit-scrollbar {
    display: none; /*  크롬, 사파리 스크롤바 숨김 */
  }
`;
