// functions/src/index.ts
import * as functions from "firebase-functions/v1";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, conf: { distDir: ".next" } });
const handle = app.getRequestHandler();

const prepared = app.prepare();

export const nextServer = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    await prepared;
    return handle(req, res);
  });
