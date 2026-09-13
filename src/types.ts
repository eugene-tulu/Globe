export type BoundaryLevel = 0 | 1 | 2
export type ExportFormat = 'geojson' | 'csv'
export type Resolution = 'web' | 'balanced' | 'full'
export type SelectionMode = 'all' | 'specific'

export interface Country {
  name: string
  code: number
}

export interface CountriesResponse {
  count: number
  countries: Country[]
}

export interface BoundaryFeature {
  type: 'Feature'
  geometry: {
    type: string
    coordinates: unknown
  } | null
  properties: Record<string, unknown>
  id?: string | number
}

export interface BoundaryCollection {
  type: 'FeatureCollection'
  features: BoundaryFeature[]
  total: number
  limit: number
  offset: number
  format?: string
}

export interface BoundaryIndexItem {
  id: string
  code: number
  name: string
  country: string
  country_code: number
  parent_id: string | null
  parent_name: string | null
  bbox: [number, number, number, number]
}

export interface BoundaryIndexResponse {
  level: BoundaryLevel
  country: string
  total: number
  limit: number
  offset: number
  items: BoundaryIndexItem[]
}

export interface DatasetMetadata {
  name: string
  provider: string
  license: string
  attribution: string
  disclaimer: string
  counts?: Record<string, number>
  [key: string]: unknown
}
