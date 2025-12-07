/**
 * BIBFRAME to Wikibase Transformer
 * 
 * Converts BIBFRAME RDF/XML from Marva Quartz into Wikibase entity format
 * for publishing to a Wikibase instance.
 * 
 * The mapping is configurable to support different Wikibase property schemas.
 */

/**
 * Default property mappings from BIBFRAME to Wikibase properties
 * Override these in config for your specific Wikibase instance
 * 
 * Set to null by default - you MUST configure your Wikibase property IDs in config.js
 * Only properties with non-null values will be used when creating claims
 */
export const DEFAULT_PROPERTY_MAPPINGS = {
  // Core type properties
  instanceOf: null,            // "instance of" - used to declare type (e.g., P5)
  
  // BIBFRAME Work properties
  workType: null,              // Type of work (will create "BIBFRAME Work" item)
  title: null,                 // "title" property (e.g., P7)
  subtitle: null,              // subtitle (e.g., P28)
  author: null,                // "author" (e.g., P8)
  contributor: null,           // "contributor" (e.g., P30)
  subject: null,               // "main subject" (e.g., P26)
  language: null,              // "language of work or name" (e.g., P27)
  dateCreated: null,           // "inception"
  
  // BIBFRAME Instance properties  
  instanceType: null,          // Will use "BIBFRAME Instance" item
  publicationDate: null,       // "publication date" (e.g., P11)
  publisher: null,             // "publisher" (e.g., P12)
  publicationStatement: null,  // full publication statement (e.g., P31)
  placeOfPublication: null,    // "place of publication"
  isbn: null,                  // "ISBN-13" (e.g., P9)
  isbn10: null,                // "ISBN-10"
  lccn: null,                  // "Library of Congress Control Number" (e.g., P10)
  oclc: null,                  // "OCLC control number"
  extent: null,                // Needs custom property (pages, etc.)
  
  // Linking properties
  hasInstance: null,           // Custom: Work -> Instance link
  workOf: null,                // Custom: Instance -> Work link (e.g., P29)
  
  // LC Identifiers (like Wikidata P13714, P11859)
  lcWorkId: null,              // Library of Congress BIBFRAME Work ID (e.g., P21)
  lcInstanceId: null,          // Library of Congress BIBFRAME Instance ID (e.g., P22)
  lcHubId: null,               // Library of Congress BIBFRAME Hub ID (e.g., P25)
  
  // Administrative
  describedBy: null,           // "described at URL"
  source: null,                // "stated in"
};

/**
 * Default item QIDs for BIBFRAME types
 * These should be created in your Wikibase or mapped to existing items
 */
export const DEFAULT_TYPE_ITEMS = {
  bibframeWork: null,          // QID for "BIBFRAME Work" item
  bibframeInstance: null,      // QID for "BIBFRAME Instance" item
  bibframeItem: null,          // QID for "BIBFRAME Item" item
  book: 'Q571',                // Wikidata QID for "book" (as fallback)
  article: 'Q191067',          // Wikidata QID for "scholarly article"
};

/**
 * Parse RDF/XML and extract BIBFRAME entities
 * @param {string} rdfXml - The BIBFRAME RDF/XML string
 * @returns {object} Parsed BIBFRAME data with works, instances, items
 */
export function parseBibframeRdf(rdfXml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rdfXml, 'application/xml');
  
  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`XML Parse Error: ${parseError.textContent}`);
  }
  
  const result = {
    works: [],
    instances: [],
    items: [],
    agents: [],      // Contributors, authors
    subjects: [],    // Subject headings
    namespaces: {}
  };
  
  // Extract namespace declarations
  const rdfRoot = doc.documentElement;
  for (const attr of rdfRoot.attributes) {
    if (attr.name.startsWith('xmlns:')) {
      const prefix = attr.name.substring(6);
      result.namespaces[prefix] = attr.value;
    }
  }
  
  // Find all bf:Work elements
  // Use simple selectors - 'Work' matches <bf:Work> in HTML DOM parsing
  // The bf\\:Work variant handles XML namespace parsing
  const workElements = doc.querySelectorAll('Work, bf\\:Work');
  const seenWorkUris = new Set();
  console.log('[Wikibase Transform] Found', workElements.length, 'Work elements');
  
  for (const work of workElements) {
    const workData = extractWorkData(work, result.namespaces);
    // Deduplicate by URI - avoid creating the same Work twice
    const uri = workData.uri || work.getAttribute('rdf:about') || work.getAttribute('about');
    console.log('[Wikibase Transform] Work URI:', uri, 'tagName:', work.tagName);
    
    if (uri && seenWorkUris.has(uri)) {
      console.log('[Wikibase Transform] Skipping duplicate Work:', uri);
      continue;
    }
    if (uri) seenWorkUris.add(uri);
    result.works.push(workData);
  }
  
  // Find all bf:Instance elements
  const instanceElements = doc.querySelectorAll('Instance, bf\\:Instance');
  const seenInstanceUris = new Set();
  console.log('[Wikibase Transform] Found', instanceElements.length, 'Instance elements');
  
  for (const instance of instanceElements) {
    const instanceData = extractInstanceData(instance, result.namespaces);
    // Deduplicate by URI
    const uri = instanceData.uri || instance.getAttribute('rdf:about') || instance.getAttribute('about');
    console.log('[Wikibase Transform] Instance URI:', uri, 'tagName:', instance.tagName);
    
    if (uri && seenInstanceUris.has(uri)) {
      console.log('[Wikibase Transform] Skipping duplicate Instance:', uri);
      continue;
    }
    if (uri) seenInstanceUris.add(uri);
    result.instances.push(instanceData);
  }
  
  // Find all bf:Item elements
  const items = doc.querySelectorAll('Item, bf\\:Item, [rdf\\:type="http://id.loc.gov/ontologies/bibframe/Item"]');
  for (const item of items) {
    result.items.push(extractItemData(item, result.namespaces));
  }
  
  return result;
}

/**
 * Extract data from a bf:Work element
 */
function extractWorkData(workElement, namespaces) {
  const work = {
    uri: workElement.getAttribute('rdf:about') || workElement.getAttribute('about'),
    type: 'Work',
    titles: [],
    contributors: [],
    subjects: [],
    languages: [],
    notes: [],
    identifiers: [],
    instanceRefs: [],
    raw: {}
  };
  
  // Extract titles
  const titleElements = workElement.querySelectorAll('title, bf\\:title');
  for (const titleEl of titleElements) {
    const title = extractTitleData(titleEl);
    if (title) work.titles.push(title);
  }
  
  // Extract contributors
  const contribElements = workElement.querySelectorAll('contribution, bf\\:contribution');
  for (const contribEl of contribElements) {
    const contrib = extractContributionData(contribEl);
    if (contrib) work.contributors.push(contrib);
  }
  
  // Extract subjects
  const subjectElements = workElement.querySelectorAll('subject, bf\\:subject');
  for (const subjEl of subjectElements) {
    const subject = extractSubjectData(subjEl);
    if (subject) work.subjects.push(subject);
  }
  
  // Extract language
  const langElements = workElement.querySelectorAll('language, bf\\:language');
  for (const langEl of langElements) {
    const langUri = langEl.getAttribute('rdf:resource') || langEl.getAttribute('resource');
    if (langUri) {
      work.languages.push({ uri: langUri, code: extractLangCode(langUri) });
    }
  }
  
  // Extract hasInstance references
  const instanceRefs = workElement.querySelectorAll('hasInstance, bf\\:hasInstance');
  for (const ref of instanceRefs) {
    const refUri = ref.getAttribute('rdf:resource') || ref.getAttribute('resource');
    if (refUri) work.instanceRefs.push(refUri);
  }
  
  return work;
}

/**
 * Extract data from a bf:Instance element
 */
function extractInstanceData(instanceElement, namespaces) {
  const instance = {
    uri: instanceElement.getAttribute('rdf:about') || instanceElement.getAttribute('about'),
    type: 'Instance',
    titles: [],
    identifiers: [],
    provisionActivity: [],  // Publication info
    extent: null,
    publicationStatement: null,
    workRef: null,
    raw: {}
  };
  
  // Extract titles (may differ from Work title)
  const titleElements = instanceElement.querySelectorAll('title, bf\\:title');
  for (const titleEl of titleElements) {
    const title = extractTitleData(titleEl);
    if (title) instance.titles.push(title);
  }
  
  // Extract identifiers (ISBN, LCCN, etc.)
  const identifierElements = instanceElement.querySelectorAll('identifiedBy, bf\\:identifiedBy');
  for (const idEl of identifierElements) {
    const identifier = extractIdentifierData(idEl);
    if (identifier) instance.identifiers.push(identifier);
  }
  
  // Extract provision activity (publication)
  const provElements = instanceElement.querySelectorAll('provisionActivity, bf\\:provisionActivity');
  for (const provEl of provElements) {
    const prov = extractProvisionActivityData(provEl);
    if (prov) instance.provisionActivity.push(prov);
  }
  
  // Extract extent
  const extentEl = instanceElement.querySelector('extent, bf\\:extent');
  if (extentEl) {
    instance.extent = extractExtentData(extentEl);
  }
  
  // Extract publication statement
  const pubStatementEl = instanceElement.querySelector('publicationStatement, bf\\:publicationStatement');
  if (pubStatementEl) {
    instance.publicationStatement = pubStatementEl.textContent?.trim();
  }
  
  // Extract instanceOf reference (link to Work)
  const workRef = instanceElement.querySelector('instanceOf, bf\\:instanceOf');
  if (workRef) {
    instance.workRef = workRef.getAttribute('rdf:resource') || workRef.getAttribute('resource');
  }
  
  return instance;
}

/**
 * Extract data from a bf:Item element
 */
function extractItemData(itemElement, namespaces) {
  const item = {
    uri: itemElement.getAttribute('rdf:about') || itemElement.getAttribute('about'),
    type: 'Item',
    heldBy: null,
    shelfMark: null,
    instanceRef: null,
    raw: {}
  };
  
  // Extract heldBy (library)
  const heldByEl = itemElement.querySelector('heldBy, bf\\:heldBy');
  if (heldByEl) {
    item.heldBy = heldByEl.getAttribute('rdf:resource') || 
                  heldByEl.getAttribute('resource') ||
                  heldByEl.textContent?.trim();
  }
  
  // Extract shelfMark
  const shelfMarkEl = itemElement.querySelector('shelfMark, bf\\:shelfMark');
  if (shelfMarkEl) {
    const labelEl = shelfMarkEl.querySelector('rdfs\\:label, label');
    item.shelfMark = labelEl?.textContent?.trim() || shelfMarkEl.textContent?.trim();
  }
  
  // Extract itemOf reference
  const instanceRef = itemElement.querySelector('itemOf, bf\\:itemOf');
  if (instanceRef) {
    item.instanceRef = instanceRef.getAttribute('rdf:resource') || instanceRef.getAttribute('resource');
  }
  
  return item;
}

/**
 * Extract title data from bf:title element
 */
function extractTitleData(titleElement) {
  // Title might be a direct value or nested bf:Title
  const titleNode = titleElement.querySelector('Title, bf\\:Title');
  
  if (titleNode) {
    const mainTitle = titleNode.querySelector('mainTitle, bf\\:mainTitle');
    const subtitle = titleNode.querySelector('subtitle, bf\\:subtitle');
    const partNumber = titleNode.querySelector('partNumber, bf\\:partNumber');
    const partName = titleNode.querySelector('partName, bf\\:partName');
    
    return {
      mainTitle: mainTitle?.textContent?.trim(),
      subtitle: subtitle?.textContent?.trim(),
      partNumber: partNumber?.textContent?.trim(),
      partName: partName?.textContent?.trim(),
      full: [
        mainTitle?.textContent?.trim(),
        subtitle?.textContent?.trim(),
        partNumber?.textContent?.trim(),
        partName?.textContent?.trim()
      ].filter(Boolean).join(' : ')
    };
  }
  
  // Simple literal title
  const text = titleElement.textContent?.trim();
  if (text) {
    return { mainTitle: text, full: text };
  }
  
  return null;
}

/**
 * Extract contribution data (authors, editors, etc.)
 */
function extractContributionData(contribElement) {
  const contribution = contribElement.querySelector('Contribution, bf\\:Contribution, bflc\\:PrimaryContribution');
  if (!contribution) return null;
  
  const agentEl = contribution.querySelector('agent, bf\\:agent');
  const roleEl = contribution.querySelector('role, bf\\:role');
  
  let agent = null;
  if (agentEl) {
    const personEl = agentEl.querySelector('Person, bf\\:Person, Agent, bf\\:Agent');
    if (personEl) {
      const labelEl = personEl.querySelector('rdfs\\:label, label');
      const authAccessPoint = personEl.querySelector('authoritativeLabel, bf\\:authoritativeLabel, bflc\\:name00MatchKey');
      agent = {
        uri: personEl.getAttribute('rdf:about') || personEl.getAttribute('about'),
        label: labelEl?.textContent?.trim() || authAccessPoint?.textContent?.trim(),
        type: personEl.localName || 'Agent'
      };
    } else {
      // Agent might be a reference
      agent = {
        uri: agentEl.getAttribute('rdf:resource') || agentEl.getAttribute('resource'),
        label: agentEl.textContent?.trim()
      };
    }
  }
  
  let role = null;
  if (roleEl) {
    role = {
      uri: roleEl.getAttribute('rdf:resource') || roleEl.getAttribute('resource'),
      code: roleEl.textContent?.trim()
    };
  }
  
  return { agent, role, isPrimary: contribution.localName?.includes('Primary') };
}

/**
 * Extract subject data
 */
function extractSubjectData(subjectElement) {
  // Subject might reference an external authority or contain inline data
  const resourceUri = subjectElement.getAttribute('rdf:resource') || subjectElement.getAttribute('resource');
  if (resourceUri) {
    return { uri: resourceUri, type: 'reference' };
  }
  
  // Look for nested subject types
  const topicEl = subjectElement.querySelector('Topic, bf\\:Topic, madsrdf\\:Topic');
  if (topicEl) {
    const labelEl = topicEl.querySelector('rdfs\\:label, label, authoritativeLabel, madsrdf\\:authoritativeLabel');
    return {
      uri: topicEl.getAttribute('rdf:about') || topicEl.getAttribute('about'),
      label: labelEl?.textContent?.trim(),
      type: 'Topic'
    };
  }
  
  return null;
}

/**
 * Extract identifier data (ISBN, LCCN, OCLC, etc.)
 */
function extractIdentifierData(identifierElement) {
  // Check for different identifier types
  const types = ['Isbn', 'Lccn', 'Local', 'Identifier', 'Oclc'];
  
  for (const typeName of types) {
    const idNode = identifierElement.querySelector(`${typeName}, bf\\:${typeName}`);
    if (idNode) {
      const valueEl = idNode.querySelector('rdf\\:value, value');
      return {
        type: typeName.toLowerCase(),
        value: valueEl?.textContent?.trim() || idNode.textContent?.trim(),
        uri: idNode.getAttribute('rdf:about') || idNode.getAttribute('about')
      };
    }
  }
  
  // Generic identifier
  const valueEl = identifierElement.querySelector('rdf\\:value, value');
  if (valueEl) {
    return {
      type: 'identifier',
      value: valueEl.textContent?.trim()
    };
  }
  
  return null;
}

/**
 * Extract provision activity data (publication info)
 */
function extractProvisionActivityData(provElement) {
  const activity = provElement.querySelector('Publication, bf\\:Publication, ProvisionActivity, bf\\:ProvisionActivity');
  if (!activity) return null;
  
  const dateEl = activity.querySelector('date, bf\\:date');
  const placeEl = activity.querySelector('place, bf\\:place');
  const agentEl = activity.querySelector('agent, bf\\:agent');
  
  const result = {
    type: activity.localName || 'Publication'
  };
  
  if (dateEl) {
    result.date = dateEl.textContent?.trim();
  }
  
  if (placeEl) {
    const placeUri = placeEl.getAttribute('rdf:resource') || placeEl.getAttribute('resource');
    const placeLabelEl = placeEl.querySelector('rdfs\\:label, label');
    result.place = {
      uri: placeUri,
      label: placeLabelEl?.textContent?.trim()
    };
  }
  
  if (agentEl) {
    const agentUri = agentEl.getAttribute('rdf:resource') || agentEl.getAttribute('resource');
    const agentLabelEl = agentEl.querySelector('rdfs\\:label, label');
    result.agent = {
      uri: agentUri,
      label: agentLabelEl?.textContent?.trim()
    };
  }
  
  return result;
}

/**
 * Extract extent data
 */
function extractExtentData(extentElement) {
  const extentNode = extentElement.querySelector('Extent, bf\\:Extent');
  if (extentNode) {
    const labelEl = extentNode.querySelector('rdfs\\:label, label');
    return labelEl?.textContent?.trim();
  }
  return extentElement.textContent?.trim();
}

/**
 * Extract language code from URI
 */
function extractLangCode(langUri) {
  // http://id.loc.gov/vocabulary/languages/eng -> eng
  const match = langUri.match(/\/languages\/(\w+)$/);
  return match ? match[1] : null;
}

/**
 * Convert parsed BIBFRAME data to Wikibase entity format
 * @param {object} bibframeData - Parsed BIBFRAME data from parseBibframeRdf
 * @param {object} propertyMappings - Property ID mappings for your Wikibase
 * @param {object} typeItems - Item QIDs for BIBFRAME types
 * @returns {object} Wikibase entities ready for wikibase-edit
 */
export function transformToWikibaseEntities(bibframeData, propertyMappings = {}, typeItems = {}) {
  const props = { ...DEFAULT_PROPERTY_MAPPINGS, ...propertyMappings };
  const types = { ...DEFAULT_TYPE_ITEMS, ...typeItems };
  
  const entities = {
    works: [],
    instances: [],
    items: []
  };
  
  // Transform Works
  for (const work of bibframeData.works) {
    entities.works.push(transformWork(work, props, types));
  }
  
  // Transform Instances
  for (const instance of bibframeData.instances) {
    entities.instances.push(transformInstance(instance, props, types));
  }
  
  // Transform Items (holdings)
  for (const item of bibframeData.items) {
    entities.items.push(transformItem(item, props, types));
  }
  
  return entities;
}

/**
 * Transform a BIBFRAME Work to Wikibase entity format
 */
function transformWork(work, props, types) {
  const entity = {
    type: 'item',
    labels: {},
    descriptions: {},
    aliases: {},
    claims: {},
    sitelinks: {},
    // Store original URI for linking
    _bibframeUri: work.uri
  };
  
  // Set label from main title
  if (work.titles.length > 0) {
    const mainTitle = work.titles[0].mainTitle || work.titles[0].full;
    if (mainTitle) {
      entity.labels.en = mainTitle;
      
      // Add subtitle to description if present
      if (work.titles[0].subtitle) {
        entity.descriptions.en = work.titles[0].subtitle;
      }
    }
    
    // Additional titles as aliases
    for (let i = 1; i < work.titles.length; i++) {
      const altTitle = work.titles[i].full;
      if (altTitle) {
        if (!entity.aliases.en) entity.aliases.en = [];
        entity.aliases.en.push(altTitle);
      }
    }
  }
  
  // Set type claim (instance of BIBFRAME Work)
  if (props.instanceOf && types.bibframeWork) {
    entity.claims[props.instanceOf] = types.bibframeWork;
  }
  
  // Add title claim
  if (props.title && work.titles.length > 0) {
    const fullTitle = work.titles[0].full;
    if (fullTitle) {
      entity.claims[props.title] = {
        value: fullTitle,
        qualifiers: work.titles[0].subtitle ? {
          // Could add subtitle as qualifier if property exists
        } : undefined
      };
    }
  }
  
  // Add author/contributor claims
  if (props.author) {
    for (const contrib of work.contributors) {
      if (contrib.agent?.label && contrib.isPrimary) {
        if (!entity.claims[props.author]) {
          entity.claims[props.author] = [];
        }
        entity.claims[props.author].push({
          value: contrib.agent.label,
          // If agent has authority URI, could link to existing item
          _agentUri: contrib.agent.uri
        });
      }
    }
  }
  
  if (props.contributor) {
    for (const contrib of work.contributors) {
      if (contrib.agent?.label && !contrib.isPrimary) {
        if (!entity.claims[props.contributor]) {
          entity.claims[props.contributor] = [];
        }
        entity.claims[props.contributor].push({
          value: contrib.agent.label,
          _agentUri: contrib.agent.uri
        });
      }
    }
  }
  
  // Add subject claims
  if (props.subject) {
    for (const subject of work.subjects) {
      if (subject.label) {
        if (!entity.claims[props.subject]) {
          entity.claims[props.subject] = [];
        }
        entity.claims[props.subject].push({
          value: subject.label,
          _subjectUri: subject.uri
        });
      }
    }
  }
  
  // Add language claim
  if (props.language && work.languages.length > 0) {
    // Would need to map language codes to Wikibase items
    // For now, store as string
    entity.claims[props.language] = work.languages.map(l => ({
      value: l.code || l.uri,
      _langUri: l.uri
    }));
  }
  
  // Add source reference (original BIBFRAME URI)
  if (props.describedBy && work.uri) {
    entity.claims[props.describedBy] = work.uri;
  }
  
  // Add LC Work ID (the URI from id.loc.gov)
  if (props.lcWorkId && work.uri) {
    // Extract just the ID portion if it's a full URL, or use the whole URI
    // e.g., http://id.loc.gov/resources/works/12618072 -> 12618072
    const workIdMatch = work.uri.match(/\/works\/(\d+)$/);
    entity.claims[props.lcWorkId] = workIdMatch ? workIdMatch[1] : work.uri;
  }
  
  return entity;
}

/**
 * Transform a BIBFRAME Instance to Wikibase entity format
 */
function transformInstance(instance, props, types) {
  const entity = {
    type: 'item',
    labels: {},
    descriptions: {},
    aliases: {},
    claims: {},
    sitelinks: {},
    _bibframeUri: instance.uri,
    _workRef: instance.workRef
  };
  
  // Set label from title
  if (instance.titles.length > 0) {
    const mainTitle = instance.titles[0].mainTitle || instance.titles[0].full;
    if (mainTitle) {
      entity.labels.en = mainTitle;
    }
  }
  
  // Set type claim (instance of BIBFRAME Instance)
  if (props.instanceOf && types.bibframeInstance) {
    entity.claims[props.instanceOf] = types.bibframeInstance;
  }
  
  // Add identifier claims
  for (const id of instance.identifiers) {
    let propId = null;
    switch (id.type) {
      case 'isbn':
        propId = id.value?.length > 10 ? props.isbn : props.isbn10;
        break;
      case 'lccn':
        propId = props.lccn;
        break;
      case 'oclc':
        propId = props.oclc;
        break;
    }
    
    if (propId && id.value) {
      entity.claims[propId] = id.value;
    }
  }
  
  // Add publication info
  for (const prov of instance.provisionActivity) {
    if (prov.type === 'Publication') {
      if (props.publicationDate && prov.date) {
        entity.claims[props.publicationDate] = prov.date;
      }
      if (props.publisher && prov.agent?.label) {
        entity.claims[props.publisher] = {
          value: prov.agent.label,
          _publisherUri: prov.agent.uri
        };
      }
      if (props.placeOfPublication && prov.place?.label) {
        entity.claims[props.placeOfPublication] = {
          value: prov.place.label,
          _placeUri: prov.place.uri
        };
      }
    }
  }
  
  // Add extent if we have a property for it
  if (props.extent && instance.extent) {
    entity.claims[props.extent] = instance.extent;
  }
  
  // Add source reference
  if (props.describedBy && instance.uri) {
    entity.claims[props.describedBy] = instance.uri;
  }
  
  // Add LC Instance ID (the URI from id.loc.gov)
  if (props.lcInstanceId && instance.uri) {
    // Extract just the ID portion if it's a full URL
    // e.g., http://id.loc.gov/resources/instances/12618072 -> 12618072
    const instanceIdMatch = instance.uri.match(/\/instances\/(\d+)$/);
    entity.claims[props.lcInstanceId] = instanceIdMatch ? instanceIdMatch[1] : instance.uri;
  }
  
  // Add subtitle if present
  if (props.subtitle && instance.titles.length > 0 && instance.titles[0].subtitle) {
    entity.claims[props.subtitle] = instance.titles[0].subtitle;
  }
  
  // Add publication statement if present
  if (props.publicationStatement && instance.publicationStatement) {
    entity.claims[props.publicationStatement] = instance.publicationStatement;
  }
  
  return entity;
}

/**
 * Transform a BIBFRAME Item to Wikibase entity format
 */
function transformItem(item, props, types) {
  const entity = {
    type: 'item',
    labels: {},
    descriptions: {},
    claims: {},
    _bibframeUri: item.uri,
    _instanceRef: item.instanceRef
  };
  
  // Set label based on shelf mark or generic
  if (item.shelfMark) {
    entity.labels.en = `Item: ${item.shelfMark}`;
  } else {
    entity.labels.en = `BIBFRAME Item`;
  }
  
  // Set type claim
  if (props.instanceOf && types.bibframeItem) {
    entity.claims[props.instanceOf] = types.bibframeItem;
  }
  
  // Add held by if we have a property
  if (item.heldBy) {
    entity.descriptions.en = `Held by ${item.heldBy}`;
  }
  
  return entity;
}

/**
 * Prepare entities for wikibase-edit API
 * Converts our internal format to wikibase-edit's expected format
 * @param {object} entities - Transformed entities from transformToWikibaseEntities
 * @returns {array} Array of entities ready for wikibase-edit
 */
export function prepareForWikibaseEdit(entities) {
  const prepared = [];
  
  for (const work of entities.works) {
    prepared.push(cleanEntityForApi(work));
  }
  
  for (const instance of entities.instances) {
    prepared.push(cleanEntityForApi(instance));
  }
  
  for (const item of entities.items) {
    prepared.push(cleanEntityForApi(item));
  }
  
  return prepared;
}

/**
 * Clean entity for API submission
 * Removes internal properties and formats claims correctly
 */
function cleanEntityForApi(entity) {
  const cleaned = {
    type: entity.type,
    labels: entity.labels,
    descriptions: entity.descriptions,
    aliases: entity.aliases,
    claims: {}
  };
  
  // Convert claims to proper format
  for (const [propId, claimValue] of Object.entries(entity.claims || {})) {
    if (!propId || propId === 'null' || propId === 'undefined') continue;
    
    if (Array.isArray(claimValue)) {
      cleaned.claims[propId] = claimValue
        .filter(v => v && (v.value || typeof v === 'string'))
        .map(v => typeof v === 'string' ? v : v.value);
    } else if (typeof claimValue === 'object' && claimValue.value) {
      cleaned.claims[propId] = claimValue.value;
    } else if (claimValue) {
      cleaned.claims[propId] = claimValue;
    }
  }
  
  // Remove empty claims object if no valid claims
  if (Object.keys(cleaned.claims).length === 0) {
    delete cleaned.claims;
  }
  
  return cleaned;
}

export default {
  parseBibframeRdf,
  transformToWikibaseEntities,
  prepareForWikibaseEdit,
  DEFAULT_PROPERTY_MAPPINGS,
  DEFAULT_TYPE_ITEMS
};
