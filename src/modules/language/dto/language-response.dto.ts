import { ApiProperty } from "@nestjs/swagger";

export class LanguageResponseDto {
  @ApiProperty({ description: "Language ID" })
  id: string;

  @ApiProperty({ example: "ja" })
  code: string;

  @ApiProperty({ example: "Japanese" })
  name: string;
}
