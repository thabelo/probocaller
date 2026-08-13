import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../admin/admin.guard';
import { SurveyTemplateService } from './survey-template.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/survey-template.dto';

/**
 * Console curation of the survey template library (surveys-spec §3.1).
 * Adding "Insurance NPS" is a data change, not a release.
 *
 * There is no delete, for the same reason the app catalogue has none: surveys
 * are built from a template and stay traceable to it, so withdrawing one is
 * `isActive: false`.
 *
 * The per-question-type fee rates (SURVEY_FEE_*) are NOT here — they are
 * ordinary settings rows, already editable through GET/PUT /admin/config like
 * every other rate on the platform.
 */
@ApiTags('admin')
@Controller('admin/surveys')
@UseGuards(AdminGuard)
export class AdminSurveyController {
  constructor(private readonly templates: SurveyTemplateService) {}

  @Get('templates')
  @ApiOperation({ summary: 'The whole template library, retired ones included' })
  async listTemplates() {
    return this.templates.listAll();
  }

  @Post('templates')
  @ApiOperation({ summary: 'Add a template to the library' })
  async createTemplate(@Body() body: CreateTemplateDto) {
    return this.templates.create(body);
  }

  @Patch('templates/:key')
  @ApiOperation({ summary: 'Edit a template, or retire it with isActive: false' })
  async updateTemplate(@Param('key') key: string, @Body() body: UpdateTemplateDto) {
    return this.templates.update(key, body);
  }
}
