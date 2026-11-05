/** Original SVG artwork drawn for the renewal; no external image assets. */
export function BenefitArtwork({ type }: { type: "care" | "card" }) {
  return type === "care" ? (
    <svg viewBox="0 0 160 138" fill="none" aria-hidden="true">
      <circle cx="88" cy="70" r="58" fill="#DCEEE6" />
      <rect x="31" y="33" width="75" height="87" rx="13" fill="#A9D2BF" />
      <rect x="24" y="26" width="75" height="87" rx="13" fill="white" />
      <path
        d="M42 48h39M42 59h23"
        stroke="#B9CDC3"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="61" cy="84" r="17" fill="#E5F2EB" />
      <path
        d="m52 84 6 6 13-14"
        stroke="#2D7B5C"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m113 58 24 9v19c0 16-24 27-24 27s-24-11-24-27V67l24-9Z"
        fill="#37896B"
      />
      <path
        d="m101 85 8 8 17-18"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M117 23v12m-6-6h12M24 87v8m-4-4h8"
        stroke="#D3B65E"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 160 138" fill="none" aria-hidden="true">
      <circle cx="84" cy="70" r="58" fill="#ECE3F7" />
      <g transform="rotate(-12 76 58)">
        <rect x="18" y="25" width="104" height="68" rx="12" fill="#D1BCE6" />
        <rect x="26" y="18" width="104" height="68" rx="12" fill="#7A56A3" />
        <path d="M26 39h104" stroke="#AC8EC8" strokeWidth="12" />
        <rect x="40" y="57" width="18" height="13" rx="3" fill="#F2D58A" />
        <path
          d="M70 66h22"
          stroke="white"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <rect x="83" y="83" width="53" height="41" rx="5" fill="#F3C7D8" />
      <rect x="78" y="77" width="63" height="13" rx="4" fill="#EAA7BF" />
      <path d="M110 77v47" stroke="#A63C69" strokeWidth="7" />
      <path
        d="M109 77c-25 1-20-25-6-14l6 14Zm2 0c25 1 20-25 6-14l-6 14Z"
        stroke="#A63C69"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M140 40v12m-6-6h12M33 110v9m-4-4h8"
        stroke="#D3B65E"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
