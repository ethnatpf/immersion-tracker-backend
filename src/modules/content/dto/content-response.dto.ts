import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CONTENT_TYPES, type Content } from "../schemas/content.schema.js";

export class ContentResponseDto {
  @ApiProperty({ description: "Content ID" })
  _id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: CONTENT_TYPES })
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
