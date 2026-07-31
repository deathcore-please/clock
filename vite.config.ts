import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { createMockBusState } from "./src/mocks/bus";
import { createMockDashboardState } from "./src/mocks/dashboard";
import type { BusMockScenario } from "./src/types/bus";

const busScenarios = new Set<BusMockScenario>([
  "station",
  "outbound",
  "inbound",
  "stale",
  "untracked",
]);

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

      server.middlewares.use("/api/bus-state", (request, response) => {
        const requestUrl = new URL(request.url || "/", "http://localhost");
        const requested = requestUrl.searchParams.get("scenario") as BusMockScenario | null;
        const scenario = requested && busScenarios.has(requested) ? requested : "station";
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(JSON.stringify(createMockBusState(scenario)));
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
