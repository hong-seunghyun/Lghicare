/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/api/admin/overview.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { google } from "googleapis";
import { collection, getDocs, query, where } from "firebase/firestore";
import pLimit from "p-limit";
import { db } from "@/lib/firebase";
import { fetchSheetData } from "@/lib/sheet";
import { getSheetsClient } from "@/lib/sheet";

type OverviewResponse = {
  topStats: {
    totalProducts: number;
    managers: number;
    todaySearch: number;
    yesterdaySearch: number;
    totalSearch: number;
  };
  visitStats: {
    pc: number;
    mobile: number;
  };
  lastMonthRange: {
    startDate: string;
    endDate: string;
  };
  currentMonthRange: {
    startDate: string;
    endDate: string;
  };
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const formatDateUTC = (d: Date) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getKstNow = () => new Date(Date.now() + KST_OFFSET_MS);

const getLastMonthRange = () => {
  const nowKst = getKstNow();
  const year = nowKst.getUTCFullYear();
  const month = nowKst.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { startDate: formatDateUTC(start), endDate: formatDateUTC(end) };
};

const getCurrentMonthRange = () => {
  const nowKst = getKstNow();
  const year = nowKst.getUTCFullYear();
  const month = nowKst.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month, nowKst.getUTCDate()));
  return { startDate: formatDateUTC(start), endDate: formatDateUTC(end) };
};

const getTodayDate = () => {
  const nowKst = getKstNow();
  return formatDateUTC(
    new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate()))
  );
};

const getYesterdayDate = () => {
  const nowKst = getKstNow();
  const todayUtc = Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate()
  );
  const yesterday = new Date(todayUtc - 24 * 60 * 60 * 1000);
  return formatDateUTC(yesterday);
};

const sumMetric = (rows: any[] | undefined) => {
  if (!rows || rows.length === 0) return 0;
  return rows.reduce((sum, row) => {
    const v = row.metricValues?.[0]?.value;
    return sum + (Number(v) || 0);
  }, 0);
};

const maskEmail = (email?: string | null) => {
  if (!email) return "(missing)";
  const [user, domain] = email.split("@");
  if (!domain) return "(invalid)";
  if (user.length <= 2) return `**@${domain}`;
  return `${user.slice(0, 2)}***@${domain}`;
};

async function fetchGa4Stats() {
  const propertyId = process.env.GA4_PROPERTY_ID;
  console.log("[overview][ga4] propertyId:", propertyId || "(missing)");
  console.log(
    "[overview][ga4] serviceEmail:",
    maskEmail(process.env.GOOGLE_SERVICE_EMAIL),
  );
  console.log(
    "[overview][ga4] privateKey:",
    process.env.GOOGLE_PRIVATE_KEY ? "(present)" : "(missing)",
  );
  if (!propertyId) {
    return {
      today: 0,
      yesterday: 0,
      lastMonthTotal: 0,
      device: { pc: 0, mobile: 0 },
      lastMonthRange: getLastMonthRange(),
      currentMonthRange: getCurrentMonthRange(),
    };
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });

  const analytics = google.analyticsdata("v1beta");
  const property = `properties/${propertyId}`;

  const today = getTodayDate();
  const yesterday = getYesterdayDate();
  const lastMonthRange = getLastMonthRange();

  const [todayRes, yesterdayRes, lastMonthRes, deviceRes] = await Promise.all([
    analytics.properties.runRealtimeReport({
      property,
      requestBody: {
        metrics: [{ name: "activeUsers" }],
      },
      auth,
    }),
    analytics.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate: yesterday, endDate: yesterday }],
        metrics: [{ name: "activeUsers" }],
      },
      auth,
    }),
    analytics.properties.runReport({
      property,
      requestBody: {
        dateRanges: [lastMonthRange],
        metrics: [{ name: "activeUsers" }],
      },
      auth,
    }),
    analytics.properties.runReport({
      property,
      requestBody: {
        dateRanges: [lastMonthRange],
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }],
      },
      auth,
    }),
  ]);

  const deviceRows = deviceRes.data.rows ?? [];
  let pc = 0;
  let mobile = 0;
  deviceRows.forEach((row) => {
    const device = row.dimensionValues?.[0]?.value || "";
    const value = Number(row.metricValues?.[0]?.value ?? 0) || 0;
    if (device === "desktop") pc += value;
    else mobile += value;
  });

  return {
    today: sumMetric(todayRes.data.rows),
    yesterday: sumMetric(yesterdayRes.data.rows),
    lastMonthTotal: sumMetric(lastMonthRes.data.rows),
    device: { pc, mobile },
    lastMonthRange,
    currentMonthRange: getCurrentMonthRange(),
  };
}

async function fetchManagersCount() {
  const snap = await getDocs(
    query(collection(db, "users"), where("role", "==", "manager"))
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
      })
    )
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OverviewResponse | { message: string }>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const [ga4, managerCount, productCount] = await Promise.all([
      fetchGa4Stats(),
      fetchManagersCount(),
      fetchProductsCount(),
    ]);

    const response: OverviewResponse = {
      topStats: {
        totalProducts: productCount,
        managers: managerCount,
        todaySearch: ga4.today,
        yesterdaySearch: ga4.yesterday,
        totalSearch: ga4.lastMonthTotal,
      },
      visitStats: {
        pc: ga4.device.pc,
        mobile: ga4.device.mobile,
      },
      lastMonthRange: ga4.lastMonthRange,
      currentMonthRange: ga4.currentMonthRange,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("overview API error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}


