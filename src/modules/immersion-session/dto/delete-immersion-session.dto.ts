import { IsMongoId } from "class-validator";

export class DeleteImmersionSessionDto {
  @IsMongoId()
  id: string;
}
