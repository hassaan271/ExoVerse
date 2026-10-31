# ExoVerse

A 3D exoplanet exploration platform built on the NASA Exoplanet Archive: one
data pipeline, one reusable planet engine, and every planet in the catalog.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Use `npm run build` and `npm start` for a
production build.

## Landing page

`components/three/LandingScene.tsx` is one canvas for both the intro and the
hero: a procedural planet passes out of view and the galaxy stays, with pointer
and scroll parallax. Counts come from `data/processed/catalog_stats.json`, which
`npm run catalog` generates. `public/Milky Way.mp4` is the untouched original
video and is no longer used by the site.

## Observatories

`/observatories` is a schematic mission map. `data/observatories/directory.mjs`
holds NASA's Observatories directory, and `scripts/build-observatories.mjs` joins
it to the catalog: a planet belongs to an observatory only when its
`disc_facility` names it, and the validator recounts every total from the raw
CSV. Positions are illustrative, never live. Official models and their credits
are in `public/models/observatories`; `lib/spacecraft/reconstructions.ts` holds
artistic reconstructions for missions with no official model.

## Habitability

`lib/habitability.ts` holds the habitable-zone model (Kopparapu et al. 2014) and
is shared by the build and the interface. `scripts/build-habitability.mjs` runs
every planet through it once and writes `public/data/habitability.json`. This is
a screen of orbit and starlight, not a detection of water, atmospheres or life,
and there is deliberately no combined score. Run the tests with `npm test`.

## AI Astronomer

`/api/agent` runs the agent on the server through Featherless and the OpenAI
SDK. Copy `.env.example` to `.env.local`, add `FEATHERLESS_API_KEY`, then run
`npm run ai:check` to test the live connection.

- `lib/ai/agent.ts` is the loop, limited to 5 tool rounds.
- `lib/ai/tools.server.ts` holds the data tools, which call the existing catalog,
  comparison and habitability code.
- `lib/ai/actions.ts` is the allowlist of interface actions. The server validates
  each one, the browser performs it and reports the result, and the agent resumes
  from a signed continuation.
- `lib/ai/appContext.ts` is how pages report their current selection.

## Planet rendering

`lib/planet-visuals/visualProfile.ts` turns known facts into a preset and
parameters. It has no Three.js dependency. `createPlanetObject.ts` bakes each
planet's maps once with the shaders in `shaders.ts`, then draws it cheaply.
Keep bake shaders small: on Windows, Direct3D compile time grows quickly with
instruction count, and a single large shader once took about 20 seconds.

Presets are artistic. They must never imply oceans, clouds or geology that the
data can't support, and the dashboard states which facts chose each one.

## Data

`data/raw/nasa_exoplanets.csv` is the source: NASA's PS (Planetary Systems)
table, which has one row per publication. To update it, run:

```bash
node scripts/build-catalog.mjs "path/to/new-export.csv"
```

```bash
npm run catalog
```

The first command copies the file in and builds the catalog. `npm run catalog`
rebuilds from the stored file, then runs `scripts/validate-catalog.mjs`, which
re-reads the CSV separately and fails on any mismatch.

| Output | Used by |
| --- | --- |
| `data/processed/exoplanets.json` | Server: full planet records |
| `data/processed/planetary_systems.json` | Server: planets grouped by host |
| `data/processed/validation_report.json` | The processing report |
| `public/data/catalog-index.json` | Browser: search, filters and the galaxy |

Each planet uses the row NASA flags `default_flag=1`. A value missing there may
be filled from the newest other publication for that planet, and is then
recorded in `provenance.gap_filled` and labelled on screen. Blank stays null.

Server code reads through `lib/catalog.server.ts` and browser code through
`lib/catalogIndex.ts`. Panels get their rows from `lib/planetFacts.ts`, which
keeps NASA values, other publications and calculations distinct.

## Positions and scale

`lib/galaxyLayout.ts` documents the frame. It is Galactocentric: the centre is
the origin, the Sun is 8,178 parsecs away on -x and 20.8 parsecs above the plane,
and NASA's `glon`, `glat` and `sy_dist` place each host. True scale uses 1 unit =
100 parsecs for everything. The Neighbourhood view keeps real directions and
compresses distance from the Sun logarithmically, shown by rings. The spiral is
procedural and decorative. Hosts with no `sy_dist` are not plotted: they show
"Position unavailable". Run `node scripts/audit-positions.mjs` to re-check it.

Planet radii use Earth radii everywhere, through `lib/planetScale.ts`: `pl_rade`
directly, otherwise `pl_radj` x 11.209, otherwise no radius. Compare uses 1 scene
unit = 1 Earth radius for both planets and only moves the camera to fit. A planet
with no radius is not drawn there. System views offer Physical Scale, one factor
for radii, orbits and star, and Visibility Enhanced, which keeps true radius
ratios within a system and draws distance as k x sqrt(AU). Orbits are dashed when distance or eccentricity is not measured. A
distance from Kepler's third law is labelled as calculated.

## Compare

`lib/compare.ts` holds the comparison logic. `comparisonPayload` there is the
integration point for an AI explanation, which does not exist yet. Earth and
Jupiter are in `lib/referenceBodies.ts`, separate from the catalog.

## Galaxy rendering and controls

The galaxy view renders through `components/three/useHdrRender.ts`: a
floating-point buffer, restrained bloom, then ACES tone mapping. Keep star
colours in linear light there. Only the interface is monochrome; stars, planets
and the galaxy keep their colour.

Planet Zoom and Orbital Speed live in `components/explorer/SystemControls.tsx`.
They write to a ref that `SystemScene` reads each frame, so sliders never
re-render the scene. Speed multiplies time only: mean motion stays proportional
to 1 / period, so stored periods and relative rates are unchanged.

## Animated numbers

`components/shared/AnimatedNumber.tsx` rolls digits with one transform per digit
and no React renders. It accepts a number or already formatted text. Its final
position is the true digit, so a stalled tab can skip motion, never show a wrong
value. Run `node scripts/audit-radii.mjs` to re-check the radius columns.

