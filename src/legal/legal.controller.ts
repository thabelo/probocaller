import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LegalService } from './legal.service';

@ApiTags('legal')
@Controller('legal')
export class LegalController {
  constructor(private readonly service: LegalService) {}

  @Get()
  @ApiOperation({ summary: 'List legal documents with current versions' })
  list() {
    return this.service.list();
  }

  @Get('terms')
  @ApiOperation({ summary: 'Get the current Terms of Service' })
  terms() {
    return this.service.get('terms');
  }

  @Get('privacy')
  @ApiOperation({ summary: 'Get the current Privacy Policy' })
  privacy() {
    return this.service.get('privacy');
  }
}
