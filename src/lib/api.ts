import type {
  BoundaryCollection,
  BoundaryIndexResponse,
  BoundaryLevel,
  Country,
  CountriesResponse,
  DatasetMetadata,
  Resolution,
} from '../types'

export interface DownloadBoundaryName {
  name: string
  parent_name?: string | null
}

export const API_BASE = (import.meta.env.VITE_API_BASE ?? 'https://gaul.trigis.space').replace(/\/$/, '')

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`)
  if (!response.ok) {
    throw new Error(`The boundary service returned ${response.status}.`)
  }
  return response.json() as Promise<T>
}

export async function getCountries(): Promise<Country[]> {
  const payload = await request<CountriesResponse>('/countries')
  return [...payload.countries].sort((a, b) => a.name.localeCompare(b.name))
}

export async function getDataset(): Promise<DatasetMetadata> {
  return request<DatasetMetadata>('/dataset')
}

export async function getBoundaries(
  country: string,
  level: BoundaryLevel,
  resolution: Resolution,
  ids?: string[],
): Promise<BoundaryCollection> {
  const params = new URLSearchParams({
    country,
    level: String(level),
    format: 'geojson',
    limit: String(ids?.length || 2000),
    offset: '0',
  })

  if (ids?.length) params.set('ids', ids.join(','))

  if (resolution !== 'full') {
    params.set('simplify', resolution === 'web' ? '0.02' : '0.005')
  }

  return request<BoundaryCollection>(`/boundaries?${params.toString()}`)
}

interface BoundaryIndexOptions {
  parentId?: string | null
  query?: string
  limit?: number
  offset?: number
}

export async function getBoundaryIndex(
  country: string,
  level: Extract<BoundaryLevel, 1 | 2>,
  { parentId, query, limit = 200, offset = 0 }: BoundaryIndexOptions = {},
): Promise<BoundaryIndexResponse> {
  const params = new URLSearchParams({
    country,
    level: String(level),
    limit: String(limit),
    offset: String(offset),
  })
  if (parentId) params.set('parent_id', parentId)
  if (query?.trim()) params.set('q', query.trim())
  return request<BoundaryIndexResponse>(`/boundary-index?${params.toString()}`)
}

function escapeCsv(value: unknown): string {
  const text = value == null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(collection: BoundaryCollection): string {
  const properties = collection.features.map((feature) => feature.properties)
  const columns = [...new Set(properties.flatMap((row) => Object.keys(row)))].sort()
  const rows = [columns.join(',')]
  for (const row of properties) {
    rows.push(columns.map((column) => escapeCsv(row[column])).join(','))
  }
  return `${rows.join('\n')}\n`
}

function filenameSlug(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'boundary'
}

function levelNoun(level: BoundaryLevel, count: number): string {
  const noun = level === 0 ? 'country' : level === 1 ? 'region' : 'district'
  return count === 1 ? noun : `${noun}s`
}

/**
 * Keeps an exported file useful after it leaves Globe. Selected boundaries are
 * named explicitly; complete layers stay concise and communicate their scope.
 */
export function getDownloadFilename(
  country: string,
  level: BoundaryLevel,
  format: 'geojson' | 'csv',
  selectedBoundaries: readonly DownloadBoundaryName[] = [],
): string {
  const prefix = `${filenameSlug(country)}-adm${level}`
  const extension = format === 'geojson' ? 'geojson' : 'csv'

  if (!selectedBoundaries.length) {
    const scope = level === 0 ? 'country' : `all-${levelNoun(level, 2)}`
    return `${prefix}-${scope}.${extension}`
  }

  const selectedNames = selectedBoundaries.map((boundary) => {
    const names = level === 2 && boundary.parent_name
      ? [boundary.parent_name, boundary.name]
      : [boundary.name]
    return names.map(filenameSlug).join('-')
  })

  if (selectedNames.length <= 3) {
    return `${prefix}-${selectedNames.join('-')}.${extension}`
  }

  return `${prefix}-${selectedNames.slice(0, 2).join('-')}-and-${selectedNames.length - 2}-more-${levelNoun(level, selectedNames.length)}.${extension}`
}

export function downloadCollection(
  collection: BoundaryCollection,
  country: string,
  level: BoundaryLevel,
  format: 'geojson' | 'csv',
  selectedBoundaries: readonly DownloadBoundaryName[] = [],
): void {
  const filename = getDownloadFilename(country, level, format, selectedBoundaries)
  const body = format === 'geojson' ? JSON.stringify(collection, null, 2) : toCsv(collection)
  const mime = format === 'geojson' ? 'application/geo+json' : 'text/csv;charset=utf-8'
  const blob = new Blob([body], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
