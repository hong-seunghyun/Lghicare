export const BOARD_THUMBNAIL_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f2f4f8"/>
          <stop offset="100%" stop-color="#e3e8f0"/>
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#bg)"/>
      <rect x="26" y="26" width="268" height="148" fill="#ffffff" stroke="#d7dde6" stroke-width="2"/>
      <circle cx="110" cy="92" r="18" fill="#c8d2e1"/>
      <path d="M70 150 L140 100 L190 140 L230 120 L270 150" fill="none" stroke="#c8d2e1" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="160" y="115" font-size="14" text-anchor="middle" fill="#7a8699" font-family="Arial, sans-serif">No Image</text>
    </svg>`,
  );
