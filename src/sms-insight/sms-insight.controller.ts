import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../admin/admin.guard';
import { SmsInsightService } from './sms-insight.service';
import { AnalyseSmsDto } from './dto/analyse-sms.dto';

/**
 * The user side of SMS insight.
 *
 * Analysis is opt-in and reviewed: the device only calls /analyse for a user
 * who turned consent on (the server refuses it otherwise), and every profile
 * suggestion it produces waits here for the user to apply or dismiss it. Nothing
 * changes a profile on its own.
 */
@ApiTags('sms-insights')
@ApiBearerAuth()
@Controller('sms-insights')
@UseGuards(AuthGuard('jwt'))
export class SmsInsightController {
  constructor(private readonly insights: SmsInsightService) {}

  @Post('analyse')
  @ApiOperation({ summary: 'Analyse my recent SMS (only if I consented) for suggestions' })
  analyse(@Request() req, @Body() body: AnalyseSmsDto) {
    return this.insights.analyseForUser(
      req.user.userId,
      (body.messages ?? []).map((m) => ({
        body: m.body,
        address: m.address ?? '',
        receivedAt: m.receivedAt ? new Date(m.receivedAt) : new Date(),
      })),
    );
  }

  @Get('profile')
  @ApiOperation({ summary: 'My pending profile-update suggestions' })
  profileSuggestions(@Request() req) {
    return this.insights.pendingProfileFor(req.user.userId);
  }

  @Post(':id/apply')
  @ApiOperation({ summary: 'Accept a profile suggestion — updates my profile' })
  apply(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.insights.applyProfileSuggestion(req.user.userId, id);
  }

  @Post(':id/dismiss')
  @ApiOperation({ summary: 'Dismiss a suggestion' })
  dismiss(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.insights.resolve(req.user.userId, id, 'dismissed');
  }
}

/**
 * The admin side: survey QUESTIONS the analyser proposed across consented
 * users, for review. Approving one is how a proposal becomes a real survey —
 * a deliberate, paid act — so it is never published automatically.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/sms-insights')
@UseGuards(AdminGuard)
export class AdminSmsInsightController {
  constructor(private readonly insights: SmsInsightService) {}

  @Get('surveys')
  @ApiOperation({ summary: 'Survey questions the analyser proposed, for review' })
  surveySuggestions() {
    return this.insights.pendingSurveySuggestions();
  }
}
