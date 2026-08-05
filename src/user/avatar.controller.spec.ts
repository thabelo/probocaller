import { AvatarController } from './avatar.controller';

/**
 * The avatar endpoints carry someone's face. They must be keyed on the JWT
 * subject, never on a caller-supplied id — otherwise anyone can read anyone's
 * photo by guessing a number.
 */
describe('AvatarController', () => {
  const service = { upload: jest.fn(), read: jest.fn() };
  const controller = new AvatarController(service as any);

  beforeEach(() => jest.clearAllMocks());

  it('uploads against the authenticated user only', async () => {
    const file: any = { mimetype: 'image/jpeg', size: 10, buffer: Buffer.alloc(10) };
    service.upload.mockResolvedValue({ id: 42, avatarPath: 'avatars/42/x.jpg' });

    await controller.upload({ user: { userId: 42 } } as any, file);

    expect(service.upload).toHaveBeenCalledWith(42, file);
  });

  /** The stored path is an internal detail; the client only needs "is one set". */
  it('reports that a photo exists without leaking its path on disk', async () => {
    service.upload.mockResolvedValue({ id: 42, avatarPath: 'avatars/42/x.jpg' });
    const res: any = await controller.upload({ user: { userId: 42 } } as any, {} as any);
    expect(res.hasPhoto).toBe(true);
    expect(JSON.stringify(res)).not.toContain('avatars/42');
  });

  it('serves the image for the authenticated user, with its content type', async () => {
    service.read.mockResolvedValue({ buffer: Buffer.from('img'), mimeType: 'image/png' });
    const res: any = { set: jest.fn(), send: jest.fn() };

    await controller.read({ user: { userId: 42 } } as any, res);

    expect(service.read).toHaveBeenCalledWith(42);
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'image/png' }));
    expect(res.send).toHaveBeenCalled();
  });

  it('is behind the jwt guard', () => {
    const guards = Reflect.getMetadata('__guards__', AvatarController) ?? [];
    expect(guards.length).toBeGreaterThan(0);
  });
});
