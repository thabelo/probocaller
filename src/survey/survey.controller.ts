import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AppAccessGuard, RequiresApp } from '../marketplace/app-access.guard';
import { SurveyService } from './survey.service';
import { SurveyTemplateService } from './survey-template.service';
import { SurveyPricingService } from './survey-pricing.service';
import { CreateSurveyDto, QuoteSurveyDto, UpdateSurveyDto, AudienceDto } from './dto/survey.dto';
import { SurveyPublishService } from './survey-publish.service';
import { SurveyMatchingService } from './survey-matching.service';
import { SurveyResultsService } from './survey-results.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SurveyAudienceProbe } from './survey-audience-probe.entity';
import { bandAudience } from './survey-audience-band';


/**
 * The business-facing survey builder.
 *
 * Publishing is its own operation rather than a status field: it debits and
 * holds real money (§1.2), so no client may reach it by setting a field.
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
    private readonly publishing: SurveyPublishService,
    private readonly matching: SurveyMatchingService,
    private readonly surveyResults: SurveyResultsService,
    @InjectRepository(SurveyAudienceProbe)
    private readonly probes: Repository<SurveyAudienceProbe>,
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
  @ApiOperation({ summary: 'What a set of questions costs — by response count, or by budget' })
  quote(@Body() body: QuoteSurveyDto) {
    const types = body.questions.map((q) => q.type);
    // A budget answers "how many can I buy?"; a count answers "what will this
    // cost?". Either way the arithmetic stays here.
    return body.budget != null
      ? this.pricing.quoteForBudget(types, body.budget)
      : this.pricing.quote(types, body.targetResponses as number);
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

  /**
   * How many people a filter can actually reach. The builder shows this BEFORE
   * publishing, so a business can see when its targeting is narrower than the
   * number of responses it is about to pay for.
   *
   * Answered in BUCKETS, never exactly. This is the only number a business can
   * ask for repeatedly, for free, without publishing anything and without
   * anybody answering — so an exact count is the cheapest oracle on the
   * platform: ask for "Gauteng, 25-34", get 40; add "has medical aid", get 39;
   * you now know exactly one person in that band has no medical aid, and no
   * suppression rule downstream ever got a say. Bucketing costs an approximate
   * shortfall warning and buys the whole defence.
   *
   * Every probe is recorded. Banding hides a single person; the log is what
   * makes a campaign of forty narrowing probes legible afterwards.
   */
  @Post('audience')
  @ApiOperation({ summary: 'Roughly how many respondents match these filters' })
  async audience(@Request() req, @Body() body: AudienceDto) {
    const filters = body.filters ?? {};
    // A businessId is scoped to the caller like every other survey route —
    // without this, one business could estimate "as" another and write a probe
    // row against a businessId it does not own.
    if (body.businessId != null) {
      await this.surveys.assertOwnsBusiness(req.user.userId, body.businessId);
    }
    const band = bandAudience(
      await this.matching.estimateAudience(filters, { businessId: body.businessId }),
    );

    // Never fail the builder's estimate over the audit row — the business is
    // mid-flow and the write is ours, not theirs.
    await this.probes
      .save(this.probes.create({
        userId: req.user.userId,
        businessId: body.businessId ?? null,
        filtersJson: filters,
        band: band.audienceBand,
      }))
      .catch(() => undefined);

    return band;
  }

  /**
   * The answers this survey bought.
   *
   * Distributions, never responses: a business sees how people answered, in
   * whole cohorts, with any group smaller than the minimum held back. The
   * whole rule is enforced in SurveyResultsService — the controller reads
   * nothing itself, so there is exactly one file to review for it.
   */
  @Get(':id/results')
  @ApiOperation({ summary: 'How people answered — totals only, small groups held back' })
  results(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.surveyResults.forBusiness(req.user.userId, id);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish: hold the money and open the survey for responses' })
  publish(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.publishing.publish(req.user.userId, id);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close early — refunds every response never delivered' })
  close(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.publishing.close(req.user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit one of my drafts' })
  update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateSurveyDto) {
    return this.surveys.update(req.user.userId, id, body as any);
  }

  /**
   * Only a draft can be deleted. Anything published is a record of money that
   * moved and answers people were paid for.
   */
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Throw away one of my drafts' })
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.surveys.deleteDraft(req.user.userId, id);
  }
}
