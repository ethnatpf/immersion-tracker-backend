import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Types } from "mongoose";
import request from "supertest";
import { createAuthFixture } from "../helpers/auth.fixture.js";
import { createTestApp } from "../helpers/create-test-app.js";

describe("GET /language", () => {
  let app: INestApplication;
  let token: string;
  const languages = Array.from({ length: 25 }, (_, index) => ({
    _id: new Types.ObjectId(),
    code: `code-${index}`,
    name: `Language ${index}`,
    __v: 0,
  }));

  beforeAll(async () => {
    const fixture = createAuthFixture();
    token = fixture.createToken();
    app = await createTestApp(fixture.authorization, { languages });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    languages.splice(
      0,
      languages.length,
      ...Array.from({ length: 25 }, (_, index) => ({
        _id: new Types.ObjectId(),
        code: `code-${index}`,
        name: `Language ${index}`,
        __v: 0,
      })),
    );
  });

  it("returns all languages with only their string id, code, and name", async () => {
    const response = await request(app.getHttpServer())
      .get("/language")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual(
      languages.map(({ _id, code, name }) => ({
        id: _id.toHexString(),
        code,
        name,
      })),
    );
  });

  it("returns an empty array when there are no languages", async () => {
    languages.splice(0);
    const response = await request(app.getHttpServer())
      .get("/language")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual([]);
  });
});
