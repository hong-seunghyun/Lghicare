// pages/api/image-proxy.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { google } from "googleapis";
import type { drive_v3 } from "googleapis";

// ✅ 글로벌 드라이브 클라이언트 캐싱
if (!globalThis.__driveClient) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  globalThis.__driveClient = google.drive({ version: "v3", auth });
}

const drive = globalThis.__driveClient as drive_v3.Drive;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { fileId } = req.query;
    if (!fileId || typeof fileId !== "string") {
      return res.status(400).json({ error: "fileId required" });
    }

    // ✅ 이미지 스트리밍 (한 번의 호출로 충분)
    const fileRes = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    // ✅ Content-Type 안전 설정
    const headerContentType = fileRes.headers["content-type"] as string | undefined;
    const lowerId = fileId.toLowerCase();
    const mimeType =
      headerContentType ||
      (lowerId.endsWith(".avif")
        ? "image/avif"
        : lowerId.endsWith(".png")
        ? "image/png"
        : lowerId.endsWith(".jpg") || lowerId.endsWith(".jpeg")
        ? "image/jpeg"
        : "image/jpeg");

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // ✅ Drive 응답 헤더 기반 캐시 힌트 전달 (가능하면)
    const etag = (fileRes.headers["etag"] || fileRes.headers.etag) as string | undefined;
    const lastModified = fileRes.headers["last-modified"] as string | undefined;

    if (etag) {
      res.setHeader("ETag", etag);
    }
    if (lastModified) {
      res.setHeader("Last-Modified", lastModified);
    }

    // ✅ 브라우저/중간 프록시 캐시 (1일 + 7일 SWR)
    res.setHeader(
      "Cache-Control",
      "public, max-age=86400, stale-while-revalidate=604800"
    );

    fileRes.data
      .on("error", (err: Error) => {
        console.error("❌ Drive stream error:", err);
        if (!res.headersSent) {
          res.status(500).end("File download error");
        }
      })
      .pipe(res);
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("❌ image-proxy API error:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Server error", detail: err.message });
      }
    } else {
      console.error("❌ image-proxy API unknown error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Unknown server error" });
      }
    }
  }
}
