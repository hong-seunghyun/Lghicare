import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import styled from "styled-components";

type Product = { [key: string]: string };

export default function ProductDetail() {
  const router = useRouter();
  const { slug } = router.query;

  const slugArr = Array.isArray(slug) ? slug : [];
  const id = slugArr[slugArr.length - 1]; // 항상 마지막이 id
  const middle = slugArr.length >= 2 ? slugArr[0] : undefined;
  const sub = slugArr.length >= 3 ? slugArr[1] : undefined;

  const [options, setOptions] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [contract, setContract] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [serviceCycle, setServiceCycle] = useState("");
  const [promoType, setPromoType] = useState("");
  const [promoName, setPromoName] = useState("");

  const [prepay, setPrepay] = useState("");
  const [prepayAmount, setPrepayAmount] = useState("");

  // 🔹 데이터 불러오기
  useEffect(() => {
    if (!router.isReady || !id) return;

    const fetchDetail = async () => {
      try {
        setLoading(true);
        const url = `/api/products?id=${id}${
          middle ? `&middle=${middle}` : ""
        }${sub ? `&sub=${sub}` : ""}`;

        const res = await fetch(url);
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
  }, [router.isReady, id, middle, sub]);

  if (loading) return <div>불러오는 중...</div>;
  if (!options.length) return <div>상품을 찾을 수 없습니다.</div>;

  // 🔹 포맷 변환
  const formatContract = (value: string) => {
    if (!value) return value;
    const months = parseInt(value.replace(/[^0-9]/g, ""), 10);
    if (isNaN(months)) return value;
    if (months % 12 === 0) return `${months / 12}년`;
    return `${months}개월`;
  };

  const current =
    contract && serviceType && serviceCycle && promoType
      ? options.find((o) => {
          const baseMatch =
            o["계약기간"] === contract &&
            o["서비스유형"] === serviceType &&
            o["서비스주기/월"] === serviceCycle &&
            (o["프로모션유형"]?.trim() || "") === promoType;
          if (!baseMatch) return false;
          if (!promoName) {
            return !o["프로모션명"] || o["프로모션명"].trim().length === 0;
          }
          return o["프로모션명"] === promoName;
        })
      : undefined;

  const isPrepay = current?.["선입금여부"] === "Y";
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

      {/* 계약기간 */}
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
              {formatContract(v)}
            </OptionButton>
          ))}
        </ButtonGroup>
      </Section>

      {/* 서비스유형 */}
      <Section>
        <Label>서비스유형</Label>
        <ButtonGroup>
          {Array.from(new Set(options.map((o) => o["서비스유형"]))).map((v) => (
            <OptionButton
              key={v}
              selected={serviceType === v}
              onClick={() => {
                if (!contract) return;
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

      {/* 프로모션 */}
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

      {/* 프로모션명 */}
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

      {isPrepay && (
        <Section>
          <Label>선입금</Label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Select value={prepay} onChange={(e) => setPrepay(e.target.value)}>
              <option value="">선택</option>
              <option value="Y">예</option>
              <option value="N">아니오</option>
            </Select>
            {prepay === "Y" && (
              <input
                type="number"
                value={prepayAmount}
                onChange={(e) => setPrepayAmount(e.target.value)}
                placeholder="선입금 금액 입력"
                style={{
                  padding: "0.5rem",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                  width: "150px",
                }}
              />
            )}
          </div>
        </Section>
      )}

      {/* 가격 */}
      <Price>
        이용요금: {current ? `${usageFee.toLocaleString()}원` : "-"} <br />
        최대혜택가:{" "}
        <span style={{ color: "#e60023", fontWeight: "bold" }}>
          {current ? `${bestPrice.toLocaleString()}원` : "-"}
        </span>
      </Price>

      {/* ✅ 상세페이지 HTML embed */}
      <Section>
        <Label>상세페이지</Label>
        {id ? (
          <Iframe
            src={`/api/product-detail?middle=${middle}&id=${id}`}
            title={`${id} 상세페이지`}
          />
        ) : (
          <div>상세페이지를 불러올 수 없습니다.</div>
        )}
      </Section>
    </Container>
  );
}

// styled-components
const Container = styled.div`
  padding: 2rem;
  max-width: 600px;
  margin: auto;
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
`;
const Iframe = styled.iframe`
  width: 100%;
  border: none;
  margin-top: 1rem;
  min-height: 600px;
`;
