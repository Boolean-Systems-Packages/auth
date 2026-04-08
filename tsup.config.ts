import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  // @boolean-systems-packages/api-auth y @boolean-systems-packages/http se bundlean adentro.
  // El consumidor instala solo @boolean-systems-packages/auth y tiene todo.
  noExternal: ["@boolean-systems-packages/api-auth", "@boolean-systems-packages/http"],
});
