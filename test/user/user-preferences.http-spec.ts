import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { UserService } from "~/modules/user/user.service.js";
import { createAuthFixture } from "../helpers/auth.fixture.js";
import { createTestApp } from "../helpers/create-test-app.js";

describe("GET /user/preferences", () => {
  let app: INestApplication;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization);
    token = fixture.createToken();
    userId = fixture.userId;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  function preferences() {
    return request(app.getHttpServer())
      .get("/user/preferences")
      .set("Authorization", `Bearer ${token}`);
  }

  it("returns a null preferred language when the user has no sessions", async () => {
    const response = await preferences().expect(200);
    expect(response.body).toEqual({ preferred_language: null });
  });

  it("returns only the preferred language ID and passes the verified subject to the service", async () => {
    const preferredLanguage = "507f1f77bcf86cd799439011";
    const service = app.get(UserService);
    const spy = vi.spyOn(service, "preferences").mockResolvedValueOnce({
      preferred_language: preferredLanguage,
    });

    const response = await preferences()
      .query({ user_id: "auth0|another-user" })
      .send({ user_id: "auth0|another-user" })
      .expect(200);

    expect(response.body).toEqual({ preferred_language: preferredLanguage });
    expect(spy).toHaveBeenCalledExactlyOnceWith(userId);
  });
});
