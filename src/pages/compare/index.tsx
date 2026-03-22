import { useEffect, useState, useRef, useLayoutEffect } from "react";
import styled from "styled-components";
import Loading from "@/components/loading/Loading";

import Image from "next/image";

// 스펙 데이터의 key-value 구조를 명시적으로 정의
interface SpecData {
  [key: string]: string | number | boolean | null;
}

// ProductInfo 타입 (그대로)
interface ProductInfo {
  thumbnailUrl?: string;
  상품명: string;
  모델코드: string;
  가격?: string;
  중분류?: string;
}

export default function ComparePage() {
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [specs, setSpecs] = useState<Record<string, SpecData>>({});
  const specRefs = useRef<Record<string, HTMLDivElement[]>>({});

  useEffect(() => {
    const data = sessionStorage.getItem("compareProducts");
    if (!data) {
      setLoading(false);
      return;
    }

    const parsed: ProductInfo[] = JSON.parse(data);
    setProducts(parsed);

    //  병렬로 API 호출
    Promise.all(
      parsed.map(async (p) => {
        console.log("🚨 중분류", p.중분류, "모델코드", p.모델코드);
        if (!p.중분류 || !p.모델코드) return null;
        console.log("🚨 중분류", p.중분류, "모델코드", p.모델코드);
        const res = await fetch(`/api/spec/${p.중분류}/${p.모델코드}`);
        if (!res.ok) return null;
        const spec = await res.json();
        return { code: p.모델코드, spec };
      })
    ).then((result) => {
      // 1️⃣ 필터 후 객체화
      const specMap = Object.fromEntries(
        result
          .filter(
            (r): r is { code: string; spec: Record<string, string> } =>
              !!r && !!r.spec
          )
          .map((r) => [r.code, r.spec])
      );

      // 2️⃣ 모든 제품의 key 통합
      const allKeys = Array.from(
        new Set(Object.values(specMap).flatMap((spec) => Object.keys(spec)))
      );

      // 3️⃣ 누락 항목을 "-"로 채운 새 스펙 객체 생성
      const normalizedSpecs: Record<string, Record<string, string>> = {};

      for (const [code, spec] of Object.entries(specMap)) {
        normalizedSpecs[code] = {};
        for (const key of allKeys) {
          normalizedSpecs[code][key] = spec[key] ?? "-";
        }
      }

      setSpecs(normalizedSpecs);
      setLoading(false);
    });
  }, []);

  useLayoutEffect(() => {
    Object.values(specRefs.current).forEach((elements) => {
      if (elements.length < 2) return;
      const maxHeight = Math.max(...elements.map((el) => el.offsetHeight || 0));
      elements.forEach((el) => {
        el.style.minHeight = `${maxHeight}px`;
      });
    });
  }, [specs]);

  if (loading) return <Loading />;

  if (products.length === 0) {
    return (
      <Container>
        <Title>선택된 제품이 없습니다.</Title>
      </Container>
    );
  }

  return (
    <Container>
      <Title>선택한 제품 비교하기</Title>
      <ScrollWrap>
        <Grid>
          {products.map((p) => {
            //  숫자로 변환 후 13,000원 할인 계산
            const numericPrice = Number(String(p.가격).replace(/[^0-9]/g, ""));
            const discountPrice =
              numericPrice > 0 ? Math.max(numericPrice - 13000, 0) : null;
            return (
              <Card key={p.모델코드}>
                <Image
                  src={p.thumbnailUrl || "/images/placeholder.png"}
                  alt=""
                  width={160}
                  height={160}
                />

                <PriceWrap>
                  <Name>{p.상품명}</Name>
                  <Code>{p.모델코드}</Code>
                </PriceWrap>
              </Card>
            );
          })}
        </Grid>
      </ScrollWrap>
      <SpecSection>
        <h3>제품 스펙 상세 비교</h3>

        {Object.keys(specs).length === 0 ? (
          <EmptySpec>현재 준비중 입니다.</EmptySpec>
        ) : (
          <ScrollWrap>
            <SpecWrap>
              {Object.entries(specs).map(([code, spec]) => {
                const product = products.find((p) => p.모델코드 === code);
                if (!product) return null;

                const specEntries = Object.entries(spec);
                const hasSpec = specEntries.length > 0;

                return (
                  <SpecCard key={code}>
                    {hasSpec ? (
                      <SpecList>
                        {specEntries.map(([key, value]) => (
                          <div
                            key={key}
                            ref={(el) => {
                              if (!el) return;
                              if (!specRefs.current[key])
                                specRefs.current[key] = [];
                              specRefs.current[key].push(el);
                            }}
                          >
                            <h6>{key}</h6>
                            <p>{String(value)}</p>
                          </div>
                        ))}
                      </SpecList>
                    ) : (
                      <EmptySpec>현재 준비중 입니다.</EmptySpec>
                    )}
                  </SpecCard>
                );
              })}
            </SpecWrap>
          </ScrollWrap>
        )}
      </SpecSection>
    </Container>
  );
}

/*  스타일 */
const Container = styled.div`
  width: 95%;
  max-width: 1380px;
  margin: auto;
`;

const Title = styled.h2`
  padding: 80px 0 24px;
  font-size: 32px;
  line-height: 40px;
  text-align: left;

  @media (max-width: 700px) {
    font-size: 24px;
  }
`;

const Grid = styled.div`
  display: flex;
  justify-content: start;
  gap: 20px;
`;

const Card = styled.div`
  width: 33.33%;
  min-width: 140px;
  flex: 1;
  text-align: center;
  border-radius: 10px;
  padding: 24px;
  border: 1px solid #ddd;

  @media (max-width: 700px) {
    padding: 16px 10px;
    img {
      width: 80%;
      height: auto;
      object-fit: contain;
    }
  }
`;

const Name = styled.div`
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: 20px;
  line-height: 1.5;
  font-weight: bold;

  @media (max-width: 700px) {
    font-size: 16px;
  }
`;

const Code = styled.div`
  font-size: 14px;
  line-height: 1.2;
  color: #666;
  margin-top: 5px;

  @media (max-width: 700px) {
    font-size: 12px;
  }
`;

const Price = styled.div`
  color: #000;
  font-size: 20px;

  @media (max-width: 700px) {
    font-size: 16px;
  }
`;

const BenefitPrice = styled.div`
  font-size: 16px;
  color: #e60023;
  font-weight: 400;
  margin-top: 5px;

  @media (max-width: 700px) {
    font-size: 12px;
  }
`;

const PriceWrap = styled.div`
  padding: 16px 0;
  border-radius: 10px;
  background: #f7f7f7;
  margin-top: 16px;
`;

const SpecWrap = styled.div`
  display: flex;
  justify-content: start;
  gap: 20px;
`;

const SpecSection = styled.section`
  margin-top: 60px;
  padding: 20px;

  h3 {
    text-align: left;
    font-weight: 700;
    font-size: 28px;
    border-bottom: 2px solid #000;
    padding-bottom: 20px;

    @media (max-width: 700px) {
      font-size: 24px;
    }
  }
`;

const SpecCard = styled.div`
  width: 33.33%;
  min-width: 140px;
  flex: 1;
`;

const SpecList = styled.div`
  > div {
    text-align: center;
    padding: 24px 40px;
    border-bottom: 1px solid #ccc;

    @media (max-width: 700px) {
      padding: 16px 10px;
    }
  }

  h6 {
    font-size: 14px;
    line-height: 1.4;
    color: #666;

    @media (max-width: 700px) {
      font-size: 12px;
    }
  }

  p {
    width: 100%;
    font-weight: 700;
    font-size: 18px;
    line-height: 1.4;
    color: #000;
    word-break: break-word;
    overflow: hidden;

    @media (max-width: 700px) {
      font-size: 14px;
    }
  }
`;

const ScrollWrap = styled.div`
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
`;

const EmptySpec = styled.div`
  text-align: center;
  color: #888;
  font-size: 15px;
  padding: 40px 0;
  font-weight: 400;
`;
