import { BadRequestException } from '@nestjs/common';
import { ConsentController } from './consent.controller';

describe('ConsentController', () => {
  let controller: ConsentController;
  let consent: { grant: jest.Mock; revoke: jest.Mock; getActive: jest.Mock };
  let legal: { currentVersion: jest.Mock };

  beforeEach(() => {
    consent = { grant: jest.fn(), revoke: jest.fn(), getActive: jest.fn() };
    legal = { currentVersion: jest.fn().mockReturnValue('1.0.0') };
    controller = new ConsentController(consent as any, legal as any);
  });

  it('grants data-sharing consent at the current privacy-policy version when none supplied', async () => {
    consent.grant.mockResolvedValue({ id: 1 });
    await controller.grant({ user: { userId: 7 } } as any, { type: 'data_sharing' } as any);
    expect(legal.currentVersion).toHaveBeenCalledWith('privacy');
    expect(consent.grant).toHaveBeenCalledWith(7, 'data_sharing', '1.0.0');
  });

  it('honours an explicit version in the body', async () => {
    consent.grant.mockResolvedValue({ id: 1 });
    await controller.grant({ user: { userId: 7 } } as any, { type: 'terms', version: '2.1.0' } as any);
    expect(consent.grant).toHaveBeenCalledWith(7, 'terms', '2.1.0');
  });

  it('rejects an unknown consent type', async () => {
    await expect(
      controller.grant({ user: { userId: 7 } } as any, { type: 'whatever' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revokes consent for the authenticated user', async () => {
    consent.revoke.mockResolvedValue({ revoked: 1 });
    await controller.revoke({ user: { userId: 7 } } as any, 'data_sharing');
    expect(consent.revoke).toHaveBeenCalledWith(7, 'data_sharing');
  });

  it('lists the user’s active consents', async () => {
    consent.getActive.mockResolvedValue([]);
    await controller.my({ user: { userId: 7 } } as any);
    expect(consent.getActive).toHaveBeenCalledWith(7);
  });
});
