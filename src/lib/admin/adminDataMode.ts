export type AdminDataMode = "real" | "demo";

// 9521% display policy for demo values.
export const DEMO_MULTIPLIER = 95.21;
export const DEMO_VISITOR_MULTIPLIER = 3;

export const isDemoMode = (mode: AdminDataMode) => mode === "demo";

const toSafeNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const scaleCountByMode = (value: unknown, mode: AdminDataMode) => {
  const numeric = toSafeNumber(value);
  if (!isDemoMode(mode)) return numeric;
  return Math.floor(numeric * DEMO_MULTIPLIER);
};

export const scaleVisitorCountByMode = (value: unknown, mode: AdminDataMode) => {
  const numeric = toSafeNumber(value);
  if (!isDemoMode(mode)) return numeric;
  return Math.floor(numeric * DEMO_VISITOR_MULTIPLIER);
};
