import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GdprService } from './gdpr.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('user/me')
export class GdprController {
  constructor(private readonly gdpr: GdprService) {}

  @Get('export')
  @ApiOperation({ summary: 'GDPR data export — returns all PII and related rows for the current user' })
  exportMine(@Request() req) {
    return this.gdpr.exportForUser(req.user.userId);
  }
}
