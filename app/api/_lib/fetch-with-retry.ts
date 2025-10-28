const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type FetchWithRetryOptions = {
  retries?: number;
  retryDelayMs?: number;
  retryStatusCodes?: number[];
};

const DEFAULT_RETRYABLE_STATUS = [500];

export async function fetchWithRetry(
  requestFn: () => Promise<Response>,
  {
    retries = 2,
    retryDelayMs = 0,
    retryStatusCodes = DEFAULT_RETRYABLE_STATUS,
  }: FetchWithRetryOptions = {}
): Promise<Response> {
  let lastError: unknown = undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await requestFn();
      if (!retryStatusCodes.includes(response.status) || attempt === retries) {
        return response;
      }
    } catch (err) {
      lastError = err;
      if (attempt === retries) {
        throw err;
      }
    }

    if (retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }

  throw lastError ?? new Error("fetchWithRetry exhausted retries without a response");
}
