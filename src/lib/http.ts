export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers
    }
  });
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

export function unauthorized(): Response {
  return json({ error: 'unauthorized' }, 401);
}

export function notFound(): Response {
  return json({ error: 'not_found' }, 404);
}

export function ok(data: unknown): Response {
  return json(data, 200);
}
