import { ApiProperty } from "@nestjs/swagger";
import type { Content } from "../schemas/content.schema.js";

export class ContentSearchItemResponseDto {
  @ApiProperty({ description: "Content ID" })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: ["anime", "book", "manga", "drama", "video"] })
  type: Content["type"];
}

export class ContentSearchResponseDto {
  @ApiProperty({ type: [ContentSearchItemResponseDto] })
  items: ContentSearchItemResponseDto[];

  @ApiProperty({
    type: "integer",
    description: "Total matching contents",
    minimum: 0,
  })
  total: number;

  @ApiProperty({ type: "integer", minimum: 1 })
  page: number;

  @ApiProperty({ type: "integer", minimum: 1 })
  limit: number;
}
