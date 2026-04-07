const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type RequestOptions = RequestInit & {
  token?: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly details?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function shouldRetry(path: string, options: RequestOptions, attempt: number) {
  const method = (options.method ?? "GET").toUpperCase();
  return method === "GET" && attempt < 2 && path.startsWith("/api/ClientProfiles");
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
  }

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  let response: Response | null = null;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        cache: "no-store",
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed.");

      if (!shouldRetry(path, options, attempt)) {
        throw lastError;
      }

      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  if (!response) {
    throw lastError ?? new Error("Request failed.");
  }

  const body = (await response.json().catch(() => null)) as T | { message?: string } | null;

  if (!response.ok) {
    const fallbackMessage =
      typeof body === "object" && body && "message" in body && body.message
        ? body.message
        : "Request failed.";

    throw new ApiError(
      fallbackMessage,
      response.status,
      typeof body === "object" && body ? JSON.stringify(body) : undefined,
    );
  }

  return body as T;
}
