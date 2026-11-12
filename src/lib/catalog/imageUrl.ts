export function isPublishedProductImage(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "firebasestorage.googleapis.com" &&
      /^\/v0\/b\/[^/]+\/o\/product-assets%2f/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
