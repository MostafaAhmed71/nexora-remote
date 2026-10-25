export const grants = {
  owner: [
    "view",
    "control",
    "devices",
    "users",
    "terminate",
    "audit",
    "settings",
  ],
  admin: ["view", "control", "devices", "users", "terminate", "audit"],
  technician: ["view", "control", "terminate"],
  employee: ["view"],
  viewer: ["view"],
} as const;
export type Role = keyof typeof grants;
export function allowed(role: string, permission: string) {
  return (
    role in grants &&
    (grants[role as Role] as readonly string[]).includes(permission)
  );
}
