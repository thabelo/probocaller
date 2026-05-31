import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, HttpCode, HttpStatus, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { BlockedKeywordService } from './blocked-keyword.service';

@ApiTags('blocked-keywords')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('blocked-keywords')
export class BlockedKeywordController {
  constructor(private readonly service: BlockedKeywordService) {}

  @Get()
  @ApiOperation({ summary: 'List my blocked keywords' })
  getAll(@Request() req) {
    return this.service.getAll(req.user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a blocked keyword' })
  add(@Request() req, @Body() body: { keyword: string; scope?: string; note?: string }) {
    return this.service.add(req.user.userId, body);
  }

  @Put(':id/toggle')
  @ApiOperation({ summary: 'Toggle active state' })
  toggle(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.toggle(req.user.userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a blocked keyword' })
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(req.user.userId, id);
  }
}
