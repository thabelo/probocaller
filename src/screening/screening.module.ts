import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { CallScreening } from './call-screening.entity';
import { ScreeningService } from './screening.service';
import { ScreeningController } from './screening.controller';
import { TranscriptionProvider, StubTranscriptionProvider } from './transcription.provider';
import { OpenAiTranscriptionProvider } from './openai-transcription.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([CallScreening]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [ScreeningController],
  providers: [
    ScreeningService,
    {
      // Use real OpenAI Whisper when a key is configured; otherwise the stub.
      // A placeholder key still selects OpenAI — calls fail and ScreeningService
      // falls back gracefully (see recordScreening try/catch).
      provide: TranscriptionProvider,
      useFactory: () =>
        process.env.OPENAI_API_KEY
          ? new OpenAiTranscriptionProvider()
          : new StubTranscriptionProvider(),
    },
  ],
  exports: [ScreeningService],
})
export class ScreeningModule {}
