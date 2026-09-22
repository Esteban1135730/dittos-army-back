import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('GET /health → { ok: true }', () => {
    const controller = new HealthController();
    expect(controller.ok()).toEqual({ ok: true });
  });
});
