import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createAuthFixture } from "./helpers/auth.fixture.js";
import { createTestApp } from "./helpers/create-test-app.js";

// Add each protected endpoint here, using concrete values for path parameters.
const protectedRoutes: {
  method: "get" | "post" | "put" | "patch" | "delete" | "head" | "options";
  path: string;
}[] = [
  { method: "get", path: "/language" },
  { method: "post", path: "/content" },
  { method: "post", path: "/timer/start" },
  { method: "post", path: "/timer/stop" },
  { method: "post", path: "/immersion-session" },
  { method: "get", path: "/immersion-session" },
  { method: "delete", path: "/immersion-session/507f1f77bcf86cd799439011" },
  { method: "patch", path: "/immersion-session/507f1f77bcf86cd799439011" },
  { method: "get", path: "/content/search" },
  { method: "get", path: "/content/507f1f77bcf86cd799439011" },
  { method: "patch", path: "/content/507f1f77bcf86cd799439011" },
];

describe("Protected routes", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(createAuthFixture().authorization);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe.each(protectedRoutes)("$method $path", ({ method, path }) => {
    it("rejects missing credentials", async () => {
      await request(app.getHttpServer())[method](path).expect(401);
    });

    it("rejects an invalid token", async () => {
      await request(app.getHttpServer())
        [method](path)
        .set("Authorization", "Bearer not-a-jwt")
        .expect(401);
    });
  });
});
