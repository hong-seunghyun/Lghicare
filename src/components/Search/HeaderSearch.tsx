// components/Search/HeaderSearch.tsx
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import styled from "styled-components";
import Link from "next/link";

export default function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // ✅ ESC로 닫기
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  // ✅ 모달 열릴 때 인풋 자동포커스
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  const handleSearch = () => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    router.push(`/search/?q=${encodeURIComponent(trimmed)}`);
    setOpen(false);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <>
      {/* 🔍 버튼 */}
      <Link href="/search">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          fill="none"
          viewBox="0 0 24 24"
          className="icon"
          role="img"
        >
          <path
            stroke="#000"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M11 19c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8 3.582 8 8 8z"
          ></path>
          <path
            stroke="#000"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M22 22l-5-5"
          ></path>
        </svg>
      </Link>

      {/* 모달 */}
      {open && (
        <Overlay>
          <Modal>
            <Header>
              <Title>SEARCH</Title>
              <CloseButton onClick={() => setOpen(false)}>×</CloseButton>
            </Header>

            <Fieldset>
              <legend>검색</legend>
              <InputWrap>
                <SearchInput
                  ref={inputRef}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="검색어를 입력하세요"
                />
                <SearchIconButton onClick={handleSearch}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    fill="none"
                    viewBox="0 0 24 24"
                    className="icon"
                    role="img"
                  >
                    <path
                      stroke="#000"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M11 19c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8 3.582 8 8 8z"
                    ></path>
                    <path
                      stroke="#000"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M22 22l-5-5"
                    ></path>
                  </svg>
                </SearchIconButton>
              </InputWrap>
            </Fieldset>
          </Modal>
        </Overlay>
      )}
    </>
  );
}

// ====== Styled ======
const SearchButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(255, 255, 255, 0.98);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 80px;
  animation: fadeIn 0.2s ease;
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const Modal = styled.div`
  width: 100%;
  max-width: 800px;
  padding: 0 20px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.div`
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.05em;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
`;

const Fieldset = styled.fieldset`
  margin-top: 40px;
  border: none;
`;

const InputWrap = styled.div`
  position: relative;
  width: 100%;
`;

const SearchInput = styled.input`
  width: 100%;
  border: none;
  border-bottom: 1px solid #000;
  font-size: 16px;
  padding: 10px 40px 10px 0;
  outline: none;
  background: transparent;

  &::placeholder {
    color: #999;
  }
`;

const SearchIconButton = styled.button`
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
`;
