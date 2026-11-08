import { ApiProperty } from "@nestjs/swagger";

export class FaroCollectResponseDto {
  @ApiProperty({ description: "Whether Alloy accepted the Faro payload" })
  accepted!: boolean;
}
