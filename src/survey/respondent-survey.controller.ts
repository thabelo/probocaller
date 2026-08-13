import {
  Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AppAccessGuard, RequiresApp } from '../marketplace/app-access.guard';
import { SurveyResponseService } from './survey-response.service';
import { SubmitAnswersDto } from './dto/submit-answers.dto';

/**
 * Answering surveys and getting paid — the personal half of the product.
 *
 * Gated on the `surveys` app rather than `survey-campaigns`: they are two
 * catalogue entries for one product with different audiences, and installing
 * `surveys` IS the consent to be matched on demographics (§2.2).
 *
 * There is no route here that reveals who answered anything. A business sees
 * answers plus the bands it targeted, never an identity (§2.1).
 */
@ApiTags('surveys')
@ApiBearerAuth()
@Controller('my-surveys')
@UseGuards(AuthGuard('jwt'), AppAccessGuard)
@RequiresApp('surveys')
export class RespondentSurveyController {
  constructor(private readonly responses: SurveyResponseService) {}

  /**
   * Surveys this person matches and has not answered — each stating what it
   * pays and how many questions it asks, so the decision to start is informed.
   */
  @Get()
  @ApiOperation({ summary: 'Surveys I can answer, with what each one pays' })
  available(@Request() req) {
    return this.responses.available(req.user.userId);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit answers and get paid' })
  submit(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SubmitAnswersDto,
  ) {
    return this.responses.submit(req.user.userId, id, body.answers);
  }
}
