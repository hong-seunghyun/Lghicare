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
  role: "teamLeader" | "officeHead" | "regionLeader";
  region?: string;
  office?: string;
};

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

export type TeamTop = {
  teamLeaderId: string;
  teamLeaderName: string;
  estimateTop: ManagerSummary[];
  shareTop: ManagerSummary[];
};

export type OfficeTop = {
  office: string;
  estimateTop: ManagerSummary[];
  shareTop: ManagerSummary[];
};

export type ManagerDashboardResponse = {
  estimateTop: ManagerSummary[];
  shareTop: ManagerSummary[];
  teamTops: TeamTop[];
  officeTops: OfficeTop[];
};

const getScopeQuery = (
  role: ManagerDashboardRequest["role"],
  region?: string,
  office?: string,
  managerId?: string,
) => {
  const baseQuery = query(collection(db, "users"), where("role", "==", "manager"));
  if (role === "teamLeader" && managerId) {
    return query(baseQuery, where("teamLeaderId", "==", managerId));
  }
  if (role === "officeHead" && office) {
    return query(baseQuery, where("office", "==", office));
  }
  if (role === "regionLeader" && region) {
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

const topN = (
  list: ManagerSummary[],
  field: "estimateCount" | "shareCount",
  limit: number,
) =>
  [...list]
    .sort((a, b) => b[field] - a[field])
    .slice(0, limit);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ManagerDashboardResponse | { message: string }>,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const body = req.body as ManagerDashboardRequest;
  if (!body.managerUid || !body.role) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const managerQuery = getScopeQuery(
      body.role,
      body.region,
      body.office,
      body.managerId,
    );
    const managerSnap = await getDocs(managerQuery);
    const subordinates = managerSnap.docs
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
      })
      .filter((item) => item.id !== body.managerUid);

    const totalMap = await fetchManagerTotals();

    const enriched = subordinates.map((manager) => {
      const totals = totalMap.get(manager.id) ?? { estimate: 0, share: 0 };
      return {
        ...manager,
        estimateCount: totals.estimate,
        shareCount: totals.share,
      };
    });

    const teamLeaderRegistry = new Map<string, string>();
    enriched.forEach((manager) => {
      if (manager.position.includes("팀장")) {
        teamLeaderRegistry.set(manager.managerId, manager.name);
      }
    });

    const groupBy = (
      keySelector: (manager: ManagerSummary) => string,
    ): Map<string, ManagerSummary[]> => {
      const map = new Map<string, ManagerSummary[]>();
      enriched.forEach((manager) => {
        const key = keySelector(manager) || "unknown";
        const list = map.get(key) ?? [];
        list.push(manager);
        map.set(key, list);
      });
      return map;
    };

    const teamGroups = groupBy((manager) => manager.teamLeaderId || "unknown");
    const teamTops: TeamTop[] = Array.from(teamGroups.entries())
      .map(([teamLeaderId, members]) => ({
        teamLeaderId,
        teamLeaderName:
          teamLeaderRegistry.get(teamLeaderId) || teamLeaderId || "팀장 미지정",
        estimateTop: topN(members, "estimateCount", 5),
        shareTop: topN(members, "shareCount", 5),
      }))
      .filter((group) => group.teamLeaderId && group.estimateTop.length > 0);

    const officeGroups = groupBy((manager) => manager.office || "unknown");
    const officeTops: OfficeTop[] = Array.from(officeGroups.entries()).map(
      ([office, members]) => ({
        office,
        estimateTop: topN(members, "estimateCount", 10),
        shareTop: topN(members, "shareCount", 10),
      }),
    );

    const limit = body.role === "teamLeader" ? 5 : 10;
    const estimateTop = topN(enriched, "estimateCount", limit);
    const shareTop = topN(enriched, "shareCount", limit);

    return res.status(200).json({
      estimateTop,
      shareTop,
      teamTops,
      officeTops,
    });
  } catch (err) {
    console.error("manager dashboard stats error:", err);
    return res.status(500).json({ message: "Unable to load dashboard stats" });
  }
}
