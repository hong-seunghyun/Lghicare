/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";

type ActivityTypeCount = {
  name: string;
  count: number;
};

type ActivityManager = {
  id: string;
  name: string;
  branch: string;
  estimateCount: number;
};

type ActivityBranch = {
  name: string;
  estimateCount: number;
};

type ShareSummary = {
  today: number;
  range: number;
};

type ActivitySummaryResponse = {
  totalEstimates: number;
  topManagers: ActivityManager[];
  topBranches: ActivityBranch[];
  typeCounts: ActivityTypeCount[];
  dailyCounts: Array<{ date: string; count: number }>;
  rangeStart: string;
  rangeEnd: string;
  shareSummary: ShareSummary;
  todayEstimates: number;
};

const padDate = (value: number) => String(value).padStart(2, "0");

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(
    date.getDate(),
  )}`;

const parseDateInput = (value?: string, fallback?: Date) => {
  if (!value) return fallback ?? new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback ?? new Date();
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const toSafeDate = (value: any): Date | null => {
  if (!value) return null;
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "number" || typeof value === "string") {
    const coerced = new Date(value);
    if (!Number.isNaN(coerced.getTime())) {
      return coerced;
    }
  }
  return null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ActivitySummaryResponse | { message: string }>,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const startParam = Array.isArray(req.query.start)
    ? req.query.start[0]
    : req.query.start;
  const endParam = Array.isArray(req.query.end)
    ? req.query.end[0]
    : req.query.end;

  const startDate = parseDateInput(startParam, defaultStart);
  const endDate = parseDateInput(endParam, today);
  const normalizedEnd = new Date(endDate);

  if (normalizedEnd < startDate) {
    normalizedEnd.setTime(startDate.getTime());
  }
  normalizedEnd.setDate(normalizedEnd.getDate() + 1);
  normalizedEnd.setHours(0, 0, 0, 0);

  const startTimestamp = Timestamp.fromDate(startDate);
  const endTimestamp = Timestamp.fromDate(normalizedEnd);

  try {
    const estimatesRef = collection(db, "estimates");
    const estimatesQuery = query(
      estimatesRef,
      where("createdAt", ">=", startTimestamp),
      where("createdAt", "<", endTimestamp),
      orderBy("createdAt", "asc"),
    );

    const snap = await getDocs(estimatesQuery);
    const managerMap = new Map<string, ActivityManager>();
    const branchMap = new Map<string, number>();
    const typeMap = new Map<string, number>();
    const dailyCounts = new Map<string, number>();

    let totalEstimates = 0;

    const extractDateKey = (value: any) => {
      if (!value) return null;
      let date: Date | null = null;
      if (typeof value.toDate === "function") {
        date = value.toDate();
      } else if (value instanceof Timestamp) {
        date = value.toDate();
      } else if (value instanceof Date) {
        date = value;
      } else {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          date = parsed;
        }
      }
      if (!date) return null;
      return formatDateKey(date);
    };

    snap.forEach((docSnap) => {
      totalEstimates += 1;
      const data = docSnap.data() as any;

      const managerUid =
        String(data.managerUid ?? data.managerId ?? docSnap.id);
      const managerName =
        String(data.managerName ?? data.managerId ?? "알 수 없음");
      const branch =
        String(data.managerBranch ?? data.branch ?? data.office ?? "지점");

      const prevManager = managerMap.get(managerUid);
      if (prevManager) {
        prevManager.estimateCount += 1;
      } else {
        managerMap.set(managerUid, {
          id: managerUid,
          name: managerName,
          branch,
          estimateCount: 1,
        });
      }

      const branchKey = branch || "지점";
      branchMap.set(branchKey, (branchMap.get(branchKey) ?? 0) + 1);

      const estimateTypes = Array.isArray(data.estimateTypes)
        ? data.estimateTypes
        : [];
      estimateTypes.forEach((type: unknown) => {
        const normalized = String(type ?? "unknown") || "unknown";
        typeMap.set(
          normalized,
          (typeMap.get(normalized) ?? 0) + 1,
        );
      });

      const dayKey = extractDateKey(data.createdAt);
      if (dayKey) {
        dailyCounts.set(dayKey, (dailyCounts.get(dayKey) ?? 0) + 1);
      }
    });

    const topManagers = Array.from(managerMap.values())
      .sort((a, b) => b.estimateCount - a.estimateCount)
      .slice(0, 30);

    const topBranches = Array.from(branchMap.entries())
      .map(([name, estimateCount]) => ({ name, estimateCount }))
      .sort((a, b) => b.estimateCount - a.estimateCount)
      .slice(0, 20);

    const typeCounts = Array.from(typeMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const dailyRange: Array<{ date: string; count: number }> = [];
    const cursor = new Date(startDate);
    while (cursor < normalizedEnd) {
      const key = formatDateKey(cursor);
      dailyRange.push({
        date: key,
        count: dailyCounts.get(key) ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const shareSummary: ShareSummary = { today: 0, range: 0 };
    let todayEstimateCount = 0;
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const shareRangeQuery = query(
        collection(db, "shareCount"),
        where("updatedAt", ">=", Timestamp.fromDate(startDate)),
        where("updatedAt", "<", Timestamp.fromDate(normalizedEnd)),
      );
      const shareTodayQuery = query(
        collection(db, "shareCount"),
        where("updatedAt", ">=", Timestamp.fromDate(todayStart)),
        where("updatedAt", "<", Timestamp.fromDate(todayEnd)),
      );
      const todayEstimateQuery = query(
        collection(db, "estimates"),
        where("createdAt", ">=", Timestamp.fromDate(todayStart)),
        where("createdAt", "<", Timestamp.fromDate(todayEnd)),
      );

      const [shareRangeSnap, shareTodaySnap, todayEstimateSnap] =
        await Promise.all([
          getDocs(shareRangeQuery),
          getDocs(shareTodayQuery),
          getDocs(todayEstimateQuery),
        ]);

      const buildUniqueSet = (snapshot: any) => {
        const set = new Set<string>();
        snapshot.docs.forEach((docSnap: any) => {
          const data = docSnap.data() as any;
          const updatedAt = toSafeDate(data.updatedAt);
          if (!updatedAt) {
            return;
          }
          const pathKey = String(data.path ?? docSnap.id ?? "");
          const timeKey = Math.floor(updatedAt.getTime() / 1000);
          set.add(`${pathKey}:${timeKey}`);
        });
        return set;
      };

      shareSummary.range = buildUniqueSet(shareRangeSnap).size;
      shareSummary.today = buildUniqueSet(shareTodaySnap).size;
      todayEstimateCount = todayEstimateSnap.size;
    } catch (shareError) {
      console.error("share summary load error:", shareError);
    }

    const response: ActivitySummaryResponse = {
      totalEstimates,
      topManagers,
      topBranches,
      typeCounts,
      dailyCounts: dailyRange,
      rangeStart: formatDateKey(startDate),
      rangeEnd: formatDateKey(
        new Date(normalizedEnd.getTime() - 1),
      ),
      shareSummary,
      todayEstimates: todayEstimateCount,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("activity summary error:", error);
    return res.status(500).json({ message: "Unable to load activity summary" });
  }
}
