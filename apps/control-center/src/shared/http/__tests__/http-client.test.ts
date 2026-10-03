import { describe, expect, it, vi } from 'vitest'
import { createHttpClient, HttpError } from '../http-client'

function respond(body: string, status = 200) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status }))
}

describe('createHttpClient', () => {
  it('joins the base URL and returns parsed JSON as unknown', async () => {
    const fetch = respond('{"ok":true}')
    const client = createHttpClient({ baseUrl: 'https://api.test/v1/', fetch })

    await expect(client.get('/fleet')).resolves.toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test/v1/fleet',
      expect.objectContaining({ method: 'GET', body: null }),
    )
  })

  it('serializes JSON bodies', async () => {
    const fetch = respond('')
    const client = createHttpClient({ baseUrl: 'https://api.test', fetch })

    await expect(client.post('missions', { name: 'Scan' })).resolves.toBeNull()
    const init = fetch.mock.calls[0]?.[1]
    expect(init?.body).toBe('{"name":"Scan"}')
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('maps non-2xx responses to status errors with the payload', async () => {
    const client = createHttpClient({
      baseUrl: 'https://api.test',
      fetch: respond('{"error":"nope"}', 503),
    })

    const error = await client.get('fleet').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ kind: 'status', status: 503, body: { error: 'nope' } })
  })

  it('maps invalid JSON and network failures', async () => {
    const parse = createHttpClient({ baseUrl: 'https://api.test', fetch: respond('<html>') })
    await expect(parse.get('fleet')).rejects.toMatchObject({ kind: 'parse' })

    const network = createHttpClient({
      baseUrl: 'https://api.test',
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')),
    })
    await expect(network.get('fleet')).rejects.toMatchObject({ kind: 'network', status: null })
  })

  it('propagates aborts unchanged', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    const client = createHttpClient({
      baseUrl: 'https://api.test',
      fetch: vi.fn<typeof fetch>().mockRejectedValue(abort),
    })
    await expect(client.get('fleet')).rejects.toBe(abort)
  })
})
