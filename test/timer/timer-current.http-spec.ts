import "reflect-metadata";
import { NotFoundException, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { TimerService } from "~/modules/timer/timer.service.js";
import { createAuthFixture } from "../helpers/auth.fixture.js";
import { createTestApp } from "../helpers/create-test-app.js";

describe("GET /timer", () => {
  let app: INestApplication;
  let fixture: ReturnType<typeof createAuthFixture>;
  const result = {
    id: "507f1f77bcf86cd799439015",
    content_id: "507f1f77bcf86cd799439011",
    title: "The Forest Chronicles",
    type: "book",
    started_at: "2026-10-15T12:34:56.789Z",
  };
  // Mock service results only; database tests exercise lookup and ownership.
  const getCurrent = vi.fn();

  beforeAll(async () => {
    fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization);
    Object.assign(app.get(TimerService), { getCurrent });
  });

  beforeEach(() => {
    getCurrent.mockReset();
    getCurrent.mockResolvedValue(result);
  });

  afterAll(async () => {
    await app?.close();
  });

  function get(subject = fixture.userId) {
    return request(app.getHttpServer())
      .get("/timer")
      .set("Authorization", `Bearer ${fixture.createToken({ sub: subject })}`);
  }

  it("returns the current timer and content details without requiring an id", async () => {
    const response = await get().expect(200);
    expect(response.body).toEqual(result);
    expect(getCurrent).toHaveBeenCalledExactlyOnceWith(fixture.userId);
  });

  it("returns 404 when the authenticated user has no active timer", async () => {
    getCurrent.mockRejectedValueOnce(new NotFoundException("No active timer"));
    const response = await get().expect(404);
    expect(response.body).toMatchObject({ statusCode: 404 });
    expect(getCurrent).toHaveBeenCalledExactlyOnceWith(fixture.userId);
  });

  it("ignores user and timer ids supplied in the query or body", async () => {
    await get()
      .query({
        user_id: "auth0|other-user",
        timer_id: "507f1f77bcf86cd799439012",
      })
      .send({
        user_id: "auth0|other-user",
        timer_id: "507f1f77bcf86cd799439012",
      })
      .expect(200);
    expect(getCurrent).toHaveBeenCalledExactlyOnceWith(fixture.userId);
  });

  it("uses the subject of a different authenticated user", async () => {
    const otherUserId = "auth0|other-user";
    await get(otherUserId).expect(200);
    expect(getCurrent).toHaveBeenCalledExactlyOnceWith(otherUserId);
  });
});
