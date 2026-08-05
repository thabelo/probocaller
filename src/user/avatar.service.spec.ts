import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AvatarService } from './avatar.service';
import { User } from './user.entity';

/**
 * Optional profile photo.
 *
 * The Create-profile screen tells people "your name and profile picture will be
 * used for caller Id", but there was no way to add one — no picker, no column,
 * no endpoint. This is the storage half.
 *
 * Deliberately narrower than the FICA uploader it mirrors: an avatar is only
 * ever an image, never a PDF, and it is small.
 */
describe('AvatarService', () => {
  let service: AvatarService;
  let repo: any;
  let root: string;

  const jpeg = (size = 1024): Express.Multer.File =>
    ({ mimetype: 'image/jpeg', size, buffer: Buffer.alloc(size, 1) } as any);

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-test-'));
    repo = {
      findOne: jest.fn(async () => ({ id: 7, avatarPath: null })),
      save: jest.fn(async (u: any) => u),
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        AvatarService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();
    service = mod.get(AvatarService);
    (service as any).uploadsRoot = root;
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('stores the image and records its path against the user', async () => {
    const saved = await service.upload(7, jpeg());
    expect(saved.avatarPath).toMatch(/avatars[\\/]7[\\/]/);
    expect(fs.existsSync(path.join(root, saved.avatarPath))).toBe(true);
  });

  /**
   * The extension comes from the VALIDATED mime, never the user-supplied
   * filename — otherwise "x.php" lands on disk with that name.
   */
  it('names the file from the validated mime, not the upload name', async () => {
    const file = { ...jpeg(), originalname: 'evil.php' } as any;
    const saved = await service.upload(7, file);
    expect(saved.avatarPath.endsWith('.jpg')).toBe(true);
    expect(saved.avatarPath).not.toContain('php');
  });

  it('rejects anything that is not an image', async () => {
    const pdf = { mimetype: 'application/pdf', size: 10, buffer: Buffer.alloc(10) } as any;
    await expect(service.upload(7, pdf)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an oversized image', async () => {
    await expect(service.upload(7, jpeg(6 * 1024 * 1024))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an empty upload', async () => {
    await expect(service.upload(7, undefined as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to store one for a user that does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.upload(7, jpeg())).rejects.toBeInstanceOf(NotFoundException);
  });

  /** Replacing a photo must not leave the old file behind forever. */
  it('deletes the previous photo when a new one replaces it', async () => {
    const first = await service.upload(7, jpeg());
    const firstAbs = path.join(root, first.avatarPath);
    repo.findOne.mockResolvedValue({ id: 7, avatarPath: first.avatarPath });

    const second = await service.upload(7, jpeg());
    expect(second.avatarPath).not.toBe(first.avatarPath);
    expect(fs.existsSync(firstAbs)).toBe(false);
  });

  describe('reading one back', () => {
    it('returns the bytes for the owner', async () => {
      const saved = await service.upload(7, jpeg());
      repo.findOne.mockResolvedValue({ id: 7, avatarPath: saved.avatarPath });
      const out = await service.read(7);
      expect(out.buffer.length).toBeGreaterThan(0);
      expect(out.mimeType).toBe('image/jpeg');
    });

    it('is a clean not-found when the user never set one', async () => {
      repo.findOne.mockResolvedValue({ id: 7, avatarPath: null });
      await expect(service.read(7)).rejects.toBeInstanceOf(NotFoundException);
    });

    /**
     * A stored path is not a licence to read anywhere on disk — a traversal
     * value must not escape the uploads root.
     */
    it('refuses to read outside the uploads directory', async () => {
      repo.findOne.mockResolvedValue({ id: 7, avatarPath: '../../../etc/passwd' });
      await expect(service.read(7)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
