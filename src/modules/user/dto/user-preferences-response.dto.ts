import { ApiProperty } from "@nestjs/swagger";

export class UserPreferencesResponseDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "ID of the language with the most immersion sessions, or null when there are no sessions",
    example: "507f1f77bcf86cd799439011",
  })
  preferred_language: string | null;
}
