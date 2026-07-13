import { getMetadataArgsStorage } from 'typeorm';
import { Campaign, CAMPAIGN_STATUSES, CAMPAIGN_TYPES, CAMPAIGN_CHANNELS } from './campaign.entity';

const columns = () =>
  getMetadataArgsStorage().columns.filter((c) => c.target === Campaign);

const column = (name: string) => columns().find((c) => c.propertyName === name);

describe('Campaign entity', () => {
  it('maps to the campaigns table', () => {
    const table = getMetadataArgsStorage().tables.find((t) => t.target === Campaign);
    expect(table?.name).toBe('campaigns');
  });

  it('belongs to a business and cascades on delete', () => {
    const rel = getMetadataArgsStorage().relations.find(
      (r) => r.target === Campaign && r.propertyName === 'business',
    );
    expect(rel).toBeDefined();
    expect((rel!.options as any).onDelete).toBe('CASCADE');
    expect(column('businessId')).toBeDefined();
  });

  it('records who it targets, what it dials from, and what it may spend', () => {
    expect(column('name')).toBeDefined();
    expect(column('filters')?.options.type).toBe('simple-json');
    expect(column('callingNumberId')?.options.nullable).toBe(true);
    expect(column('audienceId')?.options.nullable).toBe(true);
    expect(column('budget')?.options.type).toBe('decimal');
    expect(column('spent')?.options.type).toBe('decimal');
    expect(column('leadsPurchased')?.options.default).toBe(0);
  });

  it('starts life as a draft', () => {
    expect(column('status')?.options.default).toBe('draft');
  });

  it('defines the campaign lifecycle', () => {
    expect(CAMPAIGN_STATUSES).toEqual(['draft', 'active', 'paused', 'completed']);
  });

  it('is either an ad or a survey, defaulting to an ad', () => {
    expect(CAMPAIGN_TYPES).toEqual(['ad', 'survey']);
    expect(column('type')?.options.default).toBe('ad');
  });

  it('is delivered in-app or over calls/SMS, defaulting to in-app', () => {
    expect(CAMPAIGN_CHANNELS).toEqual(['in_app', 'calls_sms']);
    expect(column('channel')?.options.default).toBe('in_app');
  });

  it('carries ad creative + CTA, and a survey question list (all optional)', () => {
    expect(column('creative')?.options.nullable).toBe(true);
    expect(column('ctaUrl')?.options.nullable).toBe(true);
    expect(column('questions')?.options.type).toBe('simple-json');
    expect(column('questions')?.options.nullable).toBe(true);
  });
});
