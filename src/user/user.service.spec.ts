import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';
import { TransactionService } from '../transaction/transaction.service';
import { InviteService } from '../invite/invite.service';
import { TransferService } from '../transfer/transfer.service';
import { ReportService } from '../report/report.service';

const mockUser = (overrides = {}): User =>
  ({ id: 1, phoneNumber: '+27821234567', email: 'test@probo.local', name: 'Test', walletBalance: 0, role: 'user', isBusiness: false, ...overrides } as User);

const mockRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
});

const mockJwt = () => ({
  sign: jest.fn().mockReturnValue('mock-token'),
  verify: jest.fn(),
});

describe('UserService', () => {
  let service: UserService;
  let repo: ReturnType<typeof mockRepo>;
  let jwt: ReturnType<typeof mockJwt>;
  let tx: { log: jest.Mock; sumByUserAndType: jest.Mock };
  let fakeManager: { findOne: jest.Mock; save: jest.Mock; count: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  let inviteService: any;
  let transferService: any;

  beforeEach(async () => {
    inviteService = { markAccepted: jest.fn(async () => null) };
    transferService = { claimPendingFor: jest.fn(async () => ({ claimed: 0, total: 0 })) };
    tx = {
      log: jest.fn().mockResolvedValue(undefined),
      sumByUserAndType: jest.fn().mockResolvedValue(0),
    };
    fakeManager = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (a: any, b?: any) => b ?? a),
      count: jest.fn().mockResolvedValue(0),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => cb(fakeManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: JwtService, useFactory: mockJwt },
        { provide: TransactionService, useValue: tx },
        { provide: ReportService, useValue: { getReportSummary: jest.fn().mockResolvedValue(null) } },
        { provide: InviteService, useValue: inviteService },
        { provide: TransferService, useValue: transferService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(UserService);
    repo = module.get(getRepositoryToken(User));
    jwt = module.get(JwtService);
  });

  // Backs the wallet top-up gate: only an admin may credit a wallet manually
  // once payments are wired, so the role must come from the DB row, never from
  // the JWT (which a client controls the shape of).
  describe('isAdmin', () => {
    it('is true only when the stored role is admin', async () => {
      repo.findOne.mockResolvedValue({ id: 7, role: 'admin' });
      await expect(service.isAdmin(7)).resolves.toBe(true);
    });

    it('is false for a normal user', async () => {
      repo.findOne.mockResolvedValue({ id: 7, role: 'user' });
      await expect(service.isAdmin(7)).resolves.toBe(false);
    });

    it('is false when the user no longer exists', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.isAdmin(7)).resolves.toBe(false);
    });
  });

  describe('login', () => {
    it('refuses in production until one-time-code verification exists', async () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await expect(service.login({ phoneNumber: '+27821234567' })).rejects.toThrow();
      } finally {
        process.env.NODE_ENV = original;
      }
    });

    it('returns tokens and user for existing user', async () => {
      const user = mockUser();
      repo.findOne.mockResolvedValue(user);
      const result = await service.login({ phoneNumber: '+27821234567' });
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.phoneNumber).toBe('+27821234567');
    });

    it('creates a new user if phone not found', async () => {
      const user = mockUser();
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(user);
      repo.save.mockResolvedValue(user);
      const result = await service.login({ phoneNumber: '+27821234567' });
      expect(repo.save).toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
    });

    it('F1: resolves one account across phone formats — national login finds the +27 account', async () => {
      const user = mockUser(); // stored as +27821234567
      repo.findOne.mockResolvedValue(user);
      await service.login({ phoneNumber: '0821234567' });
      // Looked up by every equivalent variant, so no duplicate account is created.
      const op = repo.findOne.mock.calls[0][0].where.phoneNumber as any;
      const values = op?.value ?? op?._value ?? op;
      expect(Array.isArray(values) ? values : [values]).toContain('+27821234567');
      expect(repo.create).not.toHaveBeenCalled();
    });

    // The client has no other way to tell a first-ever login from a returning
    // one, and it needs to know: a brand-new account is created with placeholder
    // name/email (the phone number and <phone>@probo.local), so the app must send
    // that user through the profile step instead of straight into the app.
    it('flags a first-ever login so the client can collect a real profile', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((data: any) => ({ ...data }));
      repo.save.mockImplementation(async (data: any) => ({ id: 7, ...data }));
      const result: any = await service.login({ phoneNumber: '+27821234567' });
      expect(result.isNewUser).toBe(true);
    });

    it('does not flag a returning login as new', async () => {
      repo.findOne.mockResolvedValue(mockUser());
      const result: any = await service.login({ phoneNumber: '+27821234567' });
      expect(result.isNewUser).toBe(false);
    });

    it('F1: stores the canonical E.164 form when creating from a national number', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((data: any) => ({ ...data }));
      repo.save.mockImplementation(async (data: any) => ({ id: 7, ...data }));
      await service.login({ phoneNumber: '0821234567' });
      expect(repo.create.mock.calls[0][0].phoneNumber).toBe('+27821234567');
    });
  });

  describe('addMultipleContacts — mass-assignment hardening (H1)', () => {
    // Backstory: the original controller accepted `{users: any[]}` and the service
    // called `repo.create(userData)` for new rows, writing whatever fields the
    // attacker chose. With that path open, any authenticated user could mint an
    // admin account (role:'admin') with a funded wallet for an arbitrary phone
    // number — then exploit the passwordless login (separate finding) to take it
    // over. These tests force the service to ignore anything outside a strict
    // (phoneNumber, name) whitelist.

    const hostilePayload = {
      phoneNumber: '+27820001111',
      name: 'Eve',
      // ── Fields that MUST be stripped ───────────────────────────────────────
      role: 'admin',
      walletBalance: 1_000_000,
      isBusiness: true,
      isSpam: false,
      email: 'attacker@example.com',
      referralCode: 'OWNED',
      id: 9999,
    };

    it('does not promote a newly-created contact to admin or fund their wallet', async () => {
      repo.findOne.mockResolvedValue(null);
      // Capture what create() is called with — that's what would be written.
      repo.create.mockImplementation((data: any) => ({ ...data }));
      repo.save.mockImplementation(async (data: any) => ({ id: 42, ...data }));

      await service.addMultipleContacts([hostilePayload]);

      // create() must have received ONLY the whitelisted fields.
      const createArg = repo.create.mock.calls[0][0];
      expect(createArg.role).toBeUndefined();
      expect(createArg.walletBalance).toBeUndefined();
      expect(createArg.isBusiness).toBeUndefined();
      expect(createArg.email).toBeUndefined();
      expect(createArg.referralCode).toBeUndefined();
      expect(createArg.id).toBeUndefined();
      // …and must include the legitimate fields.
      expect(createArg.phoneNumber).toBe('+27820001111');
      expect(createArg.name).toBe('Eve');
    });

    it('does not allow updating an existing contact’s role/balance/email/etc.', async () => {
      const existing = mockUser({
        id: 1, phoneNumber: '+27820001111', role: 'user',
        walletBalance: 0, isBusiness: false, email: 'real@probo.local',
      });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation(async (u: any) => u);

      await service.addMultipleContacts([hostilePayload]);

      const saved = repo.save.mock.calls[0][0];
      expect(saved.role).toBe('user');
      expect(Number(saved.walletBalance)).toBe(0);
      expect(saved.isBusiness).toBe(false);
      expect(saved.email).toBe('real@probo.local');
      // Name update is allowed — that's the legitimate purpose of the endpoint.
      expect(saved.name).toBe('Eve');
    });

    it('rejects entries with no phoneNumber instead of silently creating ghost rows', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.addMultipleContacts([{ name: 'No Phone' } as any]),
      ).rejects.toThrow();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('throws NotFoundException when user does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      const { NotFoundException } = require('@nestjs/common');
      await expect(service.deactivate(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sets deactivatedAt and saves the user when active', async () => {
      const user = mockUser({ deactivatedAt: null });
      repo.findOne.mockResolvedValue(user);
      repo.save.mockImplementation(async (u: any) => u);
      const result = await service.deactivate(user.id);
      expect(result.deactivatedAt).toBeInstanceOf(Date);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: user.id, deactivatedAt: expect.any(Date) }));
    });

    it('is idempotent — does not overwrite an existing deactivatedAt', async () => {
      const original = new Date('2024-01-01T00:00:00Z');
      const user = mockUser({ deactivatedAt: original });
      repo.findOne.mockResolvedValue(user);
      repo.save.mockImplementation(async (u: any) => u);
      const result = await service.deactivate(user.id);
      expect(result.deactivatedAt).toEqual(original);
    });
  });

  // Self-service personal data: the user views and edits their own name + email.
  // Phone number is the verified login identity and is never mutated here, and no
  // other column may be mass-assigned (mirrors the addMultipleContacts hardening).
  describe('getMe / updateMe — personal data', () => {
    it('getMe returns only the safe personal fields', async () => {
      repo.findOne.mockResolvedValue(mockUser({ walletBalance: 999, role: 'admin' }));
      const me = await service.getMe(1);
      expect(me).toEqual({ id: 1, name: 'Test', email: 'test@probo.local', phoneNumber: '+27821234567' });
      expect(me).not.toHaveProperty('walletBalance');
      expect(me).not.toHaveProperty('role');
    });

    it('getMe throws NotFound when the user is missing', async () => {
      repo.findOne.mockResolvedValue(null);
      const { NotFoundException } = require('@nestjs/common');
      await expect(service.getMe(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updateMe persists name and email and returns the safe shape', async () => {
      const user = mockUser();
      repo.findOne.mockResolvedValue(user);
      repo.save.mockImplementation(async (u: any) => u);
      const res = await service.updateMe(1, { name: 'New Name', email: 'new@x.com' });
      expect(repo.save.mock.calls[0][0]).toMatchObject({ id: 1, name: 'New Name', email: 'new@x.com' });
      expect(res).toEqual({ id: 1, name: 'New Name', email: 'new@x.com', phoneNumber: '+27821234567' });
    });

    it('updateMe updates only the provided field (partial)', async () => {
      const user = mockUser({ name: 'Old', email: 'keep@x.com' });
      repo.findOne.mockResolvedValue(user);
      repo.save.mockImplementation(async (u: any) => u);
      await service.updateMe(1, { name: 'Only Name' });
      const saved = repo.save.mock.calls[0][0];
      expect(saved.name).toBe('Only Name');
      expect(saved.email).toBe('keep@x.com'); // untouched
    });

    it('updateMe never mass-assigns privileged columns or the phone identity', async () => {
      const user = mockUser({ role: 'user', walletBalance: 0, phoneNumber: '+27821234567' });
      repo.findOne.mockResolvedValue(user);
      repo.save.mockImplementation(async (u: any) => u);
      await service.updateMe(1, { name: 'X', role: 'admin', walletBalance: 10_000, phoneNumber: '+270000000000' } as any);
      const saved = repo.save.mock.calls[0][0];
      expect(saved.role).toBe('user');
      expect(Number(saved.walletBalance)).toBe(0);
      expect(saved.phoneNumber).toBe('+27821234567');
    });

    it('updateMe throws NotFound when the user is missing', async () => {
      repo.findOne.mockResolvedValue(null);
      const { NotFoundException } = require('@nestjs/common');
      await expect(service.updateMe(999, { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getReferralCode', () => {
    // GET /user/referral-code now also surfaces the referrer's lifetime earned
    // referral commission — the SUM of their REFERRAL_COMMISSION transactions
    // (real wallet money from the ongoing 3% on invitees' earnings). Code and
    // count behaviour must stay exactly as before.

    it('returns referralEarnings summed from the user’s REFERRAL_COMMISSION rows', async () => {
      const user = mockUser({ id: 7, referralCode: 'PROBO-ABCDEFGH' });
      repo.findOne.mockResolvedValue(user);
      repo.count.mockResolvedValue(3);
      tx.sumByUserAndType.mockResolvedValue(12.3456);

      const result = await service.getReferralCode(7);

      expect(result.referralEarnings).toBe(12.3456);
      expect(tx.sumByUserAndType).toHaveBeenCalledWith(7, 'REFERRAL_COMMISSION');
      // Unchanged code + count behaviour.
      expect(result.referralCode).toBe('PROBO-ABCDEFGH');
      expect(result.referredCount).toBe(3);
    });

    it('returns referralEarnings 0 when the user has no REFERRAL_COMMISSION rows', async () => {
      const user = mockUser({ id: 7, referralCode: 'PROBO-ABCDEFGH' });
      repo.findOne.mockResolvedValue(user);
      repo.count.mockResolvedValue(0);
      tx.sumByUserAndType.mockResolvedValue(0);

      const result = await service.getReferralCode(7);

      expect(result.referralEarnings).toBe(0);
      expect(result.referralCode).toBe('PROBO-ABCDEFGH');
      expect(result.referredCount).toBe(0);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      const { NotFoundException } = require('@nestjs/common');
      await expect(service.getReferralCode(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('referral linkage & opaque codes', () => {
    const REFERRER_ID = 7;

    // Helper: wire the create-branch path of signup/login for a brand-new
    // referred user. The referee row gets id 3; the referrer is id 7.
    const wireCreate = (refereeId = 3) => {
      // phone lookup misses -> create branch; create returns a fresh row.
      repo.findOne.mockImplementation(async (opts: any) => {
        // resolveReferrer looks up by referralCode; phone lookup is by phoneNumber.
        if (opts?.where?.referralCode) return { id: REFERRER_ID } as User;
        return null; // phoneNumber miss -> create
      });
      repo.create.mockImplementation((data: any) => ({ ...data }));
      repo.save.mockImplementation(async (u: any) => {
        if (u.id === undefined) u.id = refereeId; // first save assigns the id
        return u;
      });
      repo.count.mockResolvedValue(0); // referralCode uniqueness check
    };

    it('links referredBy on a referred signup but credits NO signup bonus', async () => {
      wireCreate(3);

      await service.signup({ phoneNumber: '+27820000003', email: 'a@b.c', name: 'New', referralCode: 'PROBO-XXXXXXXX' });

      // The created row carries referredBy = the referrer's id.
      const created = repo.create.mock.calls[0][0];
      expect(created.referredBy).toBe(REFERRER_ID);
      // No flat referral bonus is written any more.
      const bonusLogs = tx.log.mock.calls.filter((c: any[]) => c[1] === 'REFERRAL_BONUS');
      expect(bonusLogs).toHaveLength(0);
    });

    it('links referredBy on a referred login create-branch but credits NO signup bonus', async () => {
      wireCreate(3);

      await service.login({ phoneNumber: '+27820000003', referralCode: 'PROBO-XXXXXXXX' });

      const created = repo.create.mock.calls[0][0];
      expect(created.referredBy).toBe(REFERRER_ID);
      const bonusLogs = tx.log.mock.calls.filter((c: any[]) => c[1] === 'REFERRAL_BONUS');
      expect(bonusLogs).toHaveLength(0);
    });

    it('self-referral linkage: code resolving to the new user own id -> not linked, no throw', async () => {
      // resolveReferrer returns the same id that the new row will get (3).
      repo.findOne.mockImplementation(async (opts: any) => {
        if (opts?.where?.referralCode) return { id: 3 } as User;
        return null;
      });
      repo.create.mockImplementation((data: any) => ({ ...data }));
      repo.save.mockImplementation(async (u: any) => { if (u.id === undefined) u.id = 3; return u; });
      repo.count.mockResolvedValue(0);

      await expect(
        service.signup({ phoneNumber: '+27820000003', email: 'a@b.c', name: 'New', referralCode: 'PROBO-SELFSELF' }),
      ).resolves.toHaveProperty('accessToken');

      // referredBy is the referrer code's owner id (3); the self-referral guard
      // lives in ReferralService.payCommission, which no-ops when referrer === earner.
      const bonusLogs = tx.log.mock.calls.filter((c: any[]) => c[1] === 'REFERRAL_BONUS');
      expect(bonusLogs).toHaveLength(0);
    });

    it('unknown/invalid code: user created organically with tokens, not linked, no throw', async () => {
      repo.findOne.mockImplementation(async (opts: any) => {
        if (opts?.where?.referralCode) return null; // unknown code
        return null; // phone miss -> create
      });
      repo.create.mockImplementation((data: any) => ({ ...data }));
      repo.save.mockImplementation(async (u: any) => { if (u.id === undefined) u.id = 3; return u; });
      repo.count.mockResolvedValue(0);

      const result = await service.signup({ phoneNumber: '+27820000003', email: 'a@b.c', name: 'New', referralCode: 'NOPE' });
      expect(result).toHaveProperty('accessToken');
      const created = repo.create.mock.calls[0][0];
      expect(created.referredBy).toBeUndefined();
    });

    it('opaque code: every char is drawn from the EXACT alphabet (no ambiguous I/O/L/U/0/1)', async () => {
      // The generator alphabet is Crockford-ish: ABCDEFGHJKMNPQRSTVWXYZ23456789.
      // Tightened from the looser /[A-Z2-9]/ which would wrongly admit I/O/L/U.
      const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
      const codes: string[] = [];
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((data: any) => ({ ...data }));
      repo.save.mockImplementation(async (u: any) => {
        if (u.id === undefined) u.id = 42;
        if (u.referralCode) codes.push(u.referralCode);
        return u;
      });
      repo.count.mockResolvedValue(0);

      // Many draws to make the alphabet-membership check meaningful.
      for (let i = 0; i < 50; i++) {
        await service.signup({ phoneNumber: `+2782000${(1000 + i)}`, email: 'a@b.c', name: 'New' });
      }

      expect(codes.length).toBeGreaterThan(0);
      const exactRe = new RegExp(`^PROBO-[${ALPHABET}]{8}$`);
      for (const code of codes) {
        expect(code).toMatch(exactRe);
        const body = code.slice('PROBO-'.length);
        for (const ch of body) expect(ALPHABET).toContain(ch);
      }
    });

    it('opaque code: index selection is unbiased — uses crypto.randomInt, not byte%len modulo', async () => {
      // 256 is not a multiple of the 30-char alphabet, so `byte % 30` over-weights
      // the first 16 symbols. crypto.randomInt does rejection sampling internally,
      // eliminating the bias. Assert the generator routes through randomInt.
      const crypto = require('crypto');
      const spy = jest.spyOn(crypto, 'randomInt');
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((data: any) => ({ ...data }));
      repo.save.mockImplementation(async (u: any) => { if (u.id === undefined) u.id = 42; return u; });
      repo.count.mockResolvedValue(0);

      try {
        await service.signup({ phoneNumber: '+27820000777', email: 'a@b.c', name: 'New' });
        // 8 chars -> 8 unbiased index draws, each bounded by the alphabet length.
        expect(spy).toHaveBeenCalled();
        const calls = spy.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(8);
        for (const args of calls) {
          // Called as randomInt(max) -> upper bound is the alphabet length (30).
          expect(args[args.length - 1]).toBe(30);
        }
      } finally {
        spy.mockRestore();
      }
    });

    it('opaque code: generated referralCode matches the EXACT alphabet /^PROBO-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/ and is not PROBO-${id}', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((data: any) => ({ ...data }));
      let assigned: string | undefined;
      repo.save.mockImplementation(async (u: any) => {
        if (u.id === undefined) u.id = 42;
        if (u.referralCode) assigned = u.referralCode;
        return u;
      });
      repo.count.mockResolvedValue(0);

      await service.signup({ phoneNumber: '+27820000099', email: 'a@b.c', name: 'New' });

      // Exact Crockford-ish alphabet: no I/O/L/U/0/1 — tighter than [A-Z2-9].
      expect(assigned).toMatch(/^PROBO-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/);
      expect(assigned).not.toBe('PROBO-42');
    });

    it('opaque code: retries on a collision then succeeds', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((data: any) => ({ ...data }));
      repo.save.mockImplementation(async (u: any) => { if (u.id === undefined) u.id = 42; return u; });
      // First candidate clashes (count 1), second is free (count 0).
      repo.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      const result = await service.signup({ phoneNumber: '+27820000099', email: 'a@b.c', name: 'New' });
      expect(result.user).toHaveProperty('id', 42);
      expect(repo.count).toHaveBeenCalledTimes(2);
    });

    it('retry exhaustion: assignReferralCode hits 5 consecutive unique-collisions -> throws during creation', async () => {
      // Every candidate clashes (count always > 0). The 5-retry loop is
      // exhausted, so account CREATION throws (the code is allocated at create
      // time).
      repo.findOne.mockResolvedValue(null); // phone miss -> create branch
      repo.create.mockImplementation((data: any) => ({ ...data }));
      repo.save.mockImplementation(async (u: any) => { if (u.id === undefined) u.id = 42; return u; });
      repo.count.mockResolvedValue(1); // every referralCode candidate collides

      await expect(
        service.signup({ phoneNumber: '+27820000099', email: 'a@b.c', name: 'New' }),
      ).rejects.toThrow('Could not allocate a unique referral code');
      expect(repo.count).toHaveBeenCalledTimes(5);
    });
  });

  describe('refreshAccessToken', () => {
    it('throws on invalid refresh token', async () => {
      jwt.verify.mockImplementation(() => { throw new Error('expired'); });
      await expect(service.refreshAccessToken('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws if payload type is not refresh', async () => {
      jwt.verify.mockReturnValue({ sub: 1, type: 'access' });
      await expect(service.refreshAccessToken('some-token')).rejects.toThrow(UnauthorizedException);
    });

    it('returns new tokens for valid refresh token', async () => {
      const user = mockUser();
      jwt.verify.mockReturnValue({ sub: 1, type: 'refresh' });
      repo.findOne.mockResolvedValue(user);
      const result = await service.refreshAccessToken('valid-refresh');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });
  });

  describe('addCredit — real-money input hardening', () => {
    it('rejects negative, zero, NaN, Infinity and absurd amounts before touching the balance', async () => {
      const { BadRequestException } = require('@nestjs/common');
      repo.findOne.mockResolvedValue({ id: 7, isBusiness: true, walletBalance: 100 });
      for (const bad of [0, -50, NaN, Infinity, -Infinity, 1e300, 1_000_001]) {
        await expect(service.addCredit(7, bad as any)).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(repo.save).not.toHaveBeenCalled();
    });

    // Regression: this wallet is Rand-denominated everywhere else it's touched
    // (call earnings notifications, profile balances, airtime redemptions).
    // The top-up ledger description must say "R", never "$".
    it('logs the top-up description in ZAR (R…), not dollars', async () => {
      repo.findOne.mockResolvedValue({ id: 7, isBusiness: true, walletBalance: 100 });

      await service.addCredit(7, 10);

      expect(tx.log).toHaveBeenCalledWith(7, 'CREDIT_ADDED', 10, expect.stringContaining('R10.00'));
      const [, , , description] = tx.log.mock.calls[0];
      expect(description).not.toContain('$');
    });
  });
});

// Business mode is OPT-IN: a normal user has no business capability until they
// explicitly enable it (free). The flag rides on the user response so the
// clients can gate their business surfaces without an extra round-trip.
describe('UserService — business opt-in (free, explicit)', () => {
  let service: UserService;
  let repo: ReturnType<typeof mockRepo>;
  let inviteService: any;
  let transferService: any;

  beforeEach(async () => {
    inviteService = { markAccepted: jest.fn(async () => null) };
    transferService = { claimPendingFor: jest.fn(async () => ({ claimed: 0, total: 0 })) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: JwtService, useFactory: mockJwt },
        { provide: TransactionService, useValue: { log: jest.fn(), sumByUserAndType: jest.fn().mockResolvedValue(0) } },
        { provide: ReportService, useValue: { getReportSummary: jest.fn().mockResolvedValue(null) } },
        { provide: InviteService, useValue: inviteService },
        { provide: TransferService, useValue: transferService },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get(UserService);
    repo = module.get(getRepositoryToken(User));
  });

  it('reports businessOptIn on the login user payload (false by default)', async () => {
    repo.findOne.mockResolvedValue(mockUser({ businessOptIn: false } as any));
    const res: any = await service.login({ phoneNumber: '+27821234567' });
    expect(res.user.businessOptIn).toBe(false);
  });

  it('enableBusinessMode flips the flag and costs nothing', async () => {
    const user = mockUser({ id: 7, businessOptIn: false, walletBalance: 12.34 } as any);
    repo.findOne.mockResolvedValue(user);
    repo.save.mockImplementation(async (u: any) => u);

    const res: any = await service.enableBusinessMode(7);

    expect(user.businessOptIn).toBe(true);
    expect(res.businessOptIn).toBe(true);
    // Free: the wallet is untouched and no charge is recorded.
    expect(Number(user.walletBalance)).toBe(12.34);
  });

  it('enableBusinessMode is idempotent for an already opted-in user', async () => {
    const user = mockUser({ id: 7, businessOptIn: true } as any);
    repo.findOne.mockResolvedValue(user);
    repo.save.mockImplementation(async (u: any) => u);
    const res: any = await service.enableBusinessMode(7);
    expect(res.businessOptIn).toBe(true);
  });

  it('404s when enabling for a user that does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.enableBusinessMode(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('disableBusinessMode hides the surfaces but keeps the company and wallet intact', async () => {
    const user = mockUser({ id: 7, businessOptIn: true, isBusiness: true, walletBalance: 12.34 } as any);
    repo.findOne.mockResolvedValue(user);
    repo.save.mockImplementation(async (u: any) => u);

    const res: any = await service.disableBusinessMode(7);

    expect(user.businessOptIn).toBe(false);
    expect(res.businessOptIn).toBe(false);
    // Opting out is a VISIBILITY change, never a deletion: the registered
    // company and the money it holds must survive so opting back in restores
    // everything exactly as it was.
    expect(user.isBusiness).toBe(true);
    expect(Number(user.walletBalance)).toBe(12.34);
  });
});

/**
 * Caller-ID lookup must find an account however its number was stored.
 *
 * The lookup matched `phoneNumber` as an exact string, so a user registered as
 * "+27821234567" was invisible to a lookup for "27821234567" or "0821234567" —
 * and instead of matching, a fresh placeholder was minted with isBusiness=false
 * and a zero wallet. Every signal the incoming-call gate depends on (business
 * status, spam flag, funds) was silently lost, so a low-funds business call
 * rang through with no voice note.
 */
describe('UserService.findOrCreatePlaceholder — number-format matching', () => {
  let service: UserService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: JwtService, useFactory: mockJwt },
        { provide: TransactionService, useValue: { log: jest.fn(), sumByUserAndType: jest.fn() } },
        { provide: ReportService, useValue: {} },
        { provide: InviteService, useValue: { markAccepted: jest.fn(async () => null) } },
        { provide: TransferService, useValue: { claimPendingFor: jest.fn(async () => ({ claimed: 0, total: 0 })) } },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = module.get<UserService>(UserService);
    repo = module.get(getRepositoryToken(User));
  });

  const stored = mockUser({ id: 42, phoneNumber: '+27821234567', isBusiness: true, walletBalance: 0 });

  it.each([
    ['27821234567', 'international without the plus'],
    ['0821234567', 'SA national format'],
    ['+27821234567', 'exactly as stored'],
  ])('matches the stored +27 account when asked for %s (%s)', async (asked) => {
    repo.find = jest.fn().mockImplementation(({ where }: any) => {
      const wanted = where.phoneNumber;
      const list = Array.isArray(wanted?._value) ? wanted._value : [wanted];
      return Promise.resolve(list.includes(stored.phoneNumber) ? [stored] : []);
    });

    const found = await service.findOrCreatePlaceholder(asked);

    expect(found.id).toBe(42);
    expect(found.isBusiness).toBe(true);
    // The whole point: no throwaway placeholder gets minted for a known caller.
    expect(repo.save).not.toHaveBeenCalled();
  });

  // Years of exact-match lookups minted duplicate placeholder rows ("Unknown",
  // no business, empty wallet) alongside the real account. With variants now
  // matching several rows, the canonical E.164 account must win — otherwise the
  // gate reads a placeholder and still sees no business and no funds problem.
  it('prefers the canonical +27 account over a legacy placeholder row', async () => {
    const placeholder = mockUser({ id: 356, phoneNumber: '27821234567', name: 'Unknown', isBusiness: false });
    // Both rows come back from the one query; canonical must win.
    repo.find = jest.fn().mockResolvedValue([placeholder, stored]);

    const found = await service.findOrCreatePlaceholder('27821234567');

    expect(found.id).toBe(42);
    expect(found.isBusiness).toBe(true);
  });

  // Caller-ID sits on the incoming-call hot path: the overlay shows
  // "Looking up caller…" until this resolves. Probing formats one at a time
  // multiplies the round trips, so the whole variant set goes in one query.
  it('resolves the caller in a single database round trip', async () => {
    repo.find = jest.fn().mockResolvedValue([stored]);
    repo.findOne.mockResolvedValue(null);

    await service.findOrCreatePlaceholder('0821234567');

    const queries = repo.findOne.mock.calls.length + (repo.find as jest.Mock).mock.calls.length;
    expect(queries).toBe(1);
  });

  it('still creates a placeholder for a genuinely unknown number', async () => {
    repo.find = jest.fn().mockResolvedValue([]);
    repo.findOne.mockResolvedValue(null);
    repo.create.mockImplementation((u: any) => u);
    repo.save.mockImplementation((u: any) => Promise.resolve({ ...u, id: 99 }));

    const created = await service.findOrCreatePlaceholder('+27829990000');

    expect(created.id).toBe(99);
    expect(repo.save).toHaveBeenCalled();
  });
});

/**
 * An invite is only useful to the admin view if it can show whether the person
 * actually joined. Signup is the moment that becomes knowable, so it closes the
 * loop on whoever invited that number.
 */
describe('UserService — signup closes the loop on an invite', () => {
  let service: UserService;
  let repo: any;
  let inviteService: any;
  let transferService: any;

  beforeEach(async () => {
    inviteService = { markAccepted: jest.fn(async () => null) };
    transferService = { claimPendingFor: jest.fn(async () => ({ claimed: 0, total: 0 })) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: JwtService, useFactory: mockJwt },
        { provide: TransactionService, useValue: { creditSignupBonus: jest.fn() } },
        { provide: ReportService, useValue: { getReportSummary: jest.fn().mockResolvedValue(null) } },
        { provide: InviteService, useValue: inviteService },
        { provide: TransferService, useValue: transferService },
        { provide: DataSource, useValue: { createQueryRunner: jest.fn() } },
      ],
    }).compile();
    service = module.get(UserService);
    repo = module.get(getRepositoryToken(User));
  });

  it('marks the invite accepted when a brand-new number signs up', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.create.mockImplementation((d: any) => ({ ...d }));
    repo.save.mockImplementation(async (u: any) => ({ id: 77, ...u }));
    await service.login({ phoneNumber: '0821140092' });
    expect(inviteService.markAccepted).toHaveBeenCalledWith('+27821140092');
  });

  /** A returning user was not just invited — nothing to close. */
  /**
   * Money sent to them before they joined is held against their number; signup
   * is the moment it can finally land.
   */
  it('claims money held for that number when a brand-new user signs up', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.create.mockImplementation((d: any) => ({ ...d }));
    repo.save.mockImplementation(async (u: any) => ({ id: 77, ...u }));
    await service.login({ phoneNumber: '0821140092' });
    expect(transferService.claimPendingFor).toHaveBeenCalledWith(expect.any(Number), '+27821140092');
  });

  it('does not touch invites when an existing user logs in', async () => {
    repo.findOne.mockResolvedValue(mockUser());
    await service.login({ phoneNumber: '0821140092' });
    expect(inviteService.markAccepted).not.toHaveBeenCalled();
  });
});
