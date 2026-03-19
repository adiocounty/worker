import type { Env } from '../types';

export function isAdmin(request: Request, env: Env): boolean {
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${env.ADMIN_TOKEN}`;
}
