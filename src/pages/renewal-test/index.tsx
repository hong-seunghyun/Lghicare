/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { CSSProperties, useEffect, useState } from "react";
import TestLayout, { Icon, Modal } from "@/components/renewal-test/TestLayout";
import {
  PREVIEW_CATEGORIES,
  PRODUCT_CATEGORIES,
  featuredBenefitPrice,
  lowestVariant,
  variantMonthly,
  money,
  textValue,
  themeProductSummary,
} from "@/lib/renewalTest";
import {
  useRenewalMainContent,
  useRenewalProducts,
  useRenewalThemeProducts,
  prefetchRenewalTheme,
} from "@/hooks/useRenewalData";
import s from "@/components/renewal-test/renewal.module.css";
import h from "@/components/renewal-test/home.module.css";
import { CategoryRail } from "@/components/renewal-test/Controls";
import { BenefitArtwork } from "@/components/renewal-test/BenefitArtwork";

const themePalette: Record<
  string,
  { accent: string; soft: string; border: string; icon: string }
> = {
  냉장고: {
    accent: "#a50034",
    soft: "#fcf0f4",
    border: "#efd3dd",
    icon: "fridge",
  },
  에어컨: {
    accent: "#236e63",
    soft: "#edf7f3",
    border: "#cee6dc",
    icon: "wind",
  },
  식기세척기: {
    accent: "#365f9d",
    soft: "#eff4fc",
    border: "#d6e1f1",
    icon: "dishwasher",
  },
  TV: { accent: "#7650a2", soft: "#f5effa", border: "#e4d8ee", icon: "tv" },
};

const categoryImages: Record<string, number> = {
  정수기: 1,
  안마의자: 2,
  TV: 3,
  냉장고: 5,
  김치냉장고: 6,
  에어컨: 7,
  공기청정기: 8,
  제습기: 10,
  가습기: 11,
  전기레인지: 12,
  식기세척기: 13,
  워시타워: 14,
  워시콤보: 15,
  세탁기: 16,
  의류건조기: 17,
  의류관리기: 18,
  신발관리기: 19,
  청소기: 20,
};
export default function RenewalHome() {
  const router = useRouter(),
    {
      banners,
      themes,
      error: contentError,
      loading: contentLoading,
    } = useRenewalMainContent();
  const catalogMode =
    typeof router.query.category === "string" || Boolean(router.query.search);
  const [themeId, setThemeId] = useState("");
  const activeTheme = themes.find((t) => t.id === themeId) ?? themes[0];
  const themed = useRenewalThemeProducts(activeTheme);
  const category =
    typeof router.query.category === "string"
      ? router.query.category
      : typeof router.query.search === "string" && router.query.search.trim()
        ? "전체"
        : activeTheme?.sheetName || "정수기";
  const palette = themePalette[category] ?? themePalette.냉장고;
  const themeStyle = {
    "--theme-accent": palette.accent,
    "--theme-soft": palette.soft,
    "--theme-border": palette.border,
  } as CSSProperties;
  const search =
    typeof router.query.search === "string" ? router.query.search : "";
  const catalog = useRenewalProducts(category, search, catalogMode);
  const { products } = catalog;
  const loading = catalogMode
    ? catalog.loading
    : themed.loading || contentLoading;
  const error = catalogMode ? catalog.error : themed.error;
  const retry = catalogMode ? catalog.retry : themed.retry;
  const [slide, setSlide] = useState(0),
    [sort, setSort] = useState("recommended"),
    [limit, setLimit] = useState(6),
    [benefit, setBenefit] = useState<string | null>(null),
    [consult, setConsult] = useState(false);
  useEffect(() => setLimit(6), [category, search]);
  const activeBanner = banners[slide % banners.length];
  const ranked = [...products].sort((a, b) => {
    if (sort === "low")
      return (
        variantMonthly(lowestVariant(a)) - variantMonthly(lowestVariant(b))
      );
    if (sort === "high")
      return (
        variantMonthly(lowestVariant(b)) - variantMonthly(lowestVariant(a))
      );
    return 0;
  });
  const displayed = catalogMode
    ? ranked
        .slice(0, limit)
        .map((product) => ({ product: themeProductSummary(product), rank: 0 }))
    : themed.products;
  const chooseCategory = (value: string) =>
    void router.push(
      {
        pathname: "/renewal-test",
        query: { category: value },
        hash: "products",
      },
      undefined,
      { shallow: true },
    );
  const estimateLink = (id: string, cat: string) => ({
    pathname: "/renewal-test/estimate",
    query: { add: id, category: cat, pricing: "lowest" },
  });
  return (
    <TestLayout originalFooter>
      <section className={h.hero} aria-label="가전 구독 소개">
        {activeBanner &&
        (activeBanner.pcImageUrl || activeBanner.mobileImageUrl) ? (
          <div className={h.liveBanner}>
            {activeBanner.linkUrl ? (
              <a href={activeBanner.linkUrl}>
                <picture>
                  <source
                    media="(max-width:760px)"
                    srcSet={
                      activeBanner.mobileImageUrl ||
                      activeBanner.pcImageUrl ||
                      ""
                    }
                  />
                  <img
                    src={
                      activeBanner.pcImageUrl ||
                      activeBanner.mobileImageUrl ||
                      ""
                    }
                    alt={activeBanner.title || "LG 하이케어솔루션 구독 안내"}
                    fetchPriority="high"
                  />
                </picture>
              </a>
            ) : (
              <picture>
                <source
                  media="(max-width:760px)"
                  srcSet={
                    activeBanner.mobileImageUrl || activeBanner.pcImageUrl || ""
                  }
                />
                <img
                  src={
                    activeBanner.pcImageUrl || activeBanner.mobileImageUrl || ""
                  }
                  alt={activeBanner.title || "LG 하이케어솔루션 구독 안내"}
                  fetchPriority="high"
                />
              </picture>
            )}
            {banners.length > 1 && (
              <div className={h.bannerControls}>
                <button
                  aria-label="이전 배너"
                  onClick={() =>
                    setSlide((n) => (n + banners.length - 1) % banners.length)
                  }
                >
                  ‹
                </button>
                <span>
                  {(slide % banners.length) + 1} / {banners.length}
                </span>
                <button
                  aria-label="다음 배너"
                  onClick={() => setSlide((n) => (n + 1) % banners.length)}
                >
                  ›
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={`${h.container} ${h.heroInner}`}>
            <div className={h.heroCopy}>
              <span className={s.eyebrow}>LG 가전 구독 · 하이케어솔루션</span>
              <h1>
                우리 집에 맞는 가전,
                <br />
                일상에 맞추는 구독.
              </h1>
              <p>
                제품 선택부터 정기적인 관리까지.
                <br />
                우리 집에 필요한 가전을 만나보세요.
              </p>
              <a href="#products" className={s.darkButton}>
                구독 제품 둘러보기
                <Icon name="arrow" />
              </a>
            </div>
            <div className={s.spaciousHeroImage}>
              {displayed[0]?.product?.image ? (
                <img
                  src={displayed[0].product.image}
                  alt={displayed[0].product.name}
                  fetchPriority="high"
                />
              ) : (
                <div
                  className={h.heroLoading}
                  aria-label="운영 상품 이미지 불러오는 중"
                />
              )}
            </div>
          </div>
        )}
      </section>
      <section
        className={`${h.container} ${h.categorySection}`}
        aria-label="제품 카테고리"
      >
        <CategoryRail
          label="제품 카테고리"
          className={h.mainCategoryRail}
          arrows={false}
          draggable
        >
          {PRODUCT_CATEGORIES.map((name) => (
            <Link
              key={name}
              className={h.mainCategoryLink}
              href={`/products/${encodeURIComponent(name)}`}
              aria-current={category === name ? "true" : undefined}
              draggable={false}
            >
              {categoryImages[name] ? (
                <img
                  src={`/images/main-category-${categoryImages[name]}.png`}
                  alt=""
                  draggable={false}
                />
              ) : (
                <span className={h.categoryGlyph}>
                  <Icon
                    name={
                      name === "광파오븐"
                        ? "oven"
                        : name === "마이컵"
                          ? "cup"
                          : "wind"
                    }
                    size={36}
                  />
                </span>
              )}
              <span>{name === "의류관리기" ? "스타일러" : name}</span>
            </Link>
          ))}
        </CategoryRail>
      </section>
      <section
        id="products"
        className={`${h.container} ${h.productsSection} ${!catalogMode ? h.weeklySection : ""}`}
        style={themeStyle}
      >
        <div className={h.sectionHeader}>
          <div>
            {catalogMode && <span className={s.eyebrow}>LG 가전 구독</span>}
            <h2>
              {!catalogMode && (
                <span className={h.headingMark}>
                  <Icon name="sparkle" size={22} />
                </span>
              )}
              {search
                ? `‘${search}’ 검색 결과`
                : catalogMode
                  ? `${category === "의류관리기" ? "스타일러" : category} 구독 제품`
                  : "금주의 테마상품"}
            </h2>
            {catalogMode && (
              <p>제품별 최저 구독료와 적용 조건을 확인해 보세요.</p>
            )}
          </div>
          {!catalogMode && activeTheme ? (
            <Link
              className={h.viewAll}
              href={`/products/${encodeURIComponent(activeTheme.sheetName)}`}
            >
              {activeTheme.label} 전체 보기
              <Icon name="chevron" size={16} />
            </Link>
          ) : (
            <Link className={h.viewAll} href="/renewal-test">
              금주의 테마상품 보기
              <Icon name="chevron" size={16} />
            </Link>
          )}
        </div>
        <div className={h.productToolbar}>
          <div
            className={h.tabs}
            aria-label={catalogMode ? "제품 카테고리" : "금주의 테마 카테고리"}
          >
            {catalogMode
              ? PREVIEW_CATEGORIES.map((name) => (
                  <button
                    className={category === name ? h.tabActive : ""}
                    key={name}
                    aria-pressed={category === name}
                    onClick={() => chooseCategory(name)}
                  >
                    {name === "의류관리기" ? "스타일러" : name}
                  </button>
                ))
              : themes.map((theme) => (
                  <button
                    className={activeTheme?.id === theme.id ? h.tabActive : ""}
                    key={theme.id}
                    aria-pressed={activeTheme?.id === theme.id}
                    onPointerEnter={() => prefetchRenewalTheme(theme)}
                    onFocus={() => prefetchRenewalTheme(theme)}
                    onClick={() => setThemeId(theme.id)}
                  >
                    <Icon
                      name={themePalette[theme.sheetName]?.icon ?? "grid"}
                      size={18}
                    />
                    {theme.label}
                  </button>
                ))}
          </div>
          {catalogMode && (
            <select
              aria-label="제품 정렬"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recommended">기본순</option>
              <option value="low">낮은 요금순</option>
              <option value="high">높은 요금순</option>
            </select>
          )}
        </div>
        {(error || contentError) && (
          <div className={s.errorNotice} role="alert">
            {error || contentError}
            <button className={s.secondary} onClick={retry}>
              다시 불러오기
            </button>
          </div>
        )}
        <div className={h.productCards}>
          {loading
            ? Array.from({ length: catalogMode ? 6 : 3 }, (_, i) => (
                <div
                  className={h.productSkeleton}
                  key={i}
                  aria-label="상품 불러오는 중"
                />
              ))
            : displayed.map(({ product: p, rank }) => {
                const v = p.minimumVariant;
                return (
                  <article
                    className={`${h.productCard} ${rank === 1 ? h.featuredProduct : ""}`}
                    key={p.id}
                  >
                    <Link
                      href={estimateLink(p.id, p.category)}
                      className={h.productImage}
                    >
                      <span className={h.productTag}>
                        {rank > 0 && (
                          <Icon
                            name={rank === 1 ? "trophy" : "award"}
                            size={rank === 1 ? 30 : 24}
                          />
                        )}
                        {rank ? `BEST ${rank}` : p.category}
                      </span>
                      {p.image ? (
                        <Image
                          src={p.image}
                          alt={p.name}
                          width={640}
                          height={480}
                          priority={rank === 1}
                          sizes={
                            rank === 1
                              ? "(max-width: 760px) 88vw, 700px"
                              : "(max-width: 760px) 78vw, 440px"
                          }
                        />
                      ) : (
                        <div className={s.imageMissing}>이미지 준비 중</div>
                      )}
                    </Link>
                    <div className={h.productInfo}>
                      <small>{p.category}</small>
                      <h3>
                        <Link
                          href={estimateLink(p.id, p.category)}
                          title={p.name}
                        >
                          {p.name}
                        </Link>
                      </h3>
                      <span className={h.model}>{p.id}</span>
                      {rank ? (
                        <div className={h.featuredPriceBlock}>
                          <span>
                            월 구독료 <b>{money(p.monthly)}</b>
                            <span className={h.benefitFlag}>
                              <Icon name="gift" size={16} />
                              최대 혜택
                            </span>
                          </span>
                          <strong>
                            <small>월 체감요금</small>
                            <span>
                              {money(featuredBenefitPrice(p.monthly)).replace(
                                /원$/,
                                "",
                              )}
                              <em>원</em>
                            </span>
                          </strong>
                        </div>
                      ) : (
                        <>
                          <div className={h.priceLine}>
                            <span>옵션 최저 월 구독료</span>
                            <strong>
                              {money(p.monthly)}
                              <small>부터</small>
                            </strong>
                          </div>
                          <p className={h.productCondition}>
                            {textValue(v["프로모션 대분류"])} ·{" "}
                            {Number(v.계약기간) / 12}년 ·{" "}
                            {textValue(v.서비스유형)} ·{" "}
                            {textValue(v["서비스주기/월"])}
                          </p>
                        </>
                      )}
                      <Link
                        className={h.productCta}
                        href={estimateLink(p.id, p.category)}
                      >
                        구독 조건 확인
                        <Icon name="arrow" size={22} />
                      </Link>
                    </div>
                  </article>
                );
              })}
        </div>
        {!loading && !error && !displayed.length && (
          <div className={s.empty}>
            <Icon name="search" size={36} />
            <h3>
              {catalogMode
                ? "검색 결과가 없습니다."
                : "등록된 테마상품이 없습니다."}
            </h3>
            <p>
              {catalogMode
                ? "다른 제품명이나 모델명으로 검색해 주세요."
                : "관리자에서 테마 카테고리와 BEST 3 모델을 등록해 주세요."}
            </p>
            <button
              className={s.secondary}
              onClick={() => chooseCategory("전체")}
            >
              전체 제품 보기
            </button>
          </div>
        )}
        {catalogMode && ranked.length > limit && (
          <button
            className={s.addProductButton}
            onClick={() => setLimit((n) => n + 6)}
          >
            제품 더 보기
            <Icon name="plus" />
          </button>
        )}
        {catalogMode && (
          <p className={h.priceNote}>
            표시 요금은 실제 옵션 조합 중 최저 월 구독료입니다. 선택 조건에 따라
            달라집니다.
          </p>
        )}
      </section>
      <section id="benefits" className={`${h.container} ${h.benefitsSection}`}>
        <div className={h.sectionHeader}>
          <div>
            <span className={s.eyebrow}>함께 누리는 구독 혜택</span>
            <h2>가전 그 이상의 구독 생활</h2>
          </div>
        </div>
        <div className={h.benefitCards}>
          <button
            className={h.careBenefit}
            onClick={() => setBenefit("구독·케어 서비스")}
          >
            <div>
              <span>케어 서비스</span>
              <h3>
                사용하는 내내, <br />
                전문가의 세심한 케어
              </h3>
              <p>제품에 맞는 정기적인 관리까지</p>
            </div>
            <span className={h.benefitArtwork}>
              <BenefitArtwork type="care" />
            </span>
            <Icon name="arrow" />
          </button>
          <button
            className={h.cardBenefit}
            onClick={() => setBenefit("제휴카드 혜택")}
          >
            <div>
              <span>구독 혜택</span>
              <h3>
                나에게 맞는 혜택으로, <br />
                매달 더 가벼운 구독
              </h3>
              <p>현재 적용 가능한 카드·교원 혜택 확인</p>
            </div>
            <span className={h.benefitArtwork}>
              <BenefitArtwork type="card" />
            </span>
            <Icon name="arrow" />
          </button>
        </div>
      </section>
      <section id="consult" className={h.consultSection}>
        <div className={`${h.container} ${h.consultInner}`}>
          <div className={h.consultCopy}>
            <span className={h.consultIcon}>
              <Icon name="support" size={30} />
            </span>
            <div>
              <h2>가전 구독, 편하게 상담하세요.</h2>
              <p>제품 선택부터 구독 조건까지 안내해 드려요.</p>
            </div>
          </div>
          <button className={h.consultButton} onClick={() => setConsult(true)}>
            상담 안내
            <Icon name="arrow" />
          </button>
        </div>
      </section>
      {benefit && (
        <Modal title={benefit} onClose={() => setBenefit(null)}>
          <div className={s.modalContent}>
            <p>
              {benefit === "제휴카드 혜택"
                ? "현재 관리 화면에 등록된 카드와 구독교원 혜택을 견적에서 확인할 수 있습니다. 카드 청구 할인은 계약 구독료와 구분해 표시합니다."
                : "모델별로 선택 가능한 관리 방식과 주기를 확인하고, 계약 기간에 맞춰 구독을 구성해 보세요."}
            </p>
            <Link className={s.primary} href="/renewal-test/estimate">
              로그인 후 견적내기
              <Icon name="arrow" />
            </Link>
          </div>
        </Modal>
      )}
      {consult && (
        <Modal title="구독 상담 안내" onClose={() => setConsult(false)}>
          <div className={s.modalContent}>
            <p>
              상담 신청은 기존 사이트의 상담 안내를 통해 진행하실 수 있습니다.
            </p>
            <a
              className={s.primary}
              href="https://lghicaresolution.com/"
              target="_blank"
              rel="noreferrer"
            >
              기존 사이트에서 상담하기 ↗
            </a>
          </div>
        </Modal>
      )}
    </TestLayout>
  );
}
