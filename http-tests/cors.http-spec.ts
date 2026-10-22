import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createAuthFixture } from "./helpers/auth.fixture.js";
import { createTestApp } from "./helpers/create-test-app.js";

describe("CORS", () => {
  let app: INestApplication;
  let token: string;
  const frontendUrl = "https://frontend.example.com";

  beforeEach(() => {
    vi.stubEnv("FRONTEND_URL", frontendUrl);
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  async function startApp() {
    const fixture = createAuthFixture();
    token = fixture.createToken();
    app = await createTestApp(fixture.authorization);
  }

  it("allows authenticated requests from the configured frontend", async () => {
    await startApp();
    const response = await request(app.getHttpServer())
      .get("/language")
      .set("Origin", frontendUrl)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBe(frontendUrl);
  });

  it("handles preflight requests with authorization and JSON headers", async () => {
    await startApp();
    const response = await request(app.getHttpServer())
      .options("/content")
      .set("Origin", frontendUrl)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe(frontendUrl);
    expect(
      response.headers["access-control-allow-methods"].split(","),
    ).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toBe(
      "authorization,content-type",
    );
  });

  it("does not allow other origins", async () => {
    await startApp();
    const response = await request(app.getHttpServer())
      .get("/language")
      .set("Origin", "https://other.example.com")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("preserves authentication for requests from the frontend", async () => {
    await startApp();
    const response = await request(app.getHttpServer())
      .get("/language")
      .set("Origin", frontendUrl)
      .expect(401);

    expect(response.headers["access-control-allow-origin"]).toBe(frontendUrl);
  });

  it("does not enable cross-origin access when FRONTEND_URL is unset", async () => {
    vi.stubEnv("FRONTEND_URL", undefined);
    await startApp();
    const response = await request(app.getHttpServer())
      .get("/language")
      .set("Origin", frontendUrl)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
