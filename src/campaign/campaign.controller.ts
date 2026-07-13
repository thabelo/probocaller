import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request, UseGuards, ParseIntPipe, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CampaignService, CampaignInput } from './campaign.service';

@ApiTags('campaigns')
@ApiBearerAuth()
@Controller('campaigns')
@UseGuards(AuthGuard('jwt'))
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Get()
  @ApiOperation({ summary: 'List the campaigns of a business I own' })
  list(@Request() req, @Query('businessId', ParseIntPipe) businessId: number) {
    return this.campaignService.list(req.user.userId, businessId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a draft campaign for a business I own' })
  create(@Request() req, @Body() body: CampaignInput & { businessId: number }) {
    return this.campaignService.create(req.user.userId, body.businessId, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update one of my campaigns (rename, retarget, budget, status)' })
  update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() body: Partial<CampaignInput>) {
    return this.campaignService.update(req.user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete one of my campaigns' })
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.campaignService.remove(req.user.userId, id);
  }
}
