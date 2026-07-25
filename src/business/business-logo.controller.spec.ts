import { BadRequestException } from '@nestjs/common';
import { BusinessLogoController } from './business-logo.controller';

describe('BusinessLogoController', () => {
  const makeSvc = () => ({ save: jest.fn(), resolve: jest.fn() });

  it('uploads the file to the service and returns its URL', async () => {
    const svc = makeSvc();
    svc.save.mockResolvedValue({ url: '/business/logo/abc.png' });
    const c = new BusinessLogoController(svc as any);
    const file = { buffer: Buffer.from('x'), mimetype: 'image/png', size: 1 } as any;

    const res = await c.upload(file);

    expect(res).toEqual({ url: '/business/logo/abc.png' });
    expect(svc.save).toHaveBeenCalledWith(file);
  });

  it('rejects a request with no file before touching the service', async () => {
    const svc = makeSvc();
    const c = new BusinessLogoController(svc as any);
    await expect(c.upload(undefined as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(svc.save).not.toHaveBeenCalled();
  });

  it('streams a stored logo with the right content-type and a cache header', () => {
    const svc = makeSvc();
    svc.resolve.mockReturnValue({ absPath: __filename, contentType: 'image/png' });
    const c = new BusinessLogoController(svc as any);
    const res: any = { setHeader: jest.fn() };

    const out = c.serve('abc.png', res);

    expect(svc.resolve).toHaveBeenCalledWith('abc.png');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('max-age'));
    // A StreamableFile is returned for Nest to pipe.
    expect(out).toBeDefined();
  });
});
