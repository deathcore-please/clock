import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { createMockDashboardState } from "./src/mocks/dashboard";

function mockDashboardApi(enabled: boolean): Plugin {
  return {
    name: "wall-clock-mock-api",
    configureServer(server) {
      if (!enabled) {
        return;
      }

      server.middlewares.use("/api/state", (_request, response) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(JSON.stringify(createMockDashboardState()));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const mockEnabled = env.VITE_WEATHER_MOCK !== "false";

  return {
    plugins: [react(), mockDashboardApi(mockEnabled)],
  };
});
