import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FeatureKey } from '../config/owners.config';
import { isFeatureAllowed } from '../config/owners.config';
import { getCurrentOwner } from './owner-context';

export const REQUIRED_FEATURE_KEY = 'requiredFeature';

export const RequireFeature = (feature: FeatureKey) =>
  SetMetadata(REQUIRED_FEATURE_KEY, feature);

@Injectable()
export class FeatureAclGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<FeatureKey | undefined>(
      REQUIRED_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!feature) return true;

    const owner = getCurrentOwner();
    if (!isFeatureAllowed(owner, feature)) {
      throw new ForbiddenException(
        `Feature "${feature}" no permitida para owner "${owner}"`,
      );
    }
    return true;
  }
}

/** Imperative ACL check for services/controllers without decorator. */
export function assertFeatureAllowed(feature: FeatureKey): void {
  const owner = getCurrentOwner();
  if (!isFeatureAllowed(owner, feature)) {
    throw new ForbiddenException(
      `Feature "${feature}" no permitida para owner "${owner}"`,
    );
  }
}
