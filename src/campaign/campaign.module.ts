import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { Campaign } from './campaign.entity';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';
import { Business } from '../business/business.entity';
import { BusinessNumber } from '../business/business-number.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, Business, BusinessNumber]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [CampaignController],
  providers: [CampaignService],
  exports: [CampaignService],
})
export class CampaignModule {}
