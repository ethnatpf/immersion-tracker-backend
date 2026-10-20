import "reflect-metadata";
import { type INestApplication, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import request from "supertest";
import { LanguageService } from "../../src/modules/language/language.service.js";
import { createAuthFixture } from "../helpers/auth.fixture.js";
import { createTestApp } from "../helpers/create-test-app.js";

describe("Request logging", () => {
  let app: INestApplication;
  let fixture: ReturnType<typeof createAuthFixture>;
  let records: Record<string, unknown>[];

  beforeAll(async () => {
    fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization);
    SwaggerModule.setup("api", app, () =>
      SwaggerModule.createDocument(app, new DocumentBuilder().build()),
    );
  });

  beforeEach(() => {
    records = [];
    for (const stream of [process.stdout, process.stderr]) {
      vi.spyOn(stream, "write").mockImplementation((chunk) => {
        for (const line of String(chunk).trim().split("\n")) {
          try {
            records.push(JSON.parse(line) as Record<string, unknown>);
          } catch {
            // Ignore unrelated test runner output; assertions require JSON logs.
          }
        }
        return true;
      });
    }
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => app?.close());

  const completions = () =>
    records.filter((record) => record.message === "HTTP request completed");

  it.each([
    {
      method: "get",
      path: "/language?private=secret",
      route: "/language",
      status: 200,
      auth: true,
    },
    {
      method: "get",
      path: "/content/507f1f77bcf86cd799439011?private=secret",
      route: "/content/:id",
      status: 401,
      auth: false,
    },
    {
      method: "post",
      path: "/content",
      route: "/content",
      status: 400,
      auth: true,
    },
    {
      method: "get",
      path: "/unknown?private=secret",
      route: "unmatched",
      status: 404,
      auth: false,
    },
  ] as const)(
    "logs $status responses with final request details",
    async ({ method, path, route, status, auth }) => {
      const req = request(app.getHttpServer())[method](path);
      if (auth) req.set("Authorization", `Bearer ${fixture.createToken()}`);
      if (method === "post") req.send({});
      const response = await req.expect(status);

      expect(completions()).toHaveLength(1);
      expect(completions()[0]).toMatchObject({
        requestId: response.headers["x-request-id"],
        method: method.toUpperCase(),
        route,
        status,
        level: "log",
      });
      expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
      expect(completions()[0]?.durationMs).toEqual(expect.any(Number));
      expect(Number(completions()[0]?.durationMs)).toBeGreaterThan(0);
      expect(JSON.stringify(completions())).not.toContain("secret");
      expect(JSON.stringify(completions())).not.toContain(
        "507f1f77bcf86cd799439011",
      );
    },
  );

  it("generates a unique UUID instead of trusting incoming IDs", async () => {
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .get("/language")
          .set("X-Request-ID", "supplied-id")
          .expect(401),
      ),
    );
    const ids = responses.map(
      (response) => response.headers["x-request-id"] as string,
    );
    for (const id of ids)
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    expect(new Set(ids).size).toBe(2);
    expect(completions()).toHaveLength(2);
    expect(new Set(completions().map((record) => record.requestId))).toEqual(
      new Set(ids),
    );
  });

  it("logs malformed JSON rejected before routing", async () => {
    const response = await request(app.getHttpServer())
      .post("/content")
      .set("Content-Type", "application/json")
      .send('{"invalid":')
      .expect(400);

    expect(completions()).toHaveLength(1);
    expect(completions()[0]).toMatchObject({
      requestId: response.headers["x-request-id"],
      method: "POST",
      route: "unmatched",
      status: 400,
    });
  });

  it("correlates Nest errors and concurrent asynchronous requests without losing stacks", async () => {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(app.get(LanguageService), "findAll")
      .mockImplementationOnce(async () => {
        entered();
        await gate;
        throw new Error("first request failed");
      })
      .mockImplementationOnce(async () => {
        release();
        throw new Error("second request failed");
      });

    const first = request(app.getHttpServer())
      .get("/language")
      .set("Authorization", `Bearer ${fixture.createToken()}`)
      .expect(500)
      .then((response) => response);
    await started;
    const second = request(app.getHttpServer())
      .get("/language")
      .set("Authorization", `Bearer ${fixture.createToken()}`)
      .expect(500);
    const responses = await Promise.all([first, second]);

    expect(completions()).toHaveLength(2);
    for (const [index, response] of responses.entries()) {
      const id: unknown = response.headers["x-request-id"];
      const errors = records.filter(
        (record) => record.level === "error" && record.requestId === id,
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        context: "ExceptionsHandler",
        message: `${index === 0 ? "first" : "second"} request failed`,
      });
      expect(errors[0]?.error).toMatchObject({
        stack: expect.stringContaining("request-logging.http-spec.ts"),
      });
      expect(
        completions().filter((record) => record.requestId === id),
      ).toHaveLength(1);
    }
  });

  it.each([
    "/metrics",
    "/api",
    "/api/",
    "/api/swagger-ui.css",
    "/api-json",
    "/api-yaml",
  ])("assigns an ID but omits completion logs for %s", async (path) => {
    const response = await request(app.getHttpServer()).get(path);
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(completions()).toHaveLength(0);
  });

  it("emits parseable startup logs without a request ID", () => {
    new Logger("StartupProbe").log("Ready");
    expect(records).toContainEqual(
      expect.objectContaining({ message: "Ready", context: "StartupProbe" }),
    );
    expect(
      records.find((record) => record.message === "Ready"),
    ).not.toHaveProperty("requestId");
  });
});
