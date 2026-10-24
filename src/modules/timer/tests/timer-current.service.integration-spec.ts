import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
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

describe("TimerService getCurrent database integration", () => {
  let module: TestingModule | undefined;
  let service: TimerService;
  let timers: Model<StoredTimer>;
  let contents: Model<StoredContent>;
  let languages: Model<Language>;
  let languageId: Types.ObjectId;
  let contentId: Types.ObjectId;
  let otherContentId: Types.ObjectId;
  const userId = `auth0|current-timer-${randomUUID()}`;
  const otherUserId = `auth0|current-timer-${randomUUID()}`;
  const owners = { user_id: { $in: [userId, otherUserId] } };
  const startedAt = new Date("2026-10-15T12:34:56.789Z");
  const otherStartedAt = new Date("2026-10-15T13:00:00.123Z");

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
    await Promise.all([timers.init(), contents.init()]);
    const language = await languages.create({
      code: `test-${randomUUID()}`,
      name: "Current timer test language",
      nativeName: "Current timer test language",
    });
    languageId = language._id;
    const content = await contents.create({
      title: "The Forest Chronicles",
      type: "book",
      user_id: userId,
      language: languageId,
      completed: false,
    });
    contentId = content._id;
    const otherContent = await contents.create({
      title: "Other user's anime",
      type: "anime",
      user_id: otherUserId,
      language: languageId,
      completed: false,
    });
    otherContentId = otherContent._id;
  });

  afterEach(async () => {
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

  function seedTimer(owner = userId) {
    return timers.create({
      user_id: owner,
      content: owner === otherUserId ? otherContentId : contentId,
      started_at: owner === otherUserId ? otherStartedAt : startedAt,
    });
  }

  it("returns the persisted timer with content details and the exact start timestamp", async () => {
    const timer = await seedTimer();
    expect(await service.getCurrent(userId)).toEqual({
      id: timer._id.toHexString(),
      content_id: contentId.toHexString(),
      title: "The Forest Chronicles",
      type: "book",
      started_at: startedAt.toISOString(),
    });
  });

  it("returns not found when the user has no active timer", async () => {
    await expect(service.getCurrent(userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await timers.countDocuments(owners)).toBe(0);
  });

  it("returns not found rather than exposing another user's active timer", async () => {
    await seedTimer(otherUserId);
    await expect(service.getCurrent(userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await timers.countDocuments({ user_id: otherUserId })).toBe(1);
  });

  it("returns each user's own timer when both have active timers", async () => {
    const own = await seedTimer();
    const other = await seedTimer(otherUserId);
    expect(await service.getCurrent(userId)).toEqual({
      id: own._id.toHexString(),
      content_id: contentId.toHexString(),
      title: "The Forest Chronicles",
      type: "book",
      started_at: startedAt.toISOString(),
    });
    expect(await service.getCurrent(otherUserId)).toEqual({
      id: other._id.toHexString(),
      content_id: otherContentId.toHexString(),
      title: "Other user's anime",
      type: "anime",
      started_at: otherStartedAt.toISOString(),
    });
  });

  it("leaves timers and content unchanged across repeated reads", async () => {
    await seedTimer();
    await seedTimer(otherUserId);
    const timersBefore = await timers
      .find(owners)
      .sort({ _id: 1 })
      .lean()
      .exec();
    const contentsBefore = await contents
      .find(owners)
      .sort({ _id: 1 })
      .lean()
      .exec();
    const first = await service.getCurrent(userId);
    expect(await service.getCurrent(userId)).toEqual(first);
    expect(await timers.find(owners).sort({ _id: 1 }).lean().exec()).toEqual(
      timersBefore,
    );
    expect(await contents.find(owners).sort({ _id: 1 }).lean().exec()).toEqual(
      contentsBefore,
    );
  });
});
