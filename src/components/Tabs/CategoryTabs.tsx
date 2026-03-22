import Image from "next/image";
import React, { useRef, useState, useEffect } from "react";
import styled from "styled-components";

interface Props {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
}

export default function CategoryTabs({
  categories,
  selected,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const updateArrows = () => {
    const el = containerRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 0);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };

  useEffect(() => {
    updateArrows();
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows);
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, []);

  const scrollByAmount = (amount: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <Wrapper>
      {showLeft && (
        <ArrowButton onClick={() => scrollByAmount(-200)} left>
          <Image
            style={{ rotate: "180deg" }}
            src="/images/left_arrow.svg"
            alt=""
            width={32}
            height={32}
          />
        </ArrowButton>
      )}
      <Container ref={containerRef}>
        {categories.map((c) => (
          <Tab key={c} active={c === selected} onClick={() => onSelect(c)}>
            {c}
          </Tab>
        ))}
      </Container>

      {showRight && (
        <ArrowButton onClick={() => scrollByAmount(200)} right>
          <Image src="/images/left_arrow.svg" alt="" width={32} height={32} />
        </ArrowButton>
      )}
    </Wrapper>
  );
}

//
//  styled-components
//
const Wrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  overflow: hidden;
  margin-bottom: 16px;
`;

const TabsWrap = styled.div``;

const Container = styled.div`
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
  ms-overflow-style: none;
  border-bottom: 1px solid #ddd;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Tab = styled.div<{ active: boolean }>`
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
  font-size: 16px;
  padding: 16px 12px;
  color: ${({ active }) => (active ? "#000" : "#767676")};
  font-weight: 700;
  position: relative;

  &::before {
    content: "";
    position: absolute;
    bottom: 0px;
    left: 0;
    width: 100%;
    height: 2px;
    background-color: ${({ active }) => (active ? "#000" : "transparent")};
    transition: background-color 0.25s ease;
  }

  &:hover {
    color: #000;
  }
`;

const ArrowButton = styled.button<{ left?: boolean; right?: boolean }>`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #ddd;
  box-shadow: rgba(0, 0, 0, 0.14) 2px 4px 16px 0px;
  cursor: pointer;
  z-index: 10;
  margin: 0 10px;

  ${({ left }) => left && `left: 0;`}
  ${({ right }) => right && `right: 0;`}
`;
