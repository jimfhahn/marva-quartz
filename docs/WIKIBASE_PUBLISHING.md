# Wikibase Publishing Integration

This document describes how to publish BIBFRAME records from Marva Quartz to a Wikibase instance.

## Overview

Marva Quartz can publish BIBFRAME Work/Instance records directly to a Wikibase knowledge base. This transforms RDF/XML metadata into Wikibase items with claims (statements).

**Configured Instance**: https://vibe.bibframe.wiki (Wikibase Cloud)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Marva Quartz                             │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐  │
│  │ BIBFRAME     │───▶│ wikibase-        │───▶│ wikibase-    │  │
│  │ RDF/XML      │    │ transform.js     │    │ publish.js   │  │
│  │ (Editor)     │    │ (Parse & Map)    │    │ (API Client) │  │
│  └──────────────┘    └──────────────────┘    └──────────────┘  │
└──────────────────────────────────────────────────────────────┬──┘
                                                               │
                                                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Wikibase Cloud                                │
│  https://vibe.bibframe.wiki/w/api.php                           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Properties   │    │ Items        │    │ SPARQL       │       │
│  │ P1, P2, ...  │    │ Q1, Q2, ...  │    │ Endpoint     │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
└──────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

1. **Wikibase Cloud Account**: You must be logged into https://vibe.bibframe.wiki
2. **Browser Session**: The same browser running Marva Quartz must have an active Wikibase session

### Publishing a Record

1. Load or create a BIBFRAME record in Marva Quartz
2. Click **Menu → Post**
3. Destination shows "🌐 Wikibase" (default)
4. URL is pre-filled with `https://vibe.bibframe.wiki`
5. Click **Post to Wikibase**

## Configuration

### Config Location

`src/stores/config.js` → `regionUrls.dev.wikibase`

```javascript
wikibase: {
  enabled: true,
  url: 'https://vibe.bibframe.wiki',
  apiPath: '/w/api.php',
  
  // Map BIBFRAME concepts to Wikibase properties
  propertyMappings: {
    instanceOf: 'P1',       // "instance of" property
    title: 'P2',            // title property
    author: 'P3',           // author property
    isbn: 'P4',             // ISBN
    lccn: 'P5',             // LCCN
    publicationDate: 'P6',  // publication date
    publisher: 'P7',        // publisher
  },
  
  // QIDs for BIBFRAME type classification
  typeItems: {
    bibframeWork: null,     // e.g., 'Q1' after creating
    bibframeInstance: null, // e.g., 'Q2' after creating
  }
}
```

### Property Mappings

The `propertyMappings` object maps BIBFRAME concepts to your Wikibase property IDs. You need to:

1. Create properties in your Wikibase
2. Note their P-numbers
3. Update the config

| BIBFRAME Concept | Wikibase Property | Data Type |
|-----------------|-------------------|-----------|
| instanceOf | P1 | Item |
| title | P2 | String |
| author | P3 | Item or String |
| isbn | P4 | External ID |
| lccn | P5 | External ID |
| publicationDate | P6 | Time |
| publisher | P7 | Item or String |

## Setting Up Your Wikibase

### Step 1: Create Type Items

Create items that classify your BIBFRAME resources:

1. Go to https://vibe.bibframe.wiki/wiki/Special:NewItem
2. Create "BIBFRAME Work" → note Q number (e.g., Q1)
3. Create "BIBFRAME Instance" → note Q number (e.g., Q2)
4. Update `typeItems` in config

### Step 2: Create Properties

1. Go to https://vibe.bibframe.wiki/wiki/Special:NewProperty
2. Create each property with appropriate data type:

| Property | Label | Data Type |
|----------|-------|-----------|
| P1 | instance of | Item |
| P2 | title | String |
| P3 | author | String |
| P4 | ISBN | External identifier |
| P5 | LCCN | External identifier |
| P6 | publication date | Point in time |
| P7 | publisher | String |

### Step 3: Update Config

After creating properties, update `src/stores/config.js`:

```javascript
propertyMappings: {
  instanceOf: 'P1',  // Replace with actual P-number
  title: 'P2',
  // ... etc
},
typeItems: {
  bibframeWork: 'Q1',     // Replace with actual Q-number
  bibframeInstance: 'Q2',
}
```

## Authentication

### Browser Session (Default)

Wikibase Cloud uses OAuth. The simplest approach:

1. Log into https://vibe.bibframe.wiki in your browser
2. Run Marva Quartz in the same browser
3. API calls use your session cookies

### Bot Password (Advanced)

For automated workflows:

1. Go to https://vibe.bibframe.wiki/wiki/Special:BotPasswords
2. Create a bot password with "Edit existing pages" and "Create, edit, and move pages" grants
3. Store credentials securely (not in code)

## API Reference

### Wikibase API Endpoint

```
https://vibe.bibframe.wiki/w/api.php
```

### Key API Actions

| Action | Purpose |
|--------|---------|
| `wbsearchentities` | Search for items/properties |
| `wbeditentity` | Create or edit items |
| `query&meta=tokens` | Get CSRF token for edits |
| `query&meta=userinfo` | Check authentication status |

### Example: Check API Status

```bash
curl "https://vibe.bibframe.wiki/w/api.php?action=query&meta=siteinfo&siprop=general&format=json"
```

### Example: Search Items

```bash
curl "https://vibe.bibframe.wiki/w/api.php?action=wbsearchentities&search=work&language=en&type=item&format=json"
```

## Transformation Details

### BIBFRAME → Wikibase Mapping

The `wikibase-transform.js` module parses BIBFRAME RDF/XML and extracts:

| BIBFRAME Element | Wikibase Target |
|-----------------|-----------------|
| `bf:Work` | Item with instanceOf → BIBFRAME Work |
| `bf:Instance` | Item with instanceOf → BIBFRAME Instance |
| `bf:mainTitle` | title claim |
| `bf:contribution/bf:agent` | author claim |
| `bf:identifiedBy/bf:Isbn` | isbn claim |
| `bf:identifiedBy/bf:Lccn` | lccn claim |
| `bf:provisionActivity/bf:date` | publicationDate claim |

### Entity Structure

Created Wikibase items have this structure:

```json
{
  "type": "item",
  "labels": {
    "en": { "language": "en", "value": "Title of the Work" }
  },
  "descriptions": {
    "en": { "language": "en", "value": "BIBFRAME Work imported from Marva Quartz" }
  },
  "claims": {
    "P1": [{ "mainsnak": { "datavalue": { "value": { "id": "Q1" } } } }],
    "P2": [{ "mainsnak": { "datavalue": { "value": "Main Title" } } }]
  }
}
```

## Troubleshooting

### "Not authenticated" Error

**Cause**: No active Wikibase session

**Solution**: 
1. Open https://vibe.bibframe.wiki in a new tab
2. Log in with your account
3. Return to Marva Quartz and try again

### "CSRF token invalid" Error

**Cause**: Session expired or cross-origin issue

**Solution**:
1. Refresh your Wikibase login
2. Ensure you're using the same browser
3. Check browser console for CORS errors

### Items Created Without Claims

**Cause**: Property mappings not configured

**Solution**:
1. Create properties in your Wikibase
2. Update `propertyMappings` in config with correct P-numbers

### Empty Wikibase After Publishing

**Cause**: API returned success but items not visible

**Solution**:
1. Check https://vibe.bibframe.wiki/wiki/Special:RecentChanges
2. Verify you have edit permissions
3. Check browser console for API response details

## Files Reference

| File | Purpose |
|------|---------|
| `src/lib/wikibase-transform.js` | Parse BIBFRAME RDF/XML, extract entities |
| `src/lib/wikibase-publish.js` | Wikibase API client, create items |
| `src/stores/config.js` | Wikibase URL and property mappings |
| `src/components/panels/nav/PostModal.vue` | Publishing UI |

## Future Enhancements

- [ ] Automatic property creation on first publish
- [ ] SPARQL query integration for duplicate detection
- [ ] Batch import of multiple records
- [ ] Two-way sync (Wikibase → BIBFRAME)
- [ ] Property mapping UI in preferences
- [ ] OAuth 2.0 flow for authentication
