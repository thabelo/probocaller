import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { BlockedKeyword } from './blocked-keyword.entity';
import { BlockedKeywordService } from './blocked-keyword.service';
import { BlockedKeywordController } from './blocked-keyword.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BlockedKeyword]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [BlockedKeywordController],
  providers: [BlockedKeywordService],
  exports: [BlockedKeywordService],
})
export class BlockedKeywordModule {}
