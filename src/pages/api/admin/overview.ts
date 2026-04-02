/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/api/admin/overview.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import pLimit from "p-limit";
import { db } from "@/lib/firebase";
import { fetchSheetData, getSheetsClient } from "@/lib/sheet";

type OverviewResponse = {
  topStats: {
    totalProducts: number;
    managers: number;
  };
};

const OVERVIEW_STATS_COLLECTION = "adminOverview";
const OVERVIEW_STATS_DOC_ID = "counts";

const safeNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

async function fetchOverviewCountsFromDoc(): Promise<
  | { totalProducts: number; managers: number }
  | null
> {
  const docRef = doc(db, OVERVIEW_STATS_COLLECTION, OVERVIEW_STATS_DOC_ID);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  const totalProducts = safeNumber(data.totalProducts);
  const managers = safeNumber(data.managers);
  if (totalProducts <= 0 && managers <= 0) return null;
  return { totalProducts, managers };
}

async function fetchManagersCount() {
  const snap = await getDocs(
    query(collection(db, "users"), where("role", "==", "manager")),
  );
  return snap.size;
}

async function fetchProductSheetNames() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) return [] as string[];

  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title))",
  });

  const titles = (res.data.sheets || [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));

  return titles;
}

async function fetchProductsCount() {
  const sheetNames = await fetchProductSheetNames();
  if (sheetNames.length === 0) return 0;

  const limiter = pLimit(5);
  const modelSet = new Set<string>();
  const rowsList = await Promise.all(
    sheetNames.map((name) =>
      limiter(async () => {
        try {
          const rows = await fetchSheetData(name);
          return rows ?? [];
        } catch {
          return [];
        }
      }),
    ),
  );

  const modelKeys = ["모델코드", "모델 코드", "모델명", "모델"];

  rowsList.forEach((rows) => {
    rows.forEach((row: Record<string, string>) => {
      const value =
        modelKeys
          .map((key) => row[key])
          .find((v) => typeof v === "string" && v.trim().length > 0) || "";
      const normalized = String(value).trim();
      if (normalized) modelSet.add(normalized);
    });
  });

  return modelSet.size;
}

async function fetchOverviewCounts() {
  const docCounts = await fetchOverviewCountsFromDoc();
  if (docCounts) return docCounts;

  const [productCount, managerCount] = await Promise.all([
    fetchProductsCount(),
    fetchManagersCount(),
  ]);

  return {
    totalProducts: productCount,
    managers: managerCount,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OverviewResponse | { message: string }>,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const counts = await fetchOverviewCounts();
    return res.status(200).json({
      topStats: {
        totalProducts: counts.totalProducts,
        managers: counts.managers,
      },
    });
  } catch (error) {
    console.error("overview API error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
