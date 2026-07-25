import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { extensionForMime } from '../common/mime-extension';

/**
 * Stores a business's uploaded logo on disk and serves it back publicly. A logo
 * has to render in an `<img>` on the incoming-call screen and caller ID, so —
 * unlike KYB/FICA documents — it is served WITHOUT auth. The upload endpoint is
 * authed; the file itself is public.
 *
 * The returned URL flows straight into the existing `logoUrl` field, so business
 * registration needs no change: upload first, then register with the URL.
 */
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const MAX_BYTES = 2 * 1024 * 1024; // 2MB — a logo, not a hero image.
const SUBDIR = 'business-logos';
// Generated names only: uuid + a .png/.jpg extension. Anything else can't be one
// of ours, so refusing to resolve it closes path-traversal at the door.
const SAFE_NAME = /^[a-f0-9-]+\.(png|jpg)$/i;
const EXT_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg' };

@Injectable()
export class BusinessLogoService {
  private readonly dir: string;

  constructor() {
    const root = process.env.UPLOAD_DIR
      ? path.resolve(process.env.UPLOAD_DIR)
      : path.resolve(process.cwd(), 'uploads');
    this.dir = path.join(root, SUBDIR);
  }

  async save(file: Express.Multer.File): Promise<{ url: string }> {
    if (!file?.buffer) throw new BadRequestException('No image was uploaded');
    if (!ALLOWED.has(String(file.mimetype).toLowerCase())) {
      throw new BadRequestException('Logo must be a PNG or JPG image');
    }
    if (Number(file.size) > MAX_BYTES) {
      throw new BadRequestException('Logo must be 2MB or smaller');
    }

    // Name the file from the validated mime — never the client-supplied name,
    // which could carry a traversal or a misleading extension.
    const name = `${randomUUID()}${extensionForMime(file.mimetype)}`;
    await fs.promises.mkdir(this.dir, { recursive: true });
    await fs.promises.writeFile(path.join(this.dir, name), file.buffer);
    return { url: `/business/logo/${name}` };
  }

  resolve(filename: string): { absPath: string; contentType: string } {
    if (!SAFE_NAME.test(filename)) throw new NotFoundException('Logo not found');
    const absPath = path.join(this.dir, filename);
    if (!fs.existsSync(absPath)) throw new NotFoundException('Logo not found');
    const contentType = EXT_MIME[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
    return { absPath, contentType };
  }
}
