import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { onSnapshot, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ServiceAreaMap from "@/components/ServiceAreaMap/ServiceAreaMap";
import {
  serviceAreas as fallbackServiceAreas,
  type ServiceArea,
} from "@/data/serviceAreas";

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);

const LocationIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7.2 3.5 4.4 5.2c-.8.5-.9 1.5-.6 2.4 2.1 6.2 6.4 10.5 12.6 12.6.9.3 1.9.2 2.4-.6l1.7-2.8-4.4-2.1-1.5 2c-3.2-1.3-6-4.1-7.3-7.3l2-1.5-2.1-4.4Z" />
  </svg>
);

export default function ServiceAreaPage() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [areas, setAreas] = useState<ServiceArea[]>(fallbackServiceAreas);
  const [currentPage, setCurrentPage] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "serviceAreas", "current"),
      (snapshot) => {
        if (!snapshot.exists()) return;
        const nextAreas = snapshot.data().areas;
        if (Array.isArray(nextAreas)) setAreas(nextAreas as ServiceArea[]);
      },
      (error) => console.error("관할지역 데이터 로딩 오류:", error),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const updateViewport = () => setIsMobile(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  const results = useMemo(() => {
    const keyword = submittedQuery.trim().replace(/\s/g, "").toLowerCase();
    if (!keyword) return [];
    return areas.filter((item) =>
      [item.manager, item.office, item.area].some((value) =>
        String(value ?? "")
          .replace(/\s/g, "")
          .toLowerCase()
          .includes(keyword),
      ),
    );
  }, [areas, submittedQuery]);

  const pageSize = isMobile ? 5 : 10;
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
  const paginatedResults = useMemo(
    () => results.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, pageSize, results],
  );
  const pageNumbers = useMemo(() => {
    const visibleCount = Math.min(5, totalPages);
    const start = Math.min(
      Math.max(currentPage - 2, 1),
      Math.max(totalPages - visibleCount + 1, 1),
    );
    return Array.from({ length: visibleCount }, (_, index) => start + index);
  }, [currentPage, totalPages]);

  useEffect(() => setCurrentPage(1), [submittedQuery, pageSize]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const search = () => setSubmittedQuery(query);
  const resetFilters = () => {
    setQuery("");
    setSubmittedQuery("");
  };
  const hasSearched = submittedQuery.trim().length > 0;

  return (
    <>
      <Head>
        <title>관할지역찾기 | 하이케어솔루션</title>
        <meta
          name="description"
          content="주소나 지역명을 검색해 가까운 관할 사무소와 연락처를 확인하세요."
        />
      </Head>

      <Page>
        <Breadcrumb>
          홈 <span>/</span> 고객혜택 <span>/</span> <b>관할지역찾기</b>
        </Breadcrumb>

        <Hero>
          <HeroCopy>
            <Eyebrow>
              <LocationIcon /> SERVICE AREA
            </Eyebrow>
            <h1>
              내 지역 관할 사무소를
              <br />
              빠르게 찾아보세요
            </h1>
            <p>
              거주하시는 지역 이름을 입력하면
              <br />
              담당 사무소와 전화번호를 바로 확인할 수 있어요.
            </p>
          </HeroCopy>
          <HeroArt aria-hidden="true">
            <MapCircle className="one" />
            <MapCircle className="two" />
            <Pin>
              <LocationIcon />
            </Pin>
            <OfficeBadge>
              <span>가까운 사무소</span>
              <b>지역명으로 바로 검색</b>
            </OfficeBadge>
          </HeroArt>
        </Hero>

        <Content>
          <ServiceAreaMap areas={areas} />

          <SearchPanel>
            <SearchTitle>
              <span>
                <SearchIcon />
              </span>
              <div>
                <h2>관할지역 검색</h2>
                <p>예) 마곡, 송도, 김포, 영등포</p>
              </div>
            </SearchTitle>
            <SearchRow>
              <SearchInput>
                <SearchIcon />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && search()}
                  placeholder="지역명을 입력해 주세요"
                  aria-label="관할지역 검색어"
                />
                {query && (
                  <ClearButton
                    onClick={() => {
                      setQuery("");
                      setSubmittedQuery("");
                    }}
                    aria-label="검색어 지우기"
                  >
                    ×
                  </ClearButton>
                )}
              </SearchInput>
              <SearchButton type="button" onClick={search}>
                검색하기
              </SearchButton>
            </SearchRow>
            <QuickKeywords>
              <span>빠른 검색</span>
              {["강서", "인천", "부천", "김포", "관악"].map((keyword) => (
                <button
                  key={keyword}
                  onClick={() => {
                    setQuery(keyword);
                    setSubmittedQuery(keyword);
                  }}
                >
                  {keyword}
                </button>
              ))}
            </QuickKeywords>
          </SearchPanel>

          {hasSearched && (
            <>
              <ResultHeader>
                <div>
                  <h2>
                    <em>‘{submittedQuery}’</em> 검색 결과
                  </h2>
                  <p>
                    총 <b>{results.length}</b>개의 사무소를 찾았습니다.
                  </p>
                </div>
                <ResetButton onClick={resetFilters}>검색 초기화</ResetButton>
              </ResultHeader>

              {results.length > 0 ? (
                <>
                  <ResultGrid>
                    {paginatedResults.map((item) => (
                      <AreaCard
                        key={`${item.manager}-${item.office}-${item.phone}`}
                      >
                        <CardTop>
                          <OfficeMark>
                            <LocationIcon />
                          </OfficeMark>
                          <div>
                            <SmallLabel>{item.manager} 담당</SmallLabel>
                            <h3>{item.office} 사무소</h3>
                          </div>
                        </CardTop>
                        <AreaInfo>
                          <b>관할구역</b>
                          <p>{item.area}</p>
                        </AreaInfo>
                        <CallLink href={`tel:${item.phone}`}>
                          <PhoneIcon />
                          <span>{item.phone}</span>
                          <b>전화하기</b>
                        </CallLink>
                      </AreaCard>
                    ))}
                  </ResultGrid>
                  {totalPages > 1 && (
                    <Pagination aria-label="관할지역 목록 페이지">
                      <PageArrow
                        type="button"
                        onClick={() =>
                          setCurrentPage((page) => Math.max(1, page - 1))
                        }
                        disabled={currentPage === 1}
                        aria-label="이전 페이지"
                      >
                        ‹
                      </PageArrow>
                      {pageNumbers.map((pageNumber) => (
                        <PageButton
                          key={pageNumber}
                          type="button"
                          $active={currentPage === pageNumber}
                          aria-current={
                            currentPage === pageNumber ? "page" : undefined
                          }
                          onClick={() => setCurrentPage(pageNumber)}
                        >
                          {pageNumber}
                        </PageButton>
                      ))}
                      <PageArrow
                        type="button"
                        onClick={() =>
                          setCurrentPage((page) =>
                            Math.min(totalPages, page + 1),
                          )
                        }
                        disabled={currentPage === totalPages}
                        aria-label="다음 페이지"
                      >
                        ›
                      </PageArrow>
                    </Pagination>
                  )}
                </>
              ) : (
                <Empty>
                  <span>
                    <SearchIcon />
                  </span>
                  <h3>검색 결과가 없습니다</h3>
                  <p>동 이름을 줄이거나 구·시 이름으로 다시 검색해 주세요.</p>
                  <button onClick={resetFilters}>다시 검색하기</button>
                </Empty>
              )}
            </>
          )}

          <Notice>
            <b>안내사항</b>
            <p>
              행정구역 및 담당 사무소 운영 상황에 따라 관할지역이 변경될 수
              있습니다. 연결이 어려운 경우 가까운 사무소로 문의해 주세요.
            </p>
          </Notice>
        </Content>
      </Page>
    </>
  );
}

const Page = styled.div`
  background: #fff;
  min-height: 100vh;
  color: #171717;
`;
const Breadcrumb = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 24px 20px;
  font-size: 13px;
  color: #8a8a8a;
  span {
    margin: 0 9px;
    color: #ccc;
  }
  b {
    color: #555;
    font-weight: 500;
  }
  @media (max-width: 640px) {
    padding: 18px 20px 14px;
    font-size: 12px;
  }
`;
const Hero = styled.section`
  position: relative;
  display: flex;
  min-height: 350px;
  max-width: 1280px;
  margin: 0 auto;
  padding: 60px 72px;
  overflow: hidden;
  border-radius: 28px;
  background: linear-gradient(125deg, #f2f0ef 0%, #f7f6f5 50%, #edeae8 100%);
  @media (max-width: 900px) {
    margin: 0 20px;
    padding: 48px 40px;
    min-height: 330px;
  }
  @media (max-width: 640px) {
    min-height: 420px;
    margin: 0 16px;
    padding: 36px 25px;
    border-radius: 22px;
    align-items: flex-start;
  }
`;
const HeroCopy = styled.div`
  position: relative;
  z-index: 2;
  h1 {
    font-size: 40px;
    line-height: 1.27;
    letter-spacing: -1.5px;
    margin: 14px 0 18px;
    color: #161616;
  }
  p {
    font-size: 16px;
    line-height: 1.75;
    color: #696969;
  }
  @media (max-width: 640px) {
    h1 {
      font-size: 30px;
      margin: 12px 0 14px;
    }
    p {
      font-size: 14px;
      line-height: 1.65;
    }
  }
`;
const Eyebrow = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1.6px;
  color: #a50034;
  svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
  }
`;
const HeroArt = styled.div`
  position: absolute;
  right: 50px;
  top: 0;
  width: 500px;
  height: 100%;
  &:before,
  &:after {
    content: "";
    position: absolute;
    background: #d7d2cf;
    border-radius: 999px;
    opacity: 0.7;
    transform: rotate(-25deg);
  }
  &:before {
    width: 420px;
    height: 2px;
    right: -30px;
    top: 140px;
  }
  &:after {
    width: 360px;
    height: 2px;
    right: 40px;
    top: 230px;
  }
  @media (max-width: 900px) {
    right: -110px;
    opacity: 0.9;
  }
  @media (max-width: 640px) {
    width: 100%;
    height: 190px;
    right: -35px;
    top: auto;
    bottom: -8px;
  }
`;
const MapCircle = styled.i`
  position: absolute;
  border: 1px solid #d4cfcc;
  border-radius: 50%;
  &.one {
    width: 240px;
    height: 240px;
    right: 30px;
    top: 48px;
  }
  &.two {
    width: 145px;
    height: 145px;
    right: 78px;
    top: 95px;
    border-color: #c5bfbc;
  }
  @media (max-width: 640px) {
    &.one {
      width: 190px;
      height: 190px;
      right: 25px;
      top: 5px;
    }
    &.two {
      width: 115px;
      height: 115px;
      right: 62px;
      top: 42px;
    }
  }
`;
const Pin = styled.div`
  position: absolute;
  right: 145px;
  top: 105px;
  width: 82px;
  height: 82px;
  border-radius: 50% 50% 50% 5px;
  transform: rotate(-45deg);
  background: linear-gradient(145deg, #b30b42, #87002c);
  box-shadow: 0 18px 35px rgba(139, 0, 44, 0.2);
  display: grid;
  place-items: center;
  svg {
    width: 38px;
    height: 38px;
    transform: rotate(45deg);
    fill: none;
    stroke: white;
    stroke-width: 1.5;
  }
  @media (max-width: 640px) {
    right: 95px;
    top: 35px;
    width: 65px;
    height: 65px;
    svg {
      width: 30px;
    }
  }
`;
const OfficeBadge = styled.div`
  position: absolute;
  right: 0;
  bottom: 46px;
  padding: 17px 22px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.07);
  backdrop-filter: blur(8px);
  span {
    display: block;
    color: #999;
    font-size: 11px;
    margin-bottom: 4px;
  }
  b {
    font-size: 14px;
  }
  @media (max-width: 640px) {
    right: 22px;
    bottom: 14px;
    padding: 13px 16px;
  }
`;
const Content = styled.div`
  max-width: 1120px;
  margin: 0 auto;
  padding: 70px 24px 20px;
  @media (max-width: 640px) {
    padding: 42px 16px 0;
  }
`;
const SearchPanel = styled.section`
  border: 1px solid #e6e6e6;
  border-radius: 22px;
  padding: 30px 34px;
  background: #fff;
  box-shadow: 0 10px 35px rgba(0, 0, 0, 0.045);
  @media (max-width: 640px) {
    padding: 23px 20px;
    border-radius: 18px;
  }
`;
const SearchTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 22px;
  > span {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: #f8edf1;
    display: grid;
    place-items: center;
    color: #a50034;
  }
  svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
  }
  h2 {
    font-size: 19px;
    letter-spacing: -0.4px;
  }
  p {
    font-size: 13px;
    color: #999;
    margin-top: 3px;
  }
`;
const SearchRow = styled.div`
  display: flex;
  gap: 10px;
  @media (max-width: 640px) {
    display: block;
  }
`;
const SearchInput = styled.div`
  flex: 1;
  height: 58px;
  border: 1px solid #d9d9d9;
  border-radius: 12px;
  display: flex;
  align-items: center;
  padding: 0 18px;
  transition: 0.2s;
  &:focus-within {
    border-color: #a50034;
    box-shadow: 0 0 0 3px rgba(165, 0, 52, 0.07);
  }
  svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: #888;
    stroke-width: 1.8;
    flex: none;
  }
  input {
    width: 100%;
    height: 100%;
    padding: 0 13px;
    font-size: 16px;
    color: #222;
  }
  & input::placeholder {
    color: #aaa;
  }
`;
const ClearButton = styled.button`
  font-size: 24px;
  color: #aaa;
  cursor: pointer;
  line-height: 1;
  padding: 5px;
`;
const SearchButton = styled.button`
  width: 140px;
  border-radius: 12px;
  background: #222;
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;
  &:hover {
    background: #a50034;
    transform: translateY(-1px);
  }
  @media (max-width: 640px) {
    width: 100%;
    height: 54px;
    margin-top: 10px;
  }
`;
const QuickKeywords = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
  flex-wrap: wrap;
  font-size: 12px;
  > span {
    color: #999;
    margin-right: 3px;
  }
  button {
    padding: 7px 12px;
    border-radius: 999px;
    background: #f5f5f5;
    color: #666;
    cursor: pointer;
    transition: 0.2s;
  }
  button:hover {
    background: #eee;
    color: #a50034;
  }
`;
const ResultHeader = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin: 66px 2px 24px;
  h2 {
    font-size: 26px;
    letter-spacing: -0.8px;
    margin-bottom: 7px;
  }
  em {
    font-style: normal;
    color: #a50034;
  }
  p {
    font-size: 14px;
    color: #888;
  }
  p b {
    color: #a50034;
  }
  @media (max-width: 640px) {
    margin-top: 46px;
    h2 {
      font-size: 22px;
    }
  }
`;
const ResetButton = styled.button`
  color: #777;
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
  padding: 6px;
`;
const ResultGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;
const AreaCard = styled.article`
  min-width: 0;
  border: 1px solid #e8e8e8;
  border-radius: 18px;
  padding: 25px 25px 20px;
  background: white;
  transition: 0.2s;
  &:hover {
    border-color: #d3b5bf;
    box-shadow: 0 12px 35px rgba(76, 28, 43, 0.08);
    transform: translateY(-2px);
  }
  @media (max-width: 640px) {
    padding: 22px 20px 17px;
  }
`;
const CardTop = styled.div`
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 20px;
  h3 {
    font-size: 19px;
    letter-spacing: -0.4px;
    margin-top: 2px;
  }
`;
const OfficeMark = styled.span`
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: #f7f2f3;
  color: #a50034;
  display: grid;
  place-items: center;
  svg {
    width: 21px;
    height: 21px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
  }
`;
const SmallLabel = styled.span`
  font-size: 11px;
  color: #a50034;
  font-weight: 600;
`;
const AreaInfo = styled.div`
  min-height: 88px;
  padding: 16px;
  border-radius: 12px;
  background: #f7f7f7;
  b {
    display: block;
    font-size: 11px;
    color: #888;
    margin-bottom: 7px;
  }
  p {
    font-size: 13px;
    line-height: 1.65;
    color: #555;
    word-break: keep-all;
  }
`;
const CallLink = styled.a`
  display: flex;
  align-items: center;
  margin-top: 17px;
  color: #333;
  font-size: 15px;
  font-weight: 600;
  svg {
    width: 18px;
    height: 18px;
    margin-right: 8px;
    fill: none;
    stroke: #a50034;
    stroke-width: 1.7;
  }
  span {
    letter-spacing: 0.2px;
  }
  b {
    margin-left: auto;
    color: #a50034;
    font-size: 12px;
    font-weight: 600;
  }
`;
const Pagination = styled.nav`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 38px;
  @media (max-width: 640px) {
    gap: 5px;
    margin-top: 30px;
  }
`;
const PageButton = styled.button<{ $active: boolean }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${({ $active }) => ($active ? "#222" : "#fff")};
  border: 1px solid ${({ $active }) => ($active ? "#222" : "#dedede")};
  color: ${({ $active }) => ($active ? "#fff" : "#666")};
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  cursor: pointer;
  transition: 0.18s;
  &:hover {
    border-color: #a50034;
    color: ${({ $active }) => ($active ? "#fff" : "#a50034")};
  }
  @media (max-width: 640px) {
    width: 36px;
    height: 36px;
  }
`;
const PageArrow = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid #dedede;
  background: #fff;
  color: #555;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  &:disabled {
    opacity: 0.3;
    cursor: default;
  }
  &:hover:not(:disabled) {
    border-color: #a50034;
    color: #a50034;
  }
  @media (max-width: 640px) {
    width: 36px;
    height: 36px;
  }
`;
const Empty = styled.div`
  border: 1px solid #e6e6e6;
  border-radius: 18px;
  text-align: center;
  padding: 70px 20px;
  color: #888;
  > span {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    margin: 0 auto 18px;
    background: #f6f6f6;
  }
  svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: #aaa;
    stroke-width: 1.6;
  }
  h3 {
    font-size: 19px;
    color: #333;
    margin-bottom: 8px;
  }
  p {
    font-size: 14px;
  }
  button {
    margin-top: 22px;
    padding: 11px 18px;
    border: 1px solid #ddd;
    border-radius: 9px;
    cursor: pointer;
    color: #555;
  }
`;
const Notice = styled.div`
  display: flex;
  gap: 22px;
  margin-top: 38px;
  padding: 20px 24px;
  border-radius: 12px;
  background: #fafafa;
  font-size: 12px;
  line-height: 1.6;
  color: #888;
  b {
    flex: none;
    color: #555;
  }
  @media (max-width: 640px) {
    display: block;
    b {
      display: block;
      margin-bottom: 6px;
    }
  }
`;
