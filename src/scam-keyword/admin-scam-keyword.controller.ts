import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, HttpCode, HttpStatus, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminGuard } from '../admin/admin.guard';
import { ScamKeywordService } from './scam-keyword.service';
import { CreateScamKeywordDto } from './dto/create-scam-keyword.dto';
import { UpdateScamKeywordDto } from './dto/update-scam-keyword.dto';

/**
 * Admin CRUD for the GLOBAL scam keyword list. Distinct from
 * BlockedKeywordController (per-user, JWT-only). Mobile reads the active
 * subset of this table via ScamKeywordController's /scam-keywords/sync.
 */
@ApiTags('admin-scam-keywords')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/scam-keywords')
export class AdminScamKeywordController {
  constructor(private readonly service: ScamKeywordService) {}

  @Get()
  @ApiOperation({ summary: '[admin] List all scam keywords (active and inactive), newest first' })
  list() {
    return this.service.findAll();
  }

  @Post()
  @ApiOperation({ summary: '[admin] Add a global scam keyword' })
  create(@Body() dto: CreateScamKeywordDto) {
    return this.service.create(dto.keyword);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[admin] Partially update a scam keyword (keyword and/or active)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateScamKeywordDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[admin] Hard delete a scam keyword' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
