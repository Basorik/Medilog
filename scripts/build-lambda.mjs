// Bundles the relay for AWS Lambda into dist-lambda/relay.zip (one ESM file).
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { build } from "esbuild";

rmSync("dist-lambda", { recursive: true, force: true });
mkdirSync("dist-lambda");
await build({
  entryPoints: ["server/lambda.ts"],
  outfile: "dist-lambda/index.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  // Some dependencies are CommonJS and call require(); give ESM a require.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
execFileSync("zip", ["-q", "-j", "dist-lambda/relay.zip", "dist-lambda/index.mjs"]);
console.log(`dist-lambda/relay.zip ${(statSync("dist-lambda/relay.zip").size / 1024).toFixed(0)} KB`);
