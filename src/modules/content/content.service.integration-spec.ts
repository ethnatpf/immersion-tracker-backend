import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { getModelToken, MongooseModule } from "@nestjs/mongoose";
import { Test, TestingModule } from "@nestjs/testing";
import { Model, Types } from "mongoose";
import { ContentModule } from "./content.module.js";
import { ContentService } from "./content.service.js";
import { Content } from "./schemas/content.schema.js";
import { CreateContentDto } from "./dto/create-content.dto.js";
import {
  Language,
  LanguageSchema,
} from "../language/schemas/language.schema.js";

describe("ContentService database integration", () => {
  let module: TestingModule | undefined;
  let service: ContentService;
  let contents: Model<Content>;
  let languages: Model<Language>;
  let input: CreateContentDto;
  let languageId: string;
  const userId = `content-integration-${randomUUID()}`;
  const otherUserId = `content-integration-${randomUUID()}`;
  const testOwners = { user_id: { $in: [userId, otherUserId] } };

  beforeAll(async () => {
    const uri = process.env.MONGODB_TEST_URL;
    if (!uri) {
      throw new Error("MONGODB_TEST_URL is required for integration tests");
    }

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, {
          retryAttempts: 0,
          serverSelectionTimeoutMS: 5_000,
        }),
        MongooseModule.forFeature([
          { name: Language.name, schema: LanguageSchema },
        ]),
        ContentModule,
      ],
    }).compile();

    contents = module.get<Model<Content>>(getModelToken(Content.name));
    // Wait for index creation before testing database uniqueness.
    await contents.init();
    languages = module.get<Model<Language>>(getModelToken(Language.name));
    const language = await languages.create({
      code: `test-${randomUUID()}`,
      name: "Integration test language",
    });
    languageId = language._id.toString();
    input = {
      title: "Integration test book",
      type: "book",
      language: languageId,
    };
  });

  beforeEach(() => {
    service = module!.get(ContentService);
  });

  afterEach(async () => {
    if (contents) await contents.deleteMany(testOwners);
  });

  afterAll(async () => {
    try {
      if (contents) await contents.deleteMany(testOwners);
      if (languages && languageId) {
        await languages.deleteOne({ _id: languageId });
      }
    } finally {
      await module?.close();
    }
  });

  it("persists content with its owner and language, initially incomplete", async () => {
    const created = await service.create(input, userId);

    expect(created._id).toBeDefined();
    const stored = await contents.findById(created._id).lean().exec();
    expect(stored).toMatchObject({
      title: input.title,
      type: input.type,
      user_id: userId,
      completed: false,
    });
    expect(stored?.language.toString()).toBe(languageId);
    expect(stored?.url).toBeUndefined();
    expect(await contents.countDocuments({ user_id: userId })).toBe(1);
  });

  it("persists the optional URL when supplied", async () => {
    const url = "https://example.com/books/123";
    const created = await service.create({ ...input, url }, userId);

    const stored = await contents.findById(created._id).lean().exec();
    expect(stored?.url).toBe(url);
    expect(await contents.countDocuments({ user_id: userId })).toBe(1);
  });

  it("rejects the same title and type for the same user without inserting a duplicate", async () => {
    const anime: CreateContentDto = {
      title: input.title,
      type: "anime",
      language: languageId,
    };
    const created = await service.create(anime, userId);

    await expect(service.create(anime, userId)).rejects.toThrow();

    const stored = await contents.find({ user_id: userId }).lean().exec();
    expect(stored).toHaveLength(1);
    expect(stored[0]._id.toString()).toBe(created._id.toString());
  });

  it("allows the same title with different types for the same user", async () => {
    const anime = await service.create(
      { title: input.title, type: "anime", language: languageId },
      userId,
    );
    const manga = await service.create(
      { title: input.title, type: "manga", language: languageId },
      userId,
    );

    expect(anime._id.toString()).not.toBe(manga._id.toString());
    const stored = await contents
      .find({ user_id: userId, title: input.title })
      .lean()
      .exec();
    expect(stored).toHaveLength(2);
    expect(stored.map((content) => content.type).sort()).toEqual([
      "anime",
      "manga",
    ]);
  });

  it("allows different users to create separate content with the same title and type", async () => {
    const first = await service.create(input, userId);
    const second = await service.create(input, otherUserId);

    expect(first._id.toString()).not.toBe(second._id.toString());
    const stored = await contents.find(testOwners).lean().exec();
    expect(stored).toHaveLength(2);
    expect(stored).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: input.title,
          type: input.type,
          user_id: userId,
        }),
        expect.objectContaining({
          title: input.title,
          type: input.type,
          user_id: otherUserId,
        }),
      ]),
    );
  });

  it("rejects a nonexistent language without persisting content", async () => {
    const language = new Types.ObjectId().toHexString();
    expect(await languages.exists({ _id: language })).toBeNull();

    await expect(
      service.create(
        { title: input.title, type: input.type, language },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(await contents.countDocuments({ user_id: userId })).toBe(0);
  });
});
