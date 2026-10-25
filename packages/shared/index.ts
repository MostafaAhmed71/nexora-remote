export const grants = {
  owner: [
    "view",
    "control",
    "devices",
    "device-manage",
    "users",
    "terminate",
    "audit",
    "settings",
  ],
  admin: [
    "view",
    "control",
    "devices",
    "device-manage",
    "users",
    "terminate",
    "audit",
  ],
  technician: ["view", "control", "terminate", "device-manage"],
  employee: ["view"],
  viewer: ["view"],
} as const;
export type Role = keyof typeof grants;
export function allowed(role: string, permission: string) {
  return (
    Object.hasOwn(grants, role) &&
    (grants[role as Role] as readonly string[]).includes(permission)
  );
}
