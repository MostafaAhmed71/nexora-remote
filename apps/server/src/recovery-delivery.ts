export function recoveryDelivery(
  config: { url?: string; bearer?: string; origin: string },
  send: typeof fetch = fetch,
) {
  if (!config.url) return undefined;
  if (new URL(config.url).protocol !== "https:" || !config.bearer)
    throw new Error("Recovery delivery requires HTTPS and a bearer secret");
  return async (email: string, token: string) => {
    const response = await send(config.url!, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + config.bearer,
      },
      body: JSON.stringify({
        email,
        resetUrl: config.origin + "/reset?token=" + encodeURIComponent(token),
      }),
    });
    if (!response.ok) throw new Error("Recovery delivery failed");
  };
}
