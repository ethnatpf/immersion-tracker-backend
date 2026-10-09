import "reflect-metadata";
import mongoose from "mongoose";
import languages from "../data/iso_639-1.json" with { type: "json" };
import {
  Language,
  LanguageSchema,
} from "~/modules/language/schemas/language.schema.js";

async function seed() {
  const uri = process.env.MONGODB_URL;
  if (!uri) {
    throw new Error("MONGODB_URL environment variable is required");
  }

  try {
    await mongoose.connect(uri, { dbName: "immersion-tracker" });
    const languageModel = mongoose.model(Language.name, LanguageSchema);
    const result = await languageModel.bulkWrite(
      Object.values(languages).map((language) => ({
        updateOne: {
          filter: { code: language["639-1"] },
          update: {
            $set: { code: language["639-1"], name: language.name },
          },
          upsert: true,
        },
      })),
    );

    console.log(
      `Seeded ${Object.keys(languages).length} languages: ${result.upsertedCount} inserted, ${result.modifiedCount} updated.`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error("Failed to seed languages:", error);
  process.exitCode = 1;
});
