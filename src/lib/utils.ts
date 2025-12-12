// lib/utils.ts

// 단일 모델명 정규화
export function normalizeModelName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

// 괄호 모델 확장 (썸네일 전용)
export function normalizeAndExpandModelNames(modelId: string): string[] {
  const candidates: string[] = [];
  const base = modelId.trim();

  candidates.push(base);

  // 괄호 제거 버전
  const noParen = base.replace(/[()]/g, "");
  if (noParen !== base) candidates.push(noParen);

  // (M) ↔ M ↔ 없음 변환
  if (/\(M\)$/.test(base)) {
    // FQ18FN7BK2(M) → FQ18FN7BK2M, FQ18FN7BK2
    candidates.push(base.replace(/\(M\)$/, "M"));
    candidates.push(base.replace(/\(M\)$/, ""));
  } else if (/M$/.test(base)) {
    // FQ18FN7BK2M → FQ18FN7BK2(M), FQ18FN7BK2
    candidates.push(base.replace(/M$/, "(M)"));
    candidates.push(base.replace(/M$/, ""));
  } else {
    // FQ18FN7BK2 → FQ18FN7BK2M, FQ18FN7BK2(M)
    candidates.push(base + "M");
    candidates.push(base + "(M)");
  }

  return Array.from(new Set(candidates));
}


