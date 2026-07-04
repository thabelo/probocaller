import { LegalController } from './legal.controller';

describe('LegalController', () => {
  let controller: LegalController;
  let service: { get: jest.Mock; list: jest.Mock };

  beforeEach(() => {
    service = { get: jest.fn(), list: jest.fn() };
    controller = new LegalController(service as any);
  });

  it('serves the Terms of Service', () => {
    service.get.mockReturnValue({ type: 'terms' });
    expect(controller.terms()).toEqual({ type: 'terms' });
    expect(service.get).toHaveBeenCalledWith('terms');
  });

  it('serves the Privacy Policy', () => {
    service.get.mockReturnValue({ type: 'privacy' });
    expect(controller.privacy()).toEqual({ type: 'privacy' });
    expect(service.get).toHaveBeenCalledWith('privacy');
  });

  it('lists document metadata', () => {
    service.list.mockReturnValue([]);
    expect(controller.list()).toEqual([]);
    expect(service.list).toHaveBeenCalled();
  });
});
