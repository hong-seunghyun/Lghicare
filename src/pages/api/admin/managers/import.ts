/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/api/admin/managers/import.ts
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import fs from "fs/promises";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";

const MANAGER_AUTH_EMAIL_SUFFIX = "@co.kr";
const MANAGER_AUTH_COMMON_PASSWORD = "q1w2e3r4@@!!@@";

type ImportResponse = {
  ok: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ImportResponse>,
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      error: "Method not allowed",
    });
  }

  try {
    const db = initFirebaseAdmin();
    const auth = getAuth();

    const defaultPassword =
      typeof req.body?.defaultPassword === "string" &&
      req.body.defaultPassword.trim()
        ? req.body.defaultPassword.trim()
        : "123456";

    const filePath = path.join(
      process.cwd(),
      "src",
      "data",
      "managerList.json",
    );
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    let rows: Record<string, unknown>[] = [];
    if (Array.isArray(data)) {
      rows = data;
    } else if (data?.sheets) {
      const sheetKey = Object.keys(data.sheets)[0];
      rows = sheetKey ? data.sheets[sheetKey] : [];
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const seenManagerIds = new Set<string>();

    for (const row of rows) {
      try {
        const managerId = String(row["업무등록번호"] ?? "")
          .trim()
          .toUpperCase();
        if (!managerId) {
          skipped += 1;
          continue;
        }
        if (seenManagerIds.has(managerId)) {
          skipped += 1;
          continue;
        }
        seenManagerIds.add(managerId);

        const position = String(row["직급"] ?? "").trim();
        const region = String(row["권역"] ?? "").trim();
        const office = String(row["사무소"] ?? "").trim();
        const teamLeaderId = String(row["담당팀장"] ?? "").trim();
        const name = String(row["사용자"] ?? "").trim();

        const authEmail = `${managerId}${MANAGER_AUTH_EMAIL_SUFFIX}`;
        let user;
        try {
          user = await auth.getUserByEmail(authEmail);
        } catch (err: any) {
          if (err?.code === "auth/user-not-found") {
            user = await auth.createUser({
              email: authEmail,
              password: MANAGER_AUTH_COMMON_PASSWORD,
            });
          } else {
            throw err;
          }
        }

        const userRef = db.collection("users").doc(user.uid);
        const userSnap = await userRef.get();

        const payload = {
          managerId,
          email: authEmail,
          password: defaultPassword,
          name,
          position,
          region,
          office,
          branch: office,
          teamLeaderId,
          memo: "",
          role: "manager",
          isActive: true,
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (userSnap.exists) {
          await userRef.set(payload, { merge: true });
          updated += 1;
        } else {
          await userRef.set({
            ...payload,
            createdAt: FieldValue.serverTimestamp(),
          });
          created += 1;
        }
      } catch (err) {
        errors += 1;
      }
    }

    return res.status(200).json({
      ok: true,
      created,
      updated,
      skipped,
      errors,
    });
  } catch (err: any) {
    console.error("manager import error:", err);
    return res.status(500).json({
      ok: false,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      error: err?.message || "unknown error",
    });
  }
}
