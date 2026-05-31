import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { CallScreening } from './call-screening.entity';
import { ScreeningService } from './screening.service';
import { ScreeningController } from './screening.controller';
import { TranscriptionProvider, StubTranscriptionProvider } from './transcription.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([CallScreening]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [ScreeningController],
  providers: [
    ScreeningService,
    { provide: TranscriptionProvider, useClass: StubTranscriptionProvider },
  ],
  exports: [ScreeningService],
})
export class ScreeningModule {}
