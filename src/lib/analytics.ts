export type ProductEvent =
  | 'page_view'
  | 'globe_country_selected'
  | 'builder_country_selected'
  | 'builder_level_selected'
  | 'boundary_selected'
  | 'download_started'
  | 'boundary_downloaded'

export interface BoundaryDownloadEvent {
  name: string
  parent_name?: string | null
}

interface EventDetails {
  country?: string
  level?: number
  format?: 'geojson' | 'csv'
  scope?: 'entire_country' | 'specific_selection'
  boundary?: string
  parent?: string | null
  selectionCount?: number
  source?: string
}

const endpoint = '/__globe/events'
const visitorStorageKey = 'globe.analytics.visitor.v1'
const pageViewStorageKey = 'globe.analytics.page-viewed.v1'

function visitorId(): string {
  try {
    const existing = window.localStorage.getItem(visitorStorageKey)
    if (existing) return existing
    const created = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    window.localStorage.setItem(visitorStorageKey, created)
    return created
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

function referrerHost(): string | undefined {
  if (!document.referrer) return undefined
  try {
    return new URL(document.referrer).hostname
  } catch {
    return undefined
  }
}

function trackingDisabled(): boolean {
  return navigator.doNotTrack === '1'
}

export function track(event: ProductEvent, details: EventDetails = {}): void {
  if (trackingDisabled()) return

  const body = JSON.stringify({ event, visitorId: visitorId(), ...details })
  const payload = new Blob([body], { type: 'application/json' })

  if (navigator.sendBeacon?.(endpoint, payload)) return

  void fetch(endpoint, {
    body,
    headers: { 'content-type': 'application/json' },
    keepalive: true,
    method: 'POST',
  }).catch(() => undefined)
}

export function trackPageView(): void {
  try {
    if (window.sessionStorage.getItem(pageViewStorageKey)) return
    window.sessionStorage.setItem(pageViewStorageKey, '1')
  } catch {
    // A private browser can still record a single anonymous event.
  }
  track('page_view', { source: referrerHost() })
}

export function trackDownload(
  details: Omit<EventDetails, 'boundary' | 'parent' | 'selectionCount'>,
  selectionCount: number,
  selectedBoundaries: readonly BoundaryDownloadEvent[],
): void {
  track('download_started', { ...details, selectionCount })

  for (const boundary of selectedBoundaries.slice(0, 250)) {
    track('boundary_downloaded', {
      ...details,
      boundary: boundary.name,
      parent: boundary.parent_name,
      selectionCount,
    })
  }
}
