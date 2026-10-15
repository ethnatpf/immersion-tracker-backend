import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { getModelToken, MongooseModule } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { type Model, Types } from "mongoose";
import { ImmersionSessionsModule } from "../immersion-session.module.js";
import { ImmersionSessionService } from "../immersion-session.service.js";
import { ImmersionSession } from "../schemas/immersion-session.schema.js";
import type { CreateImmersionSessionDto } from "../dto/create-immersion-session.dto.js";
import { Content, ContentSchema } from "../../content/schemas/content.schema.js";
import {
  Language,
  LanguageSchema,
} from "../../language/schemas/language.schema.js";

type StoredContent = Omit<Content, "language"> & { language: Types.ObjectId };
type StoredSession = Omit<ImmersionSession, "content"> & {
  content: Types.ObjectId;
};

describe("ImmersionSessionService create database integration", () => {
  let module: TestingModule | undefined;
  let service: ImmersionSessionService;
  let sessions: Model<StoredSession>;
  let contents: Model<StoredContent>;
  let languages: Model<Language>;
  let languageId: string;
  let contentId: string;
  let otherContentId: string;
  let input: Pick<CreateImmersionSessionDto, "content" | "duration">;
  const userId = `auth0|session-integration-${randomUUID()}`;
  const otherUserId = `auth0|session-integration-${randomUUID()}`;
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
          { name: Language.name, schema: LanguageSchema },
        ]),
        ImmersionSessionsModule,
      ],
    }).compile();

    service = module.get(ImmersionSessionService);
    sessions = module.get<Model<StoredSession>>(
      getModelToken(ImmersionSession.name),
    );
    contents = module.get<Model<StoredContent>>(getModelToken(Content.name));
    languages = module.get<Model<Language>>(getModelToken(Language.name));
    await sessions.init();
    const language = await languages.create({
      code: `test-${randomUUID()}`,
      name: "Session integration test language",
    });
    languageId = language._id.toString();
    const content = await contents.create({
      title: "Session integration content",
      type: "anime",
      language: language._id,
      user_id: userId,
      completed: false,
    });
    contentId = content._id.toString();
    const otherContent = await contents.create({
      title: "Other user's session integration content",
      type: "book",
      language: language._id,
      user_id: otherUserId,
      completed: false,
    });
    otherContentId = otherContent._id.toString();
    input = { content: contentId, duration: 1200 };
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (sessions) await sessions.deleteMany(owners);
  });

  afterAll(async () => {
    try {
      if (sessions) await sessions.deleteMany(owners);
      if (contents) await contents.deleteMany(owners);
      if (languages && languageId)
        await languages.deleteOne({ _id: languageId });
    } finally {
      await module?.close();
    }
  });

  it("persists a session with its content, duration, and external owner", async () => {
    const created = await service.create(input, userId);
    expect(created._id).toBeDefined();
    const stored = await sessions.findById(created._id).lean().exec();
    expect(stored).toMatchObject({ duration: 1200, user_id: userId });
    expect(stored?.content.toString()).toBe(contentId);
    expect(stored?.progress).toBeUndefined();
    expect(await sessions.countDocuments(owners)).toBe(1);
  });

  it.each(["2026-10-13T00:00:00.001Z", "2026-10-13T23:59:59.999Z"])(
    "automatically persists the UTC day at midnight when created at %s",
    async (now) => {
      // Leave timers used by MongoDB running normally.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(now));
      const created = await service.create(input, userId);
      const stored = await sessions.findById(created._id).lean().exec();
      expect(stored?.created_at).toBeInstanceOf(Date);
      expect(stored?.created_at.toISOString()).toBe("2026-10-13T00:00:00.000Z");
    },
  );

  it("persists a supplied past day instead of the automatic day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T12:34:56.789Z"));
    const created = await service.create(
      { ...input, created_at: "2024-02-29" },
      userId,
    );
    const stored = await sessions.findById(created._id).lean().exec();
    expect(stored?.created_at).toBeInstanceOf(Date);
    expect(stored?.created_at.toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });

  describe.each(["episode", "page"] as const)("%s progress", (unit) => {
    it.each([1, 3])(
      "persists progress with start 1 and end %s",
      async (end) => {
        const progress = { unit, start: 1, end };
        const created = await service.create({ ...input, progress }, userId);
        const stored = await sessions.findById(created._id).lean().exec();
        expect(stored?.progress).toEqual(progress);
      },
    );

    it("persists identical sessions and overlapping ranges independently", async () => {
      const entries: CreateImmersionSessionDto[] = [
        {
          ...input,
          created_at: "2024-02-29",
          progress: { unit, start: 1, end: 3 },
        },
        {
          ...input,
          created_at: "2024-02-29",
          progress: { unit, start: 1, end: 3 },
        },
        {
          ...input,
          created_at: "2024-02-29",
          progress: { unit, start: 2, end: 4 },
        },
      ];
      const ids: string[] = [];
      for (const entry of entries) {
        const created = await service.create(entry, userId);
        ids.push(created._id.toString());
      }
      expect(new Set(ids).size).toBe(3);
      expect(await sessions.countDocuments(owners)).toBe(3);
      for (const [index, id] of ids.entries()) {
        const stored = await sessions.findById(id).lean().exec();
        expect(stored).toMatchObject({
          duration: input.duration,
          user_id: userId,
          progress: entries[index]!.progress,
        });
        expect(stored?.content.toString()).toBe(contentId);
        expect(stored?.created_at.toISOString()).toBe(
          "2024-02-29T00:00:00.000Z",
        );
      }
    });
  });

  it("rejects nonexistent content without inserting a session", async () => {
    const content = new Types.ObjectId().toHexString();
    expect(await contents.exists({ _id: content })).toBeNull();
    await expect(service.create({ ...input, content }, userId)).rejects.toThrow(
      new BadRequestException("Content does not exist"),
    );
    expect(await sessions.countDocuments(owners)).toBe(0);
  });

  it("rejects another user's content without inserting a session", async () => {
    await expect(
      service.create({ ...input, content: otherContentId }, userId),
    ).rejects.toThrow(new BadRequestException("Content does not exist"));
    expect(await sessions.countDocuments(owners)).toBe(0);
  });
});
