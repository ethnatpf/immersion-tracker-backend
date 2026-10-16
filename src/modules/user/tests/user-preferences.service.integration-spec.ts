import "reflect-metadata";
import { getModelToken, MongooseModule } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import { type Model, Types } from "mongoose";
import { randomUUID } from "node:crypto";
import { UserModule } from "../user.module.js";
import { UserService } from "../user.service.js";
import {
  Content,
  ContentSchema,
} from "../../content/schemas/content.schema.js";
import {
  ImmersionSession,
  ImmersionSessionSchema,
} from "../../immersion-session/schemas/immersion-session.schema.js";
import {
  Language,
  LanguageSchema,
} from "../../language/schemas/language.schema.js";

type StoredContent = Omit<Content, "language"> & { language: Types.ObjectId };
type StoredSession = Omit<ImmersionSession, "content" | "language"> & {
  content: Types.ObjectId;
  language: Types.ObjectId;
};

describe("UserService preferences database integration", () => {
  let module: TestingModule | undefined;
  let contents: Model<StoredContent>;
  let sessions: Model<StoredSession>;
  let languages: Model<Language>;
  const languageId = new Types.ObjectId();
  const otherLanguageId = new Types.ObjectId();
  const userId = `auth0|preferences-${randomUUID()}`;
  const otherUserId = `auth0|preferences-${randomUUID()}`;
  const owners = { user_id: { $in: [userId, otherUserId] } };

  beforeAll(async () => {
    const uri = process.env.MONGODB_TEST_URL;
    if (!uri)
      throw new Error("MONGODB_TEST_URL is required for integration tests");
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, {
          retryAttempts: 0,
          serverSelectionTimeoutMS: 5_000,
        }),
        MongooseModule.forFeature([
          { name: Content.name, schema: ContentSchema },
          { name: ImmersionSession.name, schema: ImmersionSessionSchema },
          { name: Language.name, schema: LanguageSchema },
        ]),
        UserModule,
      ],
    }).compile();
    contents = module.get<Model<StoredContent>>(getModelToken(Content.name));
    sessions = module.get<Model<StoredSession>>(
      getModelToken(ImmersionSession.name),
    );
    languages = module.get<Model<Language>>(getModelToken(Language.name));
    await Promise.all([contents.init(), sessions.init()]);
    await languages.insertMany([
      { _id: languageId, code: `test-${randomUUID()}`, name: "First language" },
      {
        _id: otherLanguageId,
        code: `test-${randomUUID()}`,
        name: "Second language",
      },
    ]);
  });

  afterEach(async () => {
    if (sessions) await sessions.deleteMany(owners);
    if (contents) await contents.deleteMany(owners);
  });

  afterAll(async () => {
    try {
      if (sessions) await sessions.deleteMany(owners);
      if (contents) await contents.deleteMany(owners);
      if (languages)
        await languages.deleteMany({
          _id: { $in: [languageId, otherLanguageId] },
        });
    } finally {
      await module?.close();
    }
  });

  function preferences(owner = userId) {
    return module!.get(UserService).preferences(owner);
  }

  function content(language = languageId, owner = userId) {
    return contents.create({
      title: `Preferences ${randomUUID()}`,
      type: "book",
      language,
      user_id: owner,
      completed: false,
    });
  }

  function session(
    entry: {
      _id: Types.ObjectId;
      language: Types.ObjectId;
      type: Content["type"];
    },
    duration = 60,
    owner = userId,
    created_at = new Date("2026-10-15T00:00:00.000Z"),
  ) {
    return sessions.create({
      content: entry._id,
      language: entry.language,
      content_type: entry.type,
      user_id: owner,
      duration,
      created_at,
    });
  }

  it("uses the session language instead of referenced content metadata", async () => {
    const entry = await content(otherLanguageId);
    await sessions.create({
      content: entry._id,
      language: languageId,
      content_type: "book",
      user_id: userId,
      duration: 60,
    });
    expect(await preferences()).toEqual({
      preferred_language: languageId.toHexString(),
    });
  });

  it("breaks equal session counts by ascending language ID", async () => {
    await session(await content(languageId));
    await session(await content(otherLanguageId));
    const first = [
      languageId.toHexString(),
      otherLanguageId.toHexString(),
    ].sort()[0];
    expect(await preferences()).toEqual({ preferred_language: first });
  });

  it("returns null when there are no sessions, even if the user has content", async () => {
    await content();
    expect(await preferences()).toEqual({ preferred_language: null });
  });

  it("returns the language ID for a single immersion session", async () => {
    await session(await content());
    expect(await preferences()).toEqual({
      preferred_language: languageId.toHexString(),
    });
  });

  it("counts repeated sessions across content in the same language, regardless of duration or age", async () => {
    const repeated = await content();
    await session(repeated, 1, userId, new Date("2020-01-01T00:00:00.000Z"));
    await session(repeated, 1);
    await session(await content(), 1);
    // More content and more total time must not outweigh the session count.
    await session(await content(otherLanguageId), 10_000);
    await session(await content(otherLanguageId), 10_000);
    await content(otherLanguageId);

    expect(await preferences()).toEqual({
      preferred_language: languageId.toHexString(),
    });
  });

  it("uses only the authenticated user's sessions, including when users reference the same content", async () => {
    const ownContent = await content();
    const otherLanguageContent = await content(otherLanguageId);
    await session(ownContent);
    await session(otherLanguageContent, 60, otherUserId);
    await session(otherLanguageContent, 60, otherUserId);
    await session(await content(otherLanguageId, otherUserId), 60, otherUserId);

    expect(await preferences()).toEqual({
      preferred_language: languageId.toHexString(),
    });
    expect(await preferences(otherUserId)).toEqual({
      preferred_language: otherLanguageId.toHexString(),
    });
  });

  it("returns null when only another user has sessions", async () => {
    await session(await content(languageId, otherUserId), 60, otherUserId);
    expect(await preferences()).toEqual({ preferred_language: null });
  });
});
