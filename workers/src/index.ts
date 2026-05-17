import { DebateRoom } from './debate-room'
import type { Env } from './types'

export { DebateRoom }

function cors(_req: Request, _env: Env): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers })
}

function nanoid(len = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  for (const b of bytes) id += chars[b % chars.length]
  return id
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const corsHeaders = cors(request, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // WebSocket — forward to Durable Object
    if (request.headers.get('Upgrade') === 'websocket') {
      const roomId = url.pathname.match(/^\/ws\/([a-z0-9]+)$/)?.[1]
      if (!roomId) return new Response('Not found', { status: 404 })
      const stub = env.DEBATE_ROOM.get(env.DEBATE_ROOM.idFromName(roomId))
      return stub.fetch(request)
    }

    // REST API
    const path = url.pathname

    // GET /api/rooms — list active + recent rooms
    if (path === '/api/rooms' && request.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT id, topic, status, pro1_name, pro2_name, con1_name, con2_name, judge_name, winner, created_at
         FROM debates
         WHERE created_at > unixepoch() - 86400
         ORDER BY created_at DESC LIMIT 50`
      ).all()
      return json(results, 200, corsHeaders)
    }

    // POST /api/rooms — create room
    if (path === '/api/rooms' && request.method === 'POST') {
      const body = await request.json<{ topic: string }>()
      if (!body?.topic?.trim()) return json({ error: 'topic required' }, 400, corsHeaders)

      const id = nanoid()
      await env.DB.prepare(
        `INSERT INTO debates (id, topic, status) VALUES (?, ?, 'waiting')`
      ).bind(id, body.topic.trim()).run()

      const stub = env.DEBATE_ROOM.get(env.DEBATE_ROOM.idFromName(id))
      await stub.fetch(new Request(`https://do/init`, {
        method: 'POST',
        body: JSON.stringify({ id, topic: body.topic.trim() }),
        headers: { 'Content-Type': 'application/json', 'X-Internal': '1' },
      }))

      return json({ id, topic: body.topic.trim() }, 201, corsHeaders)
    }

    // GET /api/rooms/:id
    const roomMatch = path.match(/^\/api\/rooms\/([a-z0-9]+)$/)
    if (roomMatch && request.method === 'GET') {
      const id = roomMatch[1]
      const room = await env.DB.prepare(
        `SELECT * FROM debates WHERE id = ?`
      ).bind(id).first()
      if (!room) return json({ error: 'not found' }, 404, corsHeaders)

      const { results: speeches } = await env.DB.prepare(
        `SELECT * FROM speeches WHERE debate_id = ? ORDER BY round_index`
      ).bind(id).all()

      return json({ ...room, speeches }, 200, corsHeaders)
    }

    // DELETE /api/rooms/:id
    if (roomMatch && request.method === 'DELETE') {
      const id = roomMatch[1]
      await env.DB.prepare(`DELETE FROM speeches WHERE debate_id = ?`).bind(id).run()
      await env.DB.prepare(`DELETE FROM debates WHERE id = ?`).bind(id).run()
      return json({ ok: true }, 200, corsHeaders)
    }

    return new Response('Not found', { status: 404 })
  },
}
