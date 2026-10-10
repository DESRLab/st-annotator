import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "http://localhost:8000/openapi.json",
  output: "client",
  plugins: [
    // baseUrl is owned by the runtime (STA_BACKEND_URL / window.STA_API_BASE_URL),
    // so no URL is baked into the generated client.
    { name: "@hey-api/client-fetch", baseUrl: false },
    "@hey-api/sdk",
  ],
});
