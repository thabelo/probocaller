import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataBrokerController } from './data-broker.controller';
import { DataBrokerService } from './data-broker.service';
import { CallPermissionRequest } from './call-permission-request.entity';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { PayToContactModule } from '../pay-to-contact/pay-to-contact.module';
import { ProfileModule } from '../profile/profile.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CallPermissionRequest, User, Business]),
    PayToContactModule,
    ProfileModule,
  ],
  controllers: [DataBrokerController],
  providers: [DataBrokerService],
  exports: [DataBrokerService],
})
export class DataBrokerModule {}
