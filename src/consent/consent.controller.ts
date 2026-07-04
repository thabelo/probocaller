import { Controller, Get, Post, Delete, Body, Param, Request, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ConsentService } from './consent.service';
import { ConsentType } from './user-consent.entity';
import { LegalService } from '../legal/legal.service';

const VALID_TYPES: ConsentType[] = ['data_sharing', 'terms', 'privacy'];

@ApiTags('consent')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('consent')
export class ConsentController {
  constructor(
    private readonly consent: ConsentService,
    private readonly legal: LegalService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List my active consents' })
  my(@Request() req) {
    return this.consent.getActive(req.user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Grant consent (e.g. profile data sharing) at the current policy version' })
  async grant(@Request() req, @Body() body: { type: ConsentType; version?: string }) {
    if (!VALID_TYPES.includes(body?.type)) {
      throw new BadRequestException(`type must be one of: ${VALID_TYPES.join(', ')}`);
    }
    // Data sharing is governed by the Privacy Policy; terms/privacy track their own doc.
    const versionSource = body.type === 'data_sharing' ? 'privacy' : body.type;
    const version = body.version ?? this.legal.currentVersion(versionSource);
    return this.consent.grant(req.user.userId, body.type, version);
  }

  @Delete(':type')
  @ApiOperation({ summary: 'Withdraw a consent' })
  async revoke(@Request() req, @Param('type') type: ConsentType) {
    if (!VALID_TYPES.includes(type)) {
      throw new BadRequestException(`type must be one of: ${VALID_TYPES.join(', ')}`);
    }
    return this.consent.revoke(req.user.userId, type);
  }
}
