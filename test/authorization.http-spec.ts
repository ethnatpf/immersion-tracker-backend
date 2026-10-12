import "reflect-metadata";
import { Controller, Get, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { configureApp } from "../src/configure-app.js";
import { CurrentUserId } from "../src/decorators/current-user-id.decorator.js";
import { createAuthFixture } from "./helpers/auth.fixture.js";

@Controller("test-auth")
class AuthTestController {
  @Get()
  identity(@CurrentUserId() userId: string) {
    return { userId };
  }
}

describe("JWT authentication", () => {
  let app: INestApplication;
  let fixture: ReturnType<typeof createAuthFixture>;
  let otherIssuer: ReturnType<typeof createAuthFixture>;

  beforeAll(async () => {
    fixture = createAuthFixture();
    otherIssuer = createAuthFixture();
    const module = await Test.createTestingModule({
      controllers: [AuthTestController],
    }).compile();
    app = module.createNestApplication();
    configureApp(app, { authorization: fixture.authorization });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("accepts a valid token and exposes its subject", async () => {
    await request(app.getHttpServer())
      .get("/test-auth")
      .set("Authorization", `Bearer ${fixture.createToken()}`)
      .expect(200, { userId: fixture.userId });
  });

  it("rejects a missing token", async () => {
    await request(app.getHttpServer()).get("/test-auth").expect(401);
  });

  it.each([
    { name: "malformed token", token: () => "not-a-jwt" },
    {
      name: "tampered payload",
      token: () => {
        const [header, , signature] = fixture.createToken().split(".");
        const payload = Buffer.from(
          JSON.stringify({ sub: "attacker" }),
        ).toString("base64url");
        return `${header}.${payload}.${signature}`;
      },
    },
    { name: "untrusted signing key", token: () => otherIssuer.createToken() },
    {
      name: "expired token",
      token: () =>
        fixture.createToken({ exp: Math.floor(Date.now() / 1000) - 60 }),
    },
    {
      name: "future not-before time",
      token: () =>
        fixture.createToken({ nbf: Math.floor(Date.now() / 1000) + 60 }),
    },
    {
      name: "wrong issuer",
      token: () => fixture.createToken({ iss: "https://wrong.test/" }),
    },
    {
      name: "wrong audience",
      token: () => fixture.createToken({ aud: "another-api" }),
    },
    {
      name: "missing subject",
      token: () => fixture.createToken({ sub: undefined }),
    },
    { name: "empty subject", token: () => fixture.createToken({ sub: "" }) },
  ])("rejects $name", async ({ token }) => {
    await request(app.getHttpServer())
      .get("/test-auth")
      .set("Authorization", `Bearer ${token()}`)
      .expect(401);
  });
});
