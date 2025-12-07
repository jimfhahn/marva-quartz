# Copilot Instructions: Marva Quartz (Penn Libraries Fork)

## Overview
- **Product**: Web-based BIBFRAME RDF/XML editor with Wikibase publishing support.
- **Source**: Fork of the Library of Congress "Marva Quartz" project with customized search, publishing, and workflow features.
- **Primary Goals**:
  1. Load and edit Work/Instance (and optional Item) descriptions that follow the LC BIBFRAME ontology and profile definitions.
  2. Support catalogers by accepting Alma MMSIDs, POD identifiers, LCCNs, and raw URLs.
  3. **Publish BIBFRAME records to Wikibase** (https://vibe.bibframe.wiki) for building linked data knowledge bases.
  4. Validate records using SHACL shapes via mcp4rdf-core.

## Key User Stories
- *As a cataloger*, I can search for a record by MMSID, POD, LCCN, or direct RDF URL and load it into the editor.
- *As a cataloger*, I can preview, edit, and validate BIBFRAME descriptions using profiles that group fields the way LC does.
- *As a cataloger*, I can publish BIBFRAME records to my Wikibase instance to build a linked data knowledge base.
- *As a cataloger*, I can validate my records against SHACL shapes before publishing.
- *As a systems librarian*, I can configure Wikibase URL and property mappings to match my Wikibase schema.

## Technology Stack
- **Framework**: Vue 3 (SFCs, mix of Options API + Composition helpers) bundled with Vite.
- **State**: Pinia stores under `src/stores/` for config (`config.js`), preferences (`preference.js`), profiles/data (`profile.js`).
- **Routing**: Vue Router (`src/router`).
- **Styling**: Global CSS in `src/assets/base.css` & `main.css`; component-scoped styles where needed.
- **Utilities**: Extensive helper modules in `src/lib/` for RDF parsing (`utils_parse.js`), network (`utils_network.js`), exports (`utils_export.js`), and misc transformations.
- **Tooling**: Vitest for unit tests (`npm run test:unit`), Cypress for e2e (`npm run test:e2e`), ESLint + Prettier for linting.

## Project Structure Highlights
```
src/
├── App.vue / main.js       # Entry point wiring Pinia, Router, global styles
├── views/
│   ├── Load.vue            # Record discovery & loading dashboard (Penn ID logic lives here)
│   └── Edit.vue, EditMulti.vue
├── components/
│   ├── panels/
│   │   ├── nav/            # Global navigation & modals (preferences, publishing, updates)
│   │   └── edit/           # Editor panes, fields, preview panels (MARC, XML, JSON)
│   ├── general/            # Generic UI pieces (loading modal, update banner)
│   └── icons/              # SVG icon components
├── stores/
│   ├── config.js           # Endpoint catalogs (dev/staging/prod/bibframe.org/quartz) & feature flags
│   ├── profile.js          # Core editor state, transformations, export payload assembly
│   └── preference.js       # Layout/theme settings, local storage helpers
├── lib/
│   ├── utils_network.js    # Fetch BIBFRAME packages, MMSID/POD search, saved record APIs, validation
│   ├── utils_parse.js      # XML → profile transformation, blank node handling, Item merging
│   ├── utils_export.js     # Profile → XML serialization, Work/Instance split logic
│   ├── wikibase-transform.js # BIBFRAME RDF/XML → Wikibase entity transformation
│   ├── wikibase-publish.js   # Wikibase API client for publishing entities
│   └── ...                 # Additional RDF helpers, Dewey/LCC mappings, i18n strings
├── assets/                 # Static assets (logo, fonts)
└── router/index.js         # Route definitions (Load, Edit, Multi-edit)

public/
├── profiles*.json          # Ship with LC profile snapshots; swap to target custom profiles
├── starting.json           # Profile instances available from the UI
└── test_files/*.xml        # Local sample records for testing without hitting network

docs/
└── WIKIBASE_PUBLISHING.md  # Comprehensive Wikibase integration guide
```

## Data & Workflow Notes
- **Profiles**: JSON templates describing how to group BIBFRAME properties into Work/Instance/Item resource templates. Located in `public/profiles*.json`.
- **Loading**: `Load.vue` detects identifier type via `detectSearchType()`:
  - MMSID (starts with `99` + digits) → `quartz.bibframe.app/alma/` endpoint
  - POD (UUID) → `quartz.bibframe.app/pod/<uuid>.xml`
  - URLs → direct fetch
  - Fallback → LC LCCN search via `utils_network.searchInstanceByLCCN`
- **Parsing**: `utils_parse.transformRts()` merges incoming RDF/XML with profile definitions, generates per-RT components, and sets up Items when present.
- **Publishing**: 
  - **Wikibase** (default): Publishes to configured Wikibase instance (https://vibe.bibframe.wiki). Uses `wikibase-transform.js` and `wikibase-publish.js`.
  - **Alma** (legacy): Configurable endpoints (`publish`, `workpublish`, `instancepublish`) - currently disabled.
  - UI allows selecting destination and scope (Work+Instance, Work only, Instance only) in `PostModal.vue`.
- **Saved Records**: Requires back-end (see [`marva-backend`](https://github.com/lcnetdev/marva-backend)). Front-end gracefully handles absence by showing empty states.
- **Validation**: Uses mcp4rdf-core (Docker) at `http://localhost:5050/validate` for SHACL validation. Proxied via Vite config.
- **Scriptshifter**: Optional transliteration service toggled through config flags.

## Environment & Configuration
- `useConfigStore` determines which `regionUrls` block to use based on hostname (dev/staging/production/bibframe.org/quartz).
- Local development (`npm run dev`) serves on Vite default port (5173). Use `npm run preview` for production-like preview.
- The app tolerates missing backend endpoints; however, avoid removing graceful-degradation logic.
- Feature flags:
  - `publicEndpoints` toggles whether load/publish should expose public LC services
  - `displayLCOnlyFeatures` controls visibility of LC-specific operations
  - `publishDestination` controls default publish target ('wikibase' or 'alma')
- Wikibase config (`regionUrls.dev.wikibase`):
  - `url`: Wikibase instance URL (https://vibe.bibframe.wiki)
  - `propertyMappings`: Map BIBFRAME concepts to Wikibase property IDs
  - `typeItems`: QIDs for BIBFRAME Work/Instance type items

## Coding Guidelines for Agents
1. **Match existing patterns**: Use Vue SFCs with `<script setup>` only where the repo already does; otherwise stick to Options API for consistency.
2. **Keep helpers centralized**: Add shared logic to `src/lib/` modules or Pinia stores rather than scattering utilities in components.
3. **Preserve RDF fidelity**: When modifying parsing/export logic, maintain namespace declarations, blank node structures, and Work ↔ Instance links.
4. **Accessibility**: Use semantic HTML, ensure buttons/inputs have labels, and respect existing keyboard navigation.
5. **Internationalization**: Strings are currently hard-coded but prepared for Vue I18n. Store translatable text near existing patterns when possible.
6. **Error handling**: Show user-friendly UI feedback; log details to the console for developers.
7. **Network calls**: Route through `utils_network.js`. Include abort/cancel support for long-running fetches where applicable.
8. **State updates**: Use Pinia store actions/mutations to update shared state. Avoid mutating store state directly outside store definitions.
9. **Testing**:
   - Favor Vitest for unit-level logic (helpers, stores, pure components).
   - Use Cypress for flow/regression tests involving the editor UI.
   - Ensure new features have at least one automated check when they affect critical workflows (load, edit, publish).
10. **Lint & format**: Obey ESLint/Prettier configuration. Run `npm run lint` after substantial changes.

## Common Tasks for Copilot
- **Add new identifier types**: Update `detectSearchType`, extend network helpers, add UI affordances in `Load.vue`.
- **Extend Wikibase publishing**: Touch `wikibase-transform.js`, `wikibase-publish.js`, `PostModal.vue`, and config.js property mappings.
- **Add Wikibase properties**: Update `propertyMappings` in config when new Wikibase properties are created.
- **Customize profiles**: Modify JSON under `public/` and ensure `profileStore` handles new RT suffixes.
- **Enhance validation**: Integrate mcp4rdf-core responses; handle service unavailability gracefully.
- **Improve accessibility**: Audit components in `components/panels/edit/` for ARIA attributes, keyboard interactions.

## Testing & Quality Gates
- `npm run test:unit` → Vitest (jsdom) under `src/`.
- `npm run test:e2e` → Builds preview server and runs Cypress headlessly.
- `npm run lint` → ESLint/Prettier combo.
- Prefer running relevant script(s) locally before submitting major changes; document skipped checks if backend dependencies prevent full coverage.

## Additional Tips
- The app expects profile JSON to align with LC structure (`lc:RT:` naming). When introducing new templates, update `validTopLevelProfileSufixes` in `config.js` if needed.
- `public/test_files/*.xml` provide offline fixtures. Use them in tests or when backend endpoints are down.
- When altering store defaults (e.g., `versionMajor`), ensure they propagate to UI elements that display version info.
- Keep Penn-specific logic flagged in comments to ease future upstream merges.
- Large edits to profiles or RDF transformations should include before/after XML snippets in PR descriptions for reviewer clarity.
- Penn fork allows `_b` blank nodes captured as literals to be promoted into Hub or Work resources; make sure downstream changes preserve this behavior when touching parsing/export code.
- Admin metadata defaults (assigner org/label) are hard-coded to "University of Pennsylvania, Van Pelt-Dietrich Library" unless `defaultAssignerLabel` is set; adjust intentionally when working on export or admin metadata logic.

## Staying Aligned With Upstream
- **Track Penn deviations**: Key divergences from lcnetdev upstream live in `src/views/Load.vue` (MMSID/POD detection), `src/stores/config.js` (Penn endpoints and feature flags), and publishing components such as `PostModal.vue` / `src/lib/utils_export.js` (Instance-only workflows). Review these first when resolving merge conflicts so Penn-specific behavior persists.
- **Preserve blank-node promotion**: `utils_parse.js`/`utils_profile.js` include logic for promoting `_b` literal nodes into Hub or Work resources—this does not exist upstream. When merging, ensure this custom handling survives.
- **Penn-flavored admin metadata**: `utils_export.js` seeds assigner details with Penn defaults. Preserve or relocate these values to config rather than reverting to LC strings when resolving conflicts.
- **Merge workflow**: When pulling upstream changes, prefer a feature branch and a clean merge or rebase. Resolve conflicts by preserving Penn logic, then re-run unit tests, lint, and a quick manual smoke of MMSID/POD loading plus Instance-only publishing.
- **Environment sanity checks**: After merges, confirm `regionUrls` entries still expose `publicEndpoints`, `displayLCOnlyFeatures`, and `postUsingAlmaXmlFormat` toggles as expected. Ensure default dev config points to working public endpoints.
- **Penn regression checklist**: Verify the following before finishing a sync:
  - Load by MMSID (`99…`) still chats with `quartz.bibframe.app/alma/`.
  - Load by POD UUID fetches from `quartz.bibframe.app/pod/<uuid>.xml`.
  - Instance-only publish option remains available and posts the correct payload.
  - Saved-records dashboard still tolerates absent backend services.
- **Document merges**: Summarize notable upstream changes and any Penn-specific adjustments in the PR description to help future merges.
