// pages/api/og-image.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: {
    responseLimit: false, // 큰 이미지도 대응
  },
};

const normalizeToAbsolute = (url: string) => {
  // 혹시 // 로 시작하는 경우 보정
  if (url.startsWith("//")) return `https:${url}`;
  return url;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const raw = (req.query.src as string) || "";
    if (!raw) {
      return res.status(400).send("missing src");
    }

    const target = normalizeToAbsolute(decodeURIComponent(raw));

    // 카카오/메신저 크롤러는 UA가 다양해서, 그냥 강하게 이미지로 스트리밍해주는게 안정적
    const fetchRes = await fetch(target, {
      redirect: "follow",
      headers: {
        // 일부 CDN/드라이브가 UA에 민감한 경우가 있어 지정
        "User-Agent":
          req.headers["user-agent"] ||
          "Mozilla/5.0 (compatible; KakaoBot/1.0; +https://developers.kakao.com/)",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    if (!fetchRes.ok) {
      return res.status(404).send("image fetch failed");
    }

    const contentType = fetchRes.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await fetchRes.arrayBuffer());

    // 캐싱(서버/엣지/브라우저)로 공유 미리보기 속도도 개선
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800");

    return res.status(200).send(buffer);
  } catch (e) {
    console.error("og-image proxy error:", e);
    return res.status(500).send("server error");
  }
}
