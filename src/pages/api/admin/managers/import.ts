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
  deleted: number;
  deleteErrors: number;
  error?: string;
};

type ImportAction =
  | { type: "create"; rows: Record<string, unknown>[] }
  | { type: "delete"; managerIds: string[] };

const MANAGER_ID_FIELDS = ["managerId", "manager_id", "id", "업무등록번호"];
const POSITION_FIELDS = ["직급", "position"];
const REGION_FIELDS = ["권역", "region"];
const OFFICE_FIELDS = ["사무소", "office", "branch"];
const TEAM_LEADER_FIELDS = ["담당팀장", "teamLeaderId"];
const NAME_FIELDS = ["사용자", "name"];

const chunkArray = <T,>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

const normalizeKey = (key: string) => key.normalize("NFKC");

function extractStringField(
  record: Record<string, unknown> | null,
  keys: string[],
): string {
  if (!record) return "";
  const targetSet = new Set(keys.map((key) => normalizeKey(key)));
  for (const rawKey of Object.keys(record)) {
    const normalizedKey = normalizeKey(rawKey);
    if (!targetSet.has(normalizedKey)) continue;
    const value = record[rawKey];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
      continue;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return "";
}

const normalizeManagerId = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") {
    return value.trim().normalize("NFKC").toUpperCase();
  }
  if (typeof value === "number") {
    return String(value).trim().toUpperCase();
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate = extractStringField(record, MANAGER_ID_FIELDS);
    return candidate.toUpperCase();
  }
  return "";
};

const readLegacyManagerRows = async (): Promise<Record<string, unknown>[]> => {
  const filePath = path.join(
    process.cwd(),
    "src",
    "data",
    "managerList.json",
  );
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw);
  if (Array.isArray(data)) {
    return data;
  }
  if (data?.sheets && typeof data.sheets === "object") {
    const sheetKey = Object.keys(data.sheets)[0];
    if (sheetKey && Array.isArray(data.sheets[sheetKey])) {
      return data.sheets[sheetKey];
    }
  }
  return [];
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
      deleted: 0,
      deleteErrors: 0,
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

    const actions = Array.isArray(req.body?.actions)
      ? (req.body.actions as ImportAction[])
      : null;

    let createRows: Record<string, unknown>[] = [];
    const deleteManagerIds: string[] = [];

    if (actions && actions.length) {
      for (const action of actions) {
        if (action?.type === "create" && Array.isArray(action.rows)) {
          createRows.push(...action.rows);
        }
        if (action?.type === "delete" && Array.isArray(action.managerIds)) {
          deleteManagerIds.push(
            ...action.managerIds
              .map((id) => normalizeManagerId(id))
              .filter(Boolean),
          );
        }
      }
    } else {
      createRows = await readLegacyManagerRows();
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const seenManagerIds = new Set<string>();

    for (const rawRow of createRows) {
      if (!rawRow || typeof rawRow !== "object") {
        skipped += 1;
        continue;
      }
      const row = rawRow as Record<string, unknown>;
      const managerId = normalizeManagerId(row);
      if (!managerId) {
        skipped += 1;
        continue;
      }
      if (seenManagerIds.has(managerId)) {
        skipped += 1;
        continue;
      }
      seenManagerIds.add(managerId);

      const position = extractStringField(row, POSITION_FIELDS);
      const region = extractStringField(row, REGION_FIELDS);
      const office = extractStringField(row, OFFICE_FIELDS);
      const teamLeaderId = extractStringField(row, TEAM_LEADER_FIELDS);
      const name = extractStringField(row, NAME_FIELDS);

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

      try {
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

    let deleted = 0;
    let deleteErrors = 0;
    const normalizedDeleteIds = Array.from(
      new Set(deleteManagerIds.filter(Boolean)),
    );

    if (normalizedDeleteIds.length) {
      const chunks = chunkArray(normalizedDeleteIds, 10);
      for (const chunk of chunks) {
        try {
          const snap = await db
            .collection("users")
            .where("managerId", "in", chunk)
            .get();
          for (const docSnap of snap.docs) {
            try {
              await db.collection("users").doc(docSnap.id).delete();
              deleted += 1;
            } catch (err) {
              deleteErrors += 1;
              console.error("매니저 문서 삭제 실패:", docSnap.id, err);
            }
            try {
              await auth.deleteUser(docSnap.id);
            } catch (err) {
              console.warn("매니저 인증 삭제 실패:", docSnap.id, err);
            }
          }
        } catch (err) {
          deleteErrors += chunk.length;
          console.error("삭제할 매니저 조회 실패:", chunk, err);
        }
      }
    }

    return res.status(200).json({
      ok: true,
      created,
      updated,
      skipped,
      errors,
      deleted,
      deleteErrors,
    });
  } catch (err: any) {
    console.error("manager import error:", err);
    return res.status(500).json({
      ok: false,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      deleted: 0,
      deleteErrors: 0,
      error: err?.message || "unknown error",
    });
  }
}
