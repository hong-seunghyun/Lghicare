/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/api/admin/managers/dedupe.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";

type DedupeResponse = {
  ok: boolean;
  scanned: number;
  duplicates: number;
  removed: number;
  error?: string;
};

type ManagerDoc = {
  id: string;
  managerId: string;
  createdAt?: any;
  updatedAt?: any;
};

const getTimestampValue = (value?: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DedupeResponse>,
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      scanned: 0,
      duplicates: 0,
      removed: 0,
      error: "Method not allowed",
    });
  }

  try {
    const db = initFirebaseAdmin();
    const snap = await db
      .collection("users")
      .where("role", "==", "manager")
      .get();

    const groups = new Map<string, ManagerDoc[]>();
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() as any;
      const managerId = String(data.managerId ?? "").trim().toUpperCase();
      if (!managerId) return;
      const entry: ManagerDoc = {
        id: docSnap.id,
        managerId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
      const list = groups.get(managerId) ?? [];
      list.push(entry);
      groups.set(managerId, list);
    });

    let duplicates = 0;
    let removed = 0;

    for (const [, list] of groups) {
      if (list.length <= 1) continue;

      duplicates += list.length - 1;

      const sorted = [...list].sort((a, b) => {
        const aTime =
          getTimestampValue(a.updatedAt) || getTimestampValue(a.createdAt);
        const bTime =
          getTimestampValue(b.updatedAt) || getTimestampValue(b.createdAt);
        return bTime - aTime;
      });

      const keeper = sorted[0];
      const toDelete = sorted.slice(1);

      await Promise.all(
        toDelete.map((item) =>
          db.collection("users").doc(item.id).delete(),
        ),
      );
      removed += toDelete.length;
    }

    return res.status(200).json({
      ok: true,
      scanned: snap.size,
      duplicates,
      removed,
    });
  } catch (err: any) {
    console.error("manager dedupe error:", err);
    return res.status(500).json({
      ok: false,
      scanned: 0,
      duplicates: 0,
      removed: 0,
      error: err?.message || "unknown error",
    });
  }
}
