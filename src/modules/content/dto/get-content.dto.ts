import { IsMongoId } from "class-validator";

export class GetContentDto {
  @IsMongoId()
  id: string;
}
