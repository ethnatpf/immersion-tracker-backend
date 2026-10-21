import "reflect-metadata";
import { createPublicKey } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
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

  it("caches issuer discovery and signing keys across authenticated requests", async () => {
    const fetches: string[] = [];
    const jwk = createPublicKey(fixture.authorization.publicKey as string).export({
      format: "jwk",
    });
    const issuerServer = createServer((req, res) => {
      fetches.push(req.url!);
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/.well-known/openid-configuration") {
        res.end(
          JSON.stringify({
            issuer,
            jwks_uri: `${issuer}.well-known/jwks.json`,
          }),
        );
      } else if (req.url === "/.well-known/jwks.json") {
        res.end(
          JSON.stringify({ keys: [{ ...jwk, alg: "RS256", use: "sig" }] }),
        );
      } else {
        res.writeHead(404).end();
      }
    });
    issuerServer.listen(0, "127.0.0.1");
    await once(issuerServer, "listening");
    const issuer = `http://127.0.0.1:${(issuerServer.address() as AddressInfo).port}/`;
    let cachedApp: INestApplication | undefined;
    try {
      const module = await Test.createTestingModule({
        controllers: [AuthTestController],
      }).compile();
      cachedApp = module.createNestApplication();
      configureApp(cachedApp, {
        authorization: {
          issuerBaseURL: issuer,
          audience: fixture.authorization.audience,
          tokenSigningAlg: "RS256",
        },
      });
      await cachedApp.init();

      for (const userId of [fixture.userId, "auth0|another-user"]) {
        await request(cachedApp.getHttpServer())
          .get("/test-auth")
          .set(
            "Authorization",
            `Bearer ${fixture.createToken({ iss: issuer, sub: userId })}`,
          )
          .expect(200, { userId });
      }

      expect(fetches).toEqual([
        "/.well-known/openid-configuration",
        "/.well-known/jwks.json",
      ]);
    } finally {
      await cachedApp?.close();
      await new Promise<void>((resolve, reject) => {
        issuerServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
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
