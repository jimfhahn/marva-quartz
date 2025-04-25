import {useConfigStore} from "../stores/config";
import {useProfileStore} from "../stores/profile";
import {usePreferenceStore} from "../stores/preference";
import utilsRDF from './utils_rdf';
import utilsMisc from './utils_misc';
import utilsNetwork from './utils_network';
import utilsProfile from './utils_profile';
import { parse as parseEDTF } from 'edtf'
import { md5 } from "hash-wasm";

const escapeHTML = str => str.replace(/[&<>'"]/g,
  tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag]));

// Formats an XML string with indentation for easier reading
const formatXML = function (xml, tab = '\t', nl = '\n') {
    if (!xml) {
        return 'No XML';
    }
    let formatted = '', indent = '';
    const nodes = xml.slice(1, -1).split(/>\s*</);
    if (nodes[0][0] === '?') {
        formatted += '<' + nodes.shift() + '>' + nl;
    }
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node[0] === '/') {
            indent = indent.slice(tab.length); // decrease indent
        }
        formatted += indent + '<' + node + '>' + nl;
        if (node[0] !== '/' && node[node.length - 1] !== '/' && node.indexOf('</') === -1) {
            indent += tab; // increase indent
        }
    }
    return formatted;
};

// Returns a DOMParser instance using the built-in browser API
const returnDOMParser = function () {
    let p;
    try {
        p = new DOMParser();
    } catch (error) {
        p = new window.DOMParser();
    }
    return p;
};

// Ensures the provided XML string has a root element
function ensureRoot(xmlStr) {
    if (!xmlStr.trim().match(/^<\w/)) {
        return `<root>${xmlStr}</root>`;
    }
    return xmlStr;
}

// Creates an XML element with the specified namespace and qualified name
function createElByBestNS(elStr){
    // Ensure elStr is a string so that indexOf and trim always work
    if (typeof elStr !== 'string'){
        elStr = String(elStr);
    }
    if (!elStr || typeof elStr !== "string"){
      console.error("createElByBestNS: invalid elStr", elStr);
      return document.createElement("div"); // safe fallback
    }
    elStr = elStr.trim();
    // If elStr looks like only digits (possibly with whitespace), return fallback
    if (/^\d[\d\s]*$/.test(elStr)) {
      console.warn("createElByBestNS: elStr appears numeric/index only, returning fallback", elStr);
      return document.createElement("div");
    }
    // If elStr looks like a full URI (contains "://"), follow URI logic
    if (elStr.includes("://")){
      if (elStr === 'http://www.loc.gov/mads/rdf/v1#'){
        elStr = 'http://www.loc.gov/mads/rdf/v1#Authority';
      }
      elStr = elStr.replace('https://','http://');
      if (!elStr.startsWith('http')){
        elStr = utilsExport.UriNamespace(elStr);
        if (!elStr || typeof elStr !== "string"){
          console.error("createElByBestNS: UriNamespace returned invalid value", elStr);
          return document.createElement("div");
        }
      }
      for (let ns of Object.keys(utilsRDF.namespace)){
        if (elStr.startsWith(utilsRDF.namespace[ns])){
          let tag = utilsExport.namespaceUri(elStr);
          if (!tag || typeof tag !== 'string'){
             console.error("createElByBestNS: namespaceUri returned invalid tag for", elStr);
             return document.createElement("div");
          }
          return document.createElementNS(utilsRDF.namespace[ns], tag);
        }
      }
      console.error("createElByBestNS: could not find namespace for", elStr);
      return document.createElement("div");
    }
    // If elStr does not contain "://", check if it is a qualified name like "bf:assigner"
    else if (elStr.includes(":")){
      let parts = elStr.split(":");
      let prefix = parts[0];
      if (utilsRDF.namespace[prefix]){
        return document.createElementNS(utilsRDF.namespace[prefix], elStr);
      } else {
        console.error("createElByBestNS: unknown prefix", prefix);
        return document.createElement("div");
      }
    }
    else {
      console.warn("createElByBestNS: elStr does not look like a valid URI or qualified name", elStr);
      return document.createElement("div");
    }
  }

const utilsExport = {


  checkForEDTFDatatype: null,
  lastGoodXMLBuildProfile: null,
  lastGoodXMLBuildProfileTimestamp: null,

	// ignore these beause they control the shape of the xml and we want to control that
	ignoreProperties: [

		'http://id.loc.gov/ontologies/bibframe/instanceOf',
		'http://id.loc.gov/ontologies/bibframe/hasItem',
		'http://id.loc.gov/ontologies/bibframe/itemOf',
		'http://id.loc.gov/ontologies/bibframe/hasInstance',
		'http://id.loc.gov/ontologies/bibframe/Work'

	],

  /**
  * if passed full uri like http://id.loc.gov/ontology/bibframe/xxx will convert to a prefixed bf:xxx
  *
  * @param {string} uri - the uri to convert
  * @return {string}
  */
  namespaceUri: function(uri){
		for (let ns in utilsRDF.namespace){
			let nsuri = utilsRDF.namespace[ns]
			if (uri.includes(nsuri)){
				return uri.replace(nsuri,`${ns}:`)
			}
		}
	},

  /**
  * if passed a prefix like bf:xxx it will expand it to http://id.loc.gov/ontology/bibframe...
  *
  * @param {string} passedNS - the prefixed element/prop
  * @return {string}
  */
	UriNamespace: function(passedNS){
		for (let ns in utilsRDF.namespace){
			let nsuri = utilsRDF.namespace[ns]
			if (passedNS.startsWith(`${ns}:`)){
				return passedNS.replace(`${ns}:`,nsuri)
			}
		}
	},

  /**
  * creates a element with createElementNS using the correct namespace.
  * Now supports two signatures:
  *   a) createElByBestNS(qualifiedName)
  *   b) createElByBestNS(namespaceURI, localName)
  *
  * @param {string} nsOrQualified - either a qualified name or a namespace URI.
  * @param {string} [maybeLocal] - if provided, is the local name.
  * @return {Element|Text}
  */
  createElByBestNS: function(nsOrQualified, maybeLocal) {
    // Special case for Barcode element creation
    if (nsOrQualified === 'bf:Barcode' || 
        nsOrQualified === 'http://id.loc.gov/ontologies/bibframe/Barcode') {
      try {
        console.log('Creating barcode element with special handling');
        // Create the barcode element directly with proper namespace
        const barcodeEl = document.createElementNS(utilsRDF.namespace.bf, "bf:Barcode");
        return barcodeEl;
      } catch (error) {
        console.error("Error creating barcode element:", error);
        // Continue with normal handling as fallback
      }
    }
    
    // Even more defensive coding to handle undefined values
    if (nsOrQualified === undefined || nsOrQualified === null) {
      console.error("createElByBestNS: nsOrQualified is undefined or null", new Error().stack);
      return document.createElement("div"); // safe fallback
    }
    
    // --- New overload support ---
    if (arguments.length === 2) {
      let ns = nsOrQualified;
      
      // Handle undefined maybeLocal
      if (maybeLocal === undefined || maybeLocal === null) {
        console.error("createElByBestNS: maybeLocal is undefined or null", ns);
        return document.createElement("div"); // safe fallback
      }
      
      let localName = String(maybeLocal).trim();
      let prefix = "";
      
      for (let p in utilsRDF.namespace) {
        if (utilsRDF.namespace[p] === ns) { prefix = p; break; }
      }
      
      let qualifiedName = prefix ? `${prefix}:${localName}` : localName;
      
      try {
        return document.createElementNS(ns, qualifiedName);
      } catch (error) {
        console.error("Error in createElementNS:", error, "ns:", ns, "qualifiedName:", qualifiedName);
        return document.createElement("div"); // safe fallback
      }
    }
    // --- End overload support ---

    let elStr = nsOrQualified;
    if (!elStr || typeof elStr !== "string") {
      console.error("createElByBestNS: invalid elStr", elStr);
      return document.createElement("div"); // safe fallback
    }
    elStr = elStr.trim().replace(/\s+/g, '');
    // Updated numeric check:
    if (/^\d[\d\s]*$/.test(elStr)) {
      console.warn("createElByBestNS: elStr appears numeric/index only, returning text node", elStr);
      return document.createTextNode(escapeHTML(elStr));
    }
    // If elStr contains "://", follow URI logic
    if (elStr.includes("://")) {
      if (elStr === 'http://www.loc.gov/mads/rdf/v1#') {
        elStr = 'http://www.loc.gov/mads/rdf/v1#Authority';
      }
      elStr = elStr.replace('https://', 'http://');
      if (!elStr.startsWith('http')) {
        elStr = this.UriNamespace(elStr);
        if (!elStr || typeof elStr !== "string") {
          console.error("createElByBestNS: UriNamespace returned invalid value", elStr);
          return document.createElement("div");
        }
      }
      for (let ns of Object.keys(utilsRDF.namespace)) {
        if (elStr.startsWith(utilsRDF.namespace[ns])) {
          let tag = this.namespaceUri(elStr);
          if (!tag || typeof tag !== 'string') {
            console.error("createElByBestNS: namespaceUri returned invalid tag for", elStr);
            return document.createElement("div");
          }
          return document.createElementNS(utilsRDF.namespace[ns], tag);
        }
      }
      console.error("createElByBestNS: could not find namespace for", elStr);
      return document.createElement("div");
    }
    // If elStr does not contain "://", check if it is a qualified name like "bf:assigner"
    else if (elStr.includes(":")) {
      let parts = elStr.split(":");
      let prefix = parts[0];
      if (utilsRDF.namespace[prefix]) {
        return document.createElementNS(utilsRDF.namespace[prefix], elStr);
      } else {
        console.error("createElByBestNS: unknown prefix", prefix);
        return document.createElement("div");
      }
    }
    else {
      console.warn("createElByBestNS: elStr does not look like a valid URI or qualified name", elStr);
      return document.createElement("div");
    }
  },

/**
* if passed full uri like http://id.loc.gov/ontology/bibframe/xxx will convert to a prefixed bf:xxx
*
* @param {string} uri - the uri to convert
* @return {string}
*/
namespaceUri: function(uri){
  for (let ns in utilsRDF.namespace){
    let nsuri = utilsRDF.namespace[ns]
    if (uri.includes(nsuri)){
      return uri.replace(nsuri,`${ns}:`)
    }
  }
},

/**
* if passed a prefix like bf:xxx it will expand it to http://id.loc.gov/ontology/bibframe...
*
* @param {string} passedNS - the prefixed element/prop
* @return {string}
*/
UriNamespace: function(passedNS){
  for (let ns in utilsRDF.namespace){
    let nsuri = utilsRDF.namespace[ns]
    if (passedNS.startsWith(`${ns}:`)){
      return passedNS.replace(`${ns}:`,nsuri)
    }
  }
},

/**
* creates a element with createElementNS using the correct namespace.
* Now supports two signatures:
*   a) createElByBestNS(qualifiedName)
*   b) createElByBestNS(namespaceURI, localName)
*
* @param {string} nsOrQualified - either a qualified name or a namespace URI.
* @param {string} [maybeLocal] - if provided, is the local name.
* @return {Element|Text}
*/
createElByBestNS: function(nsOrQualified, maybeLocal) {
  // Special case for Barcode element creation
  if (nsOrQualified === 'bf:Barcode' || 
      nsOrQualified === 'http://id.loc.gov/ontologies/bibframe/Barcode') {
    try {
      console.log('Creating barcode element with special handling');
      // Create the barcode element directly with proper namespace
      const barcodeEl = document.createElementNS(utilsRDF.namespace.bf, "bf:Barcode");
      return barcodeEl;
    } catch (error) {
      console.error("Error creating barcode element:", error);
      // Continue with normal handling as fallback
    }
  }
  
  // Even more defensive coding to handle undefined values
  if (nsOrQualified === undefined || nsOrQualified === null) {
    console.error("createElByBestNS: nsOrQualified is undefined or null", new Error().stack);
    return document.createElement("div"); // safe fallback
  }
  
  // --- New overload support ---
  if (arguments.length === 2) {
    let ns = nsOrQualified;
    
    // Handle undefined maybeLocal
    if (maybeLocal === undefined || maybeLocal === null) {
      console.error("createElByBestNS: maybeLocal is undefined or null", ns);
      return document.createElement("div"); // safe fallback
    }
    
    let localName = String(maybeLocal).trim();
    let prefix = "";
    
    for (let p in utilsRDF.namespace) {
      if (utilsRDF.namespace[p] === ns) { prefix = p; break; }
    }
    
    let qualifiedName = prefix ? `${prefix}:${localName}` : localName;
    
    try {
      return document.createElementNS(ns, qualifiedName);
    } catch (error) {
      console.error("Error in createElementNS:", error, "ns:", ns, "qualifiedName:", qualifiedName);
      return document.createElement("div"); // safe fallback
    }
  }
  // --- End overload support ---

  let elStr = nsOrQualified;
  if (!elStr || typeof elStr !== "string") {
    console.error("createElByBestNS: invalid elStr", elStr);
    return document.createElement("div"); // safe fallback
  }
  elStr = elStr.trim().replace(/\s+/g, '');
  // Updated numeric check:
  if (/^\d[\d\s]*$/.test(elStr)) {
    console.warn("createElByBestNS: elStr appears numeric/index only, returning text node", elStr);
    return document.createTextNode(escapeHTML(elStr));
  }
  // If elStr contains "://", follow URI logic
  if (elStr.includes("://")) {
    if (elStr === 'http://www.loc.gov/mads/rdf/v1#') {
      elStr = 'http://www.loc.gov/mads/rdf/v1#Authority';
    }
    elStr = elStr.replace('https://', 'http://');
    if (!elStr.startsWith('http')) {
      elStr = this.UriNamespace(elStr);
      if (!elStr || typeof elStr !== "string") {
        console.error("createElByBestNS: UriNamespace returned invalid value", elStr);
        return document.createElement("div");
      }
    }
    for (let ns of Object.keys(utilsRDF.namespace)) {
      if (elStr.startsWith(utilsRDF.namespace[ns])) {
        let tag = this.namespaceUri(elStr);
        if (!tag || typeof tag !== 'string') {
          console.error("createElByBestNS: namespaceUri returned invalid tag for", elStr);
          return document.createElement("div");
        }
        return document.createElementNS(utilsRDF.namespace[ns], tag);
      }
    }
    console.error("createElByBestNS: could not find namespace for", elStr);
    return document.createElement("div");
  }
  // If elStr does not contain "://", check if it is a qualified name like "bf:assigner"
  else if (elStr.includes(":")) {
    let parts = elStr.split(":");
    let prefix = parts[0];
    if (utilsRDF.namespace[prefix]) {
      return document.createElementNS(utilsRDF.namespace[prefix], elStr);
    } else {
      console.error("createElByBestNS: unknown prefix", prefix);
      return document.createElement("div");
    }
  }
  else {
    console.warn("createElByBestNS: elStr does not look like a valid URI or qualified name", elStr);
    return document.createElement("div");
  }
},

    /**
   * Serializes an XML node to a string, preserving all namespace declarations
   * @param {Element} node - The XML node to serialize
   * @return {String} The serialized XML string with namespace declarations preserved
   */
    serializePreservingNamespaces: function(node) {
      // Create a new serializer that preserves namespaces
      const serializer = new XMLSerializer();
      let xmlString = serializer.serializeToString(node);
      
      // Ensure rdfs namespace declaration is present in rdfs:label elements
      xmlString = xmlString.replace(/<rdfs:label(?![^>]*xmlns:rdfs=)/g, 
        '<rdfs:label xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"');
      
      // Fix namespace declarations - add spaces between them
      xmlString = xmlString.replace(/xmlns:[a-z0-9]+="[^"]+"/g, match => match + ' ');
      
      // Fix any double quotes that might appear before a namespace
      xmlString = xmlString.replace(/"xmlns:/g, ' xmlns:');
      
      // Remove any extra spaces in closing tags
      xmlString = xmlString.replace(/\s+\/>/g, '/>');
      
      return xmlString;
    },

  /**
  * Creates a properly namespaced rdfs:label element
  * 
  * @param {string} text - The label text content
  * @return {Element} - The properly namespaced rdfs:label element
  */
  createRdfsLabel: function(text) {
    const labelEl = document.createElementNS(utilsRDF.namespace.rdfs, "rdfs:label");
    // Explicitly set the namespace
    labelEl.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:rdfs", utilsRDF.namespace.rdfs);
    labelEl.textContent = text || '';
    return labelEl;
  },

  /**
  * Formats an agent entity from a Wikidata source for RDF output
  * @param {Object} agent - The agent entity object
  * @return {String} - The formatted RDF for the agent
  */
  formatAgentEntity: function(agent) {
    // Check if this is a Wikidata entity that should use MADS RDF types
    if (agent.uri && agent.uri.includes('wikidata.org')) {
      // Determine the entity type (PersonalName is default for agents if not specified)
      const entityType = agent.type || 'PersonalName';
      const rdfType = agent.typeFull || `http://www.loc.gov/mads/rdf/v1#${entityType}`;
      
      // Modified to ensure xmlns:rdfs is properly included and no extra whitespace is added
      return `<madsrdf:${entityType} rdf:about="${agent.uri}">
  <rdf:type rdf:resource="${rdfType}" />
  <rdfs:label xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">${agent.label || agent.title || ''}</rdfs:label>
</madsrdf:${entityType}>`;
    }
    
    // For non-Wikidata entities, use the standard bf:Agent format
    // Also add the namespace declaration here for consistency
    return `<bf:Agent rdf:about="${agent.uri}">
  <rdf:type rdf:resource="${agent.typeFull || 'http://id.loc.gov/ontologies/bibframe/Agent'}" />
  <rdfs:label xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">${agent.label || agent.title || ''}</rdfs:label>
</bf:Agent>`;
  },

  /**
  * Generates RDF markup for a contribution
  * @param {Object} contribution - The contribution object
  * @param {String} contributionType - The type of contribution (Primary, etc.)
  * @return {String} - The formatted RDF for the contribution
  */
  formatContribution: function(contribution, contributionType = 'Contribution') {
    let agentMarkup;
    
    if (contribution.agent) {
      // Use our specific formatter for agents
      agentMarkup = this.formatAgentEntity(contribution.agent);
    } else {
      // Add xmlns:rdfs for consistency even in the fallback
      agentMarkup = '<bf:Agent><rdfs:label xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">Unknown</rdfs:label></bf:Agent>';
    }
    
    // Ensure we properly preserve the XML structure when embedding
    return `<bf:${contributionType}>
  <bf:agent>
    ${agentMarkup}
  </bf:agent>
  ${contribution.role ? `<bf:role><bf:Role rdf:about="${contribution.role}"/></bf:role>` : ''}
</bf:${contributionType}>`;
  },

  /**
  * A helper function that will build blank node based on userValue obj
  *
  * @param {obj} userValue - the uservalue to test
  * @param {string} property - the property uri
  * @return {Element} - The created blank node element
  */
  createBnode: function(userValue, property) {
    // Add defensive check for undefined userValue
    if (!userValue) {
      console.error("createBnode: userValue is undefined or null", new Error().stack);
      return document.createElement("div"); // safe fallback
    }
    
    // some special cases here
    if (property == 'http://id.loc.gov/ontologies/bibframe/agent') {
      // if it is an agent create the Agent bnode and just add the type to it as rdf:type
      let bnode = this.createElByBestNS('bf:Agent');
      if (userValue['@id']) {
        bnode.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:about', userValue['@id']);
      }
      
      // Check if @type exists before using it
      if (userValue['@type']) {
        let rdftype = this.createElByBestNS('rdf:type');
        rdftype.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:resource', userValue['@type']);
        bnode.appendChild(rdftype);
      } else {
        console.warn("createBnode: agent missing @type");
      }
      
      if (userValue['@parseType']) {
        bnode.setAttribute('rdf:parseType', userValue['@parseType']);
      }
      return bnode;
    } else if (userValue['@type'] && userValue['@type'].includes('id.loc.gov/vocabulary/mnotetype')) {
      // if it is this specific note vocabulary type then create a bf:Note with a RDF type in it
      let bnode = this.createElByBestNS('bf:Note');
      let rdftype = this.createElByBestNS('rdf:type');
      rdftype.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:resource', userValue['@type']);
      bnode.appendChild(rdftype);
      return bnode;
    } else {
      // CRITICAL FIX: Check for missing @type and provide fallback
      if (!userValue['@type']) {
        console.warn("createBnode: missing @type in userValue, using fallback element", property);
        
        // Simple static mapping for common properties
        const fallbackMap = {
          'http://id.loc.gov/ontologies/bibframe/mainTitle': 'bf:Title',
          'http://id.loc.gov/ontologies/bibframe/title': 'bf:Title',
          'http://id.loc.gov/ontologies/bflc/nonSortNum': 'bf:Title',
          'http://id.loc.gov/ontologies/bibframe/Barcode': 'bf:Barcode',
          'http://id.loc.gov/ontologies/bibframe/barcode': 'bf:Barcode',
          'http://www.w3.org/2000/01/rdf-schema#label': 'bf:Label',
          'rdfs:label': 'bf:Label'
        };
        
        // Use mapping or default to Resource
        let fallbackType = fallbackMap[property] || 'bf:Resource';
        console.log(`Using fallback type ${fallbackType} for property ${property}`);
        
        try {
          let bnode = this.createElByBestNS(fallbackType);
          if (userValue['@id']) {
            bnode.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:about', userValue['@id']);
          }
          if (userValue['@parseType']) {
            bnode.setAttribute('rdf:parseType', userValue['@parseType']);
          }
          return bnode;
        } catch(e) {
          console.error("Failed to create fallback bnode", e);
          return document.createElement("div"); // emergency fallback
        }
      }
      
      // Original code path when @type exists
      try {
        let bnode = this.createElByBestNS(userValue['@type']);
        if (userValue['@id']) {
          bnode.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:about', userValue['@id']);
        }
        if (userValue['@parseType']) {
          bnode.setAttribute('rdf:parseType', userValue['@parseType']);
        }
        return bnode;
      } catch(e) {
        console.error("Failed to create bnode with @type", userValue['@type'], e);
        return document.createElement("div"); // emergency fallback
      }
    }
  },

  /**
  * A helper function that will build a literal value element
  *
  * @param {string} property - the property uri
  * @param {obj} userValue - the uservalue to test
  * @return {Element|boolean} - Element or false if no valid element could be created
  */
  createLiteral: function(property, userValue) {
    // Defensive coding - check for undefined/null values
    if (property === undefined || property === null) {
      console.error("createLiteral: property is undefined or null");
      return false;
    }
    if (userValue === undefined || userValue === null) {
      console.error("createLiteral: userValue is undefined or null");
      return false;
    }

    // Special case for barcode values - process these first
    if (property === 'http://id.loc.gov/ontologies/bibframe/Barcode' || 
        property === 'bf:Barcode' || 
        (typeof property === 'string' && property.toLowerCase().includes('barcode'))) {
      console.log('Creating proper barcode structure directly');
      try {
        const barcodeEl = this.createElByBestNS('bf:Barcode');
        
        // Create rdf:value element to hold the barcode number
        const valueEl = this.createElByBestNS('rdf:value');
        
        // Extract the barcode value - handle various possible structures
        let barcodeValue = '';
        if (typeof userValue === 'string') {
          barcodeValue = userValue;
        } else if (typeof userValue === 'number') {
          barcodeValue = userValue.toString();
        } else if (userValue && typeof userValue === 'object') {
          // Try to find the barcode value in the object
          if (userValue['bf:Barcode']) {
            barcodeValue = userValue['bf:Barcode'];
          } else if (userValue['http://id.loc.gov/ontologies/bibframe/Barcode']) {
            barcodeValue = userValue['http://id.loc.gov/ontologies/bibframe/Barcode'];
          } else if (userValue['rdf:value']) {
            barcodeValue = userValue['rdf:value'];
          } else {
            // Look for any property that might contain the barcode value
            for (const key in userValue) {
              if (typeof userValue[key] === 'string' && !key.startsWith('@')) {
                barcodeValue = userValue[key];
                break;
              }
            }
          }
        }
        
        if (barcodeValue) {
          valueEl.textContent = barcodeValue;
          if (barcodeEl && barcodeEl.nodeType && valueEl && valueEl.nodeType) {
            barcodeEl.appendChild(valueEl);
            console.log('Created barcode structure with value:', barcodeValue);
          } else {
            console.error("Invalid nodes for barcode structure:", barcodeEl, valueEl);
            return document.createElement("div"); // Return fallback
          }
        }
        
        return barcodeEl;
      } catch (error) {
        console.error("Error creating barcode structure:", error);
        // Return a fallback element rather than continuing to avoid the appendChild error
        return document.createElement("div");
      }
    }
    
    // Handle numeric properties (only after barcode check)
    if (typeof property === 'number' || /^\d+$/.test(property)) {
      console.warn("createLiteral: property is numeric, using createElByBestNS to create safe text node");
      let textNode = this.createElByBestNS(property);
      if (typeof userValue === 'string' || typeof userValue === 'number') {
        textNode.textContent = userValue;
      }
      return textNode;
    }
    
    // Standard literal creation for non-barcode values
    try {
      let pEl;
      // Ensure property is a string before any methods are called on it
      if (typeof property === 'string') {
        pEl = this.createElByBestNS(property);
      } else {
        console.warn("createLiteral: property is not a string:", property);
        return false;
      }
      
      // Extract value from userValue
      let val = userValue;
      
      // If userValue is an object, try to extract the value
      if (userValue && typeof userValue === 'object') {
        if (userValue[property]) {
          val = userValue[property];
        } else if (userValue['rdf:value']) {
          val = userValue['rdf:value'];
        } else if (userValue['@id']) {
          pEl.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:resource', userValue['@id']);
          return pEl;
        } else {
          // Look for any property that might contain a value
          let found = false;
          for (const key in userValue) {
            if (typeof userValue[key] === 'string' && !key.startsWith('@')) {
              val = userValue[key];
              found = true;
              break;
            }
          }
          if (!found) {
            console.warn("createLiteral: could not extract value from userValue:", userValue);
            return false;
          }
        }
      }
      
      // Set the text content
      if (typeof val === 'string' || typeof val === 'number') {
        pEl.textContent = val;
        return pEl;
      } else if (val && typeof val === 'object' && val['@value']) {
        pEl.textContent = val['@value'];
        return pEl;
      } else {
        console.warn("createLiteral: value is not a string or number:", val);
        return false;
      }
    } catch (error) {
      console.error("Error in createLiteral:", error);
      return false;
    }
  },

  /**
  * A helper function that will test if a userValue is a bnode
  *
  * @param {obj} userValue - the uservalue to test
  * @return {boolean}
  */
	isBnode: function(userValue){
		if (userValue['@type']){
			return true
		}
		return false
	},

  /**
  * Some structures share the same predicate
  *
  * @param {string} key - the uri
  * @return {boolean}
  */
	needsNewPredicate: function(key) {
		if (key == 'http://www.loc.gov/mads/rdf/v1#componentList'){
			return false
		}
		return true
	},

  /**
  * A helper function that will test if a userValue has a value
  *
  * @param {obj} userValue - the uservalue to test
  * @return {boolean}
  */
	hasUserValue: function(userValue){
		for (let key in userValue){
			if (key == '@id' || key.includes('http://') || key.includes('https://')){
				return true
			}
		}
		// this part looks to see if maybe it is an array of literals, like a top level propert like Statement of Work, etc.
		if (Array.isArray(userValue)){
			let allHaveCorrectKeys = true;
			for (let v of userValue){
				for (let key in v){
					if (!key.startsWith('@') && !key.startsWith('http://') && !key.startsWith('https://')){
						allHaveCorrectKeys = false
					}
				}
			}
			if (allHaveCorrectKeys){ return true }
		}
		return false
	},

  /**
  * returns the just the item portion of the profile
  *
  * @param {string} URI - the uri of the instance to look for it's items
  * @param {obj} profile - profile
  * @param {obj} tleLookup - the lookup created out of the export XML process
  * @return {obj}
  */
	returnHasItem: function(URI,profile,tleLookup){
		let results = []
		let parser = returnDOMParser()
		for (let rt in profile.rt){
			if (profile.rt[rt].itemOf && profile.rt[rt].itemOf == URI){
				if (tleLookup['Item'][profile.rt[rt].URI].getElementsByTagName('bf:itemOf').length==0){
					let hasItem = this.createElByBestNS('bf:itemOf')
					hasItem.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:resource', profile.rt[rt].itemOf)
					tleLookup['Item'][profile.rt[rt].URI].appendChild(hasItem)
				}
				let item = (new XMLSerializer()).serializeToString(tleLookup['Item'][profile.rt[rt].URI])
				item = parser.parseFromString(item, "text/xml").children[0]
				results.push(item)
			}
		}
		return results
	},

  /**
  * returns the just the work portion of the profile
  *
  * @param {string} instanceURI - the uri of the instance
  * @param {obj} profile - profile
  * @param {obj} tleLookup - the lookup created out of the export XML process
  * @return {obj}
  */
	returnWorkFromInstance: function(instanceURI,profile,tleLookup){
		let parser = returnDOMParser()
		let results = null
		for (let rt in profile.rt){
			if (profile.rt[rt].instanceOf && profile.rt[rt].URI == instanceURI){
				results = (new XMLSerializer()).serializeToString(tleLookup['Work'][profile.rt[rt].instanceOf])
				results = parser.parseFromString(results, "text/xml").children[0]
			}
		}
		// if that didnt work just pick the first work
		if (!results){
			for (let wUri in tleLookup['Work']){
				results = tleLookup['Work'][wUri]
				break
			}
		}
		return results
	},

  /**
   * Builds the admin metadata XML ensuring the assigner element is correctly structured.
   * The assigner element is built with an Organization element containing the label.
   * @param {object} userValue - The user value containing catalogerId info
   * @return {Element} - The adminMetadata element
   */    
  buildAdminMetadata: function(userValue) {
    const adminMetadata = this.createElByBestNS('bf:adminMetadata');
    const adminContainer = this.createElByBestNS('bf:AdminMetadata');
    
    // Add date element
    const dateEl = this.createElByBestNS('bf:date');
    dateEl.textContent = new Date().toISOString();
    adminContainer.appendChild(dateEl);
    
    // Add catalogerId element if available
    if (userValue && userValue['http://id.loc.gov/ontologies/bflc/catalogerId'] && 
        userValue['http://id.loc.gov/ontologies/bflc/catalogerId'][0] && 
        userValue['http://id.loc.gov/ontologies/bflc/catalogerId'][0]['http://id.loc.gov/ontologies/bflc/catalogerId']) {
        
      const catalogerIdEl = this.createElByBestNS('bflc:catalogerId');
      catalogerIdEl.textContent = userValue['http://id.loc.gov/ontologies/bflc/catalogerId'][0]['http://id.loc.gov/ontologies/bflc/catalogerId'];
      adminContainer.appendChild(catalogerIdEl);
    }
    
    adminMetadata.appendChild(adminContainer);
    return adminMetadata;
  },

  /**   
   * Creates a default assigner element for admin metadata with proper organization structure
   * @return {Element} - The properly structured assigner element
   */ 
  buildDefaultAssignerElement: function() {
    const assignerEl = this.createElByBestNS('bf:assigner');
    const orgEl = this.createElByBestNS('bf:Organization');
    // Always set rdf:about and label
    orgEl.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:about', 'http://id.loc.gov/vocabulary/organizations/pu');
    const labelEl = this.createRdfsLabel(useConfigStore().defaultAssignerLabel || "University of Pennsylvania, Van Pelt-Dietrich Library");
    orgEl.appendChild(labelEl);
    assignerEl.appendChild(orgEl);
    // Debug: log assigner structure
    // console.log('buildDefaultAssignerElement:', assignerEl.outerHTML);
    return assignerEl;
  },

  /** 
   * Clean up an assigner element to ensure it has no unwanted content
   * @param {Element} assignerEl - The assigner element to clean
   */ 
  cleanAssignerElement: function(assignerEl) {
    if (!assignerEl) return;
    const orgEls = assignerEl.querySelectorAll('*[local-name()="Organization"]');
    orgEls.forEach(orgEl => {
      // Remove text nodes that contain only zeros or whitespace
      Array.from(orgEl.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const content = node.textContent.trim();
          if (!content || /^[0\s]+$/.test(content)) {
            orgEl.removeChild(node);
          }
        }
      });
      // If Organization has no meaningful content, add a proper label
      if (!orgEl.hasChildNodes() || (orgEl.childNodes.length === 1 && orgEl.firstChild.nodeType === Node.TEXT_NODE && !orgEl.firstChild.textContent.trim())) {
        while (orgEl.firstChild) {
          orgEl.removeChild(orgEl.firstChild);
        }
        const labelEl = document.createElementNS("http://www.w3.org/2000/01/rdf-schema#", "rdfs:label");
        labelEl.textContent = "University of Pennsylvania, Van Pelt-Dietrich Library";
        orgEl.appendChild(labelEl);
      }
    });
  },

  /** 
   * Remove redundant namespace declarations from XML nodes
   * @param {Element} node - The node to process
   * @param {Object} inherited - Inherited namespace declarations
   */ 
  removeRedundantNamespaces: function(node, inherited = {}) {
    if (node.nodeType !== 1) return; // process only element nodes
    let currentInherited = Object.assign({}, inherited);
    let attrsToRemove = [];
    for (let attr of Array.from(node.attributes)) {
      if (attr.name.startsWith("xmlns")) {
        let prefix = attr.name === "xmlns" ? "" : attr.name.split(":")[1];
        if (currentInherited[prefix] && currentInherited[prefix] === attr.value) {
          attrsToRemove.push(attr.name);
        } else {
          currentInherited[prefix] = attr.value;
        }
      }
    }
    attrsToRemove.forEach(name => node.removeAttribute(name));
    Array.from(node.children).forEach(child => this.removeRedundantNamespaces(child, currentInherited));
  },

  /** 
   * Clean organization elements in an XML string
   * @param {string} xmlString - The XML string to clean
   * @return {string} - The cleaned XML string
   */ 
  cleanOrganizationElement: function(xmlString) {
    if (!xmlString) return xmlString;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) {
        console.error("Cleaning encountered an XML parsing error. Returning original string.");
        return xmlString;
      }
      this.removeRedundantNamespaces(doc.documentElement);
      const assigners = doc.querySelectorAll("bf\\:assigner");
      assigners.forEach(assignerEl => this.cleanAssignerElement(assignerEl));
      return new XMLSerializer().serializeToString(doc);
    } catch (e) {
      console.error("Error when cleaning XML:", e);
      return xmlString;
    }
  },

  /** 
   * Ensures all Organization elements in the XML have proper labels for MARC conversion
   * @param {string} xmlString - The XML to process
   * @return {string} - XML with properly structured Organization elements or original on failure
   */ 
  ensureOrganizationLabels: function(xmlString) {
    if (!xmlString) return xmlString;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, "text/xml");
      if (doc.getElementsByTagName("parsererror").length) {
        console.error("XML parsing error in ensureOrganizationLabels.");
        return xmlString;
      }
      const organizations = doc.querySelectorAll("bf\\:Organization");
      organizations.forEach(org => {
        if (org.querySelector("rdfs\\:label")) return;
        const aboutAttr = org.getAttribute('rdf:about');
        if (aboutAttr) {
          let label = null;
          if (aboutAttr === 'http://id.loc.gov/vocabulary/organizations/dlc') {
            label = "United States, Library of Congress";
          } else if (aboutAttr === 'http://id.loc.gov/vocabulary/organizations/dlcmrc') {
            label = "United States, Library of Congress, Network Development and MARC Standards Office";
          } else if (aboutAttr === 'http://id.loc.gov/vocabulary/organizations/pu') {
            label = "University of Pennsylvania, Van Pelt-Dietrich Library";
          }
          if (label) {
            const labelEl = this.createRdfsLabel(label);
            org.appendChild(labelEl);
          }
        }
      });
      return new XMLSerializer().serializeToString(doc);
    } catch (e) {
      console.error("Error in ensureOrganizationLabels:", e);
      return xmlString;
    }
  },

  /** 
  * Processes profile data and converts it to XML
  * @param {object} profile - the profile to convert to XML
  * @return {Promise<object|boolean>} - XML output object or false on failure
  */ 
  buildXML: async function(profile){
    if (!profile || (profile && Object.keys(profile).length==0)){
      console.warn("Trying to build XML with bad profile:", profile);
      return false;
    }

    // if we are in dev mode let the error bubble, but otherwise catch the error and try to recover
    if (useConfigStore().returnUrls.dev === true){
      return await this.buildXMLProcess(profile);
    } else {
      try {
        let xmlObj = await this.buildXMLProcess(profile);
        this.lastGoodXMLBuildProfile = JSON.parse(JSON.stringify(profile));
        this.lastGoodXMLBuildProfileTimestamp = Math.floor(Date.now() / 1000);
        return xmlObj;
      } catch (error) {
        console.warn("XML Parsing Error:");
        console.warn(error);
        useProfileStore().triggerBadXMLBuildRecovery(this.lastGoodXMLBuildProfile, this.lastGoodXMLBuildProfileTimestamp);
        let profileAsJson;
        try {
          profileAsJson = JSON.stringify(profile,null,2);
        } catch {
          profileAsJson = 'Error stringify-ing profile!';
        }
        let user = `${usePreferenceStore().catInitals}_${usePreferenceStore().catCode}`.replace("/\s/g",'_');
        const filename = `${Math.floor(Date.now() / 1000)}_${user}_` + `${new Date().toDateString()}_${new Date().toTimeString()}`.replaceAll(' ','_').replaceAll(':','-') + '.txt';
        console.warn(error);
        let errorReport = `
        Error: ${error}
        ----------------
        XML Creation Log
        ----------------
        ----End Creation Log----
        ****************
        XML Source = "";
        ****************
        ${(profile.xmlSource) ? profile.xmlSource : 'No Source Found'}
        ***End Source***
        `;
        utilsNetwork.sendErrorReportLog(errorReport,filename,profileAsJson);
        return false;
      }
    }
  },

  /** 
  * The core XML building process that transforms profile data into XML structure
  * @param {object} profile - the profile to convert to XML
  * @return {object} multiple XML strings and metadata
  */ 
  buildXMLProcess: async function(profile){
    // Add validation at the start
    if (!profile || typeof profile !== 'object') {
      console.error("buildXMLProcess: Invalid profile object", profile);
      return {
        xmlDom: document.createElement("rdf:RDF"),
        xmlStringFormatted: "<rdf:RDF/>",
        xlmString: "<rdf:RDF/>",
        bf2Marc: "<rdf:RDF/>",
        xlmStringBasic: "<rdf:RDF/>",
        voidTitle: "",
        voidContributor: "",
        componentXmlLookup: {}
      };
    }

    // keep track of the process for later
    let xmlLog = [];
    let componentXmlLookup = {};

    // keep a copy of the org profile around
    let orginalProfile = profile;
    // cut the ref to the original
    profile = JSON.parse(JSON.stringify(profile));

    let xmlParser = returnDOMParser();
    // these will store the top level elements
    let tleWork = [];
    let tleInstance = [];
    let tleItem = [];

    // we are creating the xml in two formats, create the root node for both
    let rdf = document.createElementNS(utilsRDF.namespace.rdf, "RDF");
    let rdfBasic = document.createElementNS(utilsRDF.namespace.rdf, "RDF");

    // just add all the namespaces into the root element
    for (let ns of Object.keys(utilsRDF.namespace)){
      rdf.setAttributeNS("http://www.w3.org/2000/xmlns/", `xmlns:${ns}`, utilsRDF.namespace[ns]);
      rdfBasic.setAttributeNS("http://www.w3.org/2000/xmlns/", `xmlns:${ns}`, utilsRDF.namespace[ns]);
    }

    // these are elements used to store metadata about the record in the backend
    let xmlVoidDataRtsUsed = [];
    let xmlVoidDataType = [];
    let xmlVoidExternalID = [];
    let xmlVoidDataTitle = "";
    let xmlVoidDataContributor = "";
    let xmlVoidDataLccn = "";
    let tleLookup = {
      Work: {},
      Instance: {},
      Item: {},
      Hub: {}
    };

    for (let rt of profile.rtOrder){
      xmlLog.push(`Processing rt: ${rt}`);

      if (profile.rt[rt].noData){
        xmlLog.push(` - ${rt} has no data, skipping it.`);
        continue;
      }

      let tleArray; // eslint-disable-line
      let rootEl;
      let rootElName;

      if (rt.includes(':Work')){
        tleArray = tleWork;
        rootEl = document.createElementNS(utilsRDF.namespace.bf,"bf:Work");
        rootElName = "Work";
      } else if (rt.includes(':Instance')){
        tleArray = tleInstance;
        rootEl = document.createElementNS(utilsRDF.namespace.bf,"bf:Instance");
        rootElName = "Instance";
      } else if (rt.includes(':Item')){
        tleArray = tleItem;
        rootEl = document.createElementNS(utilsRDF.namespace.bf,"bf:Item");
        rootElName = "Item";
      } else if (rt.endsWith(':Hub')){
        tleArray = tleItem;;
        rootEl = document.createElementNS(utilsRDF.namespace.bf,"bf:Hub");
        rootElName = "Hub";
      } else {
        // don't mess with anything that is not a top level entity in the profile
        xmlLog.push(`Dunno what this part is, skipping ${rt}`);
        continue;
      }

      xmlLog.push(`Building ${rootElName}`);

      if (profile.rt[rt].URI){
        rootEl.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:about', profile.rt[rt].URI);
        xmlLog.push(`Setting URI for this resource rdf:about to: ${profile.rt[rt].URI}`);
        xmlVoidExternalID.push(profile.rt[rt].URI);
      }

      if (profile.rt[rt]['@type']){
        let type = this.createElByBestNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
        type.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:resource', profile.rt[rt]['@type']);
        xmlLog.push(`Setting URI for this resource rdf:resource to: ${profile.rt[rt]['@type']}`);
        rootEl.appendChild(type);
      }

      xmlLog.push(`Looping through the PTs`);

      // Process property templates
      for (let pt of profile.rt[rt].ptOrder){
        // extract the pt, this is the individual component like a <mainTitle>
        let ptObj = profile.rt[rt].pt[pt];
        if (ptObj.deleted){
          continue;
        }

        if (ptObj.deepHierarchy){
          // just take our existing XML and plop it into the root element
          let orgNode = xmlParser.parseFromString(ptObj.xmlSource, "text/xml").children[0];
          rootEl.appendChild(orgNode);
          continue;
        }

        xmlLog.push(`Working on: ${pt}`);

        // Process userValue and create XML elements - THIS IS THE CRITICAL SECTION
        let userValue;
        let userValueSiblings = [];

        // the uservalue could be stored in a few places depending on the nesting
        if (ptObj.userValue[ptObj.propertyURI] && ptObj.userValue[ptObj.propertyURI][0]){
          userValue = ptObj.userValue[ptObj.propertyURI][0];

          let nonGuidProps = Object.keys(ptObj.userValue[ptObj.propertyURI][0]).filter(k => (!k.includes('@') ? true : false));
          if (nonGuidProps.length==1){
            if (typeof ptObj.userValue[ptObj.propertyURI][0][nonGuidProps[0]] == 'string' || 
                typeof ptObj.userValue[ptObj.propertyURI][0][nonGuidProps[0]] == 'number'){
              // does it have more than one?
              if (ptObj.userValue[ptObj.propertyURI].length > 1){
                // set it to the sibling group not the individual
                userValue = ptObj.userValue[ptObj.propertyURI];
              }
            }
          }

          // some top level simpleLookup values could have multiple values
          if (ptObj.userValue[ptObj.propertyURI].length > 1){
            userValueSiblings = JSON.parse(JSON.stringify(ptObj.userValue[ptObj.propertyURI])).slice(1);
          }
        } else if (ptObj.userValue[ptObj.propertyURI]){
          userValue = ptObj.userValue[ptObj.propertyURI];
        } else {
          userValue = ptObj.userValue;
        }

        // clean up bad data
        for (let k of Object.keys(userValue)){
          if (k === 'undefined'){
            delete userValue[k];
          }
        }

        let mostCommonScript = useProfileStore().setMostCommonNonLatinScript();

        // check if we need to process multiple language variants for certain properties
        if ([
          'http://id.loc.gov/ontologies/bibframe/contribution',
          'http://id.loc.gov/ontologies/bibframe/subject',
          'http://id.loc.gov/ontologies/bibframe/geographicCoverage'
        ].indexOf(ptObj.propertyURI) > -1){
          // Process non-latin variants
          // ...existing code for non-Latin processing...
        }

        xmlLog.push(['Set userValue to:', JSON.parse(JSON.stringify(userValue))]);

        // <START> Special handling for usageAndAccessPolicy
        if (ptObj.propertyURI === 'http://id.loc.gov/ontologies/bibframe/usageAndAccessPolicy') {
          console.log('--- Debugging usageAndAccessPolicy Lookup (Attempt 4 - More Robust Profile Store Lookup) ---');
          const policyType = userValue['@type'];
          let policyId = null;
          let labelText = null;
          const rdfsLabelURI = 'http://www.w3.org/2000/01/rdf-schema#label';
          const madsAuthLabelURI = 'http://www.loc.gov/mads/rdf/v1#authoritativeLabel';

          // Attempt to extract the @id from the nested structure observed in logs
          try {
            if (userValue[rdfsLabelURI] &&
                userValue[rdfsLabelURI][0] &&
                userValue[rdfsLabelURI][0]['@id']) {
              policyId = userValue[rdfsLabelURI][0]['@id'];
            } else if (userValue['@id']) { // Fallback if @id is directly present
              policyId = userValue['@id'];
            }
            console.log(`Extracted policyId: ${policyId}`);
          } catch (e) {
            xmlLog.push(`Error extracting policyId for usageAndAccessPolicy: ${e.message}`);
            console.error(`Error extracting policyId: ${e.message}`);
          }

          console.log(`Extracted policyType: ${policyType}`);

          // If we have an ID and Type, proceed with creating the policy XML structure
          if (policyId && policyType) {
            try {
              // Get access to the profile store
              const profileStore = useProfileStore();
              
              // Try multiple approaches to find the policy data
              let lookupData = [];
              let policyData = null;
              
              // Method 1: Directly fetch policies from appropriate JSON file based on policy type
              console.log(`Looking up policy data directly from JSON based on type: ${policyType}`);
              const isAccessPolicy = policyType.includes('AccessPolicy');
              const fileUrl = isAccessPolicy ? '/accessPolicies.json' : '/usePolicies.json';
              
              try {
                // Try to fetch the policy data from the appropriate file
                const response = await fetch(fileUrl);
                if (response.ok) {
                  lookupData = await response.json();
                  console.log(`Loaded ${lookupData.length} policies from ${fileUrl}`);
                  
                  // Find the policy with matching ID
                  policyData = lookupData.find(p => p['@id'] === policyId);
                  if (policyData) {
                    console.log(`Found policy data directly from JSON file:`, policyData);
                  }
                }
              } catch (fetchError) {
                console.warn(`Error fetching policy data from ${fileUrl}:`, fetchError);
              }
              
              // Method 2: If direct fetch failed, try to find it in the profile store
              if (!policyData) {
                // Look through all profiles for a matching property template
                console.log(`Searching all profiles for policy data...`);
                
                const allProfileIds = Object.keys(profileStore.profiles);
                for (const profileId of allProfileIds) {
                  const profile = profileStore.profiles[profileId];
                  if (!profile || !profile.rt) continue;
                  
                  // Search all resource templates
                  for (const rtKey in profile.rt) {
                    if (!profile.rt[rtKey].pt) continue;
                    
                    // Search all property templates
                    for (const ptKey in profile.rt[rtKey].pt) {
                      const propTemplate = profile.rt[rtKey].pt[ptKey];
                      
                      // Check if this is a usageAndAccessPolicy property template
                      if (propTemplate.propertyURI === 'http://id.loc.gov/ontologies/bibframe/usageAndAccessPolicy' &&
                          propTemplate.valueConstraint?.useValuesFrom?.[0]?.data) {
                        // Check if the data contains our policy
                        const ptLookupData = propTemplate.valueConstraint.useValuesFrom[0].data;
                        console.log(`Found potential lookup data in ${profileId}.${rtKey}.${ptKey}, ${ptLookupData.length} items`);
                        
                        const foundPolicy = ptLookupData.find(p => p['@id'] === policyId);
                        if (foundPolicy) {
                          policyData = foundPolicy;
                          console.log(`Found policy data in profile ${profileId}:`, policyData);
                          break;
                        }
                      }
                    }
                    if (policyData) break;
                  }
                  if (policyData) break;
                }
              }
              
              // Method 3: Hardcoded fallback labels for common policies
              if (!policyData) {
                console.log(`Trying fallback hardcoded labels for known policies`);
                
                // Map of known policy IDs to labels
                const knownPolicies = {
                  'local:accessPolicy1': 'Free to access',
                  'local:accessPolicy2': 'Access restricted',
                  'local:accessPolicy3': 'Accessible online',
                  'local:accessPolicy4': 'For use in library only',
                  'local:accessPolicy5': 'Limited circulation, long loan period',
                  'local:accessPolicy6': 'No restrictions on access',
                  'local:usePolicy1': 'Copyright constraints',
                  'local:usePolicy2': 'Free to use',
                  'local:usePolicy3': 'License restrictions',
                  'local:usePolicy4': 'No commercial use',
                  'local:usePolicy5': 'No known legal restrictions',
                  'local:usePolicy6': 'Permission to use explicitly granted by publisher'
                };
                
                if (policyId in knownPolicies) {
                  // Create a synthetic policy data object
                  policyData = {
                    '@id': policyId,
                    [madsAuthLabelURI]: [{ '@value': knownPolicies[policyId] }]
                  };
                  console.log(`Using hardcoded label for ${policyId}: ${knownPolicies[policyId]}`);
                }
              }

              // If we found the policy data through any method, extract the label
              if (policyData) {
                if (policyData[madsAuthLabelURI] && policyData[madsAuthLabelURI][0] && policyData[madsAuthLabelURI][0]['@value']) {
                  labelText = policyData[madsAuthLabelURI][0]['@value'];
                  console.log(`Successfully extracted labelText: '${labelText}'`);
                  xmlLog.push(`Special handling for usageAndAccessPolicy: ID=${policyId}, Type=${policyType}, Found Label='${labelText}'`);

                  // Build the XML structure
                  const outerEl = this.createElByBestNS(ptObj.propertyURI);
                  const innerEl = this.createElByBestNS(policyType);
                  const labelEl = this.createRdfsLabel(labelText);

                  innerEl.appendChild(labelEl);
                  outerEl.appendChild(innerEl);
                  rootEl.appendChild(outerEl);
                  componentXmlLookup[`${rt}-${pt}`] = formatXML(outerEl.outerHTML);
                  console.log('--- Finished Debugging usageAndAccessPolicy Lookup (Success) ---');
                  continue; // Skip the rest of the loop for this property
                } else {
                  console.error('Found policyData, but label structure is unexpected:', JSON.stringify(policyData, null, 2));
                }
              } else {
                console.error(`Could not find policy data for ID: ${policyId}`);
              }
            } catch (lookupError) {
              xmlLog.push(`Error during policy lookup/XML creation for usageAndAccessPolicy: ${lookupError.message}`);
              console.error(`Error during policy lookup/XML creation: ${lookupError.message}`, lookupError);
            }
          } else {
            xmlLog.push(`Special handling for usageAndAccessPolicy: Missing policyId or policyType in userValue: ${JSON.stringify(userValue)}`);
            console.warn(`Missing policyId (${policyId}) or policyType (${policyType})`);
          }
          console.log('--- Finished Debugging usageAndAccessPolicy Lookup (End) ---');
        }
        // <END> Special handling for usageAndAccessPolicy

        if (this.ignoreProperties.indexOf(ptObj.propertyURI) > -1){
          xmlLog.push(`Skipping it because it is in the ignoreProperties list`);
          continue;
        }

        xmlLog.push(['Set userValue to:', JSON.parse(JSON.stringify(userValue))]);

        // Does it have any userValues?
        if (this.hasUserValue(userValue)){
          // Keep track of resource templates used
          if (xmlVoidDataRtsUsed.indexOf(rt) === -1){
            xmlVoidDataRtsUsed.push(rt);
          }
          if (xmlVoidDataType.indexOf(rootElName) === -1){
            xmlVoidDataType.push(rootElName);
          }

          // Process based on whether it's a blank node or literal
          if (this.isBnode(userValue)){
            xmlLog.push(`Root level bnode: ${ptObj.propertyURI}`);
            let pLvl1 = this.createElByBestNS(ptObj.propertyURI);
            let bnodeLvl1 = this.createBnode(userValue, ptObj.propertyURI);
            xmlLog.push(`Created lvl 1 predicate: ${pLvl1.tagName} and bnode: ${bnodeLvl1.tagName}`);

            // Process all properties in this blank node
            for (let key1 of Object.keys(userValue).filter(k => (!k.includes('@') ? true : false))){
              xmlLog.push(`Looking at property: ${key1} in the userValue`);
              let pLvl2 = this.createElByBestNS(key1);
              if (key1 == 'http://www.loc.gov/mads/rdf/v1#componentList'){
                pLvl2.setAttribute('rdf:parseType', 'Collection');
              }
              xmlLog.push(`Created lvl 2 predicate: ${pLvl2.tagName}`);

              // Handle special cases like rdf:type node
              if (key1 == 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'){
                if (userValue[key1] && userValue[key1][0] && userValue[key1][0]['@id']){
                  let rdftype = this.createElByBestNS(key1);
                  rdftype.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:resource', userValue[key1][0]['@id']);
                  bnodeLvl1.appendChild(rdftype);
                  xmlLog.push(`This bnode just has a rdf:type : ${rdftype} setting it an continuing`);
                  continue;
                } else if (userValue[key1] && userValue[key1][0] && userValue[key1][0]['http://www.w3.org/2000/01/rdf-schema#label']){
                  let rdftype = this.createElByBestNS(key1);
                  rdftype.innerHTML = escapeHTML(userValue[key1][0]['http://www.w3.org/2000/01/rdf-schema#label']);
                  xmlLog.push(`This bnode just has a rdf:type and label : ${rdftype} setting it an continuing`);
                  bnodeLvl1.appendChild(rdftype);
                  continue;
                }
              }

              // Process each value for this property
              let value1FirstLoop = true;
              for (let value1 of userValue[key1]){
                // Create new predicate for each value if needed
                if (!value1FirstLoop && this.needsNewPredicate(key1)){
                  pLvl2 = this.createElByBestNS(key1);
                  xmlLog.push(`Creating lvl 2 property : ${pLvl2.tagName} for ${JSON.stringify(value1)}`);
                }
                value1FirstLoop = false;

                // Process based on whether this value is a blank node or literal
                if (this.isBnode(value1)){
                  // It's a blank node, build its structure
                  let bnodeLvl2 = this.createBnode(value1, key1);
                  pLvl2.appendChild(bnodeLvl2);
                  bnodeLvl1.appendChild(pLvl2);
                  xmlLog.push(`Creating bnode lvl 2 for it ${bnodeLvl2.tagName}`);
                  
                  // Continue processing deeper nodes
                  // ...existing code for processing level 3 and 4 nodes...
                } else {
                  // It's a literal or simple value
                  xmlLog.push(`It's value at lvl is not a bnode, looping through and adding a literal value`);
                  let bnodeLvl2 = this.createBnode(value1, key1);
                  // Process the literal values
                  let keys = Object.keys(value1).filter(k => (!k.includes('@') ? true : false));
                  xmlLog.push(`Creating bnode lvl 2 for it ${bnodeLvl2.tagName}`);
                  // Handle URI references
                  if (userValue['@type'] && key1 === userValue['@type']){
                    if (value1['@id']){
                      xmlLog.push(`Setting its rdf:about to ${value1['@id']}`);
                      bnodeLvl1.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:about', value1['@id']);
                    }
                  }
                  
                  // Process literal properties
                  if (keys.length > 0){
                    for (let key2 of keys){
                      if (typeof value1[key2] == 'string' || typeof value1[key2] == 'number'){
                        let p2 = this.createLiteral(key2, value1);
                        xmlLog.push(`Creating literal ${JSON.stringify(value1)}`);
                        // FIX: Ensure p2 is a valid Node before appending
                        if (p2 && p2.nodeType) bnodeLvl1.appendChild(p2);
                      } else if (Array.isArray(value1[key2])){
                        // Handle array values
                        // ...existing code for processing arrays...
                      } else {
                        console.error('key2', key2, value1[key2], 'not a literal, should not happen');
                        xmlLog.push(`Key 2 (${key2}) error, not a literal ${value1[key2]}`);
                      }
                    }
                  } else if (keys.length == 0 && value1['@id']){
                    let p2 = this.createLiteral(key1, value1);
                    if (p2 !== false) bnodeLvl1.appendChild(p2);
                  } else {
                    console.warn('Unhandled literal situation');
                    console.log("value1", value1, 'key1', key1);
                    value1[key1] = "";
                  }
                }
              }
            }
            pLvl1.appendChild(bnodeLvl1);
            rootEl.appendChild(pLvl1);
            componentXmlLookup[`${rt}-${pt}`] = formatXML(pLvl1.outerHTML);

            // Handle sibling nodes
            if (userValueSiblings.length > 0){
              // ...existing code for sibling nodes...
            }
          } else {
            // Not a blank node
            xmlLog.push(`Root level does not look like a bnode: ${ptObj.propertyURI}`);
            let userValueArray = userValue;
            if (!Array.isArray(userValue)){
              userValueArray = [userValue];
            }

            // Process each user value in the array
            for (let userValue of userValueArray){
              if (userValue['@type'] && userValue['@id']){
                let p = this.createElByBestNS(ptObj.propertyURI);
                let bnode = this.createElByBestNS(userValue['@type']);
                bnode.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:about', userValue['@id']);
                xmlLog.push(`Created ${p.tagName} property and ${bnode.tagName}`);
                p.appendChild(bnode);
                rootEl.appendChild(p);
                componentXmlLookup[`${rt}-${pt}`] = formatXML(p.outerHTML);
              } else if (userValue['@type'] && !userValue['@id']){
                xmlLog.push(`Should have a URI in ${ptObj.propertyURI} but can't find one`);
                console.error("Does not have URI, ERROR");
              } else if (await utilsRDF.suggestTypeNetwork(ptObj.propertyURI) == 'http://www.w3.org/2000/01/rdf-schema#Literal'){
                // Handle top level literals
                let allXMLFragments = '';
                for (let key1 of Object.keys(userValue).filter(k => (!k.includes('@') ? true : false))){
                  if (typeof userValue[key1] === 'string' || typeof userValue[key1] === 'number'){
                    let p1 = this.createLiteral(key1, userValue);
                    if (p1 !== false) {
                      rootEl.appendChild(p1);
                      xmlLog.push(`Creating literal at root level for ${key1} with value ${p1.innerHTML}`);
                      allXMLFragments = allXMLFragments + `\n${formatXML(p1.outerHTML)}`;
                    }
                  } else {
                    // Process nested values
                    // ...process nested values...
                  }
                }
                componentXmlLookup[`${rt}-${pt}`] = allXMLFragments;
              } else if (ptObj.propertyURI != "http://id.loc.gov/ontologies/bibframe/electronicLocator" && 
                         await utilsRDF.suggestTypeNetwork(ptObj.propertyURI) == 'http://www.w3.org/2000/01/rdf-schema#Resource'){
                // Handle resources
                // ...process resources...
              } else if (userValue['@id']){
                // Handle simple URI references
                let p = this.createElByBestNS(ptObj.propertyURI);
                p.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:resource', userValue['@id']);
                rootEl.appendChild(p);
                componentXmlLookup[`${rt}-${pt}`] = formatXML(p.outerHTML);
              } else if (ptObj.propertyURI == 'http://www.w3.org/2000/01/rdf-schema#label'){
                // Handle simple labels
                let p = this.createElByBestNS(ptObj.propertyURI);
                p.innerHTML = userValue['http://www.w3.org/2000/01/rdf-schema#label'][0]['http://www.w3.org/2000/01/rdf-schema#label'];
                rootEl.appendChild(p);
                componentXmlLookup[`${rt}-${pt}`] = formatXML(p.outerHTML);
              } else {
                console.warn("Should not be here");
              }
            }
          } // <-- This closes the else block for `isBnode`
        } else { // <-- This else now correctly corresponds to `if (this.hasUserValue(userValue))`
          xmlLog.push(`Skipping it because hasUserValue == false`);
        }
      } // <-- This closes the `for (let pt of profile.rt[rt].ptOrder)` loop

      // Handle any unused XML
      if (orginalProfile.rt[rt].unusedXml){
        let unusedXmlNode = xmlParser.parseFromString(orginalProfile.rt[rt].unusedXml, "text/xml");
        unusedXmlNode = unusedXmlNode.children[0];
        for (let el of unusedXmlNode.children){
          if (el.tagName != 'rdfs:label'){
            let newEl = (new XMLSerializer()).serializeToString(el);
            newEl = xmlParser.parseFromString(newEl, "text/xml");
            newEl = newEl.children[0];
            rootEl.appendChild(newEl);
          }
        }
      }

      // Add to lookup
      tleLookup[rootElName][orginalProfile.rt[rt].URI] = rootEl;
    }

    // Add admin metadata to Work and Instance elements
    // Add in adminMetadata to the resources with this user ID
    let userInitial = usePreferenceStore().catInitals;
    let catCode = usePreferenceStore().catCode;
    let user = `${userInitial} (${catCode})`;
    profile.user = user;

    // Create admin metadata elements
    let bf_adminMetadata = this.createElByBestNS("bf:adminMetadata");
    let bf_AdminMetadtat = this.createElByBestNS("bf:AdminMetadata");

    // Add status information
    let bf_status = this.createElByBestNS("bf:status");
    let bf_Status = this.createElByBestNS("bf:Status");
    bf_Status.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:about','http://id.loc.gov/vocabulary/mstatus/c');
    let bf_StatusLabel = this.createElByBestNS("rdfs:label");
    bf_StatusLabel.innerHTML = "changed";

    // Add cataloger information
    let bf_catalogerId = this.createElByBestNS("bflc:catalogerId");
    bf_catalogerId.innerHTML = escapeHTML(catCode);
    let bf_date = this.createElByBestNS("bf:date");
    bf_date.innerHTML = new Date().toISOString();

    bf_AdminMetadtat.appendChild(bf_date);
    bf_AdminMetadtat.appendChild(bf_catalogerId);

    // Remove any existing assigner before adding a new one
    if (bf_AdminMetadtat.querySelector("bf\\:assigner")) {
      bf_AdminMetadtat.removeChild(bf_AdminMetadtat.querySelector("bf\\:assigner"));
    }

    // Add default assigner if enabled in configuration
    let includeDefaultAssigner = useConfigStore().includeDefaultAssigner;
    if (includeDefaultAssigner) {
      let bf_assigner = this.buildDefaultAssignerElement();
      // Only add if no existing organization is found
      if (!bf_AdminMetadtat.querySelector('bf\\:Organization[rdf\\:about="http://id.loc.gov/vocabulary/organizations/dlc"], bf\\:agent[rdf\\:about="http://id.loc.gov/vocabulary/organizations/dlc"]')) {
        bf_AdminMetadtat.appendChild(bf_assigner);
      }
    }

    bf_Status.appendChild(bf_StatusLabel);
    bf_status.appendChild(bf_Status);
    bf_AdminMetadtat.appendChild(bf_status);
    bf_adminMetadata.appendChild(bf_AdminMetadtat);

    // Always add assigner to bf:AdminMetadata if not present, and ensure it is fully populated
    // (This is now handled by deduplicateAssignersInAdminMetadata)
    this.deduplicateAssignersInAdminMetadata(bf_AdminMetadtat);

    let adminMetadataText = (new XMLSerializer()).serializeToString(bf_adminMetadata);

    // Add admin metadata to Work and Instance elements
    for (let URI in tleLookup['Work']){
      // Create a fresh copy of admin metadata for each Work
      const adminCopy = xmlParser.parseFromString(adminMetadataText, "text/xml").children[0];
      // Only add if the Work doesn't already have admin metadata
      if (!tleLookup['Work'][URI].querySelector('bf\\:adminMetadata')) {
        tleLookup['Work'][URI].appendChild(adminCopy);
      }
    }

    for (let URI in tleLookup['Instance']){
      // Create a fresh copy of admin metadata for each Instance
      const adminCopy = xmlParser.parseFromString(adminMetadataText, "text/xml").children[0];
      // Only add if the Instance doesn't already have admin metadata
      if (!tleLookup['Instance'][URI].querySelector('bf\\:adminMetadata')) {
        tleLookup['Instance'][URI].appendChild(adminCopy);
      }
    }

    // Build basic version to save
    for (let URI in tleLookup['Work']){
      let theWork = (new XMLSerializer()).serializeToString(tleLookup['Work'][URI]);
      theWork = xmlParser.parseFromString(theWork, "text/xml").children[0];
      rdfBasic.appendChild(theWork);
    }

    for (let URI in tleLookup['Hub']){
      let theHub = (new XMLSerializer()).serializeToString(tleLookup['Hub'][URI]);
      theHub = xmlParser.parseFromString(theHub, "text/xml").children[0];
      rdfBasic.appendChild(theHub);
    }

    for (let URI in tleLookup['Instance']){
      let instance = (new XMLSerializer()).serializeToString(tleLookup['Instance'][URI]);
      instance = xmlParser.parseFromString(instance, "text/xml").children[0];
      // Add hasItem relationships
      let items = this.returnHasItem(URI, orginalProfile, tleLookup);
      if (items.length > 0){
        for (let item of items){
          let p = this.createElByBestNS('bf:hasItem');
          p.appendChild(item);
          instance.appendChild(p);
        }
      }
      
      // Add instanceOf relationship with work
      let work = this.returnWorkFromInstance(URI, orginalProfile, tleLookup);
      if (work) {
        let p = this.createElByBestNS('bf:instanceOf');
        // Set rdf:resource to the Work's URI if available
        const workAbout = work.getAttribute && work.getAttribute('rdf:about');
        if (workAbout) {
          p.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:resource', workAbout);
        }
        // Optionally, append the work as a child if needed for other consumers
        // p.appendChild(work);
        instance.appendChild(p);
      }
      rdfBasic.appendChild(instance);
    }

    // Build RDF centered around instance or work based on procInfo
    if (orginalProfile.procInfo && orginalProfile.procInfo.includes("update")){
      // Build centered around instance
      if (Object.keys(tleLookup['Instance']).length > 0){
        for (let URI in tleLookup['Instance']){
          let instance = (new XMLSerializer()).serializeToString(tleLookup['Instance'][URI]);
          instance = xmlParser.parseFromString(instance, "text/xml").children[0];
          // Add hasItem relationships
          let items = this.returnHasItem(URI, orginalProfile, tleLookup);
          if (items.length > 0){
            for (let item of items){
              let p = this.createElByBestNS('bf:hasItem');
              p.appendChild(item);
              instance.appendChild(p);
            }
          }
          // Add instanceOf relationship with work
          let work = this.returnWorkFromInstance(URI, orginalProfile, tleLookup);
          if (work){
            let p = this.createElByBestNS('bf:instanceOf');
            p.appendChild(work);
            instance.appendChild(p);
          }
          rdf.appendChild(instance);
        }
      } else {
        // No instances - use the first work
        let workKey = Object.keys(tleLookup['Work'])[0];
        let work = tleLookup['Work'][workKey];
        if (work){
          rdf.appendChild(work);
        }
      }
    } else {
      // Default case - centered around instance with work as child
      for (let URI in tleLookup['Instance']){
        let instance = (new XMLSerializer()).serializeToString(tleLookup['Instance'][URI]);
        instance = xmlParser.parseFromString(instance, "text/xml").children[0];
        
        // Add items
        let items = this.returnHasItem(URI, orginalProfile, tleLookup);
        if (items.length > 0){
          for (let item of items){
            let p = this.createElByBestNS('bf:hasItem');
            p.appendChild(item);
            instance.appendChild(p);
          }
        }

        // Add works
        let work = this.returnWorkFromInstance(URI, orginalProfile, tleLookup);
        if (work){
          let p = this.createElByBestNS('bf:instanceOf');
          p.appendChild(work);
          instance.appendChild(p);
        }
        rdf.appendChild(instance);
      }
    }

    // Always append all hubs as direct children of rdf
    for (let URI in tleLookup['Hub']){
      let theHub = (new XMLSerializer()).serializeToString(tleLookup['Hub'][URI]);
      theHub = xmlParser.parseFromString(theHub, "text/xml").children[0];
      rdf.appendChild(theHub);
    }

    // Extract metadata for database
    if (rdfBasic.getElementsByTagName("bf:mainTitle").length > 0){
      xmlVoidDataTitle = rdfBasic.getElementsByTagName("bf:mainTitle")[0].innerHTML;
    } else if (rdfBasic.getElementsByTagName("bfsimple:prefTitle").length > 0){
      xmlVoidDataTitle = rdfBasic.getElementsByTagName("bfsimple:prefTitle")[0].innerHTML;
    } else {
      console.warn('no title found for db');
    }

    // Extract contributor information
    if (rdfBasic.getElementsByTagName("bf:PrimaryContribution").length > 0){
      if (rdfBasic.getElementsByTagName("bf:PrimaryContribution")[0].getElementsByTagName("rdfs:label").length > 0){
        xmlVoidDataContributor = rdfBasic.getElementsByTagName("bf:PrimaryContribution")[0].getElementsByTagName("rdfs:label")[0].innerHTML;
      }
    } else {
      if (rdfBasic.getElementsByTagName("bf:Contribution").length > 0){
        if (rdfBasic.getElementsByTagName("bf:Contribution")[0].getElementsByTagName("rdfs:label").length > 0){
          xmlVoidDataContributor = rdfBasic.getElementsByTagName("bf:Contribution")[0].getElementsByTagName("rdfs:label")[0].innerHTML;
        } else {
          console.warn('no PrimaryContribution or Contribution found for db');
        }
      } else {
        console.warn('no PrimaryContribution or Contribution found for db');
      }
    }

    // Extract LCCN
    if (rdfBasic.getElementsByTagName("bf:Instance").length > 0){
      let i = rdfBasic.getElementsByTagName("bf:Instance")[0];
      // Find LCCN in bf:identifiedBy
      for (let c of i.children){
        if (c.tagName === 'bf:identifiedBy'){
          // Look for bf:Lccn elements
          if (c.getElementsByTagName("bf:Lccn").length > 0){
            let lccnEl = c.getElementsByTagName("bf:Lccn")[0];
            // Check if it has a status
            if (lccnEl.getElementsByTagName("bf:Status").length == 0){
              // No status element, use this LCCN
              xmlVoidDataLccn = lccnEl.innerText || lccnEl.textContent;
            } else if (lccnEl.getElementsByTagName("bf:Status").length > 0){
              // If it has a status, check if it's canceled
              if (lccnEl.getElementsByTagName("bf:Status")[0].hasAttribute('rdf:about') && 
                  lccnEl.getElementsByTagName("bf:Status")[0].attributes['rdf:about'].value == 'http://id.loc.gov/vocabulary/mstatus/cancinv'){
                continue;
              }
              // Use this LCCN if not canceled
              for (let cc of lccnEl.children){
                if (cc.tagName == 'rdf:value'){
                  xmlVoidDataLccn = cc.innerText || cc.textContent;
                }
              }
            }
          }
        }
      }
    }

    // Create dataset description element
    let datasetDescriptionEl = document.createElementNS(utilsRDF.namespace.void, 'void:DatasetDescription');
    datasetDescriptionEl.setAttributeNS("http://www.w3.org/2000/xmlns/", `xmlns:void`, utilsRDF.namespace.void);
    datasetDescriptionEl.setAttributeNS("http://www.w3.org/2000/xmlns/", `xmlns:lclocal`, utilsRDF.namespace.lclocal);

    // Add metadata elements
    let el;
    for (let x of xmlVoidDataRtsUsed){
      el = document.createElementNS(utilsRDF.namespace.lclocal, 'lclocal:rtsused');
      el.innerHTML = escapeHTML(x);
      datasetDescriptionEl.appendChild(el);
    }
    for (let x of xmlVoidDataType){
      el = document.createElementNS(utilsRDF.namespace.lclocal, 'lclocal:profiletypes');
      el.innerHTML = escapeHTML(x);
      datasetDescriptionEl.appendChild(el);
    }
    el = document.createElementNS(utilsRDF.namespace.lclocal, 'lclocal:title');
    el.innerHTML = escapeHTML(xmlVoidDataTitle);
    datasetDescriptionEl.appendChild(el);
    el = document.createElementNS(utilsRDF.namespace.lclocal, 'lclocal:contributor');
    el.innerHTML = escapeHTML(xmlVoidDataContributor);
    datasetDescriptionEl.appendChild(el);
    el = document.createElementNS(utilsRDF.namespace.lclocal, 'lclocal:lccn');
    el.innerHTML = escapeHTML(xmlVoidDataLccn);
    datasetDescriptionEl.appendChild(el);
    el = document.createElementNS(utilsRDF.namespace.lclocal, 'lclocal:user');
    el.innerHTML = escapeHTML(profile.user);
    datasetDescriptionEl.appendChild(el);
    el = document.createElementNS(utilsRDF.namespace.lclocal, 'lclocal:status');
    el.innerHTML = escapeHTML(profile.status);
    datasetDescriptionEl.appendChild(el);
    el = document.createElementNS(utilsRDF.namespace.lclocal, 'lclocal:eid');
    el.innerHTML = escapeHTML(profile.eId);
    datasetDescriptionEl.appendChild(el);
    el = document.createElementNS(utilsRDF.namespace.lclocal, 'lclocal:typeid');
    el.innerHTML = escapeHTML(profile.id);
    datasetDescriptionEl.appendChild(el);
    el = document.createElementNS(utilsRDF.namespace.lclocal, 'lclocal:procinfo');
    el.innerHTML = escapeHTML(orginalProfile.procInfo);
    datasetDescriptionEl.appendChild(el);
    for (let x of xmlVoidExternalID){
      el = document.createElementNS(utilsRDF.namespace.lclocal, 'lclocal:externalid');
      el.innerHTML = escapeHTML(x);
      datasetDescriptionEl.appendChild(el);
    }

    // Format XML output
    // Only serialize the rdf DOM node directly, do not use ensureRoot or prettifyXmlJS for the main RDF output
    let strXml = this.serializePreservingNamespaces(rdf);
    let strXmlBasic = this.serializePreservingNamespaces(rdfBasic);
    let strXmlFormatted = strXml; // Optionally, you can prettify for display, but do not break the structure

    // Build BF2MARC package
    let bf2MarcXmlElRdf = this.createElByBestNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#RDF');
    for (let el of rdfBasic.getElementsByTagName("bf:Work")){ bf2MarcXmlElRdf.appendChild(el); }
    for (let el of rdfBasic.getElementsByTagName("bf:Instance")){ bf2MarcXmlElRdf.appendChild(el); }
    for (let el of rdfBasic.getElementsByTagName("bf:Item")){ bf2MarcXmlElRdf.appendChild(el); }
    let strBf2MarcXmlElBib = (new XMLSerializer()).serializeToString(bf2MarcXmlElRdf);

    // clean it up a bit for the component
    if (strXmlFormatted.trim().length > 0) {
      strXmlFormatted = this.cleanOrganizationElement(strXmlFormatted);
    }
    if (strXmlBasic.trim().length > 0) {
      strXmlBasic = this.cleanOrganizationElement(strXmlBasic);
    }
    if (strXml.trim().length > 0) {
      strXml = this.cleanOrganizationElement(strXml);
    }
    if (strBf2MarcXmlElBib.trim().length > 0) {
      strBf2MarcXmlElBib = this.cleanOrganizationElement(strBf2MarcXmlElBib);
      strBf2MarcXmlElBib = this.ensureOrganizationLabels(strBf2MarcXmlElBib);
    }

    // After all XML is built, deduplicate assigners in all AdminMetadata elements in the final DOM trees
    const deduplicateAllAdminMetadataAssigners = (xmlDoc) => {
      if (!xmlDoc) return;
      // Use TreeWalker to traverse all nodes, including nested ones
      const walker = document.createTreeWalker(
        xmlDoc,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => node.nodeName === 'bf:AdminMetadata' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
        },
        false
      );
      let node = walker.nextNode();
      while (node) {
        this.deduplicateAssignersInAdminMetadata(node);
        node = walker.nextNode();
      }
    };
    deduplicateAllAdminMetadataAssigners(rdf);
    deduplicateAllAdminMetadataAssigners(rdfBasic);
    deduplicateAllAdminMetadataAssigners(bf2MarcXmlElRdf);

    // Fix barcode structures before returning the final XML
    rdf = this.fixBarcodeStructures(rdf);
    rdfBasic = this.fixBarcodeStructures(rdfBasic);
    bf2MarcXmlElRdf = this.fixBarcodeStructures(bf2MarcXmlElRdf);

    // Return the XML in various formats
    return {
      xmlDom: rdf,
      xmlStringFormatted: strXmlFormatted,
      xlmString: strXml,
      bf2Marc: strBf2MarcXmlElBib,
      xlmStringBasic: strXmlBasic,
      voidTitle: xmlVoidDataTitle,
      voidContributor: xmlVoidDataContributor,
      componentXmlLookup: componentXmlLookup
    };
  },

  /** 
  * return the MARC transformation from the back end
  * @return {string} - the MARC string of output
  */ 
  marcPreview: async function(){
    try {
      let xml = await this.buildXML(useProfileStore().activeProfile);
      if (!xml) {
        console.error("XML generation failed");
        return {
          default: null,
          versions: [{
            version: "error",
            results: { error: "Failed to generate XML" },
            default: true,
            error: true
          }]
        };
      }
      let preview;
      if (!usePreferenceStore().returnValue('--b-edit-main-splitpane-opac-marc-html')){
        preview = await utilsNetwork.marcPreview(xml.bf2Marc, false);
      } else {
        preview = await utilsNetwork.marcPreview(xml.bf2Marc, true);
      }
      // Further refine sanitization to remove malformed subfields and unnecessary content
      if (preview && Array.isArray(preview)) {
        preview = preview.map(version => {
          if (version.marcRecord) {
            // Remove XML tags
            version.marcRecord = version.marcRecord.replace(/<[^>]*>/g, '').trim();
            // Remove malformed subfields (e.g., $d with no content or invalid indicators)
            version.marcRecord = version.marcRecord.replace(/\$[a-z] \$d\s+/g, '').replace(/ind1="\s*" ind2="\s*"/g, '');
            // Remove unnecessary content like URLs in subfields where not expected
            version.marcRecord = version.marcRecord.replace(/\$[a-z] http[^\s]+/g, '');
            // Ensure proper MARC structure (e.g., add missing indicators or subfield delimiters)
            version.marcRecord = version.marcRecord.replace(/\$\s+/g, ' $');
            // Ensure proper handling of the 082 field
            version.marcRecord = version.marcRecord.replace(/(082\s+\d{2}\s+\$a\s+[^$]+)\s+\$2\s*>/g, '$1 $2 21');
            // Remove any completely empty subfields
            version.marcRecord = version.marcRecord.replace(/\$[a-z]\s*>/g, '');
            // Remove malformed indicators and subfields
            version.marcRecord = version.marcRecord.replace(/ind1="\s*" ind2="\s*"/g, '').replace(/\$[a-z]\s+\$d\s+/g, '');
          }
          return version;
        });
      }

      // If preview is null or empty, return an error
      if (!preview || (Array.isArray(preview) && preview.length === 0)) {
        return {
          default: null,
          versions: [{
            version: "error",
            results: { error: "Empty response from MARC preview service" },
            default: true,
            error: true
          }]
        };
      }

      // clean it up a bit for the component
      let versions = preview.map((v) => { return v.version }).sort().reverse();
      let newResults = [];
      let selectedDefault = false;
      for (let v of versions){
        let toAdd = preview.filter(p => p.version === v)[0];
        // Check for valid result structure before proceeding
        if (!toAdd || !toAdd.results) {
          console.error(`Invalid preview item for version ${v}:`, toAdd);
          continue;
        }
        // Determine default version - pick first one with stdout
        if (toAdd.results && toAdd.results.stdout && !selectedDefault){
          toAdd.default = true;
          selectedDefault = true;
        } else {
          toAdd.default = false;
        }
        // Mark errors appropriately
        if (!toAdd.results.stdout || toAdd.results.stderr){
          toAdd.error = true;
          // Add error details if available
          if (toAdd.results.stderr) {
            toAdd.errorDetails = toAdd.results.stderr;
          }
        } else {
          toAdd.error = false;
        }
        newResults.push(toAdd);
      }

      // If we have no results that look valid, add an error version
      if (newResults.length === 0 || !selectedDefault) {
        newResults.unshift({
          version: "error",
          results: { error: "No valid MARC data found in response", details: JSON.stringify(preview) },
          default: true,
          error: true
        });
      }

      // Get the default version
      let defaultVer = newResults.find(p => p.default === true);
      if (defaultVer) {
        defaultVer = defaultVer.version;
      } else {
        defaultVer = null;
      }
      return {
        default: defaultVer,
        versions: newResults,
      };
    } catch (error) {
      console.error("Unhandled error in marcPreview:", error);
      return {
        default: null,
        versions: [{
          version: "error",
          results: { 
            error: error.message || "Unknown error in MARC preview",
            stack: error.stack
          },
          default: true,
          error: true
        }]
      };
    }
  },

  /** 
   * Ensures the assigner in AdminMetadata is fully populated. If missing or blank, replaces with default.
   * @param {Element} adminMetadataEl - The bf:AdminMetadata element to check/fix
   */ 
  fixAssignerInAdminMetadata: function(adminMetadataEl) {
    try {
      if (!adminMetadataEl) {
        console.warn('fixAssignerInAdminMetadata: called with null/undefined element');
        return;
      }
      let assigner = adminMetadataEl.querySelector('bf\\:assigner');
      let needsFix = false;
      if (!assigner) {
        needsFix = true;
      } else {
        // Check if Organization is blank (no rdf:about and no label)
        let org = assigner.querySelector('bf\\:Organization');
        if (!org || (!org.getAttribute('rdf:about') && !org.querySelector('rdfs\\:label'))) {
          needsFix = true;
          assigner.remove();
        }
      }
      if (needsFix) {
        const newAssigner = this.buildDefaultAssignerElement();
        adminMetadataEl.appendChild(newAssigner);
        console.info('fixAssignerInAdminMetadata: added default assigner');
      }
    } catch (e) {
      console.error('fixAssignerInAdminMetadata error:', e);
    }
  },

  /** 
   * Deduplicate assigner elements in a bf:AdminMetadata element, keeping only one and ensuring it has a label.
   * @param {Element} adminMetadataEl - The bf:AdminMetadata element to clean
   */ 
  deduplicateAssignersInAdminMetadata: function(adminMetadataEl) {
    if (!adminMetadataEl) return;
    // Remove all assigner elements
    const assigners = Array.from(adminMetadataEl.querySelectorAll('bf\\:assigner'));
    assigners.forEach(el => el.remove());
    // Add a single, well-formed assigner
    const newAssigner = this.buildDefaultAssignerElement();
    adminMetadataEl.appendChild(newAssigner);
  },

  /** 
   * Split complex subjects into individual components
   * @param {string} data - The XML string containing complex subjects
   * @return {string} - The updated XML string with split subjects
   */ 
  splitComplexSubjects: function(data){
    const parser = new DOMParser();
    const xml = parser.parseFromString(data, "application/xml");
    let subjects = xml.getElementsByTagName("bf:subject");
    for (let subject of subjects){
        let componentList = subject.getElementsByTagName("madsrdf:componentList");
        if (componentList.length > 0){
            // Remove all children from the componentList
            while (componentList[0].firstChild) {
                componentList[0].removeChild(componentList[0].firstChild);
            }
            // Get the main label and marcKey from the parent Topic
            let topic = subject.getElementsByTagName("bf:Topic")[0];
            if (!topic) continue;
            let label = topic.getElementsByTagName("rdfs:label")[0]?.textContent || "";
            let marcKey = topic.getElementsByTagName("bflc:marcKey")[0]?.textContent || "";
            // If the label contains --, split it
            let terms = label.split("--");
            let subfields = marcKey.slice(5).match(/\$[axyzv]{1}/g) || [];
            for (let i = 0; i < terms.length; i++) {
                // Determine the type and element for the new component
                let type, elementType;
                switch(subfields[i]){
                    case "$x":
                        type = "madsrdf:Topic";
                        elementType = "madsrdf:TopicElement";
                        break;
                    case "$v":
                        type = "madsrdf:GenreForm";
                        elementType = "madsrdf:GenreFormElement";
                        break;
                    case "$y":
                        type = "madsrdf:Temporal";
                        elementType = "madsrdf:TemporalElement";
                        break;
                    case "$z":
                        type = "madsrdf:Geographic";
                        elementType = "madsrdf:GeographicElement";
                        break;
                    case "$a":
                    default:
                        type = "madsrdf:Topic";
                        elementType = "madsrdf:TopicElement";
                }
                // Build <madsrdf:Authority>
                let authority = xml.createElementNS("http://www.loc.gov/mads/rdf/v1#", "madsrdf:Authority");
                // <madsrdf:authoritativeLabel>
                let authLabelElement = xml.createElementNS("http://www.loc.gov/mads/rdf/v1#", "madsrdf:authoritativeLabel");
                authLabelElement.textContent = terms[i];
                authority.appendChild(authLabelElement);
                // <madsrdf:elementList>
                let elementList = xml.createElementNS("http://www.loc.gov/mads/rdf/v1#", "madsrdf:elementList");
                let element = xml.createElementNS("http://www.loc.gov/mads/rdf/v1#", elementType);
                let elementValue = xml.createElementNS("http://www.loc.gov/mads/rdf/v1#", "madsrdf:elementValue");
                elementValue.textContent = terms[i];
                element.appendChild(elementValue);
                elementList.appendChild(element);
                authority.appendChild(elementList);
                componentList[0].appendChild(authority);
            }
        }
    }
    // Return the updated XML as a string
    return new XMLSerializer().serializeToString(xml);
  },

  /** 
   * Utility function to fix barcode structures in Item elements
   * @param {Element} xml - The XML document to fix
   * @return {Element} - The fixed XML document
   */ 
  fixBarcodeStructures: function(xml) {
    if (!xml) return xml;
    console.log("Starting barcode structure cleanup");
    
    // First perform a deep cleanup of the entire XML at string level
    let xmlString = new XMLSerializer().serializeToString(xml);
    console.log("Raw XML length before cleanup:", xmlString.length);
    
    // Fix malformed namespace attributes (missing spaces between element name and attribute)
    // This is the critical fix for "<bf:Itemrdf:about>" pattern
    xmlString = xmlString.replace(/<([\w:]+)(rdf:about|xmlns:[\w]+|xml:lang)=/g, "<$1 $2=");
    
    // Remove problematic patterns more aggressively
    const patterns = [
      // Handle div elements with xmlns
      /<divxmlns="[^"]*"[^>]*\/?>/g,                     // divxmlns without space
      /<div\s+xmlns="[^"]*"[^>]*\/?>/g,                  // div with space before xmlns
      /<div[^>]*xmlns="[^"]*"[^>]*\/?>/g,                // div with xmlns anywhere in it
      
      // Handle empty/malformed barcode structures
      /<rdf:value\s*\/>/g,                               // Self-closing rdf:value
      /<bf:Barcode>\s*(<[^>]*>)*\s*<\/bf:Barcode>/g,     // bf:Barcode with only tags inside
      /<bf:Barcode>\s*<\/bf:Barcode>/g,                  // Empty bf:Barcode
      /<bf:Barcode>(\s|<div[^>]*>|<\/div>)*<\/bf:Barcode>/g  // bf:Barcode with only divs/whitespace
    ];
    
    for (const pattern of patterns) {
      const before = xmlString;
      xmlString = xmlString.replace(pattern, '');
      if (before !== xmlString) {
        console.log(`Cleaned up pattern: ${pattern.toString()}`);
      }
    }
    
    // Fix additional malformed markup issues
    console.log("XML length after pattern cleanup:", xmlString.length);
    
    // Force rebuild proper Item elements that have barcode children
    // This matches both good and bad patterns of bf:Item tags to ensure we catch all
    const itemPattern = /<bf:Item[^>]*>[\s\S]*?<bf:Barcode[\s\S]*?<\/bf:Item>/g;
    const itemMatches = xmlString.match(itemPattern);
    
    if (itemMatches && itemMatches.length > 0) {
      console.log(`Found ${itemMatches.length} bf:Item elements with Barcode children`);
      
      // Process each matched item
      itemMatches.forEach((itemStr, index) => {
        // Extract the item URI if present
        const uriMatch = itemStr.match(/rdf:about="([^"]+)"/);
        const itemUri = uriMatch ? uriMatch[1] : '';
        
        // Extract barcode value if present
        let barcodeValue = '';
        const valueMatch = itemStr.match(/<rdf:value[^>]*>(.*?)<\/rdf:value>/);
        if (valueMatch && valueMatch[1]) {
          barcodeValue = valueMatch[1].trim();
        } else {
          // Try to get from input field
          const inputField = document.querySelector('input[placeholder*="barcode" i]');
          if (inputField && inputField.value) {
            barcodeValue = inputField.value.trim();
          }
        }
        
        console.log(`Item ${index}: URI=${itemUri}, Barcode=${barcodeValue}`);
        
        // Build a clean replacement
        let cleanItem = `<bf:Item rdf:about="${itemUri}">`;
        if (barcodeValue) {
          cleanItem += `<bf:Barcode><rdf:value>${barcodeValue}</rdf:value></bf:Barcode>`;
        }
        
        // Preserve itemOf relationship if present
        const itemOfMatch = itemStr.match(/<bf:itemOf[^>]*rdf:resource="([^"]+)"[^>]*\/>/);
        if (itemOfMatch && itemOfMatch[1]) {
          cleanItem += `<bf:itemOf rdf:resource="${itemOfMatch[1]}"/>`;
        }
        
        cleanItem += '</bf:Item>';
        
        // Replace the original with clean version
        xmlString = xmlString.replace(itemStr, cleanItem);
      });
    } else {
      console.log("No bf:Item elements with Barcode children found via string matching");
    }
    
    // Parse back to DOM with error checking
    const parser = new DOMParser();
    let doc;
    try {
      doc = parser.parseFromString(xmlString, "application/xml");
      
      // Check for parsing errors
      const parseErrors = doc.getElementsByTagName("parsererror");
      if (parseErrors.length > 0) {
        console.error("XML parsing error:", parseErrors[0].textContent);
        console.error("Falling back to original XML");
        doc = parser.parseFromString(new XMLSerializer().serializeToString(xml), "application/xml");
      }
    } catch (e) {
      console.error("Error parsing cleaned XML:", e);
      return xml; // Return original if parsing fails
    }
    
    // Now do a DOM-level cleanup on the well-formed XML
    try {
      // Fixed selector: Query for Item elements using getElementsByTagNameNS or a more reliable approach
      const items = [];
      
      // Try multiple methods to find Item elements to ensure we catch them all
      try {
        // Method 1: Use getElementsByTagNameNS if available
        if (doc.getElementsByTagNameNS) {
          const nsItems = doc.getElementsByTagNameNS(utilsRDF.namespace.bf, "Item");
          if (nsItems && nsItems.length > 0) {
            for (let i = 0; i < nsItems.length; i++) {
              items.push(nsItems[i]);
            }
          }
        }
      } catch (e) {
        console.log("getElementsByTagNameNS method failed:", e);
      }
      
      // Method 2: Use getElementsByTagName with prefix
      try {
        const prefixedItems = doc.getElementsByTagName("bf:Item");
        if (prefixedItems && prefixedItems.length > 0) {
          for (let i = 0; i < prefixedItems.length; i++) {
            if (!items.includes(prefixedItems[i])) {
              items.push(prefixedItems[i]);
            }
          }
        }
      } catch (e) {
        console.log("getElementsByTagName with prefix method failed:", e);
      }
      
      // Method 3: Find all elements and filter by localName and namespaceURI
      try {
        const allElements = doc.getElementsByTagName("*");
        for (let i = 0; i < allElements.length; i++) {
          const el = allElements[i];
          if (el.localName === "Item" && el.namespaceURI === utilsRDF.namespace.bf) {
            if (!items.includes(el)) {
              items.push(el);
            }
          }
        }
      } catch (e) {
        console.log("Filter by localName method failed:", e);
      }
      
      console.log(`Found ${items.length} Item elements using combined selection methods`);
      
      if (items.length === 0) {
        // Try fallback approach if no items found
        console.log("Applying string replacement fallback approach");
        
        // Improved regex to handle more variations of Item elements
        const itemRegex = /<(bf:)?Item\s+(?:[^>]*?\s)?rdf:about="([^"]+)"[^>]*>([\s\S]*?)<\/(bf:)?Item>/g;
        let matches = [];
        let match;
        
        while (match = itemRegex.exec(xmlString)) {
          matches.push({
            fullMatch: match[0],
            uri: match[2],
            content: match[3]
          });
        }
        
        if (matches.length > 0) {
          console.log(`Found ${matches.length} Item elements via regex matching`);
          
          // Replace each match with a clean version
          for (const item of matches) {
            const barcodeValueMatch = item.content.match(/<rdf:value[^>]*>(.*?)<\/rdf:value>/);
            const barcodeValue = barcodeValueMatch ? barcodeValueMatch[1].trim() : '';
            
            // Build clean replacement
            let cleanItem = `<bf:Item rdf:about="${item.uri}">`;
            if (barcodeValue) {
              cleanItem += `<bf:Barcode><rdf:value>${barcodeValue}</rdf:value></bf:Barcode>`;
            }
            
            // Preserve itemOf relationship
            const itemOfMatch = item.content.match(/<bf:itemOf\s+rdf:resource="([^"]+)"[^>]*\/>/);
            if (itemOfMatch && itemOfMatch[1]) {
              cleanItem += `<bf:itemOf rdf:resource="${itemOfMatch[1]}"/>`;
            }
            
            cleanItem += '</bf:Item>';
            
            // Replace in string
            xmlString = xmlString.replace(item.fullMatch, cleanItem);
          }
          
          // Try parsing again
          const fallbackDoc = parser.parseFromString(xmlString, "application/xml");
          if (fallbackDoc.getElementsByTagName("parsererror").length === 0) {
            console.log("String replacement approach successful");
            return fallbackDoc.documentElement;
          }
        }
      }
      
      // DOM processing for each item
      items.forEach((item, index) => {
        // Find barcode structures through multiple methods to ensure we catch all
        const barcodes = [];
        
        // Method 1: Try getElementsByTagNameNS
        try {
          if (item.getElementsByTagNameNS) {
            const nsBarcode = item.getElementsByTagNameNS(utilsRDF.namespace.bf, "Barcode");
            if (nsBarcode && nsBarcode.length > 0) {
              for (let i = 0; i < nsBarcode.length; i++) {
                barcodes.push(nsBarcode[i]);
              }
            }
          }
        } catch (e) {
          console.log("getElementsByTagNameNS for Barcode failed:", e);
        }
        
        // Method 2: Use getElementsByTagName with prefix
        try {
          const prefixedBarcodes = item.getElementsByTagName("bf:Barcode");
          if (prefixedBarcodes && prefixedBarcodes.length > 0) {
            for (let i = 0; i < prefixedBarcodes.length; i++) {
              if (!barcodes.includes(prefixedBarcodes[i])) {
                barcodes.push(prefixedBarcodes[i]);
              }
            }
          }
        } catch (e) {
          console.log("getElementsByTagName for Barcode failed:", e);
        }
        
        // Remove all found barcodes
        barcodes.forEach(barcode => {
          if (barcode.parentNode) {
            barcode.parentNode.removeChild(barcode);
          }
        });
        
        // Get barcode value
        let barcodeValue = '';
        const inputField = document.querySelector('input[placeholder*="barcode" i]');
        if (inputField && inputField.value) {
          barcodeValue = inputField.value.trim();
        }
        
        // Create a new, clean barcode structure
        if (barcodeValue) {
          try {
            const barcodeEl = document.createElementNS(utilsRDF.namespace.bf, "bf:Barcode");
            const valueEl = document.createElementNS(utilsRDF.namespace.rdf, "rdf:value");
            valueEl.textContent = barcodeValue;
            barcodeEl.appendChild(valueEl);
            
            // Insert at the beginning
            if (item.firstChild) {
              item.insertBefore(barcodeEl, item.firstChild);
            } else {
              item.appendChild(barcodeEl);
            }
          } catch (e) {
            console.error("Error creating barcode structure:", e);
          }
        }
      });
    } catch (e) {
      console.error("Error in DOM processing:", e);
    }
    
    // Final string cleanup to ensure correct output
    let finalXmlString = new XMLSerializer().serializeToString(doc.documentElement || doc);
    
    // Ensure no self-closing rdf:value elements remain
    finalXmlString = finalXmlString.replace(/<rdf:value\s*\/>/g, '<rdf:value></rdf:value>');
    
    try {
      const finalDoc = parser.parseFromString(finalXmlString, "application/xml");
      if (finalDoc.getElementsByTagName("parsererror").length === 0) {
        console.log("Final cleanup successful");
        return finalDoc.documentElement;
      } else {
        console.error("Parser errors in final document");
      }
    } catch (e) {
      console.error("Error in final parsing:", e);
    }
    
    // If everything failed, return the document from intermediate processing
    return doc.documentElement || doc;
  }

};

export default utilsExport;