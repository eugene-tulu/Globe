import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { BoundaryMap } from './components/BoundaryMap'
import { track, trackDownload, trackPageView } from './lib/analytics'
import { downloadCollection, getBoundaries, getBoundaryIndex, getCountries, getDataset, getDownloadFilename } from './lib/api'
import type {
  BoundaryCollection,
  BoundaryFeature,
  BoundaryIndexItem,
  BoundaryLevel,
  Country,
  ExportFormat,
  Resolution,
  SelectionMode,
} from './types'

const GlobeCanvas = lazy(() => import('./components/GlobeCanvas').then(({ GlobeCanvas: component }) => ({ default: component })))

const levelLabels: Record<BoundaryLevel, { short: string; title: string }> = {
  0: { short: 'ADM 0', title: 'Countries' },
  1: { short: 'ADM 1', title: 'Regions / states' },
  2: { short: 'ADM 2', title: 'Districts / counties' },
}

type SelectedBoundary = Pick<BoundaryIndexItem, 'id' | 'name' | 'parent_name'>

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function numberProperty(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Math.trunc(Number(value))
  return null
}

function textProperty(properties: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = properties[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function selectionFromFeature(feature: BoundaryFeature, level: BoundaryLevel): SelectedBoundary | null {
  const properties = feature.properties
  const countryCode = numberProperty(properties.gaul0_code)
  const codeKey = level === 0 ? 'gaul0_code' : level === 1 ? 'gaul1_code' : 'gaul2_code'
  const code = numberProperty(properties[codeKey])
  const name = textProperty(
    properties,
    level === 1 ? ['gaul1_name', 'name'] : ['gaul2_name', 'name'],
  )
  const parentName = level === 2 ? textProperty(properties, ['gaul1_name']) : textProperty(properties, ['gaul0_name'])
  const id = countryCode !== null && code !== null
    ? `${countryCode}:${level}:${code}`
    : typeof feature.id === 'string' || typeof feature.id === 'number'
      ? String(feature.id)
      : null

  return id && name ? { id, name, parent_name: parentName } : null
}

function App() {
  const [countries, setCountries] = useState<Country[]>([])
  const [selectedCountry, setSelectedCountry] = useState('Kenya')
  const [globeSelectedCountry, setGlobeSelectedCountry] = useState<string | null>(null)
  const [hasGlobeSelection, setHasGlobeSelection] = useState(false)
  const [level, setLevel] = useState<BoundaryLevel>(1)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('all')
  const [resolution, setResolution] = useState<Resolution>('web')
  const [format, setFormat] = useState<ExportFormat>('geojson')
  const [wholeCollection, setWholeCollection] = useState<BoundaryCollection | null>(null)
  const [pickerCollection, setPickerCollection] = useState<BoundaryCollection | null>(null)
  const [selectedCollection, setSelectedCollection] = useState<BoundaryCollection | null>(null)
  const [pickerItems, setPickerItems] = useState<BoundaryIndexItem[]>([])
  const [pickerTotal, setPickerTotal] = useState(0)
  const [pickerSearch, setPickerSearch] = useState('')
  const [parentOptions, setParentOptions] = useState<BoundaryIndexItem[]>([])
  const [parentId, setParentId] = useState<string | null>(null)
  const [selectedBoundaries, setSelectedBoundaries] = useState<SelectedBoundary[]>([])
  const [datasetName, setDatasetName] = useState('FAO GAUL 2024')
  const [loadingCountries, setLoadingCountries] = useState(true)
  const [loadingWhole, setLoadingWhole] = useState(false)
  const [loadingPicker, setLoadingPicker] = useState(false)
  const [loadingSelection, setLoadingSelection] = useState(false)
  const [loadingIndex, setLoadingIndex] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)

  const specificSelection = selectionMode === 'specific' && level > 0
  const selectedBoundaryIds = useMemo(() => selectedBoundaries.map((boundary) => boundary.id), [selectedBoundaries])
  const previewCollection = specificSelection ? pickerCollection : wholeCollection
  const downloadTarget = specificSelection ? selectedCollection : wholeCollection
  const loadingBoundaries = loadingWhole || loadingPicker || loadingSelection
  const downloadFilename = useMemo(
    () => getDownloadFilename(selectedCountry, level, format, specificSelection ? selectedBoundaries : []),
    [format, level, selectedBoundaries, selectedCountry, specificSelection],
  )

  useEffect(() => {
    trackPageView()
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([getCountries(), getDataset()])
      .then(([countryList, dataset]) => {
        if (!active) return
        setCountries(countryList)
        setDatasetName(dataset.name.replace('Global Administrative Unit Layers (GAUL) ', 'FAO GAUL '))
      })
      .catch(() => {
        if (active) setError('The catalog could not be reached. Check the API connection and try again.')
      })
      .finally(() => { if (active) setLoadingCountries(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (specificSelection) {
      setWholeCollection(null)
      return
    }

    let active = true
    setLoadingWhole(true)
    setError(null)
    setDownloaded(false)
    getBoundaries(selectedCountry, level, resolution)
      .then((result) => { if (active) setWholeCollection(result) })
      .catch(() => { if (active) setError('That boundary set could not be loaded. Try another place or resolution.') })
      .finally(() => { if (active) setLoadingWhole(false) })
    return () => { active = false }
  }, [selectedCountry, level, resolution, specificSelection])

  useEffect(() => {
    if (!specificSelection) {
      setPickerCollection(null)
      return
    }

    let active = true
    setLoadingPicker(true)
    setError(null)
    getBoundaries(selectedCountry, level, 'web')
      .then((result) => { if (active) setPickerCollection(result) })
      .catch(() => { if (active) setError('The map picker could not be loaded. You can still search the list below.') })
      .finally(() => { if (active) setLoadingPicker(false) })
    return () => { active = false }
  }, [selectedCountry, level, specificSelection])

  useEffect(() => {
    if (!specificSelection || !selectedBoundaryIds.length) {
      setSelectedCollection(null)
      setLoadingSelection(false)
      return
    }

    let active = true
    setLoadingSelection(true)
    setDownloaded(false)
    getBoundaries(selectedCountry, level, resolution, selectedBoundaryIds)
      .then((result) => { if (active) setSelectedCollection(result) })
      .catch(() => { if (active) setError('That selected boundary set could not be loaded. Try changing the selection.') })
      .finally(() => { if (active) setLoadingSelection(false) })
    return () => { active = false }
  }, [selectedCountry, level, resolution, selectedBoundaryIds, specificSelection])

  useEffect(() => {
    if (!specificSelection) {
      setPickerItems([])
      setPickerTotal(0)
      setLoadingIndex(false)
      return
    }

    let active = true
    const timer = window.setTimeout(() => {
      setLoadingIndex(true)
      getBoundaryIndex(selectedCountry, level as 1 | 2, {
        parentId,
        query: pickerSearch,
      })
        .then((result) => {
          if (!active) return
          setPickerItems(result.items)
          setPickerTotal(result.total)
        })
        .catch(() => {
          if (active) setError('The searchable boundary index could not be loaded. Try again shortly.')
        })
        .finally(() => { if (active) setLoadingIndex(false) })
    }, 180)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [selectedCountry, level, parentId, pickerSearch, specificSelection])

  useEffect(() => {
    if (!specificSelection || level !== 2) {
      setParentOptions([])
      setParentId(null)
      return
    }

    let active = true
    getBoundaryIndex(selectedCountry, 1, { limit: 500 })
      .then((result) => { if (active) setParentOptions(result.items) })
      .catch(() => { if (active) setError('The region filter could not be loaded. You can still search all districts.') })
    return () => { active = false }
  }, [selectedCountry, level, specificSelection])

  const selectedCountryCode = useMemo(
    () => countries.find((country) => country.name === selectedCountry)?.code,
    [countries, selectedCountry],
  )

  const toggleBoundary = (boundary: SelectedBoundary) => {
    setDownloaded(false)
    const alreadySelected = selectedBoundaries.some((item) => item.id === boundary.id)
    if (!alreadySelected) {
      track('boundary_selected', {
        boundary: boundary.name,
        country: selectedCountry,
        level,
        parent: boundary.parent_name,
        scope: 'specific_selection',
        selectionCount: selectedBoundaries.length + 1,
      })
    }
    setSelectedBoundaries((current) => {
      const exists = current.some((item) => item.id === boundary.id)
      if (exists) return current.filter((item) => item.id !== boundary.id)
      return [...current, boundary].sort((left, right) => left.name.localeCompare(right.name))
    })
  }

  const toggleBoundaryFromMap = (feature: BoundaryFeature) => {
    const boundary = selectionFromFeature(feature, level)
    if (boundary) toggleBoundary(boundary)
  }

  const resetBoundarySelection = () => {
    setSelectedBoundaries([])
    setParentId(null)
    setPickerSearch('')
    setDownloaded(false)
  }

  const download = () => {
    if (!downloadTarget) return
    downloadCollection(downloadTarget, selectedCountry, level, format, specificSelection ? selectedBoundaries : [])
    trackDownload(
      {
        country: selectedCountry,
        format,
        level,
        scope: specificSelection ? 'specific_selection' : 'entire_country',
      },
      specificSelection ? selectedBoundaries.length : downloadTarget.total,
      specificSelection ? selectedBoundaries : [],
    )
    setDownloaded(true)
  }

  const scrollToBuilder = () => document.getElementById('builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const selectCountryFromGlobe = (country: string) => {
    track('globe_country_selected', { country })
    setSelectedCountry(country)
    setGlobeSelectedCountry(country)
    setHasGlobeSelection(true)
    setSelectionMode('all')
    resetBoundarySelection()
  }

  const changeCountry = (country: string) => {
    track('builder_country_selected', { country })
    setSelectedCountry(country)
    setGlobeSelectedCountry(null)
    setSelectionMode('all')
    resetBoundarySelection()
  }

  const changeLevel = (nextLevel: BoundaryLevel) => {
    track('builder_level_selected', { level: nextLevel })
    setLevel(nextLevel)
    setSelectionMode('all')
    resetBoundarySelection()
  }

  const changeSelectionMode = (nextMode: SelectionMode) => {
    setSelectionMode(nextMode)
    resetBoundarySelection()
  }

  const downloadLabel = loadingBoundaries
    ? 'Loading layer…'
    : downloaded
      ? 'Downloaded ✓'
      : specificSelection && !selectedBoundaryIds.length
        ? `Choose ${levelLabels[level].title.toLowerCase()}`
        : `Download ${format.toUpperCase()} ↗`

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Globe home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span>GLOBE<span className="brand-sub">/ STUDIO</span></span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#builder">Builder</a>
          <a href="#how-it-works">How it works</a>
          <a href="https://gaul.trigis.space/docs" target="_blank" rel="noreferrer">API docs ↗</a>
        </nav>
        <button className="nav-cta" onClick={scrollToBuilder}>Try it free <span>↗</span></button>
      </header>

      <main id="top">
        <section className="hero hero-explore section-wrap" aria-label="Explore administrative boundaries">
          <div className="hero-visual">
            <Suspense fallback={<div className="globe-canvas space-globe-loading" aria-label="Globe visualization" role="img" />}>
              <GlobeCanvas
                countries={countries}
                selectedCountry={globeSelectedCountry}
                showAmbientHighlights={!hasGlobeSelection}
                onCountrySelect={selectCountryFromGlobe}
              />
            </Suspense>
          </div>
        </section>

        <section id="builder" className="builder-section section-wrap">
          <div className="section-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> THE BOUNDARY BUILDER</div>
              <h2>Start with a place.<br /><span>Leave with a dataset.</span></h2>
            </div>
            <p className="section-note">Preview a full layer, or choose the exact regions and districts you need before downloading.</p>
          </div>
          <div className="builder-grid">
            <aside className="control-card">
              <div className="card-kicker"><span>01</span> DEFINE YOUR LAYER</div>
              <label className="field-label" htmlFor="country">Place</label>
              <div className="select-wrap">
                <select id="country" value={selectedCountry} onChange={(event) => changeCountry(event.target.value)} disabled={loadingCountries}>
                  {loadingCountries && <option>Loading countries…</option>}
                  {countries.map((country) => <option key={country.code} value={country.name}>{country.name}</option>)}
                </select>
                <span className="select-chevron">⌄</span>
              </div>
              <div className="field-meta">GAUL code {selectedCountryCode ?? '—'} <span>·</span> {datasetName}</div>

              <label className="field-label">Administrative level</label>
              <div className="level-grid">
                {([0, 1, 2] as BoundaryLevel[]).map((item) => (
                  <button key={item} className={`level-button ${level === item ? 'is-active' : ''}`} onClick={() => changeLevel(item)}>
                    <span>{levelLabels[item].short}</span><small>{levelLabels[item].title}</small>
                  </button>
                ))}
              </div>

              {level > 0 && (
                <section className="selection-control" aria-label="Boundary coverage">
                  <label className="field-label">Coverage</label>
                  <div className="selection-mode" role="group" aria-label="Choose boundary coverage">
                    <button type="button" className={selectionMode === 'all' ? 'is-active' : ''} onClick={() => changeSelectionMode('all')}>Entire country</button>
                    <button type="button" className={selectionMode === 'specific' ? 'is-active' : ''} onClick={() => changeSelectionMode('specific')}>Choose places</button>
                  </div>

                  {specificSelection && (
                    <div className="boundary-picker">
                      {level === 2 && (
                        <div className="picker-parent">
                          <label className="field-label" htmlFor="parent-boundary">Limit to a region <span>optional</span></label>
                          <div className="select-wrap compact">
                            <select id="parent-boundary" value={parentId ?? ''} onChange={(event) => setParentId(event.target.value || null)}>
                              <option value="">All regions</option>
                              {parentOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                            </select>
                            <span className="select-chevron">⌄</span>
                          </div>
                        </div>
                      )}
                      <label className="field-label" htmlFor="boundary-search">Find a {levelLabels[level].title.toLowerCase().replace(' / ', ' or ')}</label>
                      <input id="boundary-search" className="boundary-search" value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder={`Search ${levelLabels[level].title.toLowerCase()}…`} />
                      <div className="picker-summary" aria-live="polite">
                        <span>{loadingIndex ? 'Searching…' : `${formatNumber(pickerTotal)} available`}</span>
                        <span>{selectedBoundaryIds.length} chosen</span>
                      </div>
                      <div className="picker-list">
                        {pickerItems.map((item) => {
                          const selected = selectedBoundaryIds.includes(item.id)
                          return (
                            <button key={item.id} type="button" className={`picker-item ${selected ? 'is-selected' : ''}`} aria-label={`${selected ? 'Remove' : 'Select'} ${item.name}`} aria-pressed={selected} onClick={() => toggleBoundary(item)}>
                              <span className="picker-check">{selected ? '✓' : ''}</span>
                              <span className="picker-item-copy"><strong>{item.name}</strong>{item.parent_name && <small>{item.parent_name}</small>}</span>
                            </button>
                          )
                        })}
                        {!loadingIndex && !pickerItems.length && <p className="picker-empty">No matching boundaries. Try another search.</p>}
                      </div>
                      {selectedBoundaries.length > 0 && (
                        <div className="selection-basket">
                          <div className="selection-basket-header"><strong>{selectedBoundaries.length} selected</strong><button type="button" onClick={resetBoundarySelection}>Clear</button></div>
                          <ul className="selection-basket-list">
                            {selectedBoundaries.slice(0, 5).map((item) => <li key={item.id} className="selection-chip"><span>{item.name}</span><button type="button" aria-label={`Remove ${item.name}`} onClick={() => toggleBoundary(item)}>×</button></li>)}
                            {selectedBoundaries.length > 5 && <li className="selection-more">+{selectedBoundaries.length - 5} more</li>}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              <div className="control-row">
                <div>
                  <label className="field-label" htmlFor="format">Format</label>
                  <div className="select-wrap compact"><select id="format" value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}><option value="geojson">GeoJSON</option><option value="csv">CSV attributes</option></select><span className="select-chevron">⌄</span></div>
                </div>
                <div>
                  <label className="field-label" htmlFor="resolution">Resolution</label>
                  <div className="select-wrap compact"><select id="resolution" value={resolution} onChange={(event) => setResolution(event.target.value as Resolution)}><option value="web">Web ready</option><option value="balanced">Balanced</option><option value="full">Full detail</option></select><span className="select-chevron">⌄</span></div>
                </div>
              </div>

              {error && <div className="error-message">{error}</div>}
              <button className="download-button" onClick={download} disabled={!downloadTarget || loadingBoundaries || (specificSelection && !selectedBoundaryIds.length)}>
                {downloadLabel}
              </button>
              <p className="export-filename">Saves as <code>{downloadFilename}</code></p>
              <p className="license-note">{specificSelection ? `${selectedBoundaryIds.length || 'No'} selected · ` : ''}Free preview · attribution included · GAUL 2024 terms apply</p>
            </aside>

            <section className="preview-card">
              <div className="preview-header">
                <div><div className="card-kicker"><span>02</span> PREVIEW YOUR DATA</div><h3>{selectedCountry} <span>/ {levelLabels[level].short}</span></h3></div>
                <div className="preview-status"><span className={`status-dot ${loadingBoundaries ? 'is-loading' : ''}`} /> {loadingBoundaries ? 'Fetching geometry' : specificSelection ? 'Pick exact boundaries' : 'Live from API'}</div>
              </div>
              <div className="map-frame">
                {previewCollection ? <BoundaryMap collection={previewCollection} level={level} selectionEnabled={specificSelection} selectedIds={selectedBoundaryIds} onToggleBoundary={specificSelection ? toggleBoundaryFromMap : undefined} /> : <div className="map-loading"><span className="spinner" />Waiting for the boundary layer</div>}
              </div>
              <div className="preview-footer">
                <div><span className="footer-label">{specificSelection ? 'SELECTED FOR DOWNLOAD' : 'FEATURES IN VIEW'}</span><strong>{specificSelection ? formatNumber(selectedBoundaryIds.length) : wholeCollection ? formatNumber(wholeCollection.total) : '—'}</strong></div>
                <div><span className="footer-label">GEOMETRY</span><strong>{specificSelection && selectedCollection ? `${formatNumber(selectedCollection.total)} exact` : resolution === 'web' ? 'Simplified' : resolution === 'balanced' ? 'Balanced' : 'Full detail'}</strong></div>
                <div><span className="footer-label">SOURCE</span><strong>FAO GAUL ↗</strong></div>
              </div>
            </section>
          </div>
        </section>

        <section id="how-it-works" className="workflow-section section-wrap">
          <div className="workflow-intro"><div className="eyebrow"><span className="eyebrow-line" /> BUILT FOR THE LAST MILE</div><h2>Good data is only useful<br /><span>when it gets out of the way.</span></h2></div>
          <div className="workflow-cards">
            <article><span className="workflow-number">01</span><h3>Choose</h3><p>Search the world by country and administrative level. Pick an entire layer or the exact regions you need.</p></article>
            <article><span className="workflow-number">02</span><h3>Shape</h3><p>Control resolution and format without opening a desktop GIS or writing a conversion script.</p></article>
            <article><span className="workflow-number">03</span><h3>Ship</h3><p>Download a clean, attributed file now. Connect the same boundary source to your product later.</p></article>
          </div>
        </section>
      </main>

      <footer className="footer section-wrap"><div className="brand"><span className="brand-mark"><span /><span /><span /></span><span>GLOBE<span className="brand-sub">/ STUDIO</span></span></div><p>Administrative boundaries, made legible.</p><span className="footer-right">TRIGIS · {new Date().getFullYear()}</span></footer>
    </div>
  )
}

export default App
