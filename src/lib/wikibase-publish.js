/**
 * Wikibase Publishing Service
 * 
 * Handles publishing BIBFRAME records to a Wikibase instance.
 * Uses wikibase-edit for the actual API calls.
 */

import { parseBibframeRdf, transformToWikibaseEntities, prepareForWikibaseEdit } from './wikibase-transform.js';

/**
 * Wikibase publishing configuration
 */
const DEFAULT_CONFIG = {
  // Your Wikibase instance URL (e.g., 'https://your-wikibase.example.com')
  wikibaseUrl: null,
  
  // API endpoint (usually /w/api.php for MediaWiki-based instances)
  apiPath: '/w/api.php',
  
  // Authentication - one of these methods:
  // 1. OAuth tokens
  oauth: {
    consumerToken: null,
    consumerSecret: null,
    accessToken: null,
    accessSecret: null
  },
  
  // 2. Bot password (username and password created via Special:BotPasswords)
  credentials: {
    username: null,
    password: null
  },
  
  // 3. Anonymous/logged-in session (browser-based, uses cookies)
  useSession: false,
  
  // Property mappings for your Wikibase instance
  propertyMappings: {},
  
  // Item QIDs for BIBFRAME types
  typeItems: {},
  
  // Summary for edits
  editSummary: 'Created from BIBFRAME via Marva Quartz',
  
  // Tags for edits (if your Wikibase supports edit tags)
  tags: ['marva-quartz', 'bibframe'],
  
  // Whether to create new items or just return what would be created
  dryRun: false
};

/**
 * Store for Wikibase configuration
 * Will be populated from Quartz config
 */
let wikibaseConfig = { ...DEFAULT_CONFIG };

/**
 * Configure the Wikibase publisher
 * @param {object} config - Configuration object
 */
export function configureWikibase(config) {
  wikibaseConfig = { ...DEFAULT_CONFIG, ...config };
  console.log('[Wikibase] Configured for:', wikibaseConfig.wikibaseUrl);
}

/**
 * Get current Wikibase configuration
 * @returns {object} Current configuration (without sensitive data)
 */
export function getWikibaseConfig() {
  return {
    wikibaseUrl: wikibaseConfig.wikibaseUrl,
    apiPath: wikibaseConfig.apiPath,
    hasOAuth: !!(wikibaseConfig.oauth?.consumerToken && wikibaseConfig.oauth?.accessToken),
    hasCredentials: !!(wikibaseConfig.credentials?.username),
    useSession: wikibaseConfig.useSession,
    dryRun: wikibaseConfig.dryRun
  };
}

/**
 * Check if Wikibase is configured
 * @returns {boolean} True if minimally configured
 */
export function isWikibaseConfigured() {
  return !!(wikibaseConfig.wikibaseUrl);
}

/**
 * Build the API URL
 * Uses mcp4rdf-core backend for Wikibase proxy (handles CORS and bot protection)
 */
function getApiUrl() {
  if (!wikibaseConfig.wikibaseUrl) {
    throw new Error('Wikibase URL not configured');
  }
  
  // Use the mcp4rdf-core backend proxy (available via Vite proxy at /mcp4rdf)
  // This avoids CORS issues and bypasses Anubis bot protection
  if (typeof window !== 'undefined') {
    console.log('[Wikibase] Using mcp4rdf backend proxy');
    return '/mcp4rdf/wikibase';
  }
  
  const base = wikibaseConfig.wikibaseUrl.replace(/\/$/, '');
  return `${base}${wikibaseConfig.apiPath}`;
}

/**
 * Get CSRF token for editing using mcp4rdf backend
 * Required for all write operations
 */
async function getCsrfToken() {
  const proxyUrl = '/mcp4rdf/wikibase/csrf';
  
  console.log('[Wikibase] Getting CSRF token via backend proxy...');
  
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      wikibase_url: wikibaseConfig.wikibaseUrl
    })
  });
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Failed to get CSRF token: ${data.error}`);
  }
  
  const token = data.csrftoken;
  
  if (!token || token === '+\\') {
    throw new Error('Invalid CSRF token - authentication may have failed');
  }
  
  console.log('[Wikibase] Got CSRF token');
  return token;
}

/**
 * Build authorization headers based on config
 */
function buildAuthHeaders() {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  
  // For OAuth, you'd typically use a library like oauth-1.0a
  // This is a simplified version - full OAuth requires signature generation
  if (wikibaseConfig.oauth?.accessToken) {
    // OAuth 1.0a would need proper signature here
    console.warn('[Wikibase] OAuth requires proper signature generation');
  }
  
  return headers;
}

/**
 * Login with bot credentials using mcp4rdf backend
 * Returns a session for subsequent requests
 */
async function loginWithCredentials() {
  if (!wikibaseConfig.credentials?.username || !wikibaseConfig.credentials?.password) {
    throw new Error('Bot credentials not configured');
  }
  
  const proxyUrl = '/mcp4rdf/wikibase/login';
  console.log('[Wikibase] Logging in via backend proxy...');
  console.log('[Wikibase] URL:', wikibaseConfig.wikibaseUrl);
  console.log('[Wikibase] Username:', wikibaseConfig.credentials.username);
  console.log('[Wikibase] Password length:', wikibaseConfig.credentials.password?.length);
  
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      wikibase_url: wikibaseConfig.wikibaseUrl,
      username: wikibaseConfig.credentials.username,
      password: wikibaseConfig.credentials.password
    })
  });
  
  const data = await response.json();
  console.log('[Wikibase] Login response:', data);
  
  if (!data.success) {
    throw new Error(`Login failed: ${data.error || data.response?.login?.reason || JSON.stringify(data)}`);
  }
  
  console.log('[Wikibase] Login successful:', data.login?.lgusername);
  return true;
}

/**
 * Create a new Wikibase item using mcp4rdf backend
 * @param {object} entity - Entity data in wikibase-edit format
 * @param {string} csrfToken - CSRF token (not used with backend, but kept for API compatibility)
 * @returns {object} Created entity with QID
 */
async function createItem(entity, csrfToken) {
  const proxyUrl = '/mcp4rdf/wikibase/create';
  
  // Build the data structure for wbeditentity
  // Format labels, descriptions, aliases, and claims for the API
  const entityData = {
    labels: formatLabelsForApi(entity.labels || {}),
    descriptions: formatLabelsForApi(entity.descriptions || {}),
    aliases: formatAliasesForApi(entity.aliases || {}),
    claims: formatClaimsForApi(entity.claims || {})
  };
  
  console.log('[Wikibase] Creating item via backend proxy...');
  console.log('[Wikibase] Entity data:', JSON.stringify(entityData, null, 2));
  
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      wikibase_url: wikibaseConfig.wikibaseUrl,
      data: entityData,
      summary: wikibaseConfig.editSummary
    })
  });
  
  const result = await response.json();
  
  if (result.error) {
    throw new Error(`Wikibase API error: ${result.error}`);
  }
  
  console.log('[Wikibase] Created item:', result.id);
  
  return {
    success: true,
    id: result.id,
    title: result.entity?.title,
    lastrevid: result.entity?.lastrevid,
    url: result.url
  };
}

/**
 * Format labels/descriptions for the Wikibase API
 * Converts from simple {lang: "text"} to {lang: {language: lang, value: "text"}}
 */
function formatLabelsForApi(labels) {
  const formatted = {};
  for (const [lang, value] of Object.entries(labels)) {
    if (value) {
      formatted[lang] = { language: lang, value: String(value) };
    }
  }
  return formatted;
}

/**
 * Format aliases for the Wikibase API
 * Converts from simple {lang: ["alias1", "alias2"]} to {lang: [{language: lang, value: "alias1"}, ...]}
 */
function formatAliasesForApi(aliases) {
  const formatted = {};
  for (const [lang, values] of Object.entries(aliases)) {
    if (values && Array.isArray(values)) {
      formatted[lang] = values.map(v => ({ language: lang, value: String(v) }));
    } else if (values) {
      formatted[lang] = [{ language: lang, value: String(values) }];
    }
  }
  return formatted;
}

/**
 * Format claims for the Wikibase API
 * Converts from simple format to API format
 */
function formatClaimsForApi(claims) {
  const formatted = {};
  
  for (const [propId, values] of Object.entries(claims)) {
    if (!propId || !values) continue;
    
    const claimArray = Array.isArray(values) ? values : [values];
    formatted[propId] = claimArray.map(value => {
      // Determine value type
      if (typeof value === 'string') {
        // Check if it's a QID (item reference)
        if (/^Q\d+$/.test(value)) {
          return {
            mainsnak: {
              snaktype: 'value',
              property: propId,
              datavalue: {
                type: 'wikibase-entityid',
                value: { 'entity-type': 'item', 'numeric-id': parseInt(value.slice(1)) }
              }
            },
            type: 'statement',
            rank: 'normal'
          };
        }
        // URL
        if (value.startsWith('http://') || value.startsWith('https://')) {
          return {
            mainsnak: {
              snaktype: 'value',
              property: propId,
              datavalue: { type: 'string', value }
            },
            type: 'statement',
            rank: 'normal'
          };
        }
        // Plain string
        return {
          mainsnak: {
            snaktype: 'value',
            property: propId,
            datavalue: { type: 'string', value }
          },
          type: 'statement',
          rank: 'normal'
        };
      }
      // Object value (might have qualifiers later)
      return {
        mainsnak: {
          snaktype: 'value',
          property: propId,
          datavalue: { type: 'string', value: String(value) }
        },
        type: 'statement',
        rank: 'normal'
      };
    });
  }
  
  return formatted;
}

/**
 * Publish BIBFRAME RDF/XML to Wikibase
 * Main entry point for publishing
 * 
 * @param {string} rdfXml - BIBFRAME RDF/XML content
 * @param {object} options - Publishing options
 * @returns {object} Publishing results with created entity IDs
 */
export async function publishToWikibase(rdfXml, options = {}) {
  console.log('[Wikibase] Starting publish...');
  console.log('[Wikibase] RDF XML length:', rdfXml?.length || 0);
  console.log('[Wikibase] RDF XML preview:', rdfXml?.substring(0, 300));
  
  if (!isWikibaseConfigured()) {
    throw new Error('Wikibase not configured. Set wikibaseUrl in config.');
  }
  
  const results = {
    success: false,
    works: [],
    instances: [],
    items: [],
    errors: [],
    dryRun: wikibaseConfig.dryRun
  };
  
  try {
    // 1. Parse BIBFRAME RDF
    console.log('[Wikibase] Parsing BIBFRAME...');
    const bibframeData = parseBibframeRdf(rdfXml);
    console.log('[Wikibase] Parsed data:', JSON.stringify(bibframeData, null, 2).substring(0, 1000));
    console.log(`[Wikibase] Found ${bibframeData.works.length} works, ${bibframeData.instances.length} instances`);
    
    // 2. Transform to Wikibase format
    console.log('[Wikibase] Transforming to Wikibase format...');
    const entities = transformToWikibaseEntities(
      bibframeData,
      { ...wikibaseConfig.propertyMappings, ...options.propertyMappings },
      { ...wikibaseConfig.typeItems, ...options.typeItems }
    );
    
    // 3. Prepare for API
    const preparedEntities = prepareForWikibaseEdit(entities);
    console.log(`[Wikibase] Prepared ${preparedEntities.length} entities`);
    
    // If dry run, just return what would be created
    if (wikibaseConfig.dryRun || options.dryRun) {
      console.log('[Wikibase] Dry run - not creating entities');
      results.dryRun = true;
      results.preview = preparedEntities;
      results.success = true;
      return results;
    }
    
    // 4. Authenticate if needed
    if (wikibaseConfig.credentials?.username) {
      console.log('[Wikibase] Logging in with bot credentials...');
      await loginWithCredentials();
    }
    
    // 5. Get CSRF token
    console.log('[Wikibase] Getting CSRF token...');
    const csrfToken = await getCsrfToken();
    
    // 6. Create entities
    console.log('[Wikibase] Creating entities...');
    
    // Create Works first
    for (let i = 0; i < entities.works.length; i++) {
      const work = entities.works[i];
      const prepared = preparedEntities[i];
      
      try {
        console.log(`[Wikibase] Creating Work: ${work.labels?.en || 'Untitled'}`);
        const created = await createItem(prepared, csrfToken);
        results.works.push({
          ...created,
          bibframeUri: work._bibframeUri,
          label: work.labels?.en
        });
      } catch (error) {
        console.error(`[Wikibase] Failed to create work:`, error);
        results.errors.push({
          type: 'work',
          bibframeUri: work._bibframeUri,
          error: error.message
        });
      }
    }
    
    // Create Instances (and link to Works if we have QIDs)
    const workOffset = entities.works.length;
    for (let i = 0; i < entities.instances.length; i++) {
      const instance = entities.instances[i];
      const prepared = preparedEntities[workOffset + i];
      
      // Try to link to created Work
      if (instance._workRef && wikibaseConfig.propertyMappings?.instanceOf) {
        const matchingWork = results.works.find(w => w.bibframeUri === instance._workRef);
        if (matchingWork?.id) {
          prepared.claims = prepared.claims || {};
          prepared.claims[wikibaseConfig.propertyMappings.instanceOf] = matchingWork.id;
        }
      }
      
      try {
        console.log(`[Wikibase] Creating Instance: ${instance.labels?.en || 'Untitled'}`);
        const created = await createItem(prepared, csrfToken);
        results.instances.push({
          ...created,
          bibframeUri: instance._bibframeUri,
          label: instance.labels?.en
        });
      } catch (error) {
        console.error(`[Wikibase] Failed to create instance:`, error);
        results.errors.push({
          type: 'instance',
          bibframeUri: instance._bibframeUri,
          error: error.message
        });
      }
    }
    
    // Create Items (holdings) - link to Instances
    const instanceOffset = workOffset + entities.instances.length;
    for (let i = 0; i < entities.items.length; i++) {
      const item = entities.items[i];
      const prepared = preparedEntities[instanceOffset + i];
      
      try {
        console.log(`[Wikibase] Creating Item: ${item.labels?.en || 'Untitled'}`);
        const created = await createItem(prepared, csrfToken);
        results.items.push({
          ...created,
          bibframeUri: item._bibframeUri,
          label: item.labels?.en
        });
      } catch (error) {
        console.error(`[Wikibase] Failed to create item:`, error);
        results.errors.push({
          type: 'item',
          bibframeUri: item._bibframeUri,
          error: error.message
        });
      }
    }
    
    results.success = results.errors.length === 0;
    console.log(`[Wikibase] Publishing complete. Created: ${results.works.length} works, ${results.instances.length} instances, ${results.items.length} items`);
    
  } catch (error) {
    console.error('[Wikibase] Publishing failed:', error);
    results.errors.push({ type: 'general', error: error.message });
    results.success = false;
  }
  
  return results;
}

/**
 * Search for existing Wikibase items by label
 * Useful for deduplication or finding related entities
 */
export async function searchWikibaseItems(searchTerm, options = {}) {
  const apiUrl = getApiUrl();
  
  const params = new URLSearchParams({
    action: 'wbsearchentities',
    search: searchTerm,
    language: options.language || 'en',
    type: options.type || 'item',
    limit: options.limit || 10,
    format: 'json'
  });
  
  const response = await fetch(`${apiUrl}?${params}`, {
    method: 'GET',
    credentials: wikibaseConfig.useSession ? 'include' : 'omit'
  });
  
  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }
  
  const data = await response.json();
  return data.search || [];
}

/**
 * Get details of a Wikibase item by QID
 */
export async function getWikibaseItem(qid, options = {}) {
  const apiUrl = getApiUrl();
  
  const params = new URLSearchParams({
    action: 'wbgetentities',
    ids: qid,
    format: 'json'
  });
  
  if (options.props) {
    params.append('props', options.props.join('|'));
  }
  
  const response = await fetch(`${apiUrl}?${params}`, {
    method: 'GET',
    credentials: wikibaseConfig.useSession ? 'include' : 'omit'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get item: ${response.status}`);
  }
  
  const data = await response.json();
  return data.entities?.[qid];
}

export default {
  configureWikibase,
  getWikibaseConfig,
  isWikibaseConfigured,
  publishToWikibase,
  searchWikibaseItems,
  getWikibaseItem
};
