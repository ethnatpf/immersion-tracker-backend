import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import { Language } from "~/modules/language/schemas/language.schema.js";

// Represents an immersion content (a book, an anime, etc)
@Schema()
export class Content {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  type: "anime" | "book" | "manga" | "drama" | "video";

  // ID of the user inside the external authentication provider (Auth0)
  @Prop({ required: true })
  user_id: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Language", required: true })
  language: Language;
}

export type ContentDocument = HydratedDocument<Content>;
export const ContentSchema = SchemaFactory.createForClass(Content);
