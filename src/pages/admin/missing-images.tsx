import React, { useState, useEffect, useRef } from "react";

interface MissingItem {
  모델코드: string;
  상품명: string;
  중분류: string;
  소분류: string;
  썸네일: string;
  상세페이지: string;
}

const MIDDLES = [
  "정수기",
  "TV",
  "의류건조기",
  "세탁기",
  "신발관리기",
  "냉장고",
  "김치냉장고",
  "식기세척기",
  "전기레인지",
  "광파오븐",
  "워시타워",
  "의류관리기",
  "청소기",
  "가습기",
  "워시콤보",
  "에어컨",
  "제습기",
  "공기청정기",
  "안마의자",
  "마이컵",
];

export default function MissingImagesPage() {
  const [selectedMiddle, setSelectedMiddle] = useState(MIDDLES[0]);
  const [items, setItems] = useState<MissingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0); // ✅ 렌더 간에도 유지됨

  const fetchData = async (middle: string) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setItems([]); // ✅ 이전 데이터 즉시 제거 → 로딩 중엔 깔끔하게 비워짐

    if (requestId !== requestIdRef.current) return;
    try {
      const res = await fetch(
        `/api/missing-images?middle=${encodeURIComponent(middle)}`
      );
      if (!res.ok) throw new Error(`API 요청 실패 (${res.status})`);
      const data = await res.json();

      // ✅ 최신 요청만 반영
      if (requestId !== requestIdRef.current) return;

      setItems(data.items || []);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error(err);
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedMiddle);
  }, [selectedMiddle]);

  return (
    <div style={{ padding: "40px", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>
        📦 이미지 누락 제품 확인
      </h1>

      <div
        style={{
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <label style={{ fontWeight: 600 }}>중분류 선택:</label>
        <select
          value={selectedMiddle}
          onChange={(e) => setSelectedMiddle(e.target.value)}
          style={{
            padding: "6px 10px",
            fontSize: 14,
            borderRadius: 6,
            border: "1px solid #ddd",
          }}
        >
          {MIDDLES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div style={{ position: "relative", minHeight: 200 }}>
        {/* ✅ 로딩 중 오버레이 */}
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(255,255,255,0.85)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 10,
              transition: "opacity 0.2s ease-in-out",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                border: "4px solid #ddd",
                borderTop: "4px solid #333",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <p style={{ marginTop: 12, fontSize: 14, color: "#555" }}>
              불러오는 중...
            </p>
          </div>
        )}

        {/* ✅ 에러 / 결과 렌더링 */}
        {!loading && error ? (
          <p style={{ color: "red" }}>{error}</p>
        ) : !loading && items.length === 0 ? (
          <p>누락된 제품이 없습니다 ✅</p>
        ) : (
          !loading && (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr style={{ background: "#f7f7f7", textAlign: "left" }}>
                    <th style={thStyle}>모델코드</th>
                    <th style={thStyle}>상품명</th>
                    <th style={thStyle}>소분류</th>
                    <th style={thStyle}>썸네일 여부</th>
                    <th style={thStyle}>상세페이지</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={tdStyle}>{p.모델코드}</td>
                      <td style={tdStyle}>{p.상품명}</td>
                      <td style={tdStyle}>{p.소분류}</td>
                      <td style={tdStyle}>{p.썸네일}</td>
                      <td style={tdStyle}>{p.상세페이지}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 8px",
  fontWeight: 600,
  borderBottom: "2px solid #ddd",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 8px",
  verticalAlign: "top",
};
