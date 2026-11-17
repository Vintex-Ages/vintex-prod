const endpoint = "https://api.github.com/graphql";

export function createGraphqlClient(token, options = {}) {
  const request = options.fetch ?? fetch;
  const log = options.log ?? console.log;
  const delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastMutation = 0;

  return async (query, variables) => {
    const mutation = /^\s*mutation\b/.test(query);
    if (mutation && lastMutation) {
      const remaining = 1000 - (Date.now() - lastMutation);
      if (remaining > 0) await delay(remaining);
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (mutation) lastMutation = Date.now();
      const response = await request(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ query, variables }),
      });
      const payload = await response.json();
      const remaining = response.headers.get("x-ratelimit-remaining");
      const used = response.headers.get("x-ratelimit-used");
      const reset = response.headers.get("x-ratelimit-reset");
      log(`GraphQL rate: remaining=${remaining ?? "?"} used=${used ?? "?"} reset=${reset ?? "?"}`);

      if (response.ok && !payload.errors) return payload.data;

      const details = JSON.stringify(payload.errors ?? payload);
      const rateLimited = response.status === 429 ||
        /rate.limit|graphql_rate_limit/i.test(details);
      if (rateLimited) {
        const resetAt = reset ? new Date(Number(reset) * 1000).toISOString() : "unknown";
        if (remaining === "0") {
          throw new Error(`GraphQL primary rate limit exhausted; reset=${resetAt}`);
        }
        const retryAfter = Number(response.headers.get("retry-after"));
        if (!mutation && attempt === 0 && retryAfter > 0 && retryAfter <= 30) {
          await delay(retryAfter * 1000);
          continue;
        }
        throw new Error(`GraphQL secondary rate limit; retry-after=${retryAfter || "unknown"}; ${details}`);
      }
      throw new Error(`GraphQL HTTP ${response.status}: ${details}`);
    }
  };
}
