import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { App } from './app.entity';
import { AppInstall } from './app-install.entity';
import { MarketplaceService } from './marketplace.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([App, AppInstall]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
