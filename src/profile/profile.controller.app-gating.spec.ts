import 'reflect-metadata';
import { ProfileController } from './profile.controller';
import { REQUIRES_APP } from '../marketplace/app-access.guard';

/**
 * Audience & Leads is a marketplace app, so buying other people's profile data
 * requires having installed it — enforced on the route, not just hidden in the
 * UI.
 *
 * The exclusions matter as much as the inclusions. Pricing has to be readable
 * BEFORE installing or App Detail could not show what the app costs, and
 * certificate validation is how a third party checks an authorisation they were
 * shown — neither is the buyer using the product.
 */
describe('ProfileController — Audience & Leads gating', () => {
  const appFor = (method: keyof ProfileController) =>
    Reflect.getMetadata(REQUIRES_APP, ProfileController.prototype[method] as any);

  it.each([
    'getBusinessLeads',
    'getMyCertificates',
    'getCertificateLeads',
    'queryAudience',
    'purchaseLeads',
    'aggregateReport',
    'saveAudience',
    'getSavedAudiences',
    'deleteAudience',
  ] as Array<keyof ProfileController>)('%s requires the app', (method) => {
    expect(appFor(method)).toBe('audience-leads');
  });

  it('pricing stays readable before installing', () => {
    expect(appFor('getLeadsPricing')).toBeUndefined();
  });

  it('certificate validation stays open to whoever was shown the code', () => {
    expect(appFor('validateCertificate')).toBeUndefined();
  });

  /**
   * The seller side is NOT gated. Removing Databroker must not hide a user's
   * own profile or access log — the remove sheet promises the log stays and the
   * data isn't deleted — and erasure has to survive opt-out for GDPR.
   */
  it.each(['getMyProfile', 'getAccessLog', 'eraseData'] as Array<keyof ProfileController>)(
    '%s stays reachable after removing Databroker',
    (method) => {
      expect(appFor(method)).toBeUndefined();
    },
  );
});
