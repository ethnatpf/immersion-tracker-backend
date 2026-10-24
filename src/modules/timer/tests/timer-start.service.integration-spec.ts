import "reflect-metadata";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { getModelToken, MongooseModule } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { type Model, Types } from "mongoose";
import {
  Content,
  ContentSchema,
} from "../../content/schemas/content.schema.js";
import {
  Language,
  LanguageSchema,
} from "../../language/schemas/language.schema.js";
import { TimerModule } from "../timer.module.js";
import { TimerService } from "../timer.service.js";
import { Timer } from "../schemas/timer.schema.js";

type StoredContent = Omit<Content, "language"> & { language: Types.ObjectId };
type StoredTimer = Omit<Timer, "content"> & { content: Types.ObjectId };

describe("TimerService start database integration", () => {
  let module: TestingModule | undefined;
  let service: TimerService;
  let timers: Model<StoredTimer>;
  let contents: Model<StoredContent>;
  let languages: Model<Language>;
  let languageId: string;
  let contentId: string;
  let secondContentId: string;
  let otherContentId: string;
  const userId = `auth0|timer-integration-${randomUUID()}`;
  const otherUserId = `auth0|timer-integration-${randomUUID()}`;
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
        TimerModule,
      ],
    }).compile();

    service = module.get(TimerService);
    timers = module.get<Model<StoredTimer>>(getModelToken(Timer.name));
    contents = module.get<Model<StoredContent>>(getModelToken(Content.name));
    languages = module.get<Model<Language>>(getModelToken(Language.name));
    // Wait for indexes before testing simultaneous starts.
    await timers.init();
    const language = await languages.create({
      code: `test-${randomUUID()}`,
      name: "Timer integration test language",
      nativeName: "Timer integration test language",
    });
    languageId = language._id.toString();
    const [content, secondContent, otherContent] = await contents.create([
      {
        title: "Timer integration content",
        type: "anime",
        language: language._id,
        user_id: userId,
        completed: false,
      },
      {
        title: "Second timer integration content",
        type: "book",
        language: language._id,
        user_id: userId,
        completed: false,
      },
      {
        title: "Other user's timer integration content",
        type: "book",
        language: language._id,
        user_id: otherUserId,
        completed: false,
      },
    ]);
    contentId = content!._id.toString();
    secondContentId = secondContent!._id.toString();
    otherContentId = otherContent!._id.toString();
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (timers) await timers.deleteMany(owners);
  });

  afterAll(async () => {
    try {
      if (timers) await timers.deleteMany(owners);
      if (contents) await contents.deleteMany(owners);
      if (languages && languageId)
        await languages.deleteOne({ _id: languageId });
    } finally {
      await module?.close();
    }
  });

  it("persists the existing content, external owner, and exact current time", async () => {
    const now = "2026-10-15T12:34:56.789Z";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    const created = await service.start({ content: contentId }, userId);
    expect(created._id).toBeDefined();
    const stored = await timers.findById(created._id).lean().exec();
    expect(stored?.user_id).toBe(userId);
    expect(stored?.content.toString()).toBe(contentId);
    expect(stored?.started_at).toBeInstanceOf(Date);
    expect(stored?.started_at.toISOString()).toBe(now);
    expect(await timers.countDocuments(owners)).toBe(1);
  });

  it("rejects nonexistent content without creating a timer or content", async () => {
    const content = new Types.ObjectId().toHexString();
    expect(await contents.exists({ _id: content })).toBeNull();
    const before = await contents.countDocuments(owners);
    await expect(service.start({ content }, userId)).rejects.toThrow(
      new BadRequestException("Content does not exist"),
    );
    expect(await timers.countDocuments(owners)).toBe(0);
    expect(await contents.countDocuments(owners)).toBe(before);
    expect(await contents.exists({ _id: content })).toBeNull();
  });

  it("rejects another user's content without inserting a timer", async () => {
    await expect(
      service.start({ content: otherContentId }, userId),
    ).rejects.toThrow(new BadRequestException("Content does not exist"));
    expect(await timers.countDocuments(owners)).toBe(0);
  });

  it.each(["same", "different"])(
    "rejects a second start for %s content and preserves the running timer",
    async (target) => {
      const created = await service.start({ content: contentId }, userId);
      const original = await timers.findById(created._id).lean().exec();
      await expect(
        service.start(
          { content: target === "same" ? contentId : secondContentId },
          userId,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await timers.countDocuments({ user_id: userId })).toBe(1);
      expect(await timers.findById(created._id).lean().exec()).toEqual(
        original,
      );
    },
  );

  it("allows one running timer per user independently", async () => {
    await service.start({ content: contentId }, userId);
    await service.start({ content: otherContentId }, otherUserId);
    expect(await timers.countDocuments({ user_id: userId })).toBe(1);
    expect(await timers.countDocuments({ user_id: otherUserId })).toBe(1);
  });

  it("persists only one timer when the same user starts two simultaneously", async () => {
    const results = await Promise.allSettled([
      service.start({ content: contentId }, userId),
      service.start({ content: secondContentId }, userId),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failures = results.filter((result) => result.status === "rejected");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toBeInstanceOf(ConflictException);
    expect(await timers.countDocuments({ user_id: userId })).toBe(1);
  });
});
