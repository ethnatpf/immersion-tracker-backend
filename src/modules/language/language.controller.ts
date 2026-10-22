import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiBearerAuth, ApiOkResponse } from "@nestjs/swagger";
import { LanguageService } from "./language.service.js";
import { LanguageResponseDto } from "./dto/language-response.dto.js";

@ApiBearerAuth()
@Controller("language")
export class LanguageController {
  constructor(private readonly languageService: LanguageService) {}

  @Get()
  @ApiOperation({ operationId: "languageList" })
  @ApiOkResponse({ type: LanguageResponseDto, isArray: true })
  findAll(): Promise<LanguageResponseDto[]> {
    return this.languageService.findAll();
  }
}
