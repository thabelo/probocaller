import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { ScamKeyword } from './scam-keyword.entity';
import { ScamKeywordService } from './scam-keyword.service';
import { AdminScamKeywordController } from './admin-scam-keyword.controller';
import { ScamKeywordController } from './scam-keyword.controller';
import { AdminGuard } from '../admin/admin.guard';
import { User } from '../user/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScamKeyword, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [AdminScamKeywordController, ScamKeywordController],
  providers: [ScamKeywordService, AdminGuard],
  exports: [ScamKeywordService],
})
export class ScamKeywordModule {}
