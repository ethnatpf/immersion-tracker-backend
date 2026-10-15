import { IsMongoId } from "class-validator";

export class StartTimerDto {
  @IsMongoId()
  content: string;
}
