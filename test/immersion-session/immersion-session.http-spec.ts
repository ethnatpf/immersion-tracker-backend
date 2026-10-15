import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createAuthFixture } from "../helpers/auth.fixture.js";
import { ImmersionSessionService } from "~/modules/immersion-session/immersion-session.service.js";
import { createTestApp } from "../helpers/create-test-app.js";

describe("POST /immersion-session", () => {
  let app: INestApplication;
  let token: string;
  let userId: string;
  let createToken: ReturnType<typeof createAuthFixture>["createToken"];
  const input = { content: "507f1f77bcf86cd799439011", duration: 1200 };
  const otherContent = "507f1f77bcf86cd799439012";
  const missingContent = "507f1f77bcf86cd799439013";
  const progress = { unit: "episode", start: 1, end: 3 };

  beforeAll(async () => {
    const fixture = createAuthFixture();
    createToken = fixture.createToken;
    userId = fixture.userId;
    token = fixture.createToken();
    app = await createTestApp(fixture.authorization, {
      contents: [
        { _id: input.content, user_id: userId },
        { _id: otherContent, user_id: "auth0|other-user" },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    token = createToken();
  });

  afterAll(async () => {
    await app?.close();
  });

  function post(body: object) {
    return request(app.getHttpServer())
      .post("/immersion-session")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  function spyOnCreate() {
    return vi.spyOn(app.get(ImmersionSessionService), "create");
  }

  it("returns the created session and passes the verified subject to the service", async () => {
    const create = spyOnCreate();
    const response = await post(input).expect(201);
    expect(create).toHaveBeenCalledExactlyOnceWith(input, userId);
    expect(response.body).toMatchObject({ ...input, user_id: userId });
  });

  it("ignores a body-supplied owner", async () => {
    const response = await post({
      ...input,
      user_id: "auth0|someone-else",
    }).expect(201);
    expect(response.body.user_id).toBe(userId);
  });

  it("accepts the minimum duration with optional fields omitted", async () => {
    const response = await post({ ...input, duration: 1 }).expect(201);
    expect(response.body.duration).toBe(1);
    expect(response.body.progress).toBeUndefined();
  });

  it.each(["content", "duration"] as const)("requires %s", async (field) => {
    const body: Record<string, unknown> = { ...input };
    delete body[field];
    await post(body).expect(400);
  });

  it.each(
    [
      null,
      "",
      42,
      true,
      [],
      {},
      "not-an-id",
      "abcdefghijkl",
      "507f1f77bcf86cd79943901",
      "507f1f77bcf86cd7994390110",
      "507f1f77bcf86cd79943901z",
    ].map((content) => ({ content })),
  )("rejects invalid content $content", async ({ content }) => {
    await post({ ...input, content }).expect(400);
  });

  it.each(
    [null, 0, -1, 1.5, "1200", "", true, [], {}].map((duration) => ({
      duration,
    })),
  )("rejects invalid duration $duration", async ({ duration }) => {
    await post({ ...input, duration }).expect(400);
  });

  it.each([missingContent, otherContent])(
    "rejects inaccessible content %s",
    async (content) => {
      const response = await post({ ...input, content }).expect(400);
      expect(response.body.message).toBe("Content does not exist");
    },
  );

  it.each(["episode", "page"])(
    "accepts %s progress with equal or ranged bounds",
    async (unit) => {
      for (const end of [1, 3]) {
        const metadata = { unit, start: 1, end };
        const response = await post({ ...input, progress: metadata }).expect(
          201,
        );
        expect(response.body.progress).toEqual(metadata);
      }
    },
  );

  it.each(
    [
      null,
      "episode",
      1,
      true,
      [],
      {},
      { start: 1, end: 3 },
      { unit: "episode", end: 3 },
      { unit: "episode", start: 1 },
      ...[null, "chapter", "EPISODE", 1, [], {}].map((unit) => ({
        ...progress,
        unit,
      })),
      ...["start", "end"].flatMap((field) =>
        [null, 0, -1, 1.5, "1", true, [], {}].map((value) => ({
          ...progress,
          [field]: value,
        })),
      ),
      { ...progress, start: 3, end: 2 },
    ].map((value) => ({ value })),
  )("rejects invalid progress $value", async ({ value }) => {
    await post({ ...input, progress: value }).expect(400);
  });

  describe("calendar dates", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-13T12:34:56.789Z"));
      token = createToken();
    });

    it.each(["2026-10-13", "2020-01-02", "2024-02-29"])(
      "accepts %s and returns midnight UTC",
      async (created_at) => {
        const response = await post({ ...input, created_at }).expect(201);
        expect(response.body.created_at).toBe(`${created_at}T00:00:00.000Z`);
      },
    );

    it.each(
      [
        null,
        "",
        42,
        true,
        [],
        {},
        "2026-10-14",
        "2026-02-29",
        "2024-02-30",
        "2026-04-31",
        "2026-00-01",
        "2026-13-01",
        "2026-01-00",
        "2026-1-2",
        "13/10/2026",
        "not-a-date",
        " 2026-10-13 ",
        "2026-10-13T00:00:00Z",
        "2026-10-13T00:00:00-04:00",
        "2026-10-13T12:00:00",
      ].map((created_at) => ({ created_at })),
    )("rejects invalid date $created_at", async ({ created_at }) => {
      await post({ ...input, created_at }).expect(400);
    });

    it.each(["2026-10-13T00:00:00.001Z", "2026-10-13T23:59:59.999Z"])(
      "uses the UTC calendar day at %s",
      async (now) => {
        vi.setSystemTime(new Date(now));
        token = createToken();
        const response = await post(input).expect(201);
        expect(response.body.created_at).toBe("2026-10-13T00:00:00.000Z");
        await post({ ...input, created_at: "2026-10-13" }).expect(201);
        await post({ ...input, created_at: "2026-10-14" }).expect(400);
      },
    );
  });

  it.each([
    { ...input, content: "not-an-id" },
    { ...input, duration: 0 },
    { ...input, progress: { ...progress, end: 0 } },
    { ...input, created_at: "not-a-date" },
  ])("rejects invalid input before invoking the service: %j", async (body) => {
    const create = spyOnCreate();
    await post(body).expect(400);
    expect(create).not.toHaveBeenCalled();
  });
});
