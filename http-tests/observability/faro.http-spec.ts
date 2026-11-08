import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createAuthFixture } from "../helpers/auth.fixture.js";
import { createTestApp } from "../helpers/create-test-app.js";

describe("Faro collection", () => {
  let app: INestApplication;
  let fixture: ReturnType<typeof createAuthFixture>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization);
  });

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => app?.close());

  it("replaces client user metadata and forwards the payload to Alloy", async () => {
    const payload = {
      meta: {
        app: { name: "immersion-tracker" },
        user: { id: "spoofed", email: "attacker@example.com", role: "admin" },
      },
      events: [{ type: "log", message: "Playback failed" }],
    };

    const response = await request(app.getHttpServer())
      .post("/observability/faro/collect")
      .set("Authorization", `Bearer ${fixture.createToken()}`)
      .send(payload)
      .expect(202);

    expect(response.body).toEqual({ accepted: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:12347/collect");
    expect(JSON.parse(String(options.body))).toEqual({
      ...payload,
      meta: {
        app: payload.meta.app,
        user: { id: fixture.userId },
      },
    });
  });

  it("limits requests per authenticated user to 50 per 30 seconds", async () => {
    const token = fixture.createToken({ sub: "auth0|faro-request-limit" });
    const send = () =>
      request(app.getHttpServer())
        .post("/observability/faro/collect")
        .set("Authorization", `Bearer ${token}`)
        .send({ meta: {}, events: [] });

    const responses = await Promise.all(
      Array.from({ length: 50 }, () => send()),
    );
    expect(responses.every(({ status }) => status === 202)).toBe(true);
    await send().expect(429);
    expect(fetchMock).toHaveBeenCalledTimes(50);
  });

  it("limits accepted payload bytes per user to 2 MiB per minute", async () => {
    const token = fixture.createToken({ sub: "auth0|faro-byte-limit" });
    const send = (size: number) =>
      request(app.getHttpServer())
        .post("/observability/faro/collect")
        .set("Authorization", `Bearer ${token}`)
        .send({ meta: {}, events: [{ message: "x".repeat(size) }] });

    await send(1_100_000).expect(202);
    await send(1_000_000).expect(429);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
