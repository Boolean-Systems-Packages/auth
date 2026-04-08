import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  // @boolean/api-auth y @boolean/http se bundlean adentro.
  // El consumidor instala solo @boolean/auth y tiene todo.
  noExternal: ["@boolean/api-auth", "@boolean/http"],
});
