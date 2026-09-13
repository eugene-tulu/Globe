import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { geoGraticule10, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import world from 'world-atlas/countries-110m.json'
import type { Country } from '../types'

const VIEWBOX_WIDTH = 760
const VIEWBOX_HEIGHT = 560
const INITIAL_ROTATION = -18
const INITIAL_TILT = -8
const INITIAL_SCALE = 280

const countryAliases: Record<string, string> = {
  'bolivia': 'Bolivia (Plurinational State of)',
  'bosnia and herz': 'Bosnia and Herzegovina',
  'brunei': 'Brunei Darussalam',
  'cape verde': 'Cabo Verde',
  'central african rep': 'Central African Republic',
  'dem rep congo': 'Democratic Republic of the Congo',
  'democratic republic of the congo': 'Democratic Republic of the Congo',
  'ivory coast': "Côte D'Ivoire",
  'laos': "Lao People's Democratic Republic",
  'moldova': 'Republic of Moldova',
  'north korea': "Democratic People's Republic of Korea",
  'north macedonia': 'North Macedonia',
  'palestine': 'Palestine',
  'russia': 'Russian Federation',
  'south korea': 'Republic Of Korea',
  'south sudan': 'South Sudan',
  'swaziland': 'Eswatini',
  'syria': 'Syrian Arab Republic',
  'taiwan': 'Taiwan Province of China',
  'tanzania': 'United Republic of Tanzania',
  'united states': 'United States of America',
  'united states of america': 'United States of America',
  'vatican': 'Holy See',
  'venezuela': 'Venezuela (Bolivarian Republic Of)',
  'vietnam': 'Viet Nam',
  'western sahara': 'Western Sahara',
}

// Kept in the opening hemisphere so an idle page always gets a few visible lights.
const ambientHighlightPool = new Set([
  'Algeria',
  'Angola',
  'Cameroon',
  'Democratic Republic of the Congo',
  'Egypt',
  'Ethiopia',
  'Ghana',
  'Kenya',
  'Libya',
  'Mali',
  'Morocco',
  'Namibia',
  'Nigeria',
  'Saudi Arabia',
  'South Africa',
  'Sudan',
  'United Republic of Tanzania',
  'Zambia',
])

const worldTopology = world as unknown as {
  objects: { countries: Parameters<typeof feature>[1] }
}
const worldCountries = feature(worldTopology as never, worldTopology.objects.countries as never) as unknown as GeoJSON.FeatureCollection
const countryBorders = mesh(worldTopology as never, worldTopology.objects.countries as never) as GeoJSON.MultiLineString

interface GlobeCountry {
  feature: GeoJSON.Feature
  id: string | number
  apiName: string | null
}

interface GlobeCanvasProps {
  countries: Country[]
  selectedCountry: string | null
  showAmbientHighlights: boolean
  onCountrySelect: (country: string) => void
}

function normalizeCountryName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function resolveApiName(sourceName: string, countryLookup: Map<string, string>): string | null {
  const normalized = normalizeCountryName(sourceName)
  return countryLookup.get(normalized)
    ?? countryLookup.get(normalizeCountryName(countryAliases[normalized] ?? sourceName))
    ?? null
}

interface GlobePathsProps {
  rotation: number
  scale: number
  renderedCountries: GlobeCountry[]
  selectedCountry: string | null
  ambientCountries: string[]
  onCountrySelect: (country: string) => void
}

function GlobePaths({ rotation, scale, renderedCountries, selectedCountry, ambientCountries, onCountrySelect }: GlobePathsProps) {
  const projection = useMemo(
    () => geoOrthographic()
      .translate([VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2 - 4])
      .scale(scale)
      .rotate([rotation, INITIAL_TILT])
      .precision(0.2),
    [rotation, scale],
  )
  const path = useMemo(() => geoPath(projection), [projection])
  const sphere = path({ type: 'Sphere' }) ?? ''
  const graticule = path(geoGraticule10()) ?? ''
  const borders = path(countryBorders) ?? ''

  return (
    <>
      <defs>
        <radialGradient id="globe-ocean" cx="34%" cy="27%" r="82%">
          <stop offset="0" stopColor="#183654" />
          <stop offset=".58" stopColor="#0b1d31" />
          <stop offset="1" stopColor="#030915" />
        </radialGradient>
        <filter id="globe-shadow" x="-35%" y="-35%" width="170%" height="180%">
          <feDropShadow dx="0" dy="20" stdDeviation="20" floodColor="#0d9bc2" floodOpacity=".2" />
        </filter>
        <clipPath id="globe-clip"><path d={sphere} /></clipPath>
      </defs>
      <path d={sphere} className="svg-globe-shadow space-globe-shadow" filter="url(#globe-shadow)" />
      <path d={sphere} className="svg-globe-ocean space-globe-ocean" fill="url(#globe-ocean)" />
      <g clipPath="url(#globe-clip)">
        <path d={graticule} className="svg-globe-graticule space-globe-graticule" />
        {renderedCountries.map(({ feature: country, id, apiName }) => {
          const countryPath = path(country as GeoPermissibleObjects) ?? ''
          const isSelected = selectedCountry !== null && apiName === selectedCountry
          const isAmbientHighlighted = !isSelected && ambientCountries.includes(apiName ?? '')
          return (
            <path
              key={id}
              d={countryPath}
              className={`svg-globe-country space-globe-country${apiName ? ' is-selectable' : ''}${isSelected ? ' is-highlighted' : ''}${isAmbientHighlighted ? ' is-ambient-highlighted' : ''}`}
              data-country={apiName ?? undefined}
              onClick={apiName ? () => onCountrySelect(apiName) : undefined}
            />
          )
        })}
        <path d={borders} className="svg-globe-borders space-globe-borders" />
      </g>
      <path d={sphere} className="svg-globe-rim space-globe-rim" />
    </>
  )
}

export function GlobeCanvas({ countries, selectedCountry, showAmbientHighlights, onCountrySelect }: GlobeCanvasProps) {
  const [rotation, setRotation] = useState(INITIAL_ROTATION)
  const [scale, setScale] = useState(INITIAL_SCALE)
  const [ambientCountries, setAmbientCountries] = useState<string[]>([])
  const dragRef = useRef({ active: false, moved: false, startX: 0, startRotation: INITIAL_ROTATION })
  const autoRotateRef = useRef(true)
  const hoverRef = useRef(false)
  const resumeTimerRef = useRef<number | undefined>(undefined)
  const countryLookup = useMemo(
    () => new Map(countries.map((country) => [normalizeCountryName(country.name), country.name])),
    [countries],
  )
  const renderedCountries = useMemo(
    () => worldCountries.features.map((country, index) => ({
      feature: country,
      id: country.id ?? index,
      apiName: resolveApiName(String(country.properties?.name ?? ''), countryLookup),
    })),
    [countryLookup],
  )

  useEffect(() => {
    if (ambientCountries.length || !renderedCountries.length) return

    const candidates = renderedCountries
      .map(({ apiName }) => apiName)
      .filter((apiName): apiName is string => apiName !== null && ambientHighlightPool.has(apiName))
    const randomized = [...candidates]

    for (let index = randomized.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      const current = randomized[index]
      randomized[index] = randomized[swapIndex]
      randomized[swapIndex] = current
    }

    setAmbientCountries(randomized.slice(0, 4))
  }, [ambientCountries.length, renderedCountries])

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return () => undefined

    let frame = 0
    let lastUpdate = 0
    const tick = (time: number) => {
      if (autoRotateRef.current && !dragRef.current.active && time - lastUpdate >= 50) {
        setRotation((value) => value + 0.065)
        lastUpdate = time
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => () => window.clearTimeout(resumeTimerRef.current), [])

  const pauseAndResume = () => {
    autoRotateRef.current = false
    window.clearTimeout(resumeTimerRef.current)
    if (!hoverRef.current) {
      resumeTimerRef.current = window.setTimeout(() => { autoRotateRef.current = true }, 2600)
    }
  }

  const handlePointerEnter = () => {
    hoverRef.current = true
    autoRotateRef.current = false
    window.clearTimeout(resumeTimerRef.current)
  }

  const handlePointerLeave = () => {
    hoverRef.current = false
    if (!dragRef.current.active) pauseAndResume()
  }

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = { active: true, moved: false, startX: event.clientX, startRotation: rotation }
    autoRotateRef.current = false
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragRef.current.active) return
    const distance = event.clientX - dragRef.current.startX
    if (Math.abs(distance) > 4 && !dragRef.current.moved) {
      dragRef.current.moved = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    pauseAndResume()
    setRotation(dragRef.current.startRotation + distance * 0.45)
  }

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current.active = false
    pauseAndResume()
    window.setTimeout(() => { dragRef.current.moved = false }, 0)
  }

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    setScale((value) => Math.max(220, Math.min(325, value - event.deltaY * 0.2)))
    pauseAndResume()
  }

  const handleCountrySelect = (country: string) => {
    if (dragRef.current.moved) return
    onCountrySelect(country)
  }

  return (
    <div className="globe-canvas space-globe" aria-label="Spin the globe and choose a country" role="img">
      <svg
        className="reference-globe-svg interactive-globe-svg"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        aria-hidden="true"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <GlobePaths
          rotation={rotation}
          scale={scale}
          renderedCountries={renderedCountries}
          selectedCountry={selectedCountry}
          ambientCountries={showAmbientHighlights ? ambientCountries : []}
          onCountrySelect={handleCountrySelect}
        />
      </svg>
      <span className="sr-only" aria-live="polite">{selectedCountry ? `${selectedCountry} selected` : ''}</span>
    </div>
  )
}
