/**
 * The three principal kinds the constitution fixes. A request is issued by a
 * member, by an administrator (a member with a role), or by a machine — and
 * guards enforce which routes accept which, so a machine caller can never act
 * as a member.
 */
export type Role = 'user' | 'admin';

export interface UserPrincipal {
  kind: 'user';
  id: string;
  role: Role;
  email?: string;
}

export interface ServicePrincipal {
  kind: 'service';
  id: string;
  name: string;
  scopes: string[];
}

export type Principal = UserPrincipal | ServicePrincipal;

export function isUser(principal: Principal): principal is UserPrincipal {
  return principal.kind === 'user';
}

export function isService(principal: Principal): principal is ServicePrincipal {
  return principal.kind === 'service';
}

export function isAdmin(principal: Principal): boolean {
  return principal.kind === 'user' && principal.role === 'admin';
}

/**
 * The id an audit row and an idempotency key are scoped by. Keying by principal
 * as well as by key is what stops one member's replayed request returning
 * another member's answer.
 */
export function principalId(principal: Principal): string {
  return `${principal.kind}:${principal.id}`;
}
