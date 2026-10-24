import { ApiProperty } from "@nestjs/swagger";

export class LanguageResponseDto {
  @ApiProperty({ description: "Language ID" })
  id: string;

  @ApiProperty({ example: "ja" })
  code: string;

  @ApiProperty({ example: "Japanese" })
  name: string;

  @ApiProperty({
    description: "Language name in its native language",
    example: "日本語 (にほんご)",
  })
  nativeName: string;
}
