import { useEffect, useMemo, useState } from 'react'
import { geoGraticule10, geoMercator, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import type { BoundaryCollection, BoundaryFeature, BoundaryLevel } from '../types'

const VIEWBOX_WIDTH = 1000
const VIEWBOX_HEIGHT = 560
const VIEWBOX_PADDING = 34

function featureName(feature: BoundaryFeature, level: BoundaryLevel): string {
  const properties = feature.properties
  const candidates = level === 0
    ? ['gaul0_name', 'name']
    : level === 1
      ? ['gaul1_name', 'name', 'gaul0_name']
      : ['gaul2_name', 'name', 'gaul1_name']
  for (const key of candidates) {
    const value = properties[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return 'Selected boundary'
}

function featureId(feature: BoundaryFeature): string | null {
  return typeof feature.id === 'string' || typeof feature.id === 'number' ? String(feature.id) : null
}

interface BoundaryMapProps {
  collection: BoundaryCollection
  level: BoundaryLevel
  selectionEnabled?: boolean
  selectedIds?: readonly string[]
  onToggleBoundary?: (feature: BoundaryFeature) => void
}

interface RenderedBoundary {
  feature: BoundaryFeature
  id: string | null
  mapId: string
  path: string
}

export function BoundaryMap({
  collection,
  level,
  selectionEnabled = false,
  selectedIds = [],
  onToggleBoundary,
}: BoundaryMapProps) {
  const [inspectedId, setInspectedId] = useState<string | null>(null)
  const [inspectedName, setInspectedName] = useState<string | null>(null)
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  useEffect(() => {
    setInspectedId(null)
    setInspectedName(null)
  }, [collection])

  const { graticule, boundaries } = useMemo(() => {
    const projection = geoMercator().fitExtent(
      [[VIEWBOX_PADDING, VIEWBOX_PADDING], [VIEWBOX_WIDTH - VIEWBOX_PADDING, VIEWBOX_HEIGHT - VIEWBOX_PADDING]],
      collection as unknown as GeoPermissibleObjects,
    )
    const path = geoPath(projection)

    return {
      graticule: path(geoGraticule10()) ?? '',
      boundaries: collection.features
        .map((feature, index): RenderedBoundary => ({
          feature,
          id: featureId(feature),
          mapId: featureId(feature) ?? `boundary-${index}`,
          path: path(feature as unknown as GeoPermissibleObjects) ?? '',
        }))
        .filter((boundary) => boundary.path.length > 0),
    }
  }, [collection])

  const handleBoundaryClick = (boundary: RenderedBoundary) => {
    setInspectedId(boundary.mapId)
    setInspectedName(featureName(boundary.feature, level))
    if (selectionEnabled && boundary.id) onToggleBoundary?.(boundary.feature)
  }

  const overlayText = selectionEnabled
    ? `${selectedIds.length} selected · click a boundary to add or remove it`
    : inspectedName ?? 'Click a region to inspect it'

  return (
    <div className="map-shell">
      <svg
        className={`boundary-map dataset-preview-map${selectionEnabled ? ' is-selection-enabled' : ''}`}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${collection.features.length} administrative boundaries ready for preview`}
      >
        <rect className="dataset-map-background" width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} />
        {graticule && <path className="dataset-map-graticule" d={graticule} />}
        {boundaries.map((boundary) => {
          const isSelected = boundary.id !== null && selectedIdSet.has(boundary.id)
          const isInspected = inspectedId === boundary.mapId
          const className = [
            'dataset-boundary',
            isSelected ? 'is-selected' : '',
            isInspected ? 'is-inspected' : '',
          ].filter(Boolean).join(' ')

          return (
            <path
              key={boundary.mapId}
              className={className}
              d={boundary.path}
              onClick={() => handleBoundaryClick(boundary)}
            />
          )
        })}
      </svg>
      <div className="map-overlay map-overlay-top">
        <span className="map-dot" />
        <span>{overlayText}</span>
      </div>
      <div className="map-overlay map-overlay-bottom">© FAO GAUL 2024 · preview geometry</div>
    </div>
  )
}
