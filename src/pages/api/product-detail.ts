// pages/api/product-detail.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { google } from "googleapis";

//  글로벌 캐시 선언
if (!globalThis.__detailCache) {
  globalThis.__detailCache = {
    rootFolderId: null,
    middleFolders: {},
  };
}

const detailCache = globalThis.__detailCache;


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { middle, id } = req.query;

    if (!middle || !id || typeof middle !== "string" || typeof id !== "string") {
      return res.status(400).json({ error: "middle and id required" });
    }

    //  구글 인증
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    const drive = google.drive({ version: "v3", auth });

    //  1. 루트 폴더 캐싱
    let rootFolderId = detailCache.rootFolderId;
    if (!rootFolderId) {
      const rootRes = await drive.files.list({
        q: `name = '상세페이지' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id,name)",
        pageSize: 1,
      });
      rootFolderId = rootRes.data.files?.[0]?.id || null;
      if (!rootFolderId) {
        const fallbackHtml = `
          <div style="padding:2rem; text-align:center; font-size:1.1rem; color:#666;">
            상세페이지를 준비중 입니다.
          </div>
        `;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=600"); // 10분 캐시
        return res.status(200).send(fallbackHtml);
      }
      detailCache.rootFolderId = rootFolderId;
    }

    //  2. 중분류 폴더 캐싱
    let middleFolderId = detailCache.middleFolders[middle];
    if (!middleFolderId) {
        const middleRes = await drive.files.list({
          q: `'${rootFolderId}' in parents and name = '${middle}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: "files(id,name)",
          pageSize: 1,
        });

        const foundId = middleRes.data.files?.[0]?.id;
       if (!foundId) {
          const fallbackHtml = `
            <div style="padding:2rem; text-align:center; font-size:1.1rem; color:#666;">
              상세페이지를 준비중 입니다.
            </div>
          `;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "public, max-age=600"); // 10분 캐시
          return res.status(200).send(fallbackHtml);
        }


        middleFolderId = foundId;
        detailCache.middleFolders[middle] = middleFolderId; //  null 들어갈 일 없음
      }


    //  3. 모델 상세 HTML 파일 찾기
    const fileRes = await drive.files.list({
      q: `'${middleFolderId}' in parents and name = '${id}_detail.html' and trashed = false`,
      fields: "files(id,name,mimeType)",
      pageSize: 1,
    });
    const file = fileRes.data.files?.[0];
    if (!file?.id) {
      const fallbackHtml = `
        <div style="padding:2rem; text-align:center; font-size:1.1rem; color:#666;">
          상세페이지를 준비중 입니다.
        </div>
      `;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=600"); // 10분 캐시
      return res.status(200).send(fallbackHtml);
    }

    //  4. 파일 내용을 Buffer로 읽기
    const fileBufferRes = await drive.files.get(
      { fileId: file.id, alt: "media" },
      { responseType: "arraybuffer" }
    );

    let html = Buffer.from(fileBufferRes.data as ArrayBuffer).toString("utf-8");

    //  5. 자동 높이 조정 스크립트 삽입
    html += `
    <style>
  html, body {
    margin: 0;
    padding: 0;
    width: 100% !important;
    box-sizing: border-box;
  }
  img, video, iframe, table {
    max-width: 100% !important;
    height: auto !important;
  }
  div, section, article {
    max-width: 100% !important;
  }
</style>

<script>
function sendHeight() {
  const body = document.body;
  const html = document.documentElement;

  const height = Math.max(
    body.scrollHeight,
    body.offsetHeight,
    html.clientHeight,
    html.scrollHeight,
    html.offsetHeight
  );

  window.parent.postMessage(
    { type: "iframeHeight", height },
    "*"
  );
}

// 초기 로드 + 약간의 텀 두고 재실행
window.addEventListener("load", () => {
  sendHeight();
  setTimeout(sendHeight, 300);
  setTimeout(sendHeight, 1000);
});

// 리사이즈 시
window.addEventListener("resize", sendHeight);

// DOM 변화 감지 (새 요소가 들어올 때마다)
new MutationObserver(() => sendHeight())
  .observe(document.body, { childList: true, subtree: true });

// 이미지 로드 후
document.querySelectorAll("img").forEach(img => {
  img.addEventListener("load", sendHeight);
});
</script>

    `;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600" // 5분 캐시 + 10분 SWR
    );
    res.send(html);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("❌ product-detail API 오류:", error.message || error);
    return res.status(500).json({ error: "서버 오류", detail: error.message });
  }
}
