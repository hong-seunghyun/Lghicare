import type { NextApiRequest, NextApiResponse } from "next";
import { resetProductCache } from "@/lib/admin/productCacheActions";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return resetProductCache(req, res, "drive");
}
