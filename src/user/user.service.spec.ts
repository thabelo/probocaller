import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';
import { TransactionService } from '../transaction/transaction.service';
import { ReportService } from '../report/report.service';

const mockUser = (overrides = {}): User =>
  ({ id: 1, phoneNumber: '+27821234567', email: 'test@probo.local', name: 'Test', walletBalance: 0, role: 'user', isBusiness: false, ...overrides } as User);

const mockRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
});

const mockJwt = () => ({
  sign: jest.fn().mockReturnValue('mock-token'),
  verify: jest.fn(),
});

describe('UserService', () => {
  let service: UserService;
  let repo: ReturnType<typeof mockRepo>;
  let jwt: ReturnType<typeof mockJwt>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: JwtService, useFactory: mockJwt },
        { provide: TransactionService, useValue: { recordCredit: jest.fn() } },
        { provide: ReportService, useValue: { getReportSummary: jest.fn().mockResolvedValue(null) } },
      ],
    }).compile();

    service = module.get(UserService);
    repo = module.get(getRepositoryToken(User));
    jwt = module.get(JwtService);
  });

  describe('login', () => {
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
});
