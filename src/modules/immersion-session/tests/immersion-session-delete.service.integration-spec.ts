import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { getModelToken, MongooseModule } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { type Model, Types } from "mongoose";
import { ImmersionSessionsModule } from "../immersion-session.module.js";
import { ImmersionSessionService } from "../immersion-session.service.js";
import { ImmersionSession } from "../schemas/immersion-session.schema.js";
import {
  Content,
  ContentSchema,
} from "../../content/schemas/content.schema.js";
import {
  Language,
  LanguageSchema,
} from "../../language/schemas/language.schema.js";

type StoredContent = Omit<Content, "language"> & { language: Types.ObjectId };
type StoredSession = Omit<ImmersionSession, "content"> & {
  content: Types.ObjectId;
};

describe("ImmersionSessionService delete database integration", () => {
  let module: TestingModule | undefined;
  let service: ImmersionSessionService;
  let sessions: Model<StoredSession>;
  let contents: Model<StoredContent>;
  let languages: Model<Language>;
  let languageId: Types.ObjectId;
  let contentId: Types.ObjectId;
  let otherContentId: Types.ObjectId;
  const userId = `auth0|delete-${randomUUID()}`;
  const otherUserId = `auth0|delete-${randomUUID()}`;
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
    await Promise.all([sessions.init(), contents.init()]);
    const language = await languages.create({
      code: `test-${randomUUID()}`,
      name: "Delete session test language",
    });
    languageId = language._id;
    const content = await contents.create({
      title: "Delete session test content",
      type: "book",
      language: languageId,
      user_id: userId,
      completed: false,
    });
    contentId = content._id;
    const otherContent = await contents.create({
      title: "Other user's delete session test content",
      type: "book",
      language: languageId,
      user_id: otherUserId,
      completed: false,
    });
    otherContentId = otherContent._id;
  });

  afterEach(async () => {
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

  function seedSession(owner = userId) {
    return sessions.create({
      content: owner === otherUserId ? otherContentId : contentId,
      duration: 1200,
      user_id: owner,
    });
  }

  it("removes only the requested owned session from MongoDB and preserves its content", async () => {
    const target = await seedSession();
    const sibling = await seedSession();
    const other = await seedSession(otherUserId);
    const siblingBefore = await sessions.findById(sibling._id).lean().exec();
    const otherBefore = await sessions.findById(other._id).lean().exec();
    const contentBefore = await contents.findById(contentId).lean().exec();
    expect(await sessions.exists({ _id: target._id })).not.toBeNull();

    await service.remove(target._id.toHexString(), userId);

    expect(await sessions.findById(target._id).lean().exec()).toBeNull();
    expect(await sessions.countDocuments(owners)).toBe(2);
    expect(await sessions.findById(sibling._id).lean().exec()).toEqual(
      siblingBefore,
    );
    expect(await sessions.findById(other._id).lean().exec()).toEqual(
      otherBefore,
    );
    expect(await contents.findById(contentId).lean().exec()).toEqual(
      contentBefore,
    );
  });

  it("rejects deleting another user's session and leaves it unchanged in MongoDB", async () => {
    const target = await seedSession(otherUserId);
    const before = await sessions.findById(target._id).lean().exec();

    await expect(
      service.remove(target._id.toHexString(), userId),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(await sessions.findById(target._id).lean().exec()).toEqual(before);
    expect(await sessions.countDocuments(owners)).toBe(1);
    // The same session is deletable by its actual owner.
    await service.remove(target._id.toHexString(), otherUserId);
    expect(await sessions.findById(target._id).lean().exec()).toBeNull();
  });

  it("rejects a nonexistent session without deleting any existing sessions", async () => {
    await seedSession();
    await seedSession(otherUserId);
    const before = await sessions.find(owners).sort({ _id: 1 }).lean().exec();
    const missingId = new Types.ObjectId();
    expect(await sessions.exists({ _id: missingId })).toBeNull();

    await expect(
      service.remove(missingId.toHexString(), userId),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(await sessions.find(owners).sort({ _id: 1 }).lean().exec()).toEqual(
      before,
    );
  });

  it("returns not found when an already deleted session is deleted again", async () => {
    const target = await seedSession();
    const id = target._id.toHexString();
    await service.remove(id, userId);
    expect(await sessions.findById(id).lean().exec()).toBeNull();

    await expect(service.remove(id, userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await sessions.countDocuments(owners)).toBe(0);
  });
});
