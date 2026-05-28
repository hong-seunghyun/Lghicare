/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import styled, { css } from "styled-components";
import { Autoplay, FreeMode, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fetchThemeCategoryPreviews } from "@/lib/mainThemeProducts";
import type {
  MainBanner,
  MainThemeProduct,
  ThemeCategoryConfig,
  ThemeCategoryPreview,
} from "@/types/mainPage";

const serviceCards = [
  {
    title: "서비스 안내",
    description: "가전 구독이 왜 좋은지 알아볼까요?",
    href: "https://lghicaresolution.com/another/rentalService.html",
    tone: "guide",
    imageUrl: "/images/img_rental01.png",
  },
  {
    title: "혜택 안내",
    description: "구독하면 어떤 혜택을 받을 수 있을까요?",
    href: "https://lghicaresolution.com/another/event/customer.html",
    tone: "card",
    imageUrl: "/images/img_card01.png",
  },
] as const;

const benefitCards = [
  {
    label: "가전 구독 혜택",
    title: "구독료 부담은 줄이고 필요한 관리는 계속",
    description:
      "초기 구매 비용 없이 원하는 제품을 필요한 기간에 맞춰 이용할 수 있습니다.",
  },
  {
    label: "제휴카드 혜택",
    title: "월 납부 금액을 더 가볍게",
    description:
      "카드 청구 할인과 프로모션을 함께 비교할 수 있도록 구성했습니다.",
  },
  {
    label: "케어 서비스",
    title: "제품별 맞춤 관리까지 한 번에",
    description:
      "사용 중 필요한 점검과 케어 정보를 상품 상세에서 확인할 수 있습니다.",
  },
];

const productHref = (category: string, subName?: string) =>
  subName
    ? `/products/${encodeURIComponent(category)}/sub?name=${encodeURIComponent(subName)}`
    : `/products/${encodeURIComponent(category)}`;

const categoryLinks = [
  {
    name: "정수기",
    href: productHref("정수기"),
    imageUrl: "/images/main-category-1.png",
  },
  {
    name: "안마의자",
    href: productHref("안마의자"),
    imageUrl: "/images/main-category-2.png",
  },
  {
    name: "TV",
    href: productHref("TV"),
    imageUrl: "/images/main-category-3.png",
  },
  {
    name: "STEM",
    href: productHref("냉장고", "STEM"),
    imageUrl: "/images/main-category-4.png",
  },
  {
    name: "냉장고",
    href: productHref("냉장고"),
    imageUrl: "/images/main-category-5.png",
  },
  {
    name: "김치냉장고",
    href: productHref("김치냉장고"),
    imageUrl: "/images/main-category-6.png",
  },
  {
    name: "에어컨",
    href: productHref("에어컨"),
    imageUrl: "/images/main-category-7.png",
  },
  {
    name: "공기청정기",
    href: productHref("공기청정기"),
    imageUrl: "/images/main-category-8.png",
  },
  {
    name: "에어로시리즈",
    href: productHref("공기청정기", "에어로시리즈"),
    imageUrl: "/images/main-category-9.png",
  },
  {
    name: "제습기",
    href: productHref("제습기"),
    imageUrl: "/images/main-category-10.png",
  },
  {
    name: "전기레인지",
    href: productHref("전기레인지"),
    imageUrl: "/images/main-category-12.png",
  },
  {
    name: "식기세척기",
    href: productHref("식기세척기"),
    imageUrl: "/images/main-category-13.png",
  },
  {
    name: "워시콤보",
    href: productHref("워시콤보"),
    imageUrl: "/images/main-category-15.png",
  },
  {
    name: "세탁기",
    href: productHref("세탁기"),
    imageUrl: "/images/main-category-16.png",
  },
  {
    name: "의류건조기",
    href: productHref("의류건조기"),
    imageUrl: "/images/main-category-17.png",
  },
  {
    name: "스타일러",
    href: productHref("의류관리기"),
    imageUrl: "/images/main-category-18.png",
  },
  {
    name: "슈케어",
    href: productHref("신발관리기"),
    imageUrl: "/images/main-category-19.png",
  },
  {
    name: "청소기",
    href: productHref("청소기"),
    imageUrl: "/images/main-category-20.png",
  },
  {
    name: "컨버터블 패키지",
    href: productHref("냉장고", "컨버터블"),
    imageUrl: "/images/main-category-22.png",
  },
];

const fallbackThemeCategory: ThemeCategoryPreview = {
  id: "fallback-theme",
  label: "냉장고",
  sheetName: "냉장고",
  status: "active",
  priority: 0,
  modelNames: [],
  previews: [],
  products: [],
};

const isExternalUrl = (url: string) => /^(https?:|mailto:|tel:)/i.test(url);

const formatPrice = (price: number) =>
  price > 0 ? price.toLocaleString("ko-KR") : "-";

function SmartLink({ href, children }: { href: string; children: ReactNode }) {
  if (isExternalUrl(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }

  return <Link href={href}>{children}</Link>;
}

function BannerContent({ banner }: { banner?: MainBanner }) {
  const pcImageUrl = banner?.pcImageUrl || banner?.mobileImageUrl || "";
  const mobileImageUrl = banner?.mobileImageUrl || banner?.pcImageUrl || "";
  const alt = banner?.title || "메인 배너";

  return (
    <BannerVisual>
      {pcImageUrl ? (
        <PcBannerImage src={pcImageUrl} alt={alt} fetchPriority="high" />
      ) : (
        <PcBannerPlaceholder>
          <HeroPlaceholderCopy>
            <h1>LG 가전 구독을 더 간결하게</h1>
            <p>필요한 제품과 혜택, 월 납부 금액을 한 화면에서 비교하세요.</p>
            <span>상담 시작하기</span>
          </HeroPlaceholderCopy>
        </PcBannerPlaceholder>
      )}

      {mobileImageUrl ? (
        <MobileBannerImage
          src={mobileImageUrl}
          alt={alt}
          fetchPriority="high"
        />
      ) : (
        <MobileBannerPlaceholder>
          <HeroPlaceholderCopy>
            <h1>가전 구독을 더 쉽게</h1>
            <p>제품과 혜택을 빠르게 비교하세요.</p>
            <span>상담 시작하기</span>
          </HeroPlaceholderCopy>
        </MobileBannerPlaceholder>
      )}
    </BannerVisual>
  );
}

function MainBannerSection({ banners }: { banners: MainBanner[] }) {
  const slides = banners.length > 0 ? banners : [undefined];

  return (
    <HeroSection>
      <HeroInner>
        <Swiper
          modules={[Autoplay, Pagination]}
          slidesPerView={1}
          loop={banners.length > 1}
          speed={650}
          autoplay={
            banners.length > 1
              ? { delay: 5500, disableOnInteraction: false }
              : false
          }
          pagination={banners.length > 1 ? { clickable: true } : false}
        >
          {slides.map((banner, index) => {
            const content = <BannerContent banner={banner} />;

            return (
              <SwiperSlide key={banner?.id || `banner-placeholder-${index}`}>
                {banner?.linkUrl ? (
                  <SmartLink href={banner.linkUrl}>{content}</SmartLink>
                ) : (
                  content
                )}
              </SwiperSlide>
            );
          })}
        </Swiper>
      </HeroInner>
    </HeroSection>
  );
}

function ServiceShortcutSection() {
  return (
    <ShortcutSection>
      {serviceCards.map((card) => (
        <ShortcutCard
          key={card.title}
          $tone={card.tone}
          $imageUrl={card.imageUrl}
        >
          <SmartLink href={card.href}>
            <ShortcutPill>{card.title}</ShortcutPill>
            <ShortcutText>{card.description}</ShortcutText>
          </SmartLink>
        </ShortcutCard>
      ))}
    </ShortcutSection>
  );
}

function ProductImage({ product }: { product?: MainThemeProduct }) {
  if (product?.thumbnailUrl) {
    return (
      <ProductImageBox
        role="img"
        aria-label={product.productName}
        $imageUrl={product.thumbnailUrl}
      />
    );
  }

  return (
    <ProductImageBox>
      <ProductImageFallback>
        <img src="/images/logo.png" alt="" />
        <span>이미지 준비중</span>
      </ProductImageFallback>
    </ProductImageBox>
  );
}

function FeaturedProductImage({ product }: { product?: MainThemeProduct }) {
  if (product?.thumbnailUrl) {
    return (
      <FeaturedImageBox
        role="img"
        aria-label={product.productName}
        $imageUrl={product.thumbnailUrl}
      />
    );
  }

  return (
    <FeaturedImageBox>
      <ProductImageFallback>
        <img src="/images/logo.png" alt="" />
        <span>이미지 준비중</span>
      </ProductImageFallback>
    </FeaturedImageBox>
  );
}

function ProductInfo({
  product,
  compact = false,
  featured = false,
}: {
  product?: MainThemeProduct;
  compact?: boolean;
  featured?: boolean;
}) {
  return (
    <>
      <ProductName $compact={compact} $featured={featured}>
        {product?.productName || "상품 정보 준비중"}
      </ProductName>
      <ProductModel>{product?.modelCode || "모델명 준비중"}</ProductModel>
      <ProductPrice $featured={featured}>
        월 <b>{formatPrice(product?.monthlyPrice ?? 0)}</b>원
      </ProductPrice>
      {product?.discountText && (
        <ProductDiscount>{product.discountText}</ProductDiscount>
      )}
    </>
  );
}

function RankingProductCard({
  product,
  rank,
  categoryLabel,
}: {
  product?: MainThemeProduct;
  rank: number;
  categoryLabel: string;
}) {
  const featured = rank === 1;
  const content = featured ? (
    <FeaturedProductInner>
      <FeaturedProductInfo>
        <FeaturedSubtitle>
          <span>차원이 다른</span>
          <strong>{categoryLabel} BEST</strong>
          <ProductRank $featured>{rank}</ProductRank>
        </FeaturedSubtitle>
        <ProductInfo product={product} compact featured />
      </FeaturedProductInfo>
      <FeaturedProductVisual>
        <FeaturedProductImage product={product} />
      </FeaturedProductVisual>
    </FeaturedProductInner>
  ) : (
    <>
      <ProductImageWrap>
        <ProductRank>{rank}</ProductRank>
        <ProductImage product={product} />
      </ProductImageWrap>
      <ProductInfo product={product} compact />
    </>
  );

  return (
    <ThemeProductCard $featured={featured}>
      {product ? <Link href={product.detailUrl}>{content}</Link> : content}
    </ThemeProductCard>
  );
}

function ThemeProductsSection({
  categories,
  loading,
}: {
  categories: ThemeCategoryPreview[];
  loading: boolean;
}) {
  const visibleCategories = useMemo(
    () =>
      categories
        .filter(
          (category) =>
            category.status === "active" && category.products.length > 0,
        )
        .sort((a, b) => a.priority - b.priority),
    [categories],
  );
  const displayCategories = useMemo(
    () =>
      visibleCategories.length > 0
        ? visibleCategories
        : [fallbackThemeCategory],
    [visibleCategories],
  );
  const [activeCategoryId, setActiveCategoryId] = useState("");

  useEffect(() => {
    setActiveCategoryId((prev) =>
      displayCategories.some((category) => category.id === prev)
        ? prev
        : displayCategories[0]?.id || "",
    );
  }, [displayCategories]);

  const activeCategory =
    displayCategories.find((category) => category.id === activeCategoryId) ??
    displayCategories[0];
  const products = activeCategory?.products ?? [];
  const rankedProducts = [products[0], products[1], products[2]];

  return (
    <ThemeSection>
      <SectionTitle>
        <h6>금주의 테마상품</h6>
      </SectionTitle>

      {loading && categories.length === 0 ? (
        <ThemeSkeleton aria-label="테마상품을 불러오는 중">
          <SkeletonHero />
          <SkeletonCard />
          <SkeletonCard />
        </ThemeSkeleton>
      ) : (
        <>
          <ThemeTabs>
            <Swiper
              modules={[FreeMode]}
              slidesPerView="auto"
              spaceBetween={8}
              freeMode
            >
              {displayCategories.map((category) => (
                <SwiperSlide key={category.id}>
                  <ThemeTab
                    type="button"
                    $active={category.id === activeCategory?.id}
                    onClick={() => setActiveCategoryId(category.id)}
                  >
                    {category.label}
                  </ThemeTab>
                </SwiperSlide>
              ))}
            </Swiper>
          </ThemeTabs>

          <ThemeProductList
            modules={[FreeMode]}
            slidesPerView="auto"
            spaceBetween={16}
            freeMode
          >
            {rankedProducts.map((product, index) => (
              <SwiperSlide key={product?.modelCode || `placeholder-${index}`}>
                <RankingProductCard
                  product={product}
                  rank={index + 1}
                  categoryLabel={
                    activeCategory?.label || product?.middle || "테마상품"
                  }
                />
              </SwiperSlide>
            ))}
          </ThemeProductList>
        </>
      )}
    </ThemeSection>
  );
}

function CategorySection() {
  return (
    <CategorySectionWrap>
      <SectionTitle>
        <h6>제품 카테고리</h6>
      </SectionTitle>
      <CategoryRail>
        <Swiper
          modules={[FreeMode]}
          slidesPerView="auto"
          spaceBetween={14}
          freeMode
        >
          {categoryLinks.map((category) => (
            <SwiperSlide key={category.name}>
              <CategoryCard href={category.href}>
                <CategoryIcon aria-hidden="true">
                  <img
                    src={category.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </CategoryIcon>
                <p>{category.name}</p>
              </CategoryCard>
            </SwiperSlide>
          ))}
        </Swiper>
      </CategoryRail>
    </CategorySectionWrap>
  );
}

function BenefitSection() {
  return (
    <BenefitSectionWrap>
      <SectionTitle>
        <h6>구독혜택을 만나보세요</h6>
      </SectionTitle>
      <BenefitRail
        modules={[FreeMode, Pagination]}
        slidesPerView="auto"
        spaceBetween={24}
        freeMode
        grabCursor
        pagination={{ type: "progressbar" }}
        breakpoints={{
          0: { spaceBetween: 16 },
          768: { spaceBetween: 24 },
        }}
      >
        {benefitCards.map((benefit, index) => (
          <SwiperSlide key={benefit.label}>
            <BenefitCard $index={index}>
              <BenefitCardCopy>
                <span>{benefit.label}</span>
                <strong>{benefit.title}</strong>
                <p>{benefit.description}</p>
              </BenefitCardCopy>
            </BenefitCard>
          </SwiperSlide>
        ))}
      </BenefitRail>
    </BenefitSectionWrap>
  );
}

function ConsultationSection() {
  return (
    <ConsultSection>
      <ConsultBox>
        <SmartLink href="mailto:caresolution@hi-caresolution.com">
          <div>
            <h6>구독 상담 문의</h6>
            <p>평일 09:00~18:00 / 토요일 09:00~13:00</p>
          </div>
          <span>caresolution@hi-caresolution.com</span>
        </SmartLink>
      </ConsultBox>
      <ConsultBox>
        <SmartLink href="mailto:chulhi.cho@lge.com">
          <div>
            <h6>B2B 가전 구독 견적 문의</h6>
            <p>
              자유롭게 제품과 견적을 확인하세요
              <br />
              chulhi.cho@lge.com
            </p>
          </div>
          <img src="/images/icon-mail.svg" alt="" />
        </SmartLink>
      </ConsultBox>
    </ConsultSection>
  );
}

export default function Home() {
  const [banners, setBanners] = useState<MainBanner[]>([]);
  const [themeConfigs, setThemeConfigs] = useState<ThemeCategoryConfig[]>([]);
  const [themePreviews, setThemePreviews] = useState<ThemeCategoryPreview[]>(
    [],
  );
  const [themeLoading, setThemeLoading] = useState(false);

  const activeBanners = useMemo(
    () =>
      banners
        .filter((banner) => banner.status === "active")
        .sort((a, b) => a.priority - b.priority),
    [banners],
  );

  useEffect(() => {
    const bannerQuery = query(
      collection(db, "mainBanners"),
      orderBy("priority", "asc"),
    );
    const unsubscribe = onSnapshot(
      bannerQuery,
      (snap) => {
        setBanners(
          snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<MainBanner, "id">),
          })),
        );
      },
      (error) => {
        console.error("main banner snapshot error:", error);
        setBanners([]);
      },
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "mainThemeProducts", "config"),
      (snap) => {
        const data = snap.data() as
          | { categories?: ThemeCategoryConfig[] }
          | undefined;
        setThemeConfigs(data?.categories ?? []);
      },
      (error) => {
        console.error("theme config snapshot error:", error);
        setThemeConfigs([]);
      },
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadThemeProducts = async () => {
      const activeConfigs = themeConfigs.filter(
        (category) =>
          category.status === "active" &&
          (category.modelNames ?? []).length > 0,
      );
      if (activeConfigs.length === 0) {
        setThemePreviews([]);
        setThemeLoading(false);
        return;
      }

      try {
        const [firstConfig, ...restConfigs] = activeConfigs;
        setThemePreviews([]);
        setThemeLoading(true);
        const firstPreview = await fetchThemeCategoryPreviews([firstConfig], {
          activeOnly: true,
        });
        if (cancelled) return;

        setThemePreviews(firstPreview);
        setThemeLoading(false);

        if (restConfigs.length === 0) return;

        const restPreviews = await fetchThemeCategoryPreviews(restConfigs, {
          activeOnly: true,
        });
        if (!cancelled) {
          setThemePreviews(
            [...firstPreview, ...restPreviews].sort(
              (a, b) => a.priority - b.priority,
            ),
          );
        }
      } catch (error) {
        console.error("theme products load error:", error);
        if (!cancelled) setThemePreviews([]);
      } finally {
        if (!cancelled) setThemeLoading(false);
      }
    };

    loadThemeProducts();
    return () => {
      cancelled = true;
    };
  }, [themeConfigs]);

  return (
    <Main>
      <MainBannerSection banners={activeBanners} />
      <Content id="main-content">
        <ServiceShortcutSection />
        <ThemeProductsSection
          categories={themePreviews}
          loading={themeLoading}
        />
        <CategorySection />
        <BenefitSection />
        <ConsultationSection />
      </Content>
    </Main>
  );
}

const swiperBaseStyles = css`
  .swiper {
    position: relative;
    width: 100%;
    overflow: hidden;
    list-style: none;
    padding: 0;
    z-index: 1;
  }

  .swiper-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    z-index: 1;
    display: flex;
    transition-property: transform;
    box-sizing: content-box;
  }

  .swiper-slide {
    flex-shrink: 0;
    height: 100%;
    position: relative;
    transition-property: transform;
  }
`;

const Main = styled.main`
  width: 100%;
  overflow-x: hidden;
  background: #fff;
  color: #111;
`;

const Content = styled.div`
  max-width: 1380px;
  width: 95%;
  margin: auto;
  overflow-x: hidden;

  @media (max-width: 767px) {
    width: calc(100% - 32px);
  }
`;

const HeroSection = styled.section`
  width: 100%;
  background: #fff;
  padding: 18px 18px 0;

  @media (max-width: 767px) {
    padding: 12px 12px 0;
  }
`;

const HeroInner = styled.div`
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 22px;
  background: #f5f6f8;

  .swiper {
    position: relative;
    width: 100%;
    overflow: hidden;
    list-style: none;
    padding: 0;
    z-index: 1;
  }

  .swiper-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    z-index: 1;
    display: flex;
    transition-property: transform;
    box-sizing: content-box;
  }

  .swiper-slide {
    flex-shrink: 0;
    width: 100%;
    height: 100%;
    position: relative;
    transition-property: transform;
  }

  a {
    display: block;
  }

  .swiper-pagination {
    position: absolute;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }

  .swiper-pagination-bullet {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: rgba(17, 17, 17, 0.22);
    opacity: 1;
    cursor: pointer;
    transition: 0.2s ease;
  }

  .swiper-pagination-bullet-active {
    width: 24px;
    background: #a50034;
  }

  @media (max-width: 767px) {
    border-radius: 16px;

    .swiper-pagination {
      bottom: 14px;
    }
  }
`;

const BannerVisual = styled.div`
  width: 100%;
  background: #f5f6f8;
`;

const PcBannerImage = styled.img`
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
  background: #f5f6f8;

  @media (max-width: 767px) {
    display: none;
  }
`;

const MobileBannerImage = styled.img`
  display: none;
  width: 100%;
  height: auto;
  object-fit: contain;
  background: #f5f6f8;

  @media (max-width: 767px) {
    display: block;
  }
`;

const BannerPlaceholderBase = styled.div`
  align-items: center;
  justify-content: center;
  width: 100%;
  background: #f6f7f8;
  color: #111;
`;

const PcBannerPlaceholder = styled(BannerPlaceholderBase)`
  display: flex;
  min-height: clamp(460px, 38vw, 640px);

  @media (max-width: 767px) {
    display: none;
  }
`;

const MobileBannerPlaceholder = styled(BannerPlaceholderBase)`
  display: none;

  @media (max-width: 767px) {
    display: flex;
    min-height: min(76vw, 360px);
  }
`;

const HeroPlaceholderCopy = styled.div`
  width: min(100% - 48px, 1180px);

  h1 {
    max-width: 620px;
    color: #111;
    font-size: clamp(34px, 4.4vw, 72px);
    font-weight: 650;
    line-height: 1.04;
  }

  p {
    max-width: 420px;
    margin-top: 18px;
    color: #555;
    font-size: 18px;
    line-height: 1.65;
  }

  span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 140px;
    height: 48px;
    margin-top: 34px;
    padding: 0 24px;
    border-radius: 999px;
    background: #111;
    color: #fff;
    font-size: 14px;
    font-weight: 650;
  }

  @media (max-width: 767px) {
    width: calc(100% - 40px);

    h1 {
      max-width: 280px;
      font-size: 34px;
      line-height: 1.08;
    }

    p {
      max-width: 250px;
      margin-top: 12px;
      font-size: 14px;
      line-height: 1.55;
    }

    span {
      min-width: 120px;
      height: 42px;
      margin-top: 24px;
      padding: 0 18px;
      font-size: 13px;
    }
  }
`;

const ShortcutSection = styled.section`
  max-width: 1476px;
  margin: 50px auto 80px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;

  @media (max-width: 1280px) {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  @media (max-width: 499px) {
    height: 280px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 32px auto 72px;
  }

  @media (max-width: 767px) {
    margin: 32px auto 72px;
  }
`;

const ShortcutCard = styled.div<{
  $tone: "guide" | "card";
  $imageUrl: string;
}>`
  position: relative;
  min-height: 188px;
  aspect-ratio: 1 / 0.4374;
  border-radius: 16px;
  overflow: hidden;
  background: ${(p) =>
    p.$tone === "guide"
      ? "linear-gradient(180deg,#fff3f2 0,#ffe5e4 100%)"
      : "linear-gradient(180deg,#fafafa 0,#e6f2f2 100%)"};
  transition: border-color 0.18s ease;

  a {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    min-height: 188px;
    width: 100%;
    height: 100%;
    padding: 32px;
    position: relative;
    z-index: 2;
  }

  &:hover {
    border-color: rgba(165, 0, 52, 0.12);
  }

  &::after {
    content: "";
    display: block;
    position: absolute;
    right: ${(p) => (p.$tone === "guide" ? "34px" : "20px")};
    bottom: 26px;
    width: ${(p) => (p.$tone === "guide" ? "176px" : "120px")};
    height: ${(p) => (p.$tone === "guide" ? "130px" : "107px")};
    background: url(${(p) => p.$imageUrl}) no-repeat 0 0 / 100% auto;
  }

  @media (max-width: 1280px) {
    aspect-ratio: auto;

    a {
      padding: 50px 0 30px 32px;
    }
  }

  @media (max-width: 499px) {
    min-height: 0;
    height: 100%;
    border-radius: 8px;

    a {
      min-height: 0;
      padding: 14px;
    }

    &::after {
      right: ${(p) => (p.$tone === "guide" ? "auto" : "10px")};
      left: ${(p) => (p.$tone === "guide" ? "50%" : "auto")};
      transform: ${(p) => (p.$tone === "guide" ? "translateX(-50%)" : "none")};
      bottom: ${(p) => (p.$tone === "guide" ? "26px" : "0")};
      width: ${(p) => (p.$tone === "guide" ? "119px" : "70px")};
      height: ${(p) => (p.$tone === "guide" ? "90px" : "70px")};
    }
  }
`;

const ShortcutPill = styled.span`
  display: inline-flex;
  width: fit-content;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  border-radius: 20px;
  color: #fff;
  background: #e21024;

  ${ShortcutCard}:nth-child(2) & {
    background: #3c5d5d;
  }

  @media (max-width: 767px) {
    font-size: 12px;
  }
`;

const ShortcutText = styled.strong`
  position: relative;
  display: block;
  margin-top: 16px;
  max-width: 310px;
  font-size: 24px;
  font-weight: 650;
  line-height: 1.38;
  color: #000;
  z-index: 2;

  @media (max-width: 767px) {
    max-width: 180px;
    font-size: 14px;
    line-height: 1.36;
  }
`;

const SectionTitle = styled.div`
  margin-bottom: 20px;

  h6 {
    text-align: left;
    margin: 0;
    font-size: 26px;
    color: #000;
    font-weight: 700;
    line-height: 1;
  }

  @media (max-width: 767px) {
    margin-bottom: 16px;

    h6 {
      font-size: 26px;
      line-height: 1.2;
    }
  }
`;

const ThemeSection = styled.section`
  position: relative;
  margin-top: 80px;

  @media (max-width: 767px) {
    margin-top: 72px;
  }
`;

const ThemeTabs = styled.div`
  overflow: hidden;
  margin-bottom: 20px;
  position: relative;
  ${swiperBaseStyles}

  .swiper {
    overflow: visible;
    padding: 1px 0 4px;
  }

  .swiper-slide {
    width: max-content;
  }
`;

const ThemeTab = styled.button<{ $active: boolean }>`
  display: inline-block;
  height: 40px;
  padding: 0 24px;
  border-radius: 40px;
  background: ${(p) => (p.$active ? "#000" : "#fff")};
  border: 1px solid ${(p) => (p.$active ? "#000" : "#cacaca")};
  color: ${(p) => (p.$active ? "#fff" : "#000")};
  font-size: 16px;
  line-height: 38px;
  font-weight: 400;
  white-space: nowrap;
  width: max-content;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;

  @media (max-width: 767px) {
    height: 34px;
    padding: 0 14px;
    font-size: 12px;
    line-height: 32px;
  }
`;

const ThemeProductList = styled(Swiper)`
  ${swiperBaseStyles}
  overflow: visible;
  height: 486px;

  .swiper-slide {
    width: auto !important;
    height: 100%;
  }

  .swiper-wrapper {
    display: grid;
    grid-template-columns:
      minmax(0, calc((100% - 48px) / 2))
      repeat(2, minmax(0, calc((100% - 48px) / 4)));
    align-items: start;
    gap: 24px;
    height: 100%;
  }

  @media (max-width: 850px) {
    height: auto;
    overflow: visible;
    padding-bottom: 2px;

    .swiper-wrapper {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 24px;
      transform: none !important;
    }

    .swiper-slide {
      width: auto !important;
      height: auto;
    }

    .swiper-slide:first-child {
      grid-column: 1 / -1;
      width: auto !important;
    }
  }

  @media (max-width: 499px) {
    .swiper-wrapper {
      gap: 18px 12px;
    }
  }
`;

const skeletonBlock = css`
  background: #f5f5f5;
  border: 1px solid rgba(17, 17, 17, 0.06);
`;

const ThemeSkeleton = styled.div`
  display: flex;
  gap: 18px;
  height: 520px;

  @media (max-width: 850px) {
    height: auto;
    overflow: hidden;
  }
`;

const SkeletonHero = styled.div`
  ${skeletonBlock}
  width: 50%;
  border-radius: 20px;

  @media (max-width: 850px) {
    flex: 0 0 86vw;
    width: 86vw;
    min-height: 440px;
  }
`;

const SkeletonCard = styled.div`
  ${skeletonBlock}
  width: 25%;
  border-radius: 20px;

  @media (max-width: 850px) {
    display: none;
  }
`;

const ProductImageBox = styled.div<{ $imageUrl?: string }>`
  aspect-ratio: 1 / 1;
  border-radius: 16px;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #f7f7f7;
  background-image: ${(p) => (p.$imageUrl ? `url("${p.$imageUrl}")` : "none")};
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`;

const ProductImageFallback = styled.div`
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 12px;

  img {
    width: 88px;
    height: auto;
    object-fit: contain;
    opacity: 0.3;
  }
`;

const FeaturedImageBox = styled.div<{ $imageUrl?: string }>`
  width: 100%;
  max-width: 320px;
  height: 100%;
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: transparent;
  background-image: ${(p) => (p.$imageUrl ? `url("${p.$imageUrl}")` : "none")};
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;

  @media (max-width: 850px) {
    max-width: 280px;
    min-height: 260px;
    height: 260px;
  }
`;

const ThemeProductCard = styled.article<{ $featured?: boolean }>`
  width: 100%;
  height: 100%;
  display: block;
  position: relative;
  border-radius: ${(p) => (p.$featured ? "16px" : "0")};
  border: ${(p) => (p.$featured ? "1px solid rgba(0, 0, 0, 0.1)" : "0")};
  background: #fff;
  box-shadow: ${(p) => (p.$featured ? "0 0 2px rgba(0, 0, 0, 0.3)" : "none")};
  padding: ${(p) => (p.$featured ? "60px 20px 0 32px" : "0")};
  overflow: ${(p) => (p.$featured ? "hidden" : "visible")};
  transition: opacity 0.18s ease;

  a {
    display: block;
    height: 100%;
  }

  ${ProductImageBox} {
    width: 100%;
    max-width: ${(p) => (p.$featured ? "320px" : "100%")};
    margin: 0 auto;
    background-color: transparent;
    background-repeat: no-repeat;
    background-position: center;
    background-size: 116% auto;

    img {
      transform: scale(1.16);
    }
  }

  &:hover {
    opacity: 0.86;
  }

  @media (max-width: 850px) {
    width: 100%;
    height: auto;
    border-radius: ${(p) => (p.$featured ? "16px" : "0")};
    padding: ${(p) => (p.$featured ? "30px 20px 30px 32px" : "0")};

    ${ProductImageBox} {
      max-width: ${(p) => (p.$featured ? "280px" : "100%")};
    }
  }

  @media (max-width: 499px) {
    padding: ${(p) => (p.$featured ? "20px 18px 23px" : "0")};
  }
`;

const ProductRank = styled.span<{ $featured?: boolean }>`
  position: ${(p) => (p.$featured ? "relative" : "absolute")};
  left: ${(p) => (p.$featured ? "auto" : "16px")};
  top: ${(p) => (p.$featured ? "auto" : "16px")};
  z-index: 1;
  display: ${(p) => (p.$featured ? "block" : "inline-flex")};
  width: ${(p) => (p.$featured ? "48px" : "32px")};
  height: ${(p) => (p.$featured ? "48px" : "32px")};
  margin-top: ${(p) => (p.$featured ? "10px" : "0")};
  border-radius: ${(p) => (p.$featured ? "0" : "0")};
  background: ${(p) =>
    p.$featured
      ? "url('/images/icon_ranking_best_1.png') no-repeat center / contain"
      : "#000"};
  color: #fff;
  font-size: ${(p) => (p.$featured ? "0" : "20px")};
  font-weight: 700;
  line-height: 1.4;
  text-align: center;
  align-items: center;
  justify-content: center;
`;

const ProductImageWrap = styled.div`
  position: relative;
  height: 332px;
  padding: 18px 20px;
  border-radius: 0;
  background: #fff;
  box-shadow: 2px 5px 10px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;

  ${ProductImageBox} {
    height: 100%;
  }

  @media (max-width: 850px) {
    height: 220px;
    padding: 28px 16px 18px;
  }

  @media (max-width: 499px) {
    height: 180px;
    padding: 24px 12px 14px;
  }
`;

const FeaturedProductInner = styled.div`
  position: relative;
  display: flex;
  justify-content: space-between;
  gap: 28px;
  height: 100%;

  @media (max-width: 850px) {
    gap: 20px;
    height: auto;
  }

  @media (max-width: 499px) {
    flex-direction: column;
  }
`;

const FeaturedProductInfo = styled.div`
  position: relative;
  z-index: 2;
  width: 254px;
  flex: 0 0 254px;

  @media (max-width: 850px) {
    width: 50%;
    flex: 1 1 50%;
  }

  @media (max-width: 499px) {
    width: 100%;
    flex-basis: auto;
  }
`;

const FeaturedProductVisual = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;

  ${ProductImageBox} {
    aspect-ratio: 1 / 1;
    height: 100%;
  }

  @media (max-width: 850px) {
    position: relative;
    right: auto;
    bottom: auto;
    width: 50%;
    height: 260px;
    min-width: 0;
    margin-top: 0;
    justify-content: center;
  }

  @media (max-width: 499px) {
    width: 100%;
    height: 250px;
  }
`;

const FeaturedSubtitle = styled.div`
  margin-bottom: 60px;

  span {
    display: block;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.25;
    color: #000;
  }

  strong {
    display: block;
    margin-top: 6px;
    font-size: 36px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: 0;
    color: #000;
    word-break: keep-all;
  }

  @media (max-width: 850px) {
    margin-bottom: 30px;

    strong {
      font-size: 30px;
      line-height: 1.18;
    }
  }

  @media (max-width: 650px) {
    margin-bottom: 10px;

    strong {
      font-size: 24px;
      line-height: 1.25;
    }
  }
`;

const ProductName = styled.h3<{ $compact?: boolean; $featured?: boolean }>`
  margin: ${(p) =>
    p.$featured ? "0 0 2px" : p.$compact ? "16px 0 2px" : "0 0 6px"};
  width: 100%;
  color: #111;
  font-size: 20px;
  line-height: 1.4;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;

  @media (max-width: 767px) {
    font-size: ${(p) => (p.$featured ? "19px" : p.$compact ? "16px" : "18px")};
  }
`;

const ProductModel = styled.p`
  font-size: 16px;
  line-height: 1.5;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 767px) {
    font-size: 13px;
  }
`;

const ProductPrice = styled.p<{ $featured?: boolean }>`
  margin-top: ${(p) => (p.$featured ? "24px" : "8px")};
  font-size: ${(p) => (p.$featured ? "22px" : "20px")};
  line-height: ${(p) => (p.$featured ? "1.27" : "1.4")};
  color: #000;

  b {
    font-size: inherit;
    font-weight: 700;
  }

  @media (max-width: 767px) {
    font-size: 16px;

    b {
      font-size: 22px;
    }
  }
`;

const ProductDiscount = styled.p`
  font-size: 16px;
  line-height: 1.5;
  color: #ea1917;

  @media (max-width: 767px) {
    font-size: 13px;
  }
`;

const CategorySectionWrap = styled.section`
  margin-top: 80px;
  position: relative;
  overflow: visible;
  padding-bottom: 20px;

  @media (max-width: 767px) {
    margin-top: 72px;
  }
`;

const CategoryRail = styled.div`
  ${swiperBaseStyles}
  padding-bottom: 2px;
  overflow: hidden;

  .swiper {
    overflow: hidden;
    padding: 1px 0 12px;
  }

  .swiper-slide {
    width: 120px;
  }

  @media (max-width: 767px) {
    overflow: hidden;

    .swiper {
      overflow: hidden;
    }
  }

  @media (max-width: 650px) {
    .swiper-slide {
      width: 80px;
    }
  }
`;

const CategoryCard = styled(Link)`
  width: 100%;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  border-radius: 12px;
  background: transparent;
  transition: transform 0.18s ease;

  p {
    margin-top: 12px;
    width: 100%;
    padding: 0;
    font-size: 16px;
    line-height: 22px;
    color: #222;
    text-align: center;
    font-weight: 500;
    word-break: keep-all;
  }

  &:hover {
    transform: translateY(-2px);
  }

  @media (max-width: 650px) {
    p {
      margin-top: 5px;
      font-size: 12px;
      line-height: 1.35;
    }
  }
`;

const CategoryIcon = styled.div`
  width: 88px;
  height: 88px;
  margin: 0 auto;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    display: block;
    width: 88px;
    height: 88px;
    object-fit: contain;
  }

  @media (max-width: 650px) {
    width: 64px;
    height: 64px;

    img {
      width: 64px;
      height: 64px;
    }
  }
`;

const BenefitSectionWrap = styled.section`
  margin-top: 160px;

  @media (max-width: 767px) {
    margin-top: 80px;
  }
`;

const BenefitRail = styled(Swiper)`
  ${swiperBaseStyles}
  overflow: hidden;
  padding: 0 0 20px;

  .swiper {
    overflow: visible;
  }

  .swiper-wrapper {
    align-items: stretch;
  }

  .swiper-slide {
    width: 638px;
    height: auto;
  }

  .swiper-pagination {
    position: relative;
    width: 100%;
    height: 3px;
    margin-top: 0;
    border-radius: 999px;
    overflow: hidden;
    background: #efefef;
  }

  .swiper-pagination-progressbar-fill {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    transform-origin: left top;
    background: #000;
    border-radius: inherit;
  }

  @media (max-width: 767px) {
    overflow: visible;

    .swiper-slide {
      width: 86vw;
      max-width: 420px;
    }
  }
`;

const BenefitCard = styled.article<{ $index: number }>`
  position: relative;
  width: 100%;
  height: 224px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  padding: 24px;
  border-radius: 16px;
  overflow: hidden;
  background: ${(p) =>
    p.$index % 3 === 0
      ? "#ded9c7"
      : p.$index % 3 === 1
        ? "#dcd4ca"
        : "#e4e2e2"};

  &::after {
    content: "";
    width: 86px;
    height: 86px;
    border-radius: 999px;
    position: absolute;
    right: -24px;
    bottom: -28px;
    background: ${(p) =>
      p.$index % 3 === 0
        ? "rgba(165, 0, 52, 0.09)"
        : p.$index % 3 === 1
          ? "rgba(38, 91, 166, 0.09)"
          : "rgba(28, 112, 84, 0.09)"};
  }

  @media (max-width: 767px) {
    height: auto;
    min-height: 210px;
    padding: 20px;
  }
`;

const BenefitCardCopy = styled.div`
  width: 100%;
  min-width: 0;

  span {
    display: block;
    color: #a50034;
    font-size: 13px;
    line-height: 1.4;
    font-weight: 650;
  }

  strong {
    display: block;
    margin-top: 12px;
    color: #000;
    font-size: 20px;
    line-height: 1.4;
    font-weight: 700;
  }

  p {
    margin-top: 10px;
    color: #555;
    font-size: 15px;
    line-height: 1.5;
  }

  @media (max-width: 767px) {
    strong {
      font-size: 18px;
    }

    p {
      font-size: 13px;
    }
  }
`;

const ConsultSection = styled.section`
  margin-top: 80px;
  margin-bottom: 86px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;

  @media (max-width: 767px) {
    margin-top: 72px;
    margin-bottom: 54px;
    grid-template-columns: 1fr;
    gap: 12px;
  }
`;

const ConsultBox = styled.div`
  border-radius: 16px;
  background: #f4f4f4;
  cursor: pointer;
  min-height: 128px;
  overflow: hidden;
  transition: background 0.18s ease;

  a {
    min-height: 128px;
    padding: 24px 50px 24px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }

  h6 {
    margin-bottom: 4px;
    font-size: 20px;
    line-height: 1.48;
    color: #000;
    font-weight: 700;
  }

  p {
    margin-top: 0;
    font-size: 16px;
    line-height: 1.45;
    color: #000;
  }

  span {
    flex: 0 0 auto;
    min-width: 0;
    height: auto;
    border-radius: 0;
    background: transparent;
    color: #000;
    font-size: 16px;
    line-height: 1.48;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  img {
    width: 40px;
    height: 40px;
    object-fit: contain;
  }

  &:hover {
    background: #ececec;
  }

  @media (max-width: 767px) {
    min-height: 126px;

    a {
      min-height: 126px;
      padding: 22px 24px;
    }

    h6 {
      font-size: 18px;
    }

    p {
      font-size: 13px;
    }

    span {
      font-size: 13px;
    }
  }

  @media (max-width: 499px) {
    a {
      flex-direction: column-reverse;
      gap: 8px;
      text-align: center;
    }
  }
`;
