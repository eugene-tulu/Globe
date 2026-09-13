import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl'
import type { BoundaryCollection, BoundaryFeature, BoundaryLevel } from '../types'

function canUseWebGL2() {
  const canvas = document.createElement('canvas')

  try {
    return Boolean(canvas.getContext('webgl2'))
  } catch {
    return false
  }
}

function flattenCoordinates(value: unknown, result: Array<[number, number]>): void {
  if (!Array.isArray(value)) return
  if (typeof value[0] === 'number' && typeof value[1] === 'number') {
    result.push([value[0], value[1]])
    return
  }
  for (const child of value) flattenCoordinates(child, result)
}

function fitToCollection(map: MapLibreMap, collection: BoundaryCollection): void {
  const coordinates: Array<[number, number]> = []
  for (const feature of collection.features) flattenCoordinates(feature.geometry?.coordinates, coordinates)
  if (!coordinates.length) return
  const bounds = coordinates.reduce(
    (result, coordinate) => result.extend(coordinate),
    new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
  )
  map.fitBounds(bounds, { padding: 48, maxZoom: 6.2, duration: 650 })
}

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

interface BoundaryMapProps {
  collection: BoundaryCollection | null
  level: BoundaryLevel
}

export function BoundaryMap({ collection, level }: BoundaryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [mapAvailable, setMapAvailable] = useState(true)

  useEffect(() => {
    if (!containerRef.current) return

    if (!canUseWebGL2()) {
      setMapAvailable(false)
      return () => undefined
    }

    let map: MapLibreMap
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        attributionControl: false,
        center: [20, 8],
        zoom: 0.7,
        minZoom: 0,
        maxZoom: 10,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#07151b' },
            },
          ],
        },
      })
    } catch {
      setMapAvailable(false)
      return () => undefined
    }
    setMapAvailable(true)
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      map.setProjection({ type: 'globe' })
      map.addSource('boundaries', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'boundary-fill',
        type: 'fill',
        source: 'boundaries',
        paint: {
          'fill-color': '#45c9ae',
          'fill-opacity': 0.21,
        },
      })
      map.addLayer({
        id: 'boundary-line',
        type: 'line',
        source: 'boundaries',
        paint: {
          'line-color': '#a4f3dc',
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 5, 1.5, 9, 2.5],
          'line-opacity': 0.9,
        },
      })
      map.on('click', 'boundary-fill', (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0] as BoundaryFeature | undefined
        if (feature) setSelected(featureName(feature, level))
      })
      map.on('mouseenter', 'boundary-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'boundary-fill', () => { map.getCanvas().style.cursor = '' })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [level])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !collection || !map.isStyleLoaded()) return
    const source = map.getSource('boundaries') as GeoJSONSource | undefined
    source?.setData(collection as never)
    fitToCollection(map, collection)
    setSelected(null)
  }, [collection])

  if (!mapAvailable) {
    return (
      <div className="map-shell map-fallback-shell">
        <div className="map-fallback-grid" />
        <div className="map-fallback-copy"><span className="fallback-eyebrow"><span className="map-dot" /> GEOMETRY LOADED</span><strong>{collection?.features.length ?? 0} boundaries ready</strong><p>This browser does not expose WebGL2, so the interactive preview is paused. Your download is unaffected.</p></div>
        <div className="map-overlay map-overlay-bottom">© FAO GAUL 2024 · preview geometry</div>
      </div>
    )
  }

  return (
    <div className="map-shell">
      <div ref={containerRef} className="boundary-map" />
      <div className="map-overlay map-overlay-top">
        <span className="map-dot" />
        <span>{selected ?? 'Click a region to inspect it'}</span>
      </div>
      <div className="map-overlay map-overlay-bottom">© FAO GAUL 2024 · preview geometry</div>
    </div>
  )
}
