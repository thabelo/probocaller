import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SubscriptionService } from './subscription.service';

@ApiTags('subscription')
@ApiBearerAuth()
@Controller('subscription')
@UseGuards(AuthGuard('jwt'))
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  @ApiOperation({ summary: 'Get my tier and its benefits (badge, ad-free, support priority)' })
  mine(@Request() req) {
    return this.subscriptionService.getBenefits(req.user.userId);
  }

  @Put()
  @ApiOperation({ summary: 'Set my subscription tier (sandbox; real billing via IAP later)' })
  update(@Request() req, @Body() body: { tier: string }) {
    return this.subscriptionService.setTier(req.user.userId, body?.tier);
  }
}
