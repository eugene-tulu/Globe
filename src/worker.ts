import { metricsPage } from './metricsPage'

interface AnalyticsEngineDataset {
  writeDataPoint(data: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void
}

interface AnalyticsSQLBinding {
  query<T>(request: { query: string; params?: Record<string, string | number> }): Promise<{ data: T[] }>
}

interface AssetFetcher {
  fetch(request: Request): Promise<Response>
}

interface Env {
  ANALYTICS_SQL: AnalyticsSQLBinding
  ASSETS: AssetFetcher
  GLOBE_EVENTS: AnalyticsEngineDataset
  METRICS_PASSWORD?: string
  METRICS_USERNAME?: string
}

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void
}

type EventName =
  | 'page_view'
  | 'globe_country_selected'
  | 'builder_country_selected'
  | 'builder_level_selected'
  | 'boundary_selected'
  | 'download_started'
  | 'boundary_downloaded'

interface TrackingPayload {
  boundary?: string
  country?: string
  event?: EventName
  format?: 'geojson' | 'csv'
  level?: number
  parent?: string
  scope?: 'entire_country' | 'specific_selection'
  selectionCount?: number
  source?: string
  visitorId?: string
}

interface CountRow { count?: number | string | null }
interface ActivityRow { day?: string; event?: string; count?: number | string | null }
interface CountryRow { country?: string; count?: number | string | null }
interface BoundaryRow { country?: string; level?: string; boundary?: string; parent?: string; count?: number | string | null }
interface SourceRow { source?: string; count?: number | string | null }

const dataset = 'events.analyticsEngine."globe_product_events"'
const eventNames = new Set<EventName>([
  'page_view',
  'globe_country_selected',
  'builder_country_selected',
  'builder_level_selected',
  'boundary_selected',
  'download_started',
  'boundary_downloaded',
])

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    status,
  })
}

function safeText(value: unknown, limit = 120): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit) : ''
}

function safeLevel(value: unknown): string {
  return value === 0 || value === 1 || value === 2 ? String(value) : ''
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(250, Math.trunc(value))) : 0
}

function fixedTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

function authorized(request: Request, env: Env): boolean {
  if (!env.METRICS_PASSWORD) return false
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Basic ')) return false
  try {
    const credentials = atob(header.slice(6))
    return fixedTimeEqual(credentials, `${env.METRICS_USERNAME || 'globe'}:${env.METRICS_PASSWORD}`)
  } catch {
    return false
  }
}

function authRequired(request: Request, env: Env): Response | null {
  if (!env.METRICS_PASSWORD) return new Response('Metrics access has not been configured.', { status: 404 })
  if (authorized(request, env)) return null
  return new Response('Authentication required.', {
    headers: { 'www-authenticate': 'Basic realm="Globe metrics", charset="UTF-8"' },
    status: 401,
  })
}

async function dailyVisitorHash(visitorId: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10)
  const source = new TextEncoder().encode(`${day}:${visitorId}`)
  const digest = await crypto.subtle.digest('SHA-256', source)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function writeEvent(env: Env, payload: TrackingPayload): Promise<void> {
  if (!payload.event || !eventNames.has(payload.event) || !payload.visitorId || !/^[a-zA-Z0-9_-]{12,128}$/.test(payload.visitorId)) return

  const visitor = await dailyVisitorHash(payload.visitorId)
  env.GLOBE_EVENTS.writeDataPoint({
    blobs: [
      payload.event,
      safeText(payload.country),
      safeLevel(payload.level),
      payload.format === 'csv' || payload.format === 'geojson' ? payload.format : '',
      payload.scope === 'entire_country' || payload.scope === 'specific_selection' ? payload.scope : '',
      safeText(payload.boundary),
      safeText(payload.parent),
      safeText(payload.source),
    ],
    doubles: [safeCount(payload.selectionCount)],
    indexes: [visitor],
  })
}

async function receiveEvent(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 })
  try {
    const payload = await request.json() as TrackingPayload
    ctx.waitUntil(writeEvent(env, payload))
  } catch {
    return new Response(null, { status: 400 })
  }
  return new Response(null, { status: 204 })
}

async function query<T>(env: Env, statement: string, params: Record<string, string | number>): Promise<T[]> {
  const result = await env.ANALYTICS_SQL.query<T>({ params, query: statement })
  return result.data ?? []
}

function numberValue(value: number | string | null | undefined): number {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? Math.round(number) : 0
}

function windowStart(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function todayStart(): string {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  return date.toISOString()
}

async function metricsSummary(request: Request, env: Env): Promise<Response> {
  const auth = authRequired(request, env)
  if (auth) return auth

  const requestedDays = Number(new URL(request.url).searchParams.get('days') ?? 30)
  const days = requestedDays === 7 || requestedDays === 90 ? requestedDays : 30
  const since = windowStart(days)
  const params = { since, today: todayStart() }

  try {
    const [views, uniqueToday, downloads, countries, selections, boundaries, sources, activity] = await Promise.all([
      query<CountRow>(env, `SELECT SUM(_sample_interval) AS count FROM ${dataset} WHERE timestamp >= $since AND blob1 = 'page_view'`, params),
      query<CountRow>(env, `SELECT COUNT(DISTINCT index1) AS count FROM ${dataset} WHERE timestamp >= $today AND blob1 = 'page_view'`, params),
      query<CountRow>(env, `SELECT SUM(_sample_interval) AS count FROM ${dataset} WHERE timestamp >= $since AND blob1 = 'download_started'`, params),
      query<CountryRow>(env, `SELECT blob2 AS country, SUM(_sample_interval) AS count FROM ${dataset} WHERE timestamp >= $since AND (blob1 = 'globe_country_selected' OR blob1 = 'builder_country_selected') AND blob2 != '' GROUP BY country ORDER BY count DESC LIMIT 8`, params),
      query<BoundaryRow>(env, `SELECT blob2 AS country, blob3 AS level, blob6 AS boundary, blob7 AS parent, SUM(_sample_interval) AS count FROM ${dataset} WHERE timestamp >= $since AND blob1 = 'boundary_selected' AND blob6 != '' GROUP BY country, level, boundary, parent ORDER BY count DESC LIMIT 8`, params),
      query<BoundaryRow>(env, `SELECT blob2 AS country, blob3 AS level, blob6 AS boundary, blob7 AS parent, SUM(_sample_interval) AS count FROM ${dataset} WHERE timestamp >= $since AND blob1 = 'boundary_downloaded' AND blob6 != '' GROUP BY country, level, boundary, parent ORDER BY count DESC LIMIT 8`, params),
      query<SourceRow>(env, `SELECT blob8 AS source, SUM(_sample_interval) AS count FROM ${dataset} WHERE timestamp >= $since AND blob1 = 'page_view' AND blob8 != '' GROUP BY source ORDER BY count DESC LIMIT 8`, params),
      query<ActivityRow>(env, `SELECT toDate(timestamp) AS day, blob1 AS event, SUM(_sample_interval) AS count FROM ${dataset} WHERE timestamp >= $since AND (blob1 = 'page_view' OR blob1 = 'download_started') GROUP BY day, event ORDER BY day ASC`, params),
    ])

    const pageViews = numberValue(views[0]?.count)
    const downloadCount = numberValue(downloads[0]?.count)
    const activityByDay = new Map<string, { day: string; downloads: number; views: number }>()
    for (const row of activity) {
      if (!row.day) continue
      const entry = activityByDay.get(row.day) ?? { day: row.day, downloads: 0, views: 0 }
      if (row.event === 'page_view') entry.views = numberValue(row.count)
      if (row.event === 'download_started') entry.downloads = numberValue(row.count)
      activityByDay.set(row.day, entry)
    }

    return json({
      activity: [...activityByDay.values()].slice(-14),
      days,
      sources: sources.map((row) => ({ count: numberValue(row.count), source: row.source })),
      summary: {
        downloadRate: pageViews ? Number(((downloadCount / pageViews) * 100).toFixed(1)) : 0,
        downloads: downloadCount,
        pageViews,
        uniqueToday: numberValue(uniqueToday[0]?.count),
      },
      topSelections: selections.map((row) => ({
        count: numberValue(row.count),
        label: [row.country, row.level ? `ADM ${row.level}` : '', row.parent, row.boundary].filter(Boolean).join(' · '),
      })),
      topBoundaries: boundaries.map((row) => ({
        count: numberValue(row.count),
        label: [row.country, row.level ? `ADM ${row.level}` : '', row.parent, row.boundary].filter(Boolean).join(' · '),
      })),
      topCountries: countries.map((row) => ({ count: numberValue(row.count), country: row.country })),
    })
  } catch (error) {
    console.error('Unable to query Globe metrics', error)
    return json({ error: 'Metrics data is temporarily unavailable.' }, 502)
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/__globe/events') return receiveEvent(request, env, ctx)
    if (url.pathname === '/__globe/metrics/summary') return metricsSummary(request, env)
    if (url.pathname === '/metrics' || url.pathname === '/metrics/') {
      const auth = authRequired(request, env)
      return auth ?? new Response(metricsPage(), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    return env.ASSETS.fetch(request)
  },
}
