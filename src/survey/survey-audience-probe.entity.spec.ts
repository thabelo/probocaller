import { getMetadataArgsStorage } from 'typeorm';
import { SurveyAudienceProbe } from './survey-audience-probe.entity';

const columns = () =>
  getMetadataArgsStorage().columns.filter((c) => c.target === SurveyAudienceProbe)
    .map((c) => c.propertyName);

describe('SurveyAudienceProbe', () => {
  it('is its own table', () => {
    const table = getMetadataArgsStorage().tables.find((t) => t.target === SurveyAudienceProbe);
    expect(table?.name).toBe('survey_audience_probes');
  });

  it('records who asked, what they asked for, and what they were told', () => {
    expect(columns()).toEqual(
      expect.arrayContaining(['userId', 'businessId', 'filtersJson', 'band', 'probedAt']),
    );
  });

  /**
   * The BAND, not the count. A log that stored the exact number would rebuild
   * the oracle the banding exists to close, for anyone who could read the
   * table — which is the one place a targeting campaign is most legible.
   */
  it('stores the band it answered with, never the exact count', () => {
    expect(columns()).not.toContain('audienceSize');
    expect(columns()).not.toContain('count');
  });
});
