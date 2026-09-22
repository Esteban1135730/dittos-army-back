import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

function readHeader(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? '');
  return String(value ?? '');
}

/** Timing-safe compare; length mismatch still hashes against itself. */
export function timingSafeEqualToken(
  provided: string,
  expected: string,
): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function configuredSyncToken(): string {
  return process.env.SYNC_TOKEN?.trim() ?? '';
}

/**
 * If `SYNC_TOKEN` is empty, skip (LAN/dev). If set, require header `X-Sync-Token`.
 * Always skip GET /health (Render / load balancers).
 */
@Injectable()
export class SyncTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      path?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const path = (request.path ?? request.url ?? '').split('?')[0];
    if (
      request.method === 'GET' &&
      (path === '/health' || path.endsWith('/health'))
    ) {
      return true;
    }

    const expected = configuredSyncToken();
    if (!expected) return true;

    const provided = readHeader(request.headers?.['x-sync-token']);
    if (!timingSafeEqualToken(provided, expected)) {
      throw new UnauthorizedException('Token de sync incorrecto');
    }
    return true;
  }
}
