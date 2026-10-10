import { createServer } from "node:http";
import { type AddressInfo } from "node:net";

import { expect, test } from "@playwright/test";

import { getAccessToken } from "./editor-helpers";

test.describe("fixture login transport", () => {
  test.describe.configure({ retries: 0 });

  for (const scenario of [
    "reset once",
    "reset always",
    "unauthorized",
  ] as const) {
    test(scenario, async ({ request }) => {
      let attempts = 0;
      const server = createServer((incoming, response) => {
        attempts++;
        if (
          scenario === "reset always" ||
          (scenario === "reset once" && attempts === 1)
        ) {
          incoming.socket.destroy();
          return;
        }
        response.writeHead(scenario === "unauthorized" ? 401 : 200, {
          "Content-Type": "application/json",
        });
        response.end(JSON.stringify({ access_token: "fixture-token" }));
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const previousURL = process.env.STA_BACKEND_URL;
      process.env.STA_BACKEND_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      try {
        if (scenario === "reset once") {
          await expect(getAccessToken({ request })).resolves.toBe(
            "fixture-token",
          );
          expect(attempts).toBe(2);
        } else {
          await expect(getAccessToken({ request })).rejects.toThrow();
          expect(attempts).toBe(scenario === "reset always" ? 3 : 1);
        }
      } finally {
        if (previousURL === undefined) delete process.env.STA_BACKEND_URL;
        else process.env.STA_BACKEND_URL = previousURL;
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });
  }
});
