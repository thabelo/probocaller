import 'reflect-metadata';
import { CampaignModule } from './campaign.module';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';

describe('CampaignModule', () => {
  it('registers the campaign controller and service', () => {
    const controllers = Reflect.getMetadata('controllers', CampaignModule) || [];
    const providers = Reflect.getMetadata('providers', CampaignModule) || [];
    expect(controllers).toContain(CampaignController);
    expect(providers).toContain(CampaignService);
  });
});
