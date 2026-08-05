import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { UserService } from './user.service';
import { User } from './user.entity';
import { Setting } from '../config/setting.entity';
import { TransactionService } from '../transaction/transaction.service';
import { ReportService } from '../report/report.service';
import { InviteService } from '../invite/invite.service';
import { TransferService } from '../transfer/transfer.service';

/**
 * The send-money contact picker badges each contact as on ProboCaller or not.
 * Doing that one lookup per contact would be hundreds of round trips on a real
 * phonebook (this device has 1,323 contacts), so it is answered in one batch.
 */
describe('UserService.checkRegistered', () => {
  let service: UserService;
  let repo: any;

  beforeEach(async () => {
    repo = { find: jest.fn(async () => []) };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: getRepositoryToken(Setting), useValue: { findOne: jest.fn() } },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: TransactionService, useValue: {} },
        { provide: ReportService, useValue: {} },
        { provide: InviteService, useValue: { markAccepted: jest.fn() } },
        { provide: TransferService, useValue: { claimPendingFor: jest.fn() } },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();
    service = mod.get(UserService);
  });

  it('reports which of the given numbers are on ProboCaller', async () => {
    repo.find.mockResolvedValue([{ id: 5, phoneNumber: '+27821140092', name: 'Mpho', referralCode: 'PROBO-AAA1' }]);
    const out = await service.checkRegistered(['0821140092', '0829998888']);
    expect(out.find((r) => r.phoneNumber === '0821140092')?.registered).toBe(true);
    expect(out.find((r) => r.phoneNumber === '0829998888')?.registered).toBe(false);
  });

  /**
   * Contacts are stored however the owner typed them; a stored "+27…" account
   * must still match a contact saved as "082…" or the badge lies.
   */
  it('matches across stored number formats', async () => {
    repo.find.mockResolvedValue([{ id: 5, phoneNumber: '+27821140092', name: 'Mpho', referralCode: 'PROBO-AAA1' }]);
    const out = await service.checkRegistered(['+27 82 114 0092']);
    expect(out[0].registered).toBe(true);
  });

  it('returns the display name for a registered contact', async () => {
    repo.find.mockResolvedValue([{ id: 5, phoneNumber: '+27821140092', name: 'Mpho Ndlovu', referralCode: 'PROBO-AAA1' }]);
    const out = await service.checkRegistered(['0821140092']);
    expect(out[0].name).toBe('Mpho Ndlovu');
  });

  it('echoes the number exactly as asked, so the client can match rows back', async () => {
    const out = await service.checkRegistered(['082 114 0092']);
    expect(out[0].phoneNumber).toBe('082 114 0092');
  });

  /**
   * Uploading your phonebook creates a User row per contact (addMultipleContacts),
   * so the table is mostly people who never signed up. Badging those as members
   * loses money: the app skips the SMS and the transfer credits a wallet nobody
   * has ever logged into. A referral code is assigned on every real login/signup
   * and never by the contact-directory path, so it is what separates the two.
   */
  it('does not treat a contact-directory row as a member', async () => {
    repo.find.mockResolvedValue([
      { id: 348, phoneNumber: '0825405921', name: 'Unknown', referralCode: null },
    ]);
    const out = await service.checkRegistered(['0825405921']);
    expect(out[0].registered).toBe(false);
  });

  it('handles an empty list without hitting the database', async () => {
    await expect(service.checkRegistered([])).resolves.toEqual([]);
    expect(repo.find).not.toHaveBeenCalled();
  });

  /** A whole phonebook in one request would be a denial-of-service on ourselves. */
  it('caps how many numbers one request may ask about', async () => {
    const many = Array.from({ length: 5000 }, (_, i) => `08211400${i}`);
    const out = await service.checkRegistered(many);
    expect(out.length).toBeLessThanOrEqual(1000);
  });

  it('ignores junk entries rather than querying for them', async () => {
    const out = await service.checkRegistered(['', '   ', 'abc']);
    expect(out.every((r) => r.registered === false)).toBe(true);
    expect(repo.find).not.toHaveBeenCalled();
  });
});
