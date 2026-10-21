import "reflect-metadata";
import {
  type INestApplication,
  InternalServerErrorException,
} from "@nestjs/common";
import { register } from "@prometheus-io/client";
import request from "supertest";
import { LanguageService } from "../../src/modules/language/language.service.js";
import { createAuthFixture } from "../helpers/auth.fixture.js";
import { createTestApp } from "../helpers/create-test-app.js";

describe("HTTP request metrics", () => {
  let app: INestApplication;
  let fixture: ReturnType<typeof createAuthFixture>;

  beforeAll(async () => {
    fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization);
  });

  beforeEach(() => {
    vi.stubEnv("METRICS_TOKEN", "test-metrics-secret");
    register.getSingleMetric("http_requests_total")?.reset();
    register.getSingleMetric("http_request_duration_seconds")?.reset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(async () => app?.close());

  async function scrape() {
    const response = await request(app.getHttpServer())
      .get("/metrics")
      .set("Authorization", "Bearer test-metrics-secret")
      .expect(200);
    return response.text as string;
  }

  function expectDuration(
    metrics: string,
    method: string,
    route: string,
    count: number,
  ) {
    const labels = `method="${method}",route="${route}"`;
    expect(metrics).toContain(
      `http_request_duration_seconds_count{${labels}} ${count}\n`,
    );
    const sum = metrics
      .split("\n")
      .find((line) =>
        line.startsWith(`http_request_duration_seconds_sum{${labels}} `),
      );
    const seconds = Number(sum?.split(" ").at(-1));
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThan(10);
    expect(metrics).toContain("http_request_duration_seconds_bucket{");
  }

  it("counts successful and unauthorized requests separately and times both", async () => {
    await request(app.getHttpServer()).get("/language").expect(401);
    await request(app.getHttpServer())
      .get("/language?ignored=value")
      .set("Authorization", `Bearer ${fixture.createToken()}`)
      .expect(200);

    const metrics = await scrape();
    expect(metrics).toContain("# TYPE http_requests_total counter");
    expect(metrics).toContain("# TYPE http_request_duration_seconds histogram");
    expect(metrics).toContain(
      'http_requests_total{method="GET",route="/language",status="401"} 1\n',
    );
    expect(metrics).toContain(
      'http_requests_total{method="GET",route="/language",status="200"} 1\n',
    );
    expectDuration(metrics, "GET", "/language", 2);
  });

  it("uses route templates rather than IDs or query strings", async () => {
    for (const id of ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]) {
      await request(app.getHttpServer())
        .get(`/content/${id}?q=private`)
        .expect(401);
    }

    const metrics = await scrape();
    expect(metrics).toContain(
      'http_requests_total{method="GET",route="/content/:id",status="401"} 2\n',
    );
    expect(metrics).not.toContain("507f1f77bcf86cd79943901");
    expect(metrics).not.toContain("q=private");
    expectDuration(metrics, "GET", "/content/:id", 2);
  });

  it("records validation failures with the HTTP method and final status", async () => {
    await request(app.getHttpServer())
      .post("/content")
      .set("Authorization", `Bearer ${fixture.createToken()}`)
      .send({})
      .expect(400);

    const metrics = await scrape();
    expect(metrics).toContain(
      'http_requests_total{method="POST",route="/content",status="400"} 1\n',
    );
    expectDuration(metrics, "POST", "/content", 1);
  });

  it("records server errors", async () => {
    vi.spyOn(app.get(LanguageService), "findAll").mockRejectedValueOnce(
      new InternalServerErrorException(),
    );
    await request(app.getHttpServer())
      .get("/language")
      .set("Authorization", `Bearer ${fixture.createToken()}`)
      .expect(500);

    const metrics = await scrape();
    expect(metrics).toContain(
      'http_requests_total{method="GET",route="/language",status="500"} 1\n',
    );
    expectDuration(metrics, "GET", "/language", 1);
  });

  it("groups unknown paths under a bounded unmatched label", async () => {
    await request(app.getHttpServer()).get("/unknown-one").expect(404);
    await request(app.getHttpServer()).get("/unknown-two").expect(404);

    const metrics = await scrape();
    expect(metrics).toContain(
      'http_requests_total{method="GET",route="unmatched",status="404"} 2\n',
    );
    expect(metrics).not.toContain("unknown-one");
    expect(metrics).not.toContain("unknown-two");
    expectDuration(metrics, "GET", "unmatched", 2);
  });

  it("counts scrapes once their responses finish", async () => {
    await scrape();
    const metrics = await scrape();
    expect(metrics).toContain(
      'http_requests_total{method="GET",route="/metrics",status="200"} 1\n',
    );
    expectDuration(metrics, "GET", "/metrics", 1);
  });
});
