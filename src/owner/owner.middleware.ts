import {
  Injectable,
  NestMiddleware,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { resolveOwnerFromRequest, runWithOwner } from './owner-context';
import { resolveTcgFromRequest, runWithTcg } from './tcg-context';

/**
 * Sets owner + TCG ALS for the request lifetime.
 * Owner: X-Owner / ?owner=. TCG: X-Tcg / ?tcg= / path `/yugioh`.
 */
@Injectable()
export class OwnerMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const owner = resolveOwnerFromRequest({
      header: req.headers['x-owner'],
      query: req.query?.owner as string | string[] | undefined,
    });
    if (owner == null) {
      next(
        new BadRequestException(
          'Owner inválido. Use X-Owner o ?owner= con valor pablo | esteban',
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
          'TCG inválido. Use X-Tcg o ?tcg= con valor pokemon | yugioh',
        ),
      );
      return;
    }
    runWithOwner(owner, () => {
      runWithTcg(tcg, () => next());
    });
  }
}
