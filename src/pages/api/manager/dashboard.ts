/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  type QueryConstraint,
} from "firebase/firestore";

export type ManagerDashboardRequest = {
  managerUid: string;
  managerId: string;
  position: string;
  role?: string;
  region?: string;
  office?: string;
  startDate?: string;
  endDate?: string;
};

export type ManagerDashboardScope =
  | "national"
  | "area"
  | "region"
  | "office"
  | "team"
  | "self";

export type ManagerSummary = {
  id: string;
  managerId: string;
  name: string;
  position: string;
  office: string;
  region: string;
  teamLeaderId: string;
  estimateCount: number;
  shareCount: number;
};

export type ManagerDashboardResponse = {
  scope: ManagerDashboardScope;
  managers: ManagerSummary[];
};

const getAreaFromRegion = (region: string) => {
  const trimmed = String(region ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("_")) {
    return trimmed.split("_")[0]?.trim() ?? trimmed;
  }
  if (/[가-힣]/u.test(trimmed)) {
    const normalized = trimmed.replace(/[A-Z0-9]+$/u, "").trim();
    return normalized || trimmed;
  }
  return trimmed;
};

const getDashboardScope = (
  body: Pick<
    ManagerDashboardRequest,
    "managerId" | "position" | "role" | "office"
  >,
): ManagerDashboardScope => {
  if (body.role === "admin" || body.managerId === "admin") {
    return "national";
  }

  if (body.managerId === "admin-global") {
    return body.office ? "office" : "national";
  }

  const position = body.position ?? "";
  if (position.includes("지역담당") || position.includes("CSA")) {
    return "national";
  }
  if (position.includes("지역행정")) {
    return "area";
  }
  if (position.includes("리더사무소장")) {
    return "region";
  }
  if (position.includes("사무소장")) {
    return "office";
  }
  if (position.includes("팀장")) {
    return "team";
  }
  return "self";
};

const getScopeQuery = (
  scope: ManagerDashboardScope,
  region?: string,
  office?: string,
  managerId?: string,
) => {
  const baseQuery = query(collection(db, "users"), where("role", "==", "manager"));
  if (scope === "self" && managerId) {
    return query(baseQuery, where("managerId", "==", managerId));
  }
  if (scope === "team" && managerId) {
    return query(baseQuery, where("teamLeaderId", "==", managerId));
  }
  if (scope === "office" && office) {
    return query(baseQuery, where("office", "==", office));
  }
  if (scope === "region" && region) {
    return query(baseQuery, where("region", "==", region));
  }
  return baseQuery;
};

const fetchEstimateTotals = async (
  start?: Timestamp,
  end?: Timestamp,
) => {
  const constraints: QueryConstraint[] = [];
  if (start) constraints.push(where("createdAt", ">=", start));
  if (end) constraints.push(where("createdAt", "<", end));
  const estimatesQuery = constraints.length
    ? query(collection(db, "estimates"), ...constraints)
    : query(collection(db, "estimates"));

  const snap = await getDocs(estimatesQuery);
  const totals = new Map<string, number>();
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as any;
    const uid: string =
      String(data.managerUid ?? "") ||
      String(data.managerId ?? "") ||
      docSnap.id;
    totals.set(uid, (totals.get(uid) ?? 0) + 1);
  });
  return totals;
};

const fetchShareTotals = async () => {
  const snap = await getDocs(collection(db, "shareCountByManager"));
  const totals = new Map<string, number>();
  snap.docs.forEach((docSnap) => {
    if (!docSnap.id.startsWith("manager_")) return;
    const data = docSnap.data() as any;
    const uid: string =
      String(data.managerUid ?? "") ||
      docSnap.id.split("_")[1] ||
      "unknown";
    totals.set(
      uid,
      (totals.get(uid) ?? 0) + Number(data.totalCount ?? data.shareCount ?? 0),
    );
  });
  return totals;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ManagerDashboardResponse | { message: string }>,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const body = req.body as ManagerDashboardRequest;
  if (!body.managerUid || !body.position) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const parseTimestamp = (value?: string) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return Timestamp.fromDate(parsed);
  };

  const startTimestamp = parseTimestamp(body.startDate);
  let endTimestamp = parseTimestamp(body.endDate);
  if (endTimestamp) {
    const endDate = endTimestamp.toDate();
    endDate.setDate(endDate.getDate() + 1);
    endDate.setHours(0, 0, 0, 0);
    endTimestamp = Timestamp.fromDate(endDate);
  }

  try {
    const scope = getDashboardScope(body);
    const managerQuery = getScopeQuery(
      scope,
      body.region,
      body.office,
      body.managerId,
    );
    const managerSnap = await getDocs(managerQuery);
    const scopedManagers = managerSnap.docs.map((docSnap) => {
      const data = docSnap.data() as any;
      return {
        id: docSnap.id,
        managerId: String(data.managerId ?? ""),
        name: String(data.name ?? ""),
        position: String(data.position ?? ""),
        office: String(data.office ?? data.branch ?? ""),
        region: String(data.region ?? ""),
        teamLeaderId: String(data.teamLeaderId ?? ""),
      };
    });

    const scopedArea = getAreaFromRegion(body.region ?? "");
    const filteredManagers = scopedManagers.filter((manager) => {
      if (scope !== "area") return true;
      return getAreaFromRegion(manager.region) === scopedArea;
    });

    const estimateMap = await fetchEstimateTotals(
      startTimestamp ?? undefined,
      endTimestamp ?? undefined,
    );
    const shareMap = await fetchShareTotals();

    const enriched = filteredManagers.map((manager) => {
      const estimateCount = estimateMap.get(manager.id) ?? 0;
      const shareCount = shareMap.get(manager.id) ?? 0;

      return {
        ...manager,
        estimateCount,
        shareCount,
      };
    });

    return res.status(200).json({
      scope,
      managers: enriched,
    });
  } catch (err) {
    console.error("manager dashboard stats error:", err);
    return res.status(500).json({ message: "Unable to load dashboard stats" });
  }
}
