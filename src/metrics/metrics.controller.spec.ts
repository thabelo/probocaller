import { MetricsController } from './metrics.controller';

/**
 * The scrape endpoint. Prometheus needs the exposition format verbatim and the
 * right content type — a JSON-wrapped body silently produces an unusable target.
 */
describe('MetricsController', () => {
  const makeController = () => {
    const service: any = {
      render: jest.fn().mockResolvedValue('# HELP up 1\n# TYPE up gauge\nup 1\n'),
      contentType: jest.fn().mockReturnValue('text/plain; version=0.0.4; charset=utf-8'),
    };
    const res: any = { set: jest.fn(), send: jest.fn() };
    return { controller: new MetricsController(service), service, res };
  };

  it('returns the exposition text unwrapped', async () => {
    const { controller, res } = makeController();
    await controller.metrics(res);
    expect(res.send).toHaveBeenCalledWith('# HELP up 1\n# TYPE up gauge\nup 1\n');
  });

  it('sets the Prometheus content type', async () => {
    const { controller, res, service } = makeController();
    await controller.metrics(res);
    expect(res.set).toHaveBeenCalledWith('Content-Type', service.contentType());
  });
});
