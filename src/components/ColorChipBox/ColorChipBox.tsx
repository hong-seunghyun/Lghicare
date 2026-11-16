import type { MouseEventHandler } from "react";
import styled from "styled-components";
import { getProductColorChipBackground } from "@/constants/colorMap";

type Props = {
  colorName: string;
  modelCode?: string;
  selected: boolean;
  compact?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
};

export default function ColorChipBox({
  colorName, modelCode, selected, compact = false, onClick,
}: Props) {
  return (
    <ColorButton
      type="button"
      $selected={selected}
      $compact={compact}
      aria-label={colorName}
      aria-pressed={selected}
      title={modelCode ? `${colorName} · ${modelCode}` : colorName}
      data-colorname={colorName}
      onClick={onClick}
    >
      <Swatch aria-hidden="true" style={{ background: getProductColorChipBackground(colorName) }} />
      <ColorName $compact={compact}>{colorName}</ColorName>
      {selected && (
        <Check $compact={compact} aria-hidden="true" viewBox="0 0 16 16" fill="none">
          <path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </Check>
      )}
    </ColorButton>
  );
}

const ColorButton = styled.button<{ $selected: boolean; $compact: boolean }>`
  appearance: none;
  position: relative;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: ${({ $compact }) => $compact ? "center" : "flex-start"};
  gap: 8px;
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100%;
  width: ${({ $compact }) => $compact ? "36px" : "auto"};
  min-height: ${({ $compact }) => $compact ? "36px" : "44px"};
  padding: ${({ $compact }) => $compact ? "5px" : "8px 12px"};
  border: 1px solid ${({ $selected }) => $selected ? "#111" : "#D8DCE1"};
  border-radius: ${({ $compact }) => $compact ? "50%" : "10px"};
  background: ${({ $selected, $compact }) => $selected && !$compact ? "#F6F6F6" : "#FFF"};
  color: #222;
  font: inherit;
  cursor: pointer;
  box-shadow: ${({ $selected }) => $selected ? "0 0 0 1px #111" : "none"};

  &:hover { border-color: #555; }
  &:focus-visible { outline: 2px solid #111; outline-offset: 3px; }
`;

const Swatch = styled.span`
  display: block;
  box-sizing: border-box;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.16);
`;

const ColorName = styled.span<{ $compact: boolean }>`
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  overflow-wrap: anywhere;
  text-align: left;
  ${({ $compact }) => $compact && `
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  `}
`;

const Check = styled.svg<{ $compact: boolean }>`
  box-sizing: border-box;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  ${({ $compact }) => $compact && `
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    padding: 1px;
    background: #111;
    color: #FFF;
  `}
`;

export const SelectedColorName = styled.p`
  min-height: 18px;
  margin: 6px 0 0;
  color: #555;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  overflow-wrap: anywhere;
`;
