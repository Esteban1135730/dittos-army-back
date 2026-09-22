import { UnauthorizedException } from '@nestjs/common';
import { SyncTokenGuard, timingSafeEqualToken } from './sync-token.guard';

function httpContext(token?: string, path = '/stock', method = 'GET') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        path,
        url: path,
        headers: token === undefined ? {} : { 'x-sync-token': token },
      }),
    }),
  } as never;
}

describe('SyncTokenGuard', () => {
  const prev = process.env.SYNC_TOKEN;

  afterEach(() => {
    if (prev === undefined) delete process.env.SYNC_TOKEN;
    else process.env.SYNC_TOKEN = prev;
  });

  it('timingSafeEqualToken acepta igual y rechaza distinto', () => {
    expect(timingSafeEqualToken('abc', 'abc')).toBe(true);
    expect(timingSafeEqualToken('abc', 'abd')).toBe(false);
    expect(timingSafeEqualToken('ab', 'abc')).toBe(false);
  });

  it('GET /health no exige token aunque SYNC_TOKEN esté definido', () => {
    process.env.SYNC_TOKEN = 'secret-token';
    const guard = new SyncTokenGuard();
    expect(guard.canActivate(httpContext(undefined, '/health'))).toBe(true);
  });

  it('sin SYNC_TOKEN no exige header', () => {
    process.env.SYNC_TOKEN = '';
    const guard = new SyncTokenGuard();
    expect(guard.canActivate(httpContext())).toBe(true);
  });

  it('con SYNC_TOKEN y header correcto → true', () => {
    process.env.SYNC_TOKEN = 'secret-token';
    const guard = new SyncTokenGuard();
    expect(guard.canActivate(httpContext('secret-token'))).toBe(true);
  });

  it('con SYNC_TOKEN y header mal → 401', () => {
    process.env.SYNC_TOKEN = 'secret-token';
    const guard = new SyncTokenGuard();
    expect(() => guard.canActivate(httpContext('wrong'))).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(httpContext())).toThrow(
      UnauthorizedException,
    );
  });
});
