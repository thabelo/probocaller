import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, HttpCode, HttpStatus, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminGuard } from '../admin/admin.guard';
import { BusinessWhitelistService } from './business-whitelist.service';
import { CreateWhitelistedNumberDto } from './dto/create-whitelisted-number.dto';
import { UpdateWhitelistedNumberDto } from './dto/update-whitelisted-number.dto';

/**
 * Admin CRUD for the GLOBAL business number whitelist. Mobile reads the
 * active subset of this table via BusinessWhitelistController's
 * /business-whitelist/sync.
 */
@ApiTags('admin-business-whitelist')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/business-whitelist')
export class AdminBusinessWhitelistController {
  constructor(private readonly service: BusinessWhitelistService) {}

  @Get()
  @ApiOperation({ summary: '[admin] List all whitelisted business numbers (active and inactive), newest first' })
  list() {
    return this.service.findAll();
  }

  @Post()
  @ApiOperation({ summary: '[admin] Add a global whitelisted business number' })
  create(@Body() dto: CreateWhitelistedNumberDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[admin] Partially update a whitelisted business number' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWhitelistedNumberDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[admin] Hard delete a whitelisted business number' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
