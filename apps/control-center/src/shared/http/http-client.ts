export type HttpErrorKind = 'network' | 'status' | 'parse'

export class HttpError extends Error {
  override name = 'HttpError'

  constructor(
    readonly kind: HttpErrorKind,
    readonly url: string,
    readonly status: number | null,
    message: string,
    readonly body: unknown = null,
  ) {
    super(message)
  }
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface HttpClient {
  /** Resolves with the parsed JSON payload as `unknown`; callers validate it. */
  request(path: string, options?: HttpRequestOptions): Promise<unknown>
  get(path: string, options?: Omit<HttpRequestOptions, 'method' | 'body'>): Promise<unknown>
  post(
    path: string,
    body: unknown,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>,
  ): Promise<unknown>
}

export interface HttpClientOptions {
  baseUrl: string
  headers?: Record<string, string>
  fetch?: typeof fetch
}

export function createHttpClient({
  baseUrl,
  headers: defaultHeaders = {},
  fetch: fetchImpl = globalThis.fetch.bind(globalThis),
}: HttpClientOptions): HttpClient {
  async function request(path: string, options: HttpRequestOptions = {}): Promise<unknown> {
    const url = `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...defaultHeaders,
      ...options.headers,
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    let response: Response
    try {
      response = await fetchImpl(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? null : JSON.stringify(options.body),
        signal: options.signal ?? null,
      })
    } catch (error) {
      // Cancellation is not a failure; let callers (e.g. TanStack Query) see the AbortError.
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new HttpError('network', url, null, `Network request failed: ${url}`)
    }

    const text = await response.text()
    let payload: unknown = null
    if (text !== '') {
      try {
        payload = JSON.parse(text)
      } catch {
        if (response.ok) throw new HttpError('parse', url, response.status, `Invalid JSON: ${url}`)
        payload = text
      }
    }

    if (!response.ok) {
      throw new HttpError(
        'status',
        url,
        response.status,
        `Request failed with ${response.status}: ${url}`,
        payload,
      )
    }
    return payload
  }

  return {
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  }
}
