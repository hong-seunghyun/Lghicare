import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import styled from "styled-components";

type Product = { [key: string]: string };

export default function ProductDetail() {
  const router = useRouter();
  const { id } = router.query;

  const [options, setOptions] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [contract, setContract] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [serviceCycle, setServiceCycle] = useState("");
  const [promoType, setPromoType] = useState("");
  const [promoName, setPromoName] = useState("");

  useEffect(() => {
    if (!id) return; // id만 있으면 실행

    const fetchDetail = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/products?sheet=${encodeURIComponent("정수기")}&id=${id}`
        );
        if (!res.ok) throw new Error(`API 요청 실패: ${res.status}`);
        const data = await res.json();
        setOptions(data.options || []);
      } catch (err) {
        console.error("상품 불러오기 오류:", err);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [id]);

  if (loading) return <div>불러오는 중...</div>;

  if (!loading && options.length === 0)
    return <div>상품을 찾을 수 없습니다.</div>;

  const current =
    contract && serviceType && serviceCycle && promoType
      ? options.find((o) => {
          const baseMatch =
            o["계약기간"] === contract &&
            o["서비스유형"] === serviceType &&
            o["서비스주기/월"] === serviceCycle &&
            (o["프로모션유형"]?.trim() || "") === promoType;

          if (!baseMatch) return false;

          // 프로모션명 선택 안 함 → 프로모션명 비어있거나 없는 행
          if (!promoName) {
            return !o["프로모션명"] || o["프로모션명"].trim().length === 0;
          }

          // 프로모션명 선택 O → 정확히 일치
          return o["프로모션명"] === promoName;
        })
      : undefined;

  const usageFee = current
    ? parseInt(
        (current["할인후금액"] || current["정상가"] || "0").replace(
          /[^0-9]/g,
          ""
        ),
        10
      )
    : 0;

  const bestPrice = current ? Math.max(usageFee - 13000, 0) : 0;

  const allModels = Array.from(new Set(options.map((o) => o["모델코드"])));

  return (
    <Container>
      <Title>{options[0]["상품명"]}</Title>
      <Sub>모델군 기준: {id}</Sub>
      <Models>모델코드: {allModels.join(", ")}</Models>

      {/* 계약기간 (항상 선택 가능) */}
      <Section>
        <Label>계약기간</Label>
        <ButtonGroup>
          {Array.from(new Set(options.map((o) => o["계약기간"]))).map((v) => (
            <OptionButton
              key={v}
              selected={contract === v}
              onClick={() => {
                setContract(v);
                setServiceType("");
                setServiceCycle("");
                setPromoType("");
                setPromoName("");
              }}
            >
              {v}
            </OptionButton>
          ))}
        </ButtonGroup>
      </Section>

      {/* 서비스유형 (계약기간이 선택되지 않으면 disabled) */}
      <Section>
        <Label>서비스유형</Label>
        <ButtonGroup>
          {Array.from(new Set(options.map((o) => o["서비스유형"]))).map((v) => (
            <OptionButton
              key={v}
              selected={serviceType === v}
              onClick={() => {
                if (!contract) return; // 계약기간 안 선택했으면 무시
                setServiceType(v);
                setServiceCycle("");
                setPromoType("");
                setPromoName("");
              }}
              disabled={!contract}
            >
              {v}
            </OptionButton>
          ))}
        </ButtonGroup>
      </Section>

      {/* 서비스주기 */}
      <Section>
        <Label>서비스주기/월</Label>
        <ButtonGroup>
          {Array.from(new Set(options.map((o) => o["서비스주기/월"]))).map(
            (v) => (
              <OptionButton
                key={v}
                selected={serviceCycle === v}
                onClick={() => {
                  if (!serviceType) return;
                  setServiceCycle(v);
                  setPromoType("");
                  setPromoName("");
                }}
                disabled={!serviceType}
              >
                {v}
              </OptionButton>
            )
          )}
        </ButtonGroup>
      </Section>

      {/* 프로모션유형 */}
      <Section>
        <Label>프로모션유형</Label>
        <ButtonGroup>
          {Array.from(
            new Set(
              options
                .map((o) => o["프로모션유형"]?.trim())
                .filter((v) => v && v.length > 0)
            )
          ).map((v) => (
            <OptionButton
              key={v}
              selected={promoType === v}
              onClick={() => {
                if (!serviceCycle) return;
                setPromoType(v);
                setPromoName("");
              }}
              disabled={!serviceCycle}
            >
              {v}
            </OptionButton>
          ))}
        </ButtonGroup>
      </Section>
      {/* 프로모션명 (드롭박스 유지) */}
      <Section>
        <Label>프로모션명</Label>
        <Select
          value={promoName}
          onChange={(e) => setPromoName(e.target.value)}
          disabled={!promoType}
        >
          <option value="">선택 안 함</option>
          {Array.from(
            new Set(
              options
                .filter(
                  (o) =>
                    o["계약기간"] === contract &&
                    o["서비스유형"] === serviceType &&
                    o["서비스주기/월"] === serviceCycle &&
                    (o["프로모션유형"]?.trim() || "") === promoType
                )
                .map((o) => o["프로모션명"])
                .filter((v): v is string => !!v)
            )
          ).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
      </Section>

      <Price>
        이용요금: {current ? `${usageFee.toLocaleString()}원` : "-"} <br />
        최대혜택가:{" "}
        <span style={{ color: "#e60023", fontWeight: "bold" }}>
          {current ? `${bestPrice.toLocaleString()}원` : "-"}
        </span>
      </Price>
    </Container>
  );
}

// styled-components
const Container = styled.div`
  padding: 2rem;
`;
const Title = styled.h1`
  font-size: 1.6rem;
  margin-bottom: 0.5rem;
`;
const Sub = styled.p`
  font-size: 0.9rem;
  color: #777;
`;
const Models = styled.div`
  margin: 0.5rem 0;
  font-size: 0.9rem;
  color: #333;
`;
const Section = styled.div`
  margin-top: 1.5rem;
`;
const Label = styled.div`
  font-weight: bold;
  margin-bottom: 0.5rem;
`;
const Select = styled.select`
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid #ccc;
`;
const Price = styled.h2`
  margin-top: 2rem;
  color: #0070f3;
`;
const ButtonGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const OptionButton = styled.button<{ selected: boolean }>`
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: 1px solid ${({ selected }) => (selected ? "#0070f3" : "#ccc")};
  background: ${({ selected }) => (selected ? "#0070f3" : "#fff")};
  color: ${({ selected }) => (selected ? "#fff" : "#333")};
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};

  &:hover {
    border-color: ${({ disabled }) => (disabled ? "#ccc" : "#0070f3")};
  }
`;
