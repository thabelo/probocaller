import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { UserConsent } from './user-consent.entity';
import { ConsentService } from './consent.service';
import { ConsentController } from './consent.controller';
import { LegalModule } from '../legal/legal.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserConsent]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    LegalModule,
  ],
  controllers: [ConsentController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
