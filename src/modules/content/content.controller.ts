import { Body, Controller, Post } from "@nestjs/common";
import { CreateContentDto } from "./dto/create-content.dto.js";
import { ContentService } from "./content.service.js";
import { CurrentUserId } from "../../decorators/current-user-id.decorator.js";
import { ApiBearerAuth } from "@nestjs/swagger";

@ApiBearerAuth()
@Controller("content")
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post()
  create(@Body() input: CreateContentDto, @CurrentUserId() userId: string) {
    return this.contentService.create(input, userId);
  }
}
