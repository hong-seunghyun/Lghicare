import React from "react";
import styled from "styled-components";
import Image from "next/image";
interface CompareModalProps {
  products: {
    thumbnailUrl?: string;
    ["상품명"]: string;
    ["모델코드"]: string;
  }[];
  isOpen: boolean;
  onToggle: () => void;
  onReset: () => void;
  onComplete: () => void;
  onRemove: (code: string) => void;
}

const CompareModal: React.FC<CompareModalProps> = ({
  products,
  isOpen,
  onToggle,
  onReset,
  onComplete,
  onRemove,
}) => {
  return (
    <ModalWrap $open={isOpen}>
      <Header>
        <Title>카테고리별 제품 비교하기 {products.length}/3</Title>
        <FlexWrap>
          <ResetButton onClick={onReset}>초기화</ResetButton>
          <span>
            <CompleteButton disabled={products.length < 2} onClick={onComplete}>
              결과보기
            </CompleteButton>

            <ArrowButton onClick={onToggle}>
              {isOpen ? (
                <Image
                  src="/images/ico_select.png"
                  alt=""
                  width={22}
                  height={13}
                />
              ) : (
                <Image
                  style={{ transform: "rotate(180deg)" }}
                  src="/images/ico_select.png"
                  alt=""
                  width={22}
                  height={13}
                />
              )}
            </ArrowButton>
          </span>
        </FlexWrap>
      </Header>

      {isOpen && (
        <ScrollBox>
          <Content>
            {products.map((p) => (
              <Item key={p["모델코드"]}>
                <Image
                  width={120}
                  height={120}
                  src={p.thumbnailUrl || "/images/placeholder.png"}
                  alt="thumb"
                />
                <div className="info">
                  <div className="name">{p["상품명"]}</div>
                  <div className="code">{p["모델코드"]}</div>
                </div>

                {/*  개별 삭제 버튼 */}
                <RemoveButton
                  onClick={() => onRemove(p["모델코드"])}
                  aria-label="제품 제거"
                >
                  ×
                </RemoveButton>
              </Item>
            ))}

            {/* 남은 슬롯 */}
            {Array.from({ length: 3 - products.length }).map((_, i) => (
              <EmptySlot key={i}>제품을 선택해 주세요.</EmptySlot>
            ))}
          </Content>
        </ScrollBox>
      )}
    </ModalWrap>
  );
};

export default CompareModal;

/*  스타일 (기존 구조 100% 유지 + 삭제 버튼 추가) */
const ModalWrap = styled.div<{ $open: boolean }>`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1px solid #ddd;
  transition: transform 0.3s ease;
  transform: ${({ $open }) => ($open ? "translateY(0)" : "translateY(30%)")};
  z-index: 2000;
  padding: 0 30px 42px;
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.14);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 16px;

  max-width: 1180px;
  margin: auto;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 20px;
  }

  @media (max-width: 499px) {
    padding: 20px 0px;
  }
`;

const FlexWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;

  @media (max-width: 768px) {
    justify-content: space-between;
    width: 100%;
  }
`;

const ArrowButton = styled.button`
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
`;

const Title = styled.h3`
  font-size: 20px;
  margin: 0;
  font-weight: bold;

  @media (max-width: 499px) {
    font-size: 16px;
  }
`;

const ResetButton = styled.button`
  border: none;
  background: transparent;
  color: #222;
  font-size: 16px;
  cursor: pointer;
  margin-right: 20px;
`;

const ScrollBox = styled.div`
  width: 100%;
  overflow-y: hidden;
  overflow-x: auto;
`;

const Content = styled.div`
  display: flex;
  height: 180px;
  gap: 24px;

  max-width: 1180px;
  margin: auto;
`;

const Item = styled.div`
  width: 33.33%;
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid #ddd;
  padding: 0 20px;
  border-radius: 16px;
  gap: 20px;
  min-width: 310px;

  & > img {
    width: 120px;
    height: 120px;
    object-fit: cover;
  }

  .info {
    text-align: left;
    .name {
      font-size: 18px;
      font-weight: 600;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      white-space: normal;
      text-overflow: ellipsis;
      -webkit-box-orient: vertical;
      word-wrap: break-word;
      overflow: hidden;
    }
    .code {
      font-size: 12px;
      color: #777;
      margin-top: 5px;
    }
  }
`;

const RemoveButton = styled.button`
  position: absolute;
  top: 10px;
  right: 10px;
  border: none;
  color: #666;
  font-size: 18px;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  line-height: 16px;
  text-align: center;
  cursor: pointer;
  transition: background 0.2s;
`;

const EmptySlot = styled.div`
  width: 33.33%;
  height: 100%;
  background: #f9f9f9;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #aaa;
  font-size: 14px;
  min-width: 310px;
`;

const CompleteButton = styled.button`
  background: ${({ disabled }) => (disabled ? "#ccc" : "#000")};
  color: #fff;
  border: none;
  padding: 12px 60px;
  border-radius: 99px;
  font-size: 14px;
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  transition: background 0.2s;
  margin-right: 20px;

  @media (max-width: 499px) {
    padding: 12px 40px;
  }
`;
