import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DashboardService } from "~/modules/dashboard/dashboard.service.js";
import { createAuthFixture } from "../helpers/auth.fixture.js";
import { createTestApp } from "../helpers/create-test-app.js";

describe("GET /dashboard/statistics", () => {
  let app: INestApplication;
  let token: string;
  let userId: string;
  const language = "507f1f77bcf86cd799439011";

  beforeAll(async () => {
    const fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization, {
      languageIds: [language],
    });
    token = fixture.createToken();
    userId = fixture.userId;
  });

  afterAll(async () => {
    await app?.close();
  });

  function statistics() {
    return request(app.getHttpServer())
      .get("/dashboard/statistics")
      .set("Authorization", `Bearer ${token}`);
  }

  it("passes the filters and verified JWT subject to the service, ignoring a supplied owner", async () => {
    const result = {
      total_immersion_time: 300,
      current_streak: 2,
      reading_time: 120,
      audiovisual_time: 180,
      average_time: 75,
      breakdown: [
        { start_date: "2026-10-12", reading_time: 120, audiovisual_time: 180 },
      ],
    };
    const spy = vi
      .spyOn(app.get(DashboardService), "statistics")
      .mockResolvedValueOnce(result);
    try {
      const response = await statistics()
        .query({ range: "week", language, user_id: "auth0|another-user" })
        .expect(200);
      expect(response.body).toEqual(result);
      expect(spy).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ range: "week", language }),
        userId,
      );
    } finally {
      spy.mockRestore();
    }
  });

  it.each(["total", "year", "month", "week"])(
    "accepts required language and range %s and returns statistics in seconds",
    async (range) => {
      const response = await statistics()
        .query({ range, language })
        .expect(200);
      expect(response.body).toEqual({
        total_immersion_time: 0,
        current_streak: 0,
        reading_time: 0,
        audiovisual_time: 0,
        average_time: 0,
        breakdown: expect.any(Array),
      });
      for (const bucket of response.body.breakdown) {
        expect(bucket).toEqual({
          start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
          reading_time: 0,
          audiovisual_time: 0,
        });
      }
    },
  );

  it.each([
    "",
    `language=${language}`,
    "range=week",
    ...["", "daily", "YEAR", "all"].map(
      (range) => `range=${range}&language=${language}`,
    ),
    ...["", "ja", "not-an-id", "507f1f77bcf86cd79943901z"].map(
      (value) => `range=week&language=${value}`,
    ),
    `range=week&range=month&language=${language}`,
    `range=week&language=${language}&language=507f1f77bcf86cd799439012`,
  ])("rejects missing, invalid, or repeated filters: %s", async (query) => {
    await statistics().query(query).expect(400);
  });

  it("returns zero statistics for a valid language ID with no matching sessions", async () => {
    const response = await statistics()
      .query({ range: "total", language: "507f1f77bcf86cd799439099" })
      .expect(200);
    expect(response.body).toEqual({
      total_immersion_time: 0,
      current_streak: 0,
      reading_time: 0,
      audiovisual_time: 0,
      average_time: 0,
      breakdown: [],
    });
  });
});
