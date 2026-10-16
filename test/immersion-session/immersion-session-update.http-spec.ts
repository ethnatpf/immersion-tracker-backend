import "reflect-metadata";
import { NotFoundException, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { Mongoose } from "mongoose";
import { ImmersionSessionService } from "../../src/modules/immersion-session/immersion-session.service.js";
import {
  ImmersionSession,
  ImmersionSessionSchema,
} from "../../src/modules/immersion-session/schemas/immersion-session.schema.js";
import { createAuthFixture } from "../helpers/auth.fixture.js";
import { createTestApp } from "../helpers/create-test-app.js";

describe("PATCH /immersion-session/:id", () => {
  let app: INestApplication;
  let token: string;
  let userId: string;
  const update = vi.fn<ImmersionSessionService["update"]>();
  const sessionModel = new Mongoose().model(
    ImmersionSession.name,
    ImmersionSessionSchema,
  );
  const sessionId = "507f1f77bcf86cd799439011";
  const result = {
    _id: sessionId,
    content: "507f1f77bcf86cd799439012",
    user_id: "auth0|test-user",
    created_at: "2024-02-29T00:00:00.000Z",
    duration: 1200,
    progress: { unit: "episode", start: 1, end: 3 },
  };

  beforeAll(async () => {
    const fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization);
    userId = fixture.userId;
    // Keep MongoDB persistence and ownership checks in the integration suite.
    Object.assign(app.get(ImmersionSessionService), { update });
    // Freeze Date only, leaving HTTP timers running normally.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
    token = fixture.createToken();
  });

  beforeEach(() => {
    update.mockReset();
    update.mockResolvedValue(new sessionModel({ ...result, __v: 0 }));
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app?.close();
  });

  function patch(id = sessionId) {
    return request(app.getHttpServer())
      .patch(`/immersion-session/${id}`)
      .set("Authorization", `Bearer ${token}`);
  }

  it.each([
    { created_at: "2024-02-29" },
    { duration: 1 },
    { duration: 1800 },
    { created_at: "2026-10-15", duration: 1800 },
    { progress: { start: 1, end: 1 } },
    { progress: { start: 1, end: 3 } },
    { progress: { unit: "episode", start: 1, end: 3 } },
    { progress: { unit: "page", start: 1, end: 3 } },
    {
      created_at: "2024-02-29",
      duration: 1800,
      progress: { start: 1, end: 3 },
    },
  ])(
    "accepts a partial update and passes the verified identity: %j",
    async (input) => {
      const response = await patch().send(input).expect(200);
      expect(response.body).toEqual(result);
      expect(update).toHaveBeenCalledExactlyOnceWith(
        sessionId,
        expect.objectContaining(input),
        userId,
      );
      const forwarded = update.mock.calls[0]![1];
      for (const field of ["created_at", "duration", "progress"] as const) {
        if (!(field in input)) expect(forwarded[field]).toBeUndefined();
      }
    },
  );

  it("uses the JWT subject despite an owner supplied in the body and query", async () => {
    await patch()
      .query({ user_id: "auth0|another-user" })
      .send({ duration: 1800, user_id: "auth0|another-user" })
      .expect(200);
    expect(update).toHaveBeenCalledExactlyOnceWith(
      sessionId,
      expect.objectContaining({ duration: 1800 }),
      userId,
    );
  });

  it("returns 404 when the service cannot find an owned session", async () => {
    update.mockRejectedValueOnce(new NotFoundException());
    await patch().send({ duration: 1800 }).expect(404);
    expect(update).toHaveBeenCalledExactlyOnceWith(
      sessionId,
      expect.objectContaining({ duration: 1800 }),
      userId,
    );
  });

  it.each([
    "not-an-id",
    "abcdefghijkl",
    "507f1f77bcf86cd79943901",
    "507f1f77bcf86cd7994390110",
    "507f1f77bcf86cd79943901z",
  ])(
    "rejects invalid session ID %s before invoking the service",
    async (id) => {
      await patch(id).send({ duration: 1800 }).expect(400);
      expect(update).not.toHaveBeenCalled();
    },
  );

  it.each(
    [null, 0, -1, 1.5, "1200", "", true, [], {}].map((duration) => ({
      duration,
    })),
  )(
    "rejects invalid duration $duration before invoking the service",
    async (body) => {
      await patch().send(body).expect(400);
      expect(update).not.toHaveBeenCalled();
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
      { start: 1 },
      { end: 3 },
      ...["start", "end"].flatMap((field) =>
        [null, 0, -1, 1.5, "1", true, [], {}].map((value) => ({
          start: 1,
          end: 3,
          [field]: value,
        })),
      ),
      { start: 3, end: 2 },
      ...[null, "chapter", "EPISODE", 1, true, [], {}].map((unit) => ({
        unit,
        start: 1,
        end: 3,
      })),
    ].map((progress) => ({ progress })),
  )(
    "rejects invalid or incomplete progress $progress before invoking the service",
    async (body) => {
      await patch().send(body).expect(400);
      expect(update).not.toHaveBeenCalled();
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
      "2026-10-16",
      "2026-02-29",
      "2024-02-30",
      "2026-04-31",
      "2026-00-01",
      "2026-13-01",
      "2026-01-00",
      "2026-1-2",
      "15/10/2026",
      "not-a-date",
      " 2026-10-15 ",
      "2026-10-15T00:00:00Z",
      "2026-10-15T00:00:00-04:00",
    ].map((created_at) => ({ created_at })),
  )(
    "rejects invalid date $created_at before invoking the service",
    async (body) => {
      await patch().send(body).expect(400);
      expect(update).not.toHaveBeenCalled();
    },
  );
});
