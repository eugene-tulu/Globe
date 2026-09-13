import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { downloadCollection, getBoundaries, getCountries, getDataset } from './lib/api'
import type { BoundaryCollection, BoundaryLevel, Country, ExportFormat, Resolution } from './types'

const BoundaryMap = lazy(() => import('./components/BoundaryMap').then(({ BoundaryMap: component }) => ({ default: component })))
const GlobeCanvas = lazy(() => import('./components/GlobeCanvas').then(({ GlobeCanvas: component }) => ({ default: component })))

const levelLabels: Record<BoundaryLevel, { short: string; title: string }> = {
  0: { short: 'ADM 0', title: 'Countries' },
  1: { short: 'ADM 1', title: 'Regions / states' },
  2: { short: 'ADM 2', title: 'Districts / counties' },
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function App() {
  const [countries, setCountries] = useState<Country[]>([])
  const [selectedCountry, setSelectedCountry] = useState('Kenya')
  const [globeSelectedCountry, setGlobeSelectedCountry] = useState<string | null>(null)
  const [hasGlobeSelection, setHasGlobeSelection] = useState(false)
  const [level, setLevel] = useState<BoundaryLevel>(1)
  const [resolution, setResolution] = useState<Resolution>('web')
  const [format, setFormat] = useState<ExportFormat>('geojson')
  const [collection, setCollection] = useState<BoundaryCollection | null>(null)
  const [datasetName, setDatasetName] = useState('FAO GAUL 2024')
  const [loadingCountries, setLoadingCountries] = useState(true)
  const [loadingBoundaries, setLoadingBoundaries] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)

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
    let active = true
    setLoadingBoundaries(true)
    setError(null)
    setDownloaded(false)
    getBoundaries(selectedCountry, level, resolution)
      .then((result) => { if (active) setCollection(result) })
      .catch(() => { if (active) setError('That boundary set could not be loaded. Try another place or resolution.') })
      .finally(() => { if (active) setLoadingBoundaries(false) })
    return () => { active = false }
  }, [selectedCountry, level, resolution])

  const selectedCountryCode = useMemo(
    () => countries.find((country) => country.name === selectedCountry)?.code,
    [countries, selectedCountry],
  )

  const download = () => {
    if (!collection) return
    downloadCollection(collection, selectedCountry, level, format)
    setDownloaded(true)
  }

  const scrollToBuilder = () => document.getElementById('builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const selectCountryFromGlobe = (country: string) => {
    setSelectedCountry(country)
    setGlobeSelectedCountry(country)
    setHasGlobeSelection(true)
  }

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
            <p className="section-note">A live preview of the same data your download will contain. No GIS software, no mystery files.</p>
          </div>
          <div className="builder-grid">
            <aside className="control-card">
              <div className="card-kicker"><span>01</span> DEFINE YOUR LAYER</div>
              <label className="field-label" htmlFor="country">Place</label>
              <div className="select-wrap">
                <select id="country" value={selectedCountry} onChange={(event) => { setSelectedCountry(event.target.value); setGlobeSelectedCountry(null) }} disabled={loadingCountries}>
                  {loadingCountries && <option>Loading countries…</option>}
                  {countries.map((country) => <option key={country.code} value={country.name}>{country.name}</option>)}
                </select>
                <span className="select-chevron">⌄</span>
              </div>
              <div className="field-meta">GAUL code {selectedCountryCode ?? '—'} <span>·</span> {datasetName}</div>

              <label className="field-label">Administrative level</label>
              <div className="level-grid">
                {([0, 1, 2] as BoundaryLevel[]).map((item) => (
                  <button key={item} className={`level-button ${level === item ? 'is-active' : ''}`} onClick={() => setLevel(item)}>
                    <span>{levelLabels[item].short}</span><small>{levelLabels[item].title}</small>
                  </button>
                ))}
              </div>

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
              <button className="download-button" onClick={download} disabled={!collection || loadingBoundaries}>
                {loadingBoundaries ? 'Loading layer…' : downloaded ? 'Downloaded ✓' : `Download ${format.toUpperCase()} ↗`}
              </button>
              <p className="license-note">Free preview · attribution included · GAUL 2024 terms apply</p>
            </aside>

            <section className="preview-card">
              <div className="preview-header">
                <div><div className="card-kicker"><span>02</span> PREVIEW YOUR DATA</div><h3>{selectedCountry} <span>/ {levelLabels[level].short}</span></h3></div>
                <div className="preview-status"><span className={`status-dot ${loadingBoundaries ? 'is-loading' : ''}`} /> {loadingBoundaries ? 'Fetching geometry' : 'Live from API'}</div>
              </div>
              <div className="map-frame">
                {collection ? <Suspense fallback={<div className="map-loading"><span className="spinner" />Preparing preview</div>}><BoundaryMap collection={collection} level={level} /></Suspense> : <div className="map-loading"><span className="spinner" />Waiting for the boundary layer</div>}
              </div>
              <div className="preview-footer">
                <div><span className="footer-label">FEATURES IN VIEW</span><strong>{collection ? formatNumber(collection.total) : '—'}</strong></div>
                <div><span className="footer-label">GEOMETRY</span><strong>{resolution === 'web' ? 'Simplified' : resolution === 'balanced' ? 'Balanced' : 'Full detail'}</strong></div>
                <div><span className="footer-label">SOURCE</span><strong>FAO GAUL ↗</strong></div>
              </div>
            </section>
          </div>
        </section>

        <section id="how-it-works" className="workflow-section section-wrap">
          <div className="workflow-intro"><div className="eyebrow"><span className="eyebrow-line" /> BUILT FOR THE LAST MILE</div><h2>Good data is only useful<br /><span>when it gets out of the way.</span></h2></div>
          <div className="workflow-cards">
            <article><span className="workflow-number">01</span><h3>Choose</h3><p>Search the world by country and administrative level. Preview the exact layer before you commit.</p></article>
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
