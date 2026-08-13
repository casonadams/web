import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("web configuration", () => {
  it("ignores retired tuning environment variables", async () => {
    vi.stubEnv("WEB_FETCH_TIMEOUT", "99");
    vi.resetModules();

    const { config } = await import("./config.ts");

    expect(config.fetchTimeout).toBe(8);
  });

  it("reads the supported environment variables", async () => {
    vi.stubEnv("WEB_REGION", "US-EN");
    vi.stubEnv("WEB_ALLOW_PRIVATE_NETWORK", "yes");
    vi.resetModules();

    const { config } = await import("./config.ts");

    expect(config.region).toBe("us-en");
    expect(config.allowPrivateNetwork).toBe(true);
  });
});
