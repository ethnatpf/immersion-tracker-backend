import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CreateContentDto } from "./dto/create-content.dto.js";
import { SearchContentDto } from "./dto/search-content.dto.js";
import { ContentService } from "./content.service.js";
import { CurrentUserId } from "../../decorators/current-user-id.decorator.js";
import { ApiBearerAuth } from "@nestjs/swagger";
import { GetContentDto } from "./dto/get-content.dto.js";

@ApiBearerAuth()
@Controller("content")
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get("search")
  search(@Query() input: SearchContentDto, @CurrentUserId() userId: string) {
    return this.contentService.search(input, userId);
  }

  @Get(":id")
  getById(@Param() params: GetContentDto, @CurrentUserId() userId: string) {
    return this.contentService.getById(params.id, userId);
  }

  @Post()
  create(@Body() input: CreateContentDto, @CurrentUserId() userId: string) {
    return this.contentService.create(input, userId);
  }
}
