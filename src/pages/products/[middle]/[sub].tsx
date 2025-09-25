import Link from "next/link";
import { useRouter } from "next/router";
import styled from "styled-components";
import { useEffect, useState } from "react";

type Product = { [key: string]: string };

export default function Products() {
  const router = useRouter();
  const { middle, sub } = router.query;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!middle) return; // middle이 없으면 아직 준비 전

    const fetchProducts = async () => {
      setLoading(true);
      const query = sub
        ? `/api/products?middle=${middle}&sub=${sub}`
        : `/api/products?middle=${middle}`;
      const res = await fetch(query);
      const data = await res.json();
      setProducts(data.options || []);
      setLoading(false);
    };

    fetchProducts();
  }, [middle, sub]);

  if (loading) return <div>불러오는 중...</div>;

  // 동일모델 기준으로 그룹핑
  const grouped = products.reduce((acc: Record<string, Product[]>, cur) => {
    const key = cur["동일 모델 기준"]?.trim();
    if (!key) {
      acc[cur["모델코드"]] = [cur];
    } else {
      if (!acc[key]) acc[key] = [];
      acc[key].push(cur);
    }
    return acc;
  }, {});

  const groups = Object.values(grouped);

  return (
    <Container>
      <Title>
        {middle} {sub ? `> ${sub}` : ""} 리스트
      </Title>
      <Grid>
        {groups.map((group, i) => {
          const representative = group[0];
          const allModels = Array.from(
            new Set(group.map((p) => p["모델코드"]))
          );

          const minPrice = Math.min(
            ...group.map((p) => {
              const rawPrice = p["할인후금액"] || p["정상가"] || "0";
              return parseInt(rawPrice.replace(/[^0-9]/g, ""), 10);
            })
          );
          const bestPrice = Math.max(minPrice - 13000, 0);

          return (
            <Card key={i}>
              <Link
                href={`/products/${middle}${sub ? `/${sub}` : ""}/${
                  representative["동일 모델 기준"] || representative["모델코드"]
                }`}
              >
                <ProductName>{representative["상품명"]}</ProductName>
                <Models>모델: {allModels.join(", ")}</Models>
                <Price>
                  이용요금: {minPrice.toLocaleString()}원 <br />
                  <span style={{ color: "#e60023", fontWeight: "bold" }}>
                    최대혜택가: {bestPrice.toLocaleString()}원
                  </span>
                </Price>
              </Link>
            </Card>
          );
        })}
      </Grid>
    </Container>
  );
}

// styled-components 그대로 유지
const Container = styled.div`
  padding: 2rem;
`;
const Title = styled.h1`
  font-size: 1.8rem;
  text-align: center;
  margin-bottom: 2rem;
`;
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.5rem;
`;
const Card = styled.div`
  border: 1px solid #eaeaea;
  border-radius: 10px;
  padding: 1rem;
  background: #fff;
  cursor: pointer;
`;
const ProductName = styled.div`
  font-weight: 600;
  margin-bottom: 0.5rem;
`;
const Models = styled.div`
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 0.8rem;
`;
const Price = styled.div`
  font-size: 1rem;
  font-weight: bold;
  color: #e60023;
`;
