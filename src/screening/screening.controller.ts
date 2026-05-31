import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ScreeningService, ScreeningSignals } from './screening.service';

@ApiTags('screening')
@ApiBearerAuth()
@Controller('screening')
@UseGuards(AuthGuard('jwt'))
export class ScreeningController {
  constructor(private readonly screeningService: ScreeningService) {}

  @Post()
  @ApiOperation({ summary: 'Record an AI-assistant screening outcome for an incoming call' })
  record(
    @Request() req,
    @Body() body: { callerNumber: string; signals: ScreeningSignals; audioRef?: string },
  ) {
    return this.screeningService.recordScreening(
      req.user.userId,
      body?.callerNumber,
      body?.signals || {},
      body?.audioRef,
    );
  }

  @Get('history')
  @ApiOperation({ summary: 'List my recent screened calls (transcripts + summaries)' })
  history(@Request() req) {
    return this.screeningService.getHistory(req.user.userId);
  }
}
