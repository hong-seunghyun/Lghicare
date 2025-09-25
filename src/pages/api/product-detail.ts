import type { NextApiRequest, NextApiResponse } from "next";
import { google } from "googleapis";
import { folderMap } from "../../lib/folderMap";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { middle, id } = req.query;

    if (!middle || !id) {
      return res.status(400).json({ error: "middle and id required" });
    }

    const folderId = folderMap[middle as string];
    if (!folderId) {
      return res.status(404).json({ error: `폴더 ID 없음: ${middle}` });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    const drive = google.drive({ version: "v3", auth });

    // 📂 해당 중분류 폴더에서 모델명_detail.html 찾기
    const response = await drive.files.list({
      q: `'${folderId}' in parents and name = '${id}_detail.html'`,
      fields: "files(id, name)",
    });

    const file = response.data.files?.[0];
    if (!file || !file.id) {
      return res.status(404).json({ error: "상세페이지 없음" });
    }

    // 📌 HTML 스트림 전달
    const fileStream = await drive.files.get(
      { fileId: file.id, alt: "media" },
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    fileStream.data.pipe(res);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("❌ Google Drive API 오류:", error.message || error);
    return res.status(500).json({ error: "서버 오류", detail: error.message });
    }
}
