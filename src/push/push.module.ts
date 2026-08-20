import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceToken } from './device-token.entity';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { PushProvider, NoopPushProvider } from './push.provider';

/**
 * Push delivery. The registration/fan-out/pruning pipeline is complete; the
 * concrete FCM transport drops in behind PushProvider once a Firebase project
 * and service-account credentials exist (same seam as TranscriptionProvider).
 *
 * Until then the provider is the honest no-op: it reports pushes as NOT
 * delivered rather than making the send path look healthy.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DeviceToken])],
  controllers: [PushController],
  providers: [
    PushService,
    {
      provide: PushProvider,
      useFactory: () => new NoopPushProvider(),
    },
  ],
  exports: [PushService],
})
export class PushModule {}
