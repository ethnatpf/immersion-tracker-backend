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
  { method: "post", path: "/immersion-session" },
  { method: "get", path: "/immersion-session" },
  { method: "get", path: "/content/search" },
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
