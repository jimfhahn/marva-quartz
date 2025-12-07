## Marva

Marva is a BIBFRAME RDF XML editor.

## Features

- **BIBFRAME Editor**: Create and edit Work/Instance/Item descriptions following LC BIBFRAME ontology
- **Profile-based Editing**: Uses LC profile definitions to group fields logically
- **Multiple Identifier Support**: Load records by MMSID, POD UUID, LCCN, or direct URL
- **SHACL Validation**: Validate records against BIBFRAME shapes using mcp4rdf-core
- **Wikibase Publishing**: Publish BIBFRAME records to Wikibase knowledge bases

## Publishing Destinations

### Wikibase (Default)
Publish BIBFRAME records to a Wikibase instance. Currently configured for:
- **URL**: https://vibe.bibframe.wiki (Wikibase Cloud)
- **Documentation**: [docs/WIKIBASE_PUBLISHING.md](docs/WIKIBASE_PUBLISHING.md)

### Alma (Optional)
Legacy support for publishing to Alma/Penn infrastructure (disabled by default).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```

## Validation

BIBFRAME validation uses [mcp4rdf-core](https://github.com/jimfhahn/mcp4rdf-core) running locally via Docker:

```sh
# In mcp4rdf-core directory
docker-compose up
```

Then validation endpoints are available at `http://localhost:5050/validate`.

## Configuration

Key configuration is in `src/stores/config.js`:

| Setting | Description |
|---------|-------------|
| `wikibase.url` | Wikibase instance URL |
| `wikibase.propertyMappings` | Map BIBFRAME concepts to Wikibase properties |
| `validate` | Validation endpoint URL |
| `publishDestination` | Default: 'wikibase' |

## Acknowledgements

This fork of the Marva Quartz editor was developed with the help of [GitHub Copilot](https://github.com/features/copilot), an AI pair programmer that assisted with code suggestions.
