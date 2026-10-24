import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { getModelToken, MongooseModule } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import { Model } from "mongoose";
import { LanguageService } from "./language.service.js";
import { Language, LanguageSchema } from "./schemas/language.schema.js";

describe("LanguageService database integration", () => {
  let module: TestingModule | undefined;
  let service: LanguageService;
  let languages: Model<Language>;
  const collection = `language_list_test_${randomUUID().replaceAll("-", "")}`;

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
          { name: Language.name, schema: LanguageSchema, collection },
        ]),
      ],
      providers: [LanguageService],
    }).compile();
    service = module.get(LanguageService);
    languages = module.get<Model<Language>>(getModelToken(Language.name));
    await languages.createCollection();
  });

  beforeEach(async () => {
    await languages.deleteMany({});
  });

  afterAll(async () => {
    try {
      if (languages) await languages.collection.drop();
    } finally {
      await module?.close();
    }
  });

  it("returns an empty array for an empty collection", async () => {
    expect(await service.findAll()).toEqual([]);
  });

  it("returns every persisted language with only its string id, code, name, and native name", async () => {
    const stored = await languages.insertMany(
      Array.from({ length: 25 }, (_, index) => ({
        code: `test-${index}`,
        name: `Test language ${index}`,
        nativeName: `日本語 ${index}`,
      })),
    );

    expect(stored.map((language) => language.nativeName)).toEqual(
      Array.from({ length: 25 }, (_, index) => `日本語 ${index}`),
    );

    const result = await service.findAll();
    expect(result).toHaveLength(stored.length);
    expect(result).toEqual(
      expect.arrayContaining(
        stored.map(({ _id, code, name, nativeName }) => ({
          id: _id.toHexString(),
          code,
          name,
          nativeName,
        })),
      ),
    );
  });
});
