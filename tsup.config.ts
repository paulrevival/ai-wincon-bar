import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  banner: { js: "#!/usr/bin/env node" },
  bundle: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: false,
});
