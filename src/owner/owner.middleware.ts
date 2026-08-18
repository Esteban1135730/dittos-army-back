import {
  Injectable,
  NestMiddleware,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { resolveOwnerFromRequest, runWithOwner } from './owner-context';

/**
 * Sets owner ALS for the request lifetime from X-Owner / ?owner=.
 * Registered globally in AppModule.
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
    runWithOwner(owner, () => next());
  }
}
