import "reflect-metadata";
import { NotFoundException, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { ImmersionSessionService } from "../src/modules/immersion-session/immersion-session.service.js";
import { createAuthFixture } from "./helpers/auth.fixture.js";
import { createTestApp } from "./helpers/create-test-app.js";

describe("DELETE /immersion-session/:id", () => {
  let app: INestApplication;
  let token: string;
  let userId: string;
  const sessionId = "507f1f77bcf86cd799439011";
  const remove = vi.fn<ImmersionSessionService["remove"]>();

  beforeAll(async () => {
    const fixture = createAuthFixture();
    app = await createTestApp(fixture.authorization);
    token = fixture.createToken();
    userId = fixture.userId;
    // Ownership and actual deletion are covered by the database suite.
    Object.assign(app.get(ImmersionSessionService), { remove });
  });

  beforeEach(() => {
    remove.mockReset();
    remove.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app?.close();
  });

  function deleteSession(id = sessionId) {
    return request(app.getHttpServer())
      .delete(`/immersion-session/${id}`)
      .set("Authorization", `Bearer ${token}`);
  }

  it("deletes by ID using the verified JWT subject and returns no content", async () => {
    const response = await deleteSession().expect(204);
    expect(response.text).toBe("");
    expect(remove).toHaveBeenCalledExactlyOnceWith(sessionId, userId);
  });

  it("uses the verified identity even when another owner is supplied", async () => {
    await deleteSession()
      .query({ user_id: "auth0|another-user" })
      .send({ user_id: "auth0|another-user" })
      .expect(204);
    expect(remove).toHaveBeenCalledExactlyOnceWith(sessionId, userId);
  });

  it("returns 404 when the service cannot find an owned session", async () => {
    remove.mockRejectedValueOnce(new NotFoundException());
    await deleteSession().expect(404);
    expect(remove).toHaveBeenCalledExactlyOnceWith(sessionId, userId);
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
      await deleteSession(id).expect(400);
      expect(remove).not.toHaveBeenCalled();
    },
  );
});
