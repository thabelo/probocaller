import { DataCertificate } from './data-certificate.entity';

describe('DataCertificate entity', () => {
  it('carries the fields needed to validate a business authorisation window', () => {
    const cert = new DataCertificate();
    cert.code = 'PC-3F9K-27A1';
    cert.businessId = 4;
    cert.businessName = 'MTN HO';
    cert.periodStart = new Date('2026-01-01');
    cert.periodEnd = new Date('2026-01-31');
    cert.leadCount = 2;
    cert.userIds = [100, 200];
    cert.purpose = 'CRM';

    expect(cert.code).toBe('PC-3F9K-27A1');
    expect(cert.businessId).toBe(4);
    expect(cert.userIds).toEqual([100, 200]);
    expect(cert.periodEnd.getTime()).toBeGreaterThan(cert.periodStart.getTime());
  });
});
