import { useState, useRef, useEffect } from "react";
import Image from "next/image";

type TipButtonProps = {
  title: string;
  children: React.ReactNode;
};

export default function TipButton({ title, children }: TipButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
        }}
      >
        {children}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: "0%",
            transform: "translateX(0%)",
            marginTop: "8px",
            padding: "20px 48px 20px 20px",
            background: "#fff",
            width: "280px",
            borderRadius: "16px",
            boxShadow:
              "0 0 1px 0 rgba(33,39,49,.08),0 12px 64px 0 rgba(33,39,49,.09)",
            fontSize: "13px",
            lineHeight: 1.4,
            zIndex: 1000,
            whiteSpace: "pre-wrap",
          }}
        >
          {title}
          <Image
            src={"/images/icon_tooltip_close.svg"}
            alt="close"
            width={16}
            height={16}
            onClick={() => setOpen(false)} // ✅ 닫기 이벤트 추가
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              cursor: "pointer",
            }}
          />
        </div>
      )}
    </div>
  );
}
