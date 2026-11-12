import type { NextConfig } from "next";
import { dirname, relative } from "node:path";

const asyncFunctionFiles = `${relative(
  process.cwd(),
  dirname(require.resolve("async-function/package.json")),
).replace(/\\/g, "/")}/**/*`;

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    // Node 20's module-sync export is not discovered by Next 15's file tracer.
    "/*": [asyncFunctionFiles],
    "/api/spec/*": ["./src/spec/**/*"],
    "/api/admin/managers/import": ["./src/data/managerList.json"],
  },
  experimental: {},
  compiler: {
    styledComponents: true,
  },
};

export default nextConfig;
