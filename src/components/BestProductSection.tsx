"use client";

import useSWR from "swr";
import Image from "next/image";
import Link from "next/link";
import styled from "styled-components";

// ✅ API 응답 타입 정의
interface HotProduct {
  modelCode: string;
  productName: string;
  price: string | number;
  thumbnailUrl: string;
}

interface Category {
  sheetName: string;
  products: HotProduct[];
}

// ✅ SWR fetcher
const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ✅ 컴포넌트
export default function BestProductSection() {
  // ✅ useSWR에 제네릭으로 타입 지정
  const { data, error } = useSWR<Category[]>("/api/hot-products", fetcher);

  if (error) return <div>불러오기 실패</div>;
  if (!data) return <div>로딩 중...</div>;

  console.log(data);
  return (
    <Section>
      <Title>카테고리별 인기상품</Title>

      {data.map((cat) => (
        <CategoryBlock key={cat.sheetName}>
          <CatTitle>{cat.sheetName}</CatTitle>
          <List>
            {cat.products.map((p) => (
              <Card key={p.modelCode}>
                <Link href={`/products/${p.modelCode}`}>
                  <Thumb>
                    <Image
                      src={p.thumbnailUrl}
                      alt={p.productName}
                      fill
                      style={{ objectFit: "cover" }}
                    />
                  </Thumb>
                  <Name>{p.productName}</Name>
                  <Price>{Number(p.price).toLocaleString("ko-KR")}원</Price>
                </Link>
              </Card>
            ))}
          </List>
        </CategoryBlock>
      ))}
    </Section>
  );
}

// ✅ styled-components
const Section = styled.section`
  margin-top: 80px;
`;

const Title = styled.h2`
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 32px;
`;

const CategoryBlock = styled.div`
  margin-bottom: 48px;
`;

const CatTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
`;

const List = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
`;

const Card = styled.div`
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  transition: transform 0.2s ease;
  &:hover {
    transform: translateY(-4px);
  }
`;

const Thumb = styled.div`
  position: relative;
  width: 100%;
  height: 180px;
`;

const Name = styled.p`
  font-size: 14px;
  margin: 12px;
  font-weight: 500;
  line-height: 1.4;
`;

const Price = styled.p`
  font-size: 15px;
  font-weight: 600;
  color: #111;
  margin: 0 12px 16px;
`;
