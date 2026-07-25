import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Real fs against a throwaway dir — the point of this service is that an
// uploaded image genuinely lands on disk and can be read back byte-for-byte.
describe('BusinessLogoService', () => {
  let tmp: string;
  let make: () => any;

  const png = (bytes = 64) => {
    // A minimal PNG signature followed by filler — enough to be a real buffer.
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return Buffer.concat([sig, Buffer.alloc(bytes)]);
  };
  const file = (over: Partial<Express.Multer.File> = {}): Express.Multer.File =>
    ({ buffer: png(), mimetype: 'image/png', size: png().length, originalname: 'logo.png', ...over } as any);

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blogo-'));
    process.env.UPLOAD_DIR = tmp;
    // Imported lazily so each test picks up the per-test UPLOAD_DIR.
    const { BusinessLogoService } = require('./business-logo.service');
    make = () => new BusinessLogoService();
  });
  afterEach(() => {
    delete process.env.UPLOAD_DIR;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('stores an uploaded PNG and returns a servable URL', async () => {
    const svc = make();
    const { url } = await svc.save(file());
    expect(url).toMatch(/^\/business\/logo\/[A-Za-z0-9-]+\.png$/);

    // The bytes are actually on disk under the business-logos subdir.
    const name = url.split('/').pop();
    const onDisk = fs.readFileSync(path.join(tmp, 'business-logos', name));
    expect(onDisk.equals(file().buffer)).toBe(true);
  });

  it('accepts JPEG and gives it a .jpg extension', async () => {
    const { url } = await make().save(file({ mimetype: 'image/jpeg', originalname: 'x.jpeg' }));
    expect(url).toMatch(/\.jpg$/);
  });

  it('rejects a non-image type (no SVG, no PDF, no script)', async () => {
    await expect(make().save(file({ mimetype: 'image/svg+xml' }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(make().save(file({ mimetype: 'application/pdf' }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an image over the size cap', async () => {
    await expect(make().save(file({ size: 3 * 1024 * 1024 }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not derive the on-disk name from the client filename (no path traversal in, no original name out)', async () => {
    const { url } = await make().save(file({ originalname: '../../etc/passwd.png' }));
    const name = url.split('/').pop();
    expect(name).not.toContain('passwd');
    expect(name).not.toContain('/');
  });

  it('resolves a stored file back to its path and content-type', async () => {
    const svc = make();
    const { url } = await svc.save(file());
    const name = url.split('/').pop();
    const { absPath, contentType } = svc.resolve(name);
    expect(fs.existsSync(absPath)).toBe(true);
    expect(contentType).toBe('image/png');
  });

  it('refuses to resolve a traversal filename', () => {
    expect(() => make().resolve('../../etc/passwd')).toThrow(NotFoundException);
    expect(() => make().resolve('a/b.png')).toThrow(NotFoundException);
  });

  it('404s an unknown logo', () => {
    expect(() => make().resolve('deadbeef.png')).toThrow(NotFoundException);
  });
});
