import { LookupService } from './lookup.service';

/**
 * Regression: community spam reports must count even when the number is NOT a
 * registered Probo user. Unknown numbers are exactly the ones most likely to be
 * scam callers, and Scam Shield relies on this count. The old not-found branch
 * hard-coded userReports: 0, hiding crowd reports about unregistered spammers.
 */
describe('LookupService — community reports on unregistered numbers', () => {
  function makeService(reportCount: number) {
    const userRepo: any = {
      findOne: jest.fn().mockResolvedValue(null), // number isn't a registered user
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(reportCount),
      })),
    };
    const businessService: any = { resolveCallerIdentity: jest.fn() };
    return new LookupService(userRepo, businessService);
  }

  it('counts community spam reports for an unregistered number', async () => {
    const res = await makeService(2).lookup('+27820000001');
    expect(res.found).toBe(false);
    expect(res.flags.userReports).toBe(2);
  });

  it('marks an unregistered number blocked once it crosses the threshold', async () => {
    const res = await makeService(3).lookup('+27820000001');
    expect(res.flags.blocked).toBe(true);
  });

  it('exposes no badge for an unregistered number', async () => {
    const res = await makeService(0).lookup('+27820000001');
    expect(res.badge).toBeNull();
  });
});

describe('LookupService — premium badge', () => {
  function makeServiceForUser(tier: string) {
    const userRepo: any = {
      findOne: jest.fn().mockResolvedValue({
        id: 5, phoneNumber: '+27820000005', isSpam: false, tier,
      }),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      })),
    };
    const businessService: any = { resolveCallerIdentity: jest.fn().mockResolvedValue(null) };
    return new LookupService(userRepo, businessService);
  }

  it('exposes the gold badge for a registered gold user', async () => {
    const res = await makeServiceForUser('gold').lookup('+27820000005');
    expect(res.found).toBe(true);
    expect(res.badge).toBe('gold');
  });

  it('exposes no badge for a free user', async () => {
    const res = await makeServiceForUser('free').lookup('+27820000005');
    expect(res.badge).toBeNull();
  });
});
