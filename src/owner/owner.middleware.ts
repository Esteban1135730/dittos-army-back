import {
  Injectable,
  NestMiddleware,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import {
  coerceOwnerForTcg,
  OWNER_KEYS,
  TCG_KEYS,
} from '../config/owners.config';
import { resolveOwnerFromRequest, runWithOwner } from './owner-context';
import { resolveTcgFromRequest, runWithTcg } from './tcg-context';

/**
 * Sets owner + TCG ALS for the request lifetime.
 * Owner: X-Owner / ?owner=. TCG: X-Tcg / ?tcg= / path `/{tcg}`.
 * Si el owner no pertenece al TCG, se corrige al default de ese TCG.
 */
@Injectable()
export class OwnerMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const resolvedOwner = resolveOwnerFromRequest({
      header: req.headers['x-owner'],
      query: req.query?.owner as string | string[] | undefined,
    });
    if (resolvedOwner == null) {
      next(
        new BadRequestException(
          `Owner inválido. Use X-Owner o ?owner= con valor ${OWNER_KEYS.join(' | ')}`,
        ),
      );
      return;
    }
    const tcg = resolveTcgFromRequest({
      header: req.headers['x-tcg'],
      query: req.query?.tcg as string | string[] | undefined,
      path: req.path,
    });
    if (tcg == null) {
      next(
        new BadRequestException(
          `TCG inválido. Use X-Tcg o ?tcg= con valor ${TCG_KEYS.join(' | ')}`,
        ),
      );
      return;
    }
    const owner = coerceOwnerForTcg(resolvedOwner, tcg);
    runWithOwner(owner, () => {
      runWithTcg(tcg, () => next());
    });
  }
}
