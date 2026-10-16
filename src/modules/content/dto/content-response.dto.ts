import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { Content } from "../schemas/content.schema.js";

export class ContentResponseDto {
  @ApiProperty({ description: "Content ID" })
  _id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: ["anime", "book", "manga", "drama", "video"] })
  type: Content["type"];

  @ApiProperty({ description: "External authentication provider user ID" })
  user_id: string;

  @ApiProperty({ description: "Language ID" })
  language: string;

  @ApiProperty()
  completed: boolean;

  @ApiPropertyOptional({ format: "uri" })
  url?: string;
}
