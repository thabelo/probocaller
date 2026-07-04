import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminGuard } from '../admin/admin.guard';
import { DataRetentionService } from './data-retention.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/retention')
export class RetentionController {
  constructor(private readonly service: DataRetentionService) {}

  @Post('purge')
  @ApiOperation({ summary: 'Run the data-retention purge now (admin only)' })
  purge() {
    return this.service.purgeExpired();
  }
}
