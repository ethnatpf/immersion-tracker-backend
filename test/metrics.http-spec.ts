import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createAuthFixture } from "./helpers/auth.fixture.js";
import { createTestApp } from "./helpers/create-test-app.js";

describe("Metrics authentication", () => {
  let app: INestApplication;
  let fixture: ReturnType<typeof createAuthFixture>;
  const metricsToken = "test-metrics-secret";

  beforeAll(async () => {
    fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization);
  });

  beforeEach(() => {
    vi.stubEnv("METRICS_TOKEN", metricsToken);
  });

  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => app?.close());

  it("returns Prometheus metrics with the configured bearer token", async () => {
    const response = await request(app.getHttpServer())
      .get("/metrics")
      .set("Authorization", `Bearer ${metricsToken}`)
      .expect(200)
      .expect("Content-Type", /text\/plain/);

    expect(response.text).toContain("# HELP process_cpu_user_seconds_total");
  });

  it.each([
    undefined,
    "Bearer wrong-token",
    "Bearer test-metrics-secreu",
    "Basic test-metrics-secret",
    "test-metrics-secret",
    "Bearer test-metrics-secret extra",
  ])("rejects missing or invalid credentials: %s", async (header) => {
    const req = request(app.getHttpServer()).get("/metrics");
    if (header) req.set("Authorization", header);
    await req.expect(401);
  });

  it("rejects an Auth0 JWT on the metrics endpoint", async () => {
    await request(app.getHttpServer())
      .get("/metrics")
      .set("Authorization", `Bearer ${fixture.createToken()}`)
      .expect(401);
  });

  it.each([undefined, ""])(
    "rejects requests when METRICS_TOKEN is %s",
    async (token) => {
      vi.stubEnv("METRICS_TOKEN", token);
      await request(app.getHttpServer())
        .get("/metrics")
        .set("Authorization", `Bearer ${metricsToken}`)
        .expect(401);
    },
  );

  it("does not accept the metrics token on user endpoints", async () => {
    await request(app.getHttpServer())
      .get("/user/preferences")
      .set("Authorization", `Bearer ${metricsToken}`)
      .expect(401);
  });
});
