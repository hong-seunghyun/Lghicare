/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/api/admin/dashboard.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

// 👉 원본 타입은 그대로 두고 (혹시 나중에 쓸 수도 있으니)
type PopularProduct = {
  id: string;
  name: string;
  estimateCount: number;
  shareCount: number;
};

type TopManager = {
  id: string;
  name: string;
  branchName: string;
  estimateCount: number;
  shareCount: number;
};

type TopBranch = {
  id: string;
  name: string;
  estimateCount: number;
  shareCount: number;
};

// ✅ 새로 추가: 중분류(estimateType) 통계 타입
type EstimateTypeStat = {
  type: string; // 예: "정수기", "TV"
  estimateCount: number;
  shareCount: number; // 현재는 0으로 두고, 추후 확장 가능
};

// ✅ 대시보드 응답 타입을 새 구조로 변경
type DashboardResponse = {
  estimateTypes: EstimateTypeStat[];
  topManagers: TopManager[];
  topBranches: TopBranch[];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DashboardResponse | { message: string }>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    // 🔥 1) Firestore에서 애널리틱스 컬렉션 2개를 병렬로 가져옴
    const [estimatesSnap, shareSnap] = await Promise.all([
      getDocs(collection(db, "estimatesCount")),
      getDocs(collection(db, "shareCount")),
    ]);

    // ================== 1. 중분류(estimateType) 통계 ==================
    // type_* 문서를 모아서 타입별 견적 수 집계
    const typeMap = new Map<string, { estimateCount: number; shareCount: number }>();

    estimatesSnap.docs.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
      const id = docSnap.id;
      const data = docSnap.data() as any;

      if (id.startsWith("type_")) {
        const type: string = data.type || id.replace(/^type_/, "") || "unknown";
        const totalCount: number = data.totalCount ?? 0;

        const prev = typeMap.get(type) || { estimateCount: 0, shareCount: 0 };
        typeMap.set(type, {
          estimateCount: prev.estimateCount + totalCount,
          shareCount: prev.shareCount, // 현재는 공유 수 알 수 없으므로 유지
        });
      }
    });

    const estimateTypes: EstimateTypeStat[] = Array.from(typeMap.entries())
      .map(([type, counts]) => ({
        type,
        estimateCount: counts.estimateCount,
        shareCount: counts.shareCount, // 현재는 0
        total: counts.estimateCount + counts.shareCount,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(({ total, ...rest }) => rest);

    // ================== 2. 매니저별 견적/공유 합산 ==================
    // estimatesCount: manager_*_* 문서 → managerCount
    const managerEstimateMap = new Map<
      string,
      { name: string; branchName: string; estimateCount: number }
    >();

    estimatesSnap.docs.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
      const id = docSnap.id;
      if (!id.startsWith("manager_")) return;

      const data = docSnap.data() as any;
      const managerUid: string = data.managerUid || id.split("_")[1] || "unknown";
      const managerName: string = data.managerName || data.managerId || managerUid;
      const branchName: string = data.branch || "미지정 지점";
      const managerCount: number = data.managerCount ?? 0;

      const prev = managerEstimateMap.get(managerUid) || {
        name: managerName,
        branchName,
        estimateCount: 0,
      };

      managerEstimateMap.set(managerUid, {
        name: prev.name || managerName,
        branchName: prev.branchName || branchName,
        estimateCount: prev.estimateCount + managerCount,
      });
    });

    // shareCount: manager_*_* 문서 → shareCount
    const managerShareMap = new Map<
      string,
      { name: string; branchName: string; shareCount: number }
    >();

    shareSnap.docs.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
      const id = docSnap.id;
      if (!id.startsWith("manager_")) return;

      const data = docSnap.data() as any;
      const managerUid: string = data.managerUid || id.split("_")[1] || "unknown";
      const managerName: string = data.managerName || data.managerId || managerUid;
      const branchName: string = data.branch || "미지정 지점";
      const shareCount: number = data.shareCount ?? 0;

      const prev = managerShareMap.get(managerUid) || {
        name: managerName,
        branchName,
        shareCount: 0,
      };

      managerShareMap.set(managerUid, {
        name: prev.name || managerName,
        branchName: prev.branchName || branchName,
        shareCount: prev.shareCount + shareCount,
      });
    });

    // 두 맵을 합쳐서 TOP 매니저 구하기
    const allManagerIds = new Set<string>([
      ...managerEstimateMap.keys(),
      ...managerShareMap.keys(),
    ]);

    const topManagers: TopManager[] = Array.from(allManagerIds).map((managerUid) => {
      const est = managerEstimateMap.get(managerUid);
      const sh = managerShareMap.get(managerUid);

      const name = est?.name || sh?.name || managerUid;
      const branchName = est?.branchName || sh?.branchName || "미지정 지점";
      const estimateCount = est?.estimateCount ?? 0;
      const shareCount = sh?.shareCount ?? 0;

      return {
        id: managerUid,
        name,
        branchName,
        estimateCount,
        shareCount,
        total: estimateCount + shareCount,
      };
    })
      .filter((m) => m.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 20)
      .map(({ total, ...rest }) => rest);

    // ================== 3. 지점별 견적/공유 합산 ==================
    // estimatesCount: branch_*_* 문서 → branchCount
    const branchEstimateMap = new Map<string, number>();

    estimatesSnap.docs.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
      const id = docSnap.id;
      if (!id.startsWith("branch_")) return;

      const data = docSnap.data() as any;
      const branch: string = data.branch || id.split("_")[1] || "미지정 지점";
      const branchCount: number = data.branchCount ?? 0;

      const prev = branchEstimateMap.get(branch) ?? 0;
      branchEstimateMap.set(branch, prev + branchCount);
    });

    // shareCount: branch_*_* 문서 → shareCount
    const branchShareMap = new Map<string, number>();

    shareSnap.docs.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
      const id = docSnap.id;
      if (!id.startsWith("branch_")) return;

      const data = docSnap.data() as any;
      const branch: string = data.branch || id.split("_")[1] || "미지정 지점";
      const shareCount: number = data.shareCount ?? 0;

      const prev = branchShareMap.get(branch) ?? 0;
      branchShareMap.set(branch, prev + shareCount);
    });

    const allBranchNames = new Set<string>([
      ...branchEstimateMap.keys(),
      ...branchShareMap.keys(),
    ]);

    const topBranches: TopBranch[] = Array.from(allBranchNames).map((branchName, idx) => {
      const estimateCount = branchEstimateMap.get(branchName) ?? 0;
      const shareCount = branchShareMap.get(branchName) ?? 0;

      return {
        id: `branch-${idx + 1}`,
        name: branchName,
        estimateCount,
        shareCount,
        total: estimateCount + shareCount,
      };
    })
      .filter((b) => b.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(({ total, ...rest }) => rest);

    const response: DashboardResponse = {
      estimateTypes,
      topManagers,
      topBranches,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("대시보드 API 오류:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
