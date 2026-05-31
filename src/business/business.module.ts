import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { Business } from './business.entity';
import { BusinessNumber } from './business-number.entity';
import { User } from '../user/user.entity';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, BusinessNumber, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [BusinessController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
