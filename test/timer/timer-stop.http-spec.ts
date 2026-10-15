import "reflect-metadata";
import { NotFoundException, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { TimerService } from "~/modules/timer/timer.service.js";
import { createAuthFixture } from "../helpers/auth.fixture.js";
import { createTestApp } from "../helpers/create-test-app.js";

describe("POST /timer/stop", () => {
  let app: INestApplication;
  let fixture: ReturnType<typeof createAuthFixture>;
  const session = {
    _id: "507f1f77bcf86cd799439015",
    content: "507f1f77bcf86cd799439011",
    duration: 1200,
    user_id: "auth0|test-user",
    created_at: "2026-10-15T00:00:00.000Z",
  };
  // Exercise routing and the real guard; persistence is covered by integration tests.
  const stop = vi.fn();

  beforeAll(async () => {
    fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization);
    Object.assign(app.get(TimerService), { stop });
  });

  beforeEach(() => {
    stop.mockReset();
    stop.mockResolvedValue(session);
  });

  afterAll(async () => {
    await app?.close();
  });

  function post(subject = fixture.userId) {
    return request(app.getHttpServer())
      .post("/timer/stop")
      .set("Authorization", `Bearer ${fixture.createToken({ sub: subject })}`);
  }

  it("requires no timer id or body and returns the created session", async () => {
    const response = await post().expect(201);
    expect(response.body).toEqual(session);
    expect(stop).toHaveBeenCalledExactlyOnceWith(fixture.userId);
  });

  it("returns not found when the user has no active timer", async () => {
    stop.mockRejectedValueOnce(new NotFoundException("No active timer"));
    await post().expect(404);
    expect(stop).toHaveBeenCalledExactlyOnceWith(fixture.userId);
  });

  it("uses the token subject even when body and query target another user's timer", async () => {
    await post()
      .query({
        user_id: "auth0|other-user",
        timer_id: "507f1f77bcf86cd799439012",
      })
      .send({
        user_id: "auth0|other-user",
        timer_id: "507f1f77bcf86cd799439012",
        content: "507f1f77bcf86cd799439013",
        duration: 9999,
      })
      .expect(201);
    expect(stop).toHaveBeenCalledExactlyOnceWith(fixture.userId);
  });

  it("passes each authenticated user's own subject to the service", async () => {
    const otherUserId = "auth0|other-user";
    stop.mockResolvedValueOnce({ ...session, user_id: otherUserId });
    const response = await post(otherUserId).expect(201);
    expect(response.body.user_id).toBe(otherUserId);
    expect(stop).toHaveBeenCalledExactlyOnceWith(otherUserId);
  });
});
