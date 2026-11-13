import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import { Language } from "~/modules/language/schemas/language.schema.js";

export const CONTENT_TYPES = [
  "anime",
  "book",
  "manga",
  "drama",
  "video",
  "game",
  "podcast",
  "radio",
  "audiobook",
  "audio",
] as const;

// Represents an immersion content (a book, an anime, etc)
@Schema({ toJSON: { versionKey: false } })
export class Content {
  @Prop({ required: true })
  title: string;

  @Prop({ type: String, enum: CONTENT_TYPES, required: true })
  type: (typeof CONTENT_TYPES)[number];

  // ID of the user inside the external authentication provider (Auth0)
  @Prop({ required: true })
  user_id: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Language", required: true })
  language: Language;

  // Whether the content has been completed or not
  @Prop({ required: true })
  completed: boolean;

  // Optional URL to the content
  @Prop()
  url: string;
}

export type ContentDocument = HydratedDocument<Content>;
export const ContentSchema = SchemaFactory.createForClass(Content);
ContentSchema.index({ user_id: 1, title: 1, type: 1 }, { unique: true });
