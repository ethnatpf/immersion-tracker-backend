import { IsIn, IsMongoId, ValidateIf } from "class-validator";
import { PaginatedSearchDto } from "../../../dto/paginated-search.dto.js";
import type { Content } from "../schemas/content.schema.js";

export class SearchContentDto extends PaginatedSearchDto {
  @ValidateIf(
    (_object: SearchContentDto, value: unknown) => value !== undefined,
  )
  @IsMongoId()
  language?: string;

  @ValidateIf(
    (_object: SearchContentDto, value: unknown) => value !== undefined,
  )
  @IsIn(["anime", "book", "manga", "drama", "video"])
  type?: Content["type"];
}
