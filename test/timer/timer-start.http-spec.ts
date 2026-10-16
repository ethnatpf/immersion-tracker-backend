import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Mongoose } from "mongoose";
import { Timer, TimerSchema } from "~/modules/timer/schemas/timer.schema.js";
import { TimerService } from "~/modules/timer/timer.service.js";
import { createAuthFixture } from "../helpers/auth.fixture.js";
import { createTestApp } from "../helpers/create-test-app.js";

describe("POST /timer/start", () => {
  let app: INestApplication;
  let fixture: ReturnType<typeof createAuthFixture>;
  let token: string;
  const content = "507f1f77bcf86cd799439011";
  const secondContent = "507f1f77bcf86cd799439012";
  const otherContent = "507f1f77bcf86cd799439013";
  const missingContent = "507f1f77bcf86cd799439014";
  const otherUserId = "auth0|other-user";
  const now = "2026-10-15T12:34:56.789Z";

  beforeAll(() => {
    fixture = createAuthFixture();
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    token = fixture.createToken();
    app = await createTestApp(fixture.authorization, {
      contents: [
        { _id: content, user_id: fixture.userId },
        { _id: secondContent, user_id: fixture.userId },
        { _id: otherContent, user_id: otherUserId },
      ],
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app?.close();
  });

  function post(body: object, bearer = token) {
    return request(app.getHttpServer())
      .post("/timer/start")
      .set("Authorization", `Bearer ${bearer}`)
      .send(body);
  }

  it("returns a timer for existing content with the verified owner and current time", async () => {
    const response = await post({ content }).expect(201);
    expect(response.body).toMatchObject({
      content,
      user_id: fixture.userId,
      started_at: now,
    });
    expect(response.body._id).toMatch(/^[a-f\d]{24}$/i);
  });

  it("ignores a body-supplied owner and start date", async () => {
    const response = await post({
      content,
      user_id: otherUserId,
      started_at: "2000-01-01T00:00:00.000Z",
    }).expect(201);
    expect(response.body.user_id).toBe(fixture.userId);
    expect(response.body.started_at).toBe(now);
  });

  it("omits the stored document version from the timer response", async () => {
    const model = new Mongoose().model(Timer.name, TimerSchema);
    const timer = new model({ content, user_id: fixture.userId, __v: 0 });
    const start = vi
      .spyOn(app.get(TimerService), "start")
      .mockResolvedValueOnce(timer);
    try {
      const response = await post({ content }).expect(201);
      expect(response.body).toMatchObject({
        content,
        user_id: fixture.userId,
        started_at: now,
      });
      expect(response.body).not.toHaveProperty("__v");
      expect(timer.__v).toBe(0);
    } finally {
      start.mockRestore();
    }
  });

  it("requires content", async () => {
    await post({}).expect(400);
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
    ].map((value) => ({ value })),
  )("rejects invalid content $value", async ({ value }) => {
    await post({ content: value }).expect(400);
  });

  it.each([missingContent, otherContent])(
    "rejects inaccessible content %s and allows a subsequent valid start",
    async (id) => {
      const response = await post({ content: id }).expect(400);
      expect(response.body.message).toBe("Content does not exist");
      await post({ content }).expect(201);
    },
  );

  it.each([content, secondContent])(
    "rejects a second timer for content %s while one is running",
    async (id) => {
      await post({ content }).expect(201);
      await post({ content: id }).expect(409);
    },
  );

  it("allows different users to each have a running timer", async () => {
    await post({ content }).expect(201);
    const response = await post(
      { content: otherContent },
      fixture.createToken({ sub: otherUserId }),
    ).expect(201);
    expect(response.body.user_id).toBe(otherUserId);
    expect(response.body.content).toBe(otherContent);
  });
});
