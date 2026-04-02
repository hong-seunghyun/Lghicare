import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isSalesHubCategory } from "@/config/boardCategories";

export type LearningActivityRow = {
  postId?: string;
  categoryId?: string;
  title?: string;
  viewCount: number;
  shareCount: number;
};

export type LearningActivityTotals = {
  views: number;
  shares: number;
};

export type ManagerLearningResult = {
  totals: LearningActivityTotals;
  details: LearningActivityRow[];
};

type BoardPostActivityDoc = {
  categoryId?: string;
  title?: string;
  viewCount?: number | string;
  shareCount?: number | string;
};

type BoardPostDoc = {
  categoryId?: string;
  title?: string;
};

export const fetchManagerLearningDetails = async (
  managerUid: string,
  maxPosts = 200,
): Promise<ManagerLearningResult> => {
  const activityQuery = query(
    collection(db, "boardPostActivity"),
    where("managerUid", "==", managerUid),
  );
  const activitySnap = await getDocs(activityQuery);
  const activityRows: LearningActivityRow[] = activitySnap.docs.map((docSnap) => {
    const data = docSnap.data() as BoardPostActivityDoc;
    return {
      postId: docSnap.id,
      categoryId: data.categoryId ?? undefined,
      title: data.title ?? undefined,
      viewCount: Number(data.viewCount ?? 0),
      shareCount: Number(data.shareCount ?? 0),
    };
  });

  const totals = {
    views: activityRows.reduce((sum, row) => sum + row.viewCount, 0),
    shares: activityRows.reduce((sum, row) => sum + row.shareCount, 0),
  };

  const activityMap = new Map<string, LearningActivityRow>();
  activityRows.forEach((row) => {
    if (row.postId) {
      activityMap.set(row.postId, row);
    }
  });

  let details: LearningActivityRow[] = [...activityRows];

  try {
    const postsSnap = await getDocs(
      query(
        collection(db, "boardPosts"),
        orderBy("createdAt", "desc"),
        limit(maxPosts),
      ),
    );

    const salesPosts = postsSnap.docs
      .map((docSnap) => {
        const data = docSnap.data() as BoardPostDoc;
        return {
          id: docSnap.id,
          categoryId: data.categoryId ?? undefined,
          title: data.title ?? undefined,
        };
      })
      .filter(
        (post) => post.categoryId && isSalesHubCategory(post.categoryId),
      );

    const salesPostIds = new Set(salesPosts.map((post) => post.id));

    const postDetails = salesPosts.map((post) => {
      const activity = post.id ? activityMap.get(post.id) : undefined;
      return {
        postId: post.id,
        categoryId: post.categoryId,
        title: post.title,
        viewCount: activity?.viewCount ?? 0,
        shareCount: activity?.shareCount ?? 0,
      };
    });

    const leftoverDetails = activityRows
      .filter((row) => row.postId && !salesPostIds.has(row.postId))
      .map((row) => ({
        postId: row.postId,
        categoryId: row.categoryId,
        title: row.title,
        viewCount: row.viewCount,
        shareCount: row.shareCount,
      }));

    details = [...postDetails, ...leftoverDetails];
  } catch (postsError) {
    console.error("학습 게시글 목록 조회 오류:", postsError);
  }

  return {
    totals,
    details,
  };
};
