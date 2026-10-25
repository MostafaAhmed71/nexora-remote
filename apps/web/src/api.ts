export let organizationId = sessionStorage.getItem("organization") ?? "";
export function setOrganization(id: string) {
  organizationId = id;
  sessionStorage.setItem("organization", id);
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Organization-Id": organizationId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error ?? "تعذر إتمام الطلب");
  return v;
}
