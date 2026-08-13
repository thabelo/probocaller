import {
  Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Request, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AppAccessGuard, RequiresApp } from '../marketplace/app-access.guard';
import { SurveyService } from './survey.service';
import { SurveyTemplateService } from './survey-template.service';
import { SurveyPricingService } from './survey-pricing.service';
import { CreateSurveyDto, QuoteSurveyDto, UpdateSurveyDto } from './dto/survey.dto';


/**
 * The business-facing survey builder (build-order step 2). DRAFT ONLY —
 * publishing holds money against a wallet and is step 3, so there is
 * deliberately no publish route here yet.
 *
 * Gated on the `survey-campaigns` app: publishing surveys is what that app IS,
 * so entitlement comes from the install rather than being re-derived locally.
 *
 * The builder is an API first and two clients second (surveys-spec §3.4) —
 * the web console and the mobile app both call exactly these routes.
 */
@ApiTags('surveys')
@ApiBearerAuth()
@Controller('surveys')
@UseGuards(AuthGuard('jwt'), AppAccessGuard)
@RequiresApp('survey-campaigns')
export class SurveyController {
  constructor(
    private readonly surveys: SurveyService,
    private readonly templateLibrary: SurveyTemplateService,
    private readonly pricing: SurveyPricingService,
  ) {}

  @Get('templates')
  @ApiOperation({ summary: 'The templates a survey can be built from' })
  templates() {
    return this.templateLibrary.listActive();
  }

  /**
   * Price a survey that does not exist yet. Without this the builder can only
   * show a cost after the business has committed to building something.
   */
  @Post('quote')
  @ApiOperation({ summary: 'What a set of questions would cost per response and in total' })
  quote(@Body() body: QuoteSurveyDto) {
    return this.pricing.quote(body.questions.map((q) => q.type), body.targetResponses);
  }

  @Get()
  @ApiOperation({ summary: 'The surveys of a business I own' })
  list(@Request() req, @Query('businessId', ParseIntPipe) businessId: number) {
    return this.surveys.list(req.user.userId, businessId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my surveys, with its questions and a live quote' })
  get(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.surveys.get(req.user.userId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a draft survey, from a template or from blank' })
  create(@Request() req, @Body() body: CreateSurveyDto) {
    return this.surveys.createDraft(req.user.userId, {
      ...body,
      durationDays: body.durationDays ?? null,
    } as any);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit one of my drafts' })
  update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateSurveyDto) {
    return this.surveys.update(req.user.userId, id, body as any);
  }
}
