import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";
import { createCatalogStore } from "./store";
import {
  PRODUCT_FIELDS,
  PRODUCT_CATEGORIES,
  type ArtifactRef,
  type CatalogRelease,
  type ProductRow,
} from "./types";

export type SheetMirrorJob = {
  id: string;
  owner: string;
  category: string;
  version: string;
  generation: string;
  source: ArtifactRef;
  total: number;
  offset: number;
  state: "preparing" | "complete" | "failed";
  createdAt: string;
  error?: string;
  leaseUntil?: number;
  leaseToken?: string;
};
const tasks = () => initFirebaseAdmin().collection("productSheetMirrors");
const lockRef = (category: string) =>
  initFirebaseAdmin().doc(
    `productSheetMirrorLocks/${Buffer.from(category).toString("base64url")}`,
  );
const client = () =>
  google.sheets({
    version: "v4",
    auth: new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    }),
  });
async function retry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (
        attempt >= 4 ||
        ![429, 500, 503].includes((error as { code?: number }).code ?? 0)
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}
export async function startSheetMirror(
  category: string,
  generation: string,
  owner: string,
) {
  if (!(PRODUCT_CATEGORIES as readonly string[]).includes(category))
    throw new Error("제품 분류를 선택해 주세요.");
  const store = createCatalogStore(),
    pointer = await store.pointer();
  if (!pointer.id || !pointer.manifest || pointer.generation !== generation)
    throw new Error("현재 상품 버전이 변경됐습니다. 새로 확인해 주세요.");
  const catalog = await store.get<CatalogRelease>(pointer.manifest),
    entry = catalog.categories[category];
  if (!entry || !catalog.parentId)
    throw new Error(
      "먼저 해당 분류를 반영하고 이전 데이터 백업을 확인해 주세요.",
    );
  const job: SheetMirrorJob = {
    id: randomUUID(),
    owner,
    category,
    version: catalog.id,
    generation,
    source: entry.rows,
    total: entry.rowCount,
    offset: 0,
    state: "preparing",
    createdAt: new Date().toISOString(),
  };
  await initFirebaseAdmin().runTransaction(async (transaction) => {
    const lock = await transaction.get(lockRef(category));
    if (lock.data()?.jobId) {
      const prior = await transaction.get(tasks().doc(lock.data()!.jobId));
      if (prior.exists && prior.data()?.state === "preparing")
        throw new Error(
          "이 분류의 시트 동기화가 진행 중입니다. 해당 작업을 이어서 실행해 주세요.",
        );
    }
    transaction.create(tasks().doc(job.id), job);
    transaction.set(lockRef(category), { jobId: job.id });
  });
  return job;
}
export async function stepSheetMirror(id: string) {
  const db = initFirebaseAdmin(),
    store = createCatalogStore(),
    ref = tasks().doc(id),
    token = randomUUID();
  const job = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("시트 동기화 내역이 없습니다.");
    const job = snapshot.data() as SheetMirrorJob;
    if (job.state === "complete") return job;
    const lock = await transaction.get(lockRef(job.category));
    if (lock.data()?.jobId !== id)
      throw new Error("더 최근 시트 동기화가 있습니다.");
    if ((job.leaseUntil ?? 0) > Date.now())
      throw new Error("시트를 처리 중입니다. 잠시 후 다시 확인해 주세요.");
    const next = {
      ...job,
      leaseUntil: Date.now() + 120000,
      leaseToken: token,
      error: "",
    };
    transaction.set(ref, next);
    return next;
  });
  if (job.state === "complete") return job;
  try {
    if ((await store.pointer()).generation !== job.generation)
      throw new Error(
        "상품 버전이 변경됐습니다. 현재 버전으로 새 동기화를 시작해 주세요.",
      );
    const records = await store.get<ProductRow[]>(job.source),
      api = client(),
      spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) throw new Error("Google Sheets 연결 설정이 없습니다.");
    const metadata = await retry(() =>
      api.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties(sheetId,title,gridProperties)",
      }),
    );
    let sheet = metadata.data.sheets?.find(
      (sheet) => sheet.properties?.title === job.category,
    )?.properties;
    const rows = records.length + 1,
      columns = PRODUCT_FIELDS.length;
    if (!sheet) {
      const created = await api.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: job.category,
                  gridProperties: {
                    rowCount: Math.max(rows, 100),
                    columnCount: Math.max(columns, 26),
                  },
                },
              },
            },
          ],
        },
      });
      sheet = created.data.replies?.[0]?.addSheet?.properties;
    }
    if (!sheet || sheet.sheetId === undefined || sheet.sheetId === null)
      throw new Error("대상 시트를 확인하지 못했습니다.");
    if (job.offset === 0) {
      const header = await retry(() =>
        api.spreadsheets.values.get({
          spreadsheetId,
          range: `'${job.category}'!A1:Z1`,
        }),
      );
      const values =
        header.data.values?.[0]?.map((value) =>
          String(value).replace(/\s+/g, ""),
        ) ?? [];
      if (
        values.some(Boolean) &&
        JSON.stringify(values) !==
          JSON.stringify(
            PRODUCT_FIELDS.map((value) => value.replace(/\s+/g, "")),
          )
      )
        throw new Error(
          "기존 Google 시트의 열 구성이 다릅니다. 값을 덮어쓰지 않았습니다. 열 매핑을 확인해 주세요.",
        );
    }
    if (
      (sheet.gridProperties?.rowCount ?? 0) < rows ||
      (sheet.gridProperties?.columnCount ?? 0) < columns
    )
      await api.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId: sheet.sheetId,
                  gridProperties: {
                    rowCount: Math.max(
                      rows,
                      sheet.gridProperties?.rowCount ?? rows,
                    ),
                    columnCount: Math.max(
                      columns,
                      sheet.gridProperties?.columnCount ?? columns,
                    ),
                  },
                },
                fields: "gridProperties.rowCount,gridProperties.columnCount",
              },
            },
          ],
        },
      });
    let end = job.offset,
      bytes = 0;
    while (end < records.length && end - job.offset < 1000) {
      const size = Buffer.byteLength(
        JSON.stringify(
          PRODUCT_FIELDS.map((field) => records[end][field] ?? ""),
        ),
      );
      if (end > job.offset && bytes + size > 1_500_000) break;
      bytes += size;
      end++;
    }
    const data = records
      .slice(job.offset, end)
      .map((row) => PRODUCT_FIELDS.map((field) => row[field] ?? ""));
    if (job.offset === 0) data.unshift([...PRODUCT_FIELDS]);
    const startRow = job.offset === 0 ? 1 : job.offset + 2;
    if (data.length)
      await retry(() =>
        api.spreadsheets.values.update({
          spreadsheetId,
          range: `'${job.category}'!A${startRow}:W${startRow + data.length - 1}`,
          valueInputOption: "RAW",
          requestBody: { values: data },
        }),
      );
    if (end === records.length && (sheet.gridProperties?.rowCount ?? 0) > rows)
      await retry(() =>
        api.spreadsheets.values.clear({
          spreadsheetId,
          range: `'${job.category}'!A${rows + 1}:W${sheet!.gridProperties!.rowCount}`,
          requestBody: {},
        }),
      );
    if ((await store.pointer()).generation !== job.generation)
      throw new Error(
        "동기화 중 상품 버전이 변경됐습니다. 현재 버전으로 다시 시작해 주세요.",
      );
    const next = {
      ...job,
      offset: end,
      state:
        end === records.length ? ("complete" as const) : ("preparing" as const),
      leaseUntil: 0,
    };
    await db.runTransaction(async (transaction) => {
      const [current, lock] = await Promise.all([
        transaction.get(ref),
        transaction.get(lockRef(job.category)),
      ]);
      if (current.data()?.leaseToken !== token || lock.data()?.jobId !== id)
        throw new Error("시트 작업이 변경됐습니다.");
      transaction.set(ref, next);
    });
    return next;
  } catch (error) {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (current.data()?.leaseToken === token)
        transaction.update(ref, {
          state: "failed",
          leaseUntil: 0,
          error: error instanceof Error ? error.message : "시트 동기화 실패",
        });
    });
    throw error;
  }
}
export async function sheetMirrorJobs() {
  const snap = await tasks().orderBy("createdAt", "desc").limit(12).get();
  return snap.docs.map((doc) => doc.data() as SheetMirrorJob);
}
