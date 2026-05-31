import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { SpamReport } from './spam-report.entity';
import { SpamReportService } from './spam-report.service';
import { SpamReportController } from './spam-report.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SpamReport]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [SpamReportController],
  providers: [SpamReportService],
  exports: [SpamReportService],
})
export class SpamReportModule {}
