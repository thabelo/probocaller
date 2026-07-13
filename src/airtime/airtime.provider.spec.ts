import { SA_NETWORKS, SA_NETWORK_CODES, isSupportedNetwork } from './airtime.provider';

describe('airtime provider — SA networks', () => {
  it('lists the four SA mobile networks', () => {
    expect(SA_NETWORK_CODES).toEqual(
      expect.arrayContaining(['VODACOM', 'MTN', 'CELLC', 'TELKOM']),
    );
    expect(SA_NETWORKS.every((n) => n.code && n.label)).toBe(true);
  });

  it('accepts supported networks (case-insensitive) and rejects others', () => {
    expect(isSupportedNetwork('MTN')).toBe(true);
    expect(isSupportedNetwork('vodacom')).toBe(true);
    expect(isSupportedNetwork('SAFARICOM')).toBe(false);
    expect(isSupportedNetwork('')).toBe(false);
    expect(isSupportedNetwork(undefined as any)).toBe(false);
  });
});
