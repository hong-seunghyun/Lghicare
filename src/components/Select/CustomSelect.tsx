import Image from "next/image";
import React, { useState, useRef, useEffect } from "react";
import styled from "styled-components";

interface Option {
  label: string; // 옵션명
  value: string; // 실제 값
}

interface Props {
  label: string; // 왼쪽에 표시되는 라벨명
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}

export default function CustomSelect({
  label,
  options,
  value,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleClickOutside = (e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = options.find((opt) => opt.value === value);

  return (
    <Wrapper ref={ref}>
      <Header onClick={() => setOpen((p) => !p)}>
        <Label>{label}</Label>
        <div style={{ display: "flex", alignItems: "center" }}>
          <SelectedValue>{selected ? selected.label : "선택"}</SelectedValue>
          <Arrow open={open}>
            <Image
              src="/images/down_arrow.svg"
              width={16}
              height={16}
              alt="arrow"
            />
          </Arrow>
        </div>
      </Header>

      {open && (
        <Dropdown>
          {options.map((opt) => (
            <OptionItem
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </OptionItem>
          ))}
        </Dropdown>
      )}
    </Wrapper>
  );
}

// ✅ styled-components
const Wrapper = styled.div`
  position: relative;
  width: 100%;
  font-size: 14px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid #8f8f8f;
  border-radius: 8px;
  padding: 11px 15px;
  background: #fff;
  cursor: pointer;
`;

const Label = styled.span`
  font-weight: 600;
  color: #222;
`;

const SelectedValue = styled.span`
  color: #555;
  font-weight: 500;
`;

const Arrow = styled.span<{ open: boolean }>`
  transform: rotate(${({ open }) => (open ? "180deg" : "0deg")});
  transition: transform 0.2s ease;
  margin-left: 14px;
  display: flex;
  align-items: center;
`;

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #8f8f8f;
  border-radius: 8px;
  max-height: 180px;
  overflow-y: auto;
  z-index: 10;
`;

const OptionItem = styled.div`
  padding: 10px 14px;
  cursor: pointer;
  color: #444;
  transition: background 0.15s;
  text-align: right;
  padding-right: 45px;

  &:hover {
    background: #f6f6f6;
  }
`;
