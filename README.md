# Globe / Studio

The first web slice for the GAUL boundary download product. It gives a user a no-code path from country and administrative level to a live preview and downloadable GeoJSON or CSV attributes.

## Run locally

```bash
pnpm install
pnpm dev
```

The app uses `https://gaul.trigis.space` by default. Set `VITE_API_BASE` to point at another compatible API:

```bash
VITE_API_BASE=http://localhost:8000 pnpm dev
```

## Production check

```bash
pnpm build
```

## Cloudflare Workers deployment

This project is configured as a static-assets Worker named `globe`. In Cloudflare Workers Builds, use:

```text
Build command:  pnpm run build
Deploy command: pnpm exec wrangler deploy
```

`wrangler.toml` deploys Vite's `dist/` directory and provides an SPA fallback for client-side routes. The Worker name in the dashboard must remain `globe`.

### Private metrics

Globe collects a small, privacy-preserving product-event stream in Workers Analytics Engine. It records page views, country and layer exploration, selected boundaries, initiated exports, and each boundary included in an exact-place export. It deliberately does **not** send IP addresses or coordinates, honors the browser's Do Not Track preference, and converts the browser's random identifier into a new hash each UTC day before writing it.

The private dashboard is available at `/metrics` after setting these Worker secrets:

```bash
pnpm exec wrangler secret put METRICS_USERNAME
pnpm exec wrangler secret put METRICS_PASSWORD
```

Use a strong, unique password. The dashboard is served by the Worker and protected with HTTP Basic authentication; do not link to it publicly. The `GLOBE_EVENTS` Analytics Engine dataset is created automatically on the first recorded event.

## Current product slice

- Quiet, space-set SVG globe hero built from open world-boundary data, with drag-to-spin, scroll zoom, gentle auto-rotation, and no WebGL requirement. It starts with a randomized constellation of visible country lights; clicking a country retires those idle lights, highlights only that country, and pre-fills the builder below.
- Live country and dataset metadata from the API.
- ADM 0, ADM 1, and ADM 2 selection, with a whole-country or exact-place path for ADM 1 and ADM 2.
- Searchable, multi-select region and district picker backed by a geometry-free boundary index; the map can toggle the same selection when WebGL is available.
- Selected-boundary downloads fetch only the chosen IDs at the requested resolution, while the picker stays lightweight.
- Web-ready, balanced, and full-detail geometry options.
- GeoJSON and CSV attribute downloads.
- Private product observability at `/metrics`: daily anonymous visitors, exploration, downloads, top boundaries, traffic sources, and activity trends.
- MapLibre preview with a graceful non-WebGL fallback.
- MapLibre visualization code loaded as a separate chunk so the core UI can become interactive sooner.

The next production slice should add server-side export jobs for large files, signed download URLs, usage metering, and a thin MCP adapter over the stable REST endpoints.
