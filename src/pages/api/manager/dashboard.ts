/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";

export type ManagerDashboardRequest = {
  managerUid: string;
  managerId: string;
  position: string;
  region?: string;
  office?: string;
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

const getDashboardScope = (position: string): ManagerDashboardScope => {
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

const fetchManagerTotals = async () => {
  const estimatesSnap = await getDocs(collection(db, "estimatesCount"));
  const sharesSnap = await getDocs(collection(db, "shareCountByManager"));

  const totals = new Map<
    string,
    { estimate: number; share: number }
  >();

  const processDoc = (
    docSnap: QueryDocumentSnapshot<DocumentData>,
    field: "estimate" | "share",
    countField: "managerCount" | "totalCount" | "shareCount",
  ) => {
    if (!docSnap.id.startsWith("manager_")) return;
    const data = docSnap.data() as any;
    const uid: string = data.managerUid || docSnap.id.split("_")[1] || "unknown";
    const count = Number(data[countField] ?? 0);
    const prev = totals.get(uid) || { estimate: 0, share: 0 };
    totals.set(uid, {
      ...prev,
      [field]: prev[field] + count,
    });
  };

  estimatesSnap.docs.forEach((docSnap) =>
    processDoc(docSnap, "estimate", "managerCount"),
  );
  sharesSnap.docs.forEach((docSnap) =>
    processDoc(docSnap, "share", "totalCount"),
  );

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

  try {
    const scope = getDashboardScope(body.position);
    const managerQuery = getScopeQuery(
      scope,
      body.region,
      body.office,
      body.managerId,
    );
    const managerSnap = await getDocs(managerQuery);
    const scopedManagers = managerSnap.docs
      .map((docSnap) => {
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

    const totalMap = await fetchManagerTotals();

    const enriched = filteredManagers.map((manager) => {
      const totals = totalMap.get(manager.id) ?? { estimate: 0, share: 0 };
      return {
        ...manager,
        estimateCount: totals.estimate,
        shareCount: totals.share,
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
