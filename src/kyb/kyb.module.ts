import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { KybSubmission } from './entities/kyb-submission.entity';
import { KybDocument } from './entities/kyb-document.entity';
import { Business } from '../business/business.entity';
import { User } from '../user/user.entity';
import { KybService } from './kyb.service';
import { KybController } from './kyb.controller';
import { AdminKybController } from './admin-kyb.controller';
import { AdminGuard } from '../admin/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([KybSubmission, KybDocument, Business, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [KybController, AdminKybController],
  providers: [KybService, AdminGuard],
  exports: [KybService],
})
export class KybModule {}
