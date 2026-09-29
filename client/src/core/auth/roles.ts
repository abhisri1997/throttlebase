/**
 * What the signed-in rider may do beyond riding, from the roles on their
 * profile (rider_roles on the server: 'admin', 'support').
 *
 * Only decides what the app shows. The server checks the roles in the access
 * token on every admin request, so a wrong answer here hides or shows a
 * button, never grants access.
 */
export const hasRole = (roles: unknown, role: string): boolean =>
  Array.isArray(roles) && roles.includes(role);

export const isAdmin = (roles: unknown): boolean => hasRole(roles, "admin");
