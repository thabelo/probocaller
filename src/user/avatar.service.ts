import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { User } from './user.entity';
import { extensionForMime } from '../common/mime-extension';

/**
 * An avatar is only ever an image — narrower than the FICA uploader this
 * mirrors, which also accepts PDFs.
 */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Optional profile photo storage.
 *
 * The Create-profile screen has always told people their picture would be used
 * for caller ID, while nothing in the stack could store one. Files live on disk
 * under uploads/avatars/<userId>/, and the user row holds only the relative
 * path.
 */
@Injectable()
export class AvatarService {
  private readonly uploadsRoot = path.resolve(process.cwd(), 'uploads');

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async upload(userId: number, file: Express.Multer.File): Promise<User> {
    if (!file) throw new BadRequestException('No image uploaded.');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(`"${file.mimetype}" is not an image. Use JPG, PNG or WebP.`);
    }
    if (file.size > MAX_BYTES) throw new BadRequestException('Image exceeds 5 MB.');

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    const previous = user.avatarPath;

    // Extension from the VALIDATED mime, never the user-supplied filename —
    // otherwise an "evil.php" lands on disk under that name.
    const relDir = path.join('avatars', String(userId));
    const absDir = path.join(this.uploadsRoot, relDir);
    fs.mkdirSync(absDir, { recursive: true });
    // Timestamp alone collides when a photo is replaced within the same
    // millisecond, which also defeats cache-busting on the served URL.
    const unique = `${Date.now()}-${randomBytes(4).toString('hex')}`;
    const fileName = `${unique}${extensionForMime(file.mimetype)}`;
    fs.writeFileSync(path.join(absDir, fileName), file.buffer);

    user.avatarPath = path.join(relDir, fileName);
    const saved = await this.userRepository.save(user);

    // Only after the new one is safely recorded, so a failure never leaves the
    // user with a path pointing at a file that is already gone.
    if (previous && previous !== saved.avatarPath) this.deleteQuietly(previous);

    return saved;
  }

  /** The stored image, for the owner. */
  async read(userId: number): Promise<{ buffer: Buffer; mimeType: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user?.avatarPath) throw new NotFoundException('No profile photo set.');

    const abs = path.resolve(this.uploadsRoot, user.avatarPath);
    // A stored path is not a licence to read anywhere on disk.
    if (!abs.startsWith(this.uploadsRoot + path.sep) || !fs.existsSync(abs)) {
      throw new NotFoundException('No profile photo set.');
    }

    return { buffer: fs.readFileSync(abs), mimeType: mimeForPath(abs) };
  }

  private deleteQuietly(relPath: string): void {
    try {
      const abs = path.resolve(this.uploadsRoot, relPath);
      if (abs.startsWith(this.uploadsRoot + path.sep) && fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {
      /* a leftover file must never fail the upload that replaced it */
    }
  }
}

const mimeForPath = (p: string): string => {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
};
