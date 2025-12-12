import * as functions from "firebase-functions";
import next from "next";
import { Request, Response } from "express";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, conf: { distDir: ".next" } });
const handle = app.getRequestHandler();

// ✅ 앱 준비는 한번만 실행
let isPrepared = false;

const prepareApp = async () => {
  if (!isPrepared) {
    await app.prepare();
    isPrepared = true;
  }
};

export const nextApp = functions.https.onRequest(
  async (req: Request, res: Response) => {
    await prepareApp(); // 요청 전에 준비
    return handle(req, res);
  }
);
