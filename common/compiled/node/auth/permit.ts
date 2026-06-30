import type { NextFunction, Request, Response } from 'express';
import { roleOperationMatch } from '../t4t/t4t-utils.ts';

export function requireRole(supplement: Record<string, unknown>, operation: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const perm = supplement[operation];
    if (perm === true || perm === undefined) return next();
    if (perm === false) {
      res.status(403).json({ error: `Forbidden - ${operation}` });
      return;
    }

    // biome-ignore lint/suspicious/noExplicitAny: user property added by authUser middleware
    const userRoles = (req as any).user?.roles;
    const roleStr = Array.isArray(userRoles) ? userRoles.join(',') : ((userRoles as string) ?? '');

    if (!roleOperationMatch(roleStr, perm as string)) {
      res.status(403).json({ error: `Forbidden - ${operation}` });
      return;
    }
    next();
  };
}
