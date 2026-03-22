/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/api/admin/managers/upsert.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";

const MANAGER_AUTH_EMAIL_SUFFIX = "@co.kr";
const MANAGER_AUTH_COMMON_PASSWORD = "q1w2e3r4@@!!@@";

type UpsertResponse = {
  ok: boolean;
  manager?: any;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpsertResponse>,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const db = initFirebaseAdmin();
    const auth = getAuth();
    const body = req.body ?? {};

    const managerId = String(body.managerId ?? "").trim().toUpperCase();
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "").trim();
    const position = String(body.position ?? "").trim();
    const region = String(body.region ?? "").trim();
    const office = String(body.office ?? "").trim();
    const teamLeaderId = String(body.teamLeaderId ?? "").trim();
    const memo = String(body.memo ?? "").trim();
    const isActive = body.isActive !== false;
    let uid = body.uid ? String(body.uid) : "";

    if (!managerId || !name || !password) {
      return res.status(400).json({
        ok: false,
        error: "managerId, name, password are required",
      });
    }

    const authEmail = `${managerId}${MANAGER_AUTH_EMAIL_SUFFIX}`;

    if (uid) {
      const user = await auth.getUser(uid);
      if (user.email !== authEmail) {
        await auth.updateUser(uid, { email: authEmail });
      }
    } else {
      try {
        const user = await auth.getUserByEmail(authEmail);
        uid = user.uid;
      } catch (err: any) {
        if (err?.code === "auth/user-not-found") {
          const createdUser = await auth.createUser({
            email: authEmail,
            password: MANAGER_AUTH_COMMON_PASSWORD,
          });
          uid = createdUser.uid;
        } else {
          throw err;
        }
      }
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    const payload = {
      managerId,
      email: authEmail,
      password,
      name,
      position,
      region,
      office,
      branch: office,
      teamLeaderId,
      memo,
      role: "manager",
      isActive,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (userSnap.exists) {
      await userRef.set(payload, { merge: true });
    } else {
      await userRef.set({
        ...payload,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    const manager = {
      id: uid,
      managerId,
      email: authEmail,
      password,
      name,
      position,
      region,
      office,
      teamLeaderId,
      memo,
      isActive,
    };

    return res.status(200).json({ ok: true, manager });
  } catch (err: any) {
    console.error("manager upsert error:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "unknown error",
    });
  }
}
