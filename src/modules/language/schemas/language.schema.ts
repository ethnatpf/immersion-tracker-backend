import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema()
export class Language {
  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  name: string;
}

export type LanguageDocument = HydratedDocument<Language>;
export const LanguageSchema = SchemaFactory.createForClass(Language);
