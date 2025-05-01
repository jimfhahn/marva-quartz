// Add the missing import statements at the top of the file
import {useConfigStore} from "../stores/config";
import {useProfileStore} from "../stores/profile";
import {usePreferenceStore} from "../stores/preference";
import utilsRDF from './utils_rdf';
import utilsNetwork from './utils_network';
import { parse as parseEDTF } from 'edtf';


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
    try {
      // Create the element with proper namespace
      const labelEl = document.createElementNS(utilsRDF.namespace.rdfs, "rdfs:label");
      
      // Set text content directly (no resource attribute)
      labelEl.textContent = text || '';
      
      return labelEl;
    } catch (error) {
      console.error("Error creating rdfs:label:", error);
      // Create fallback element if there's an error
      const fallbackEl = document.createElement("rdfs:label");
      fallbackEl.setAttribute("xmlns:rdfs", utilsRDF.namespace.rdfs);
      fallbackEl.textContent = text || '';
      return fallbackEl;
    }
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
        
        // Handle datatype - either provided explicitly, determined by EDTF validation, or other logic
        if (!this.checkForEDTFDatatype){ this.checkForEDTFDatatype = useConfigStore().checkForEDTFDatatype }

        if (userValue['@datatype']){
          pEl.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:datatype', userValue['@datatype'])
        } else if (this.checkForEDTFDatatype.indexOf(property) > -1) {
          let dataType = false
          // try to parse the value if it parses use the edtf data type
          try { parseEDTF(userValue[property]); dataType = "http://id.loc.gov/datatypes/edtf" } catch { dataType = false }
          if (dataType){
            pEl.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:datatype', dataType)
          }
        }
        
        // Handle language attribute if present
        if (userValue['@language']){
          pEl.setAttribute('xml:lang', userValue['@language'])
        }
        
        // Handle parseType attribute if present
        if (userValue['@parseType']){
          pEl.setAttribute('rdf:parseType', userValue['@parseType'])
        }
        
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
   * Clean up an assigner element to ensure it has the correct structure:
   * <bf:assigner>
   *   <bf:Organization rdf:about="http://id.loc.gov/vocabulary/organizations/pu">
   *     <rdfs:label>Label Text</rdfs:label>
   *   </bf:Organization>
   * </bf:assigner>
   * @param {Element} assignerEl - The assigner element to clean
   */ 
  cleanAssignerElement: function(assignerEl) {
    if (!assignerEl) return;
    
    // Use getElementsByTagNameNS for robust selection
    const orgEls = assignerEl.getElementsByTagNameNS(utilsRDF.namespace.bf, 'Organization');
    
    orgEls.forEach(orgEl => {
      let orgUri = 'http://id.loc.gov/vocabulary/organizations/pu'; // Default URI
      let orgLabel = useConfigStore().defaultAssignerLabel || "University of Pennsylvania, Van Pelt-Dietrich Library"; // Default Label

      // 1. Find and remove any incorrectly nested rdf:about elements
      const nestedAboutEls = orgEl.getElementsByTagNameNS(utilsRDF.namespace.rdf, 'about');
      if (nestedAboutEls.length > 0) {
        // Try to get the URI from the incorrect element before removing it
        if (nestedAboutEls[0].textContent) {
          orgUri = nestedAboutEls[0].textContent.trim();
        }
        Array.from(nestedAboutEls).forEach(el => el.parentNode?.removeChild(el));
        console.log("[cleanAssignerElement] Removed incorrectly nested rdf:about element.");
      }

      // 2. Ensure rdf:about attribute exists and has the correct URI
      if (!orgEl.hasAttributeNS(utilsRDF.namespace.rdf, 'about') && !orgEl.hasAttribute('rdf:about')) {
        orgEl.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:about', orgUri);
        console.log(`[cleanAssignerElement] Added missing rdf:about attribute with URI: ${orgUri}`);
      } else {
         // If it exists, make sure it's the correct one (or update if needed, though default is usually fine)
         // For now, we assume the existing one is intended if present.
         orgUri = orgEl.getAttributeNS(utilsRDF.namespace.rdf, 'about') || orgEl.getAttribute('rdf:about');
      }

      // 3. Ensure rdfs:label exists and is nested correctly
      let labelEl = orgEl.querySelector('rdfs\\:label'); // Use querySelector for simplicity here
      if (!labelEl) {
        // If no label, create and append one
        labelEl = this.createRdfsLabel(orgLabel);
        orgEl.appendChild(labelEl);
        console.log(`[cleanAssignerElement] Added missing rdfs:label with text: ${orgLabel}`);
      } else {
         // If label exists, ensure it has text content (use default if empty)
         if (!labelEl.textContent || labelEl.textContent.trim() === '') {
             labelEl.textContent = orgLabel;
             console.log(`[cleanAssignerElement] Populated empty rdfs:label with default text: ${orgLabel}`);
         }
         // Ensure the label is the *only* direct child if possible, remove extra text nodes
         Array.from(orgEl.childNodes).forEach(node => {
             if (node !== labelEl && node.nodeType === Node.TEXT_NODE && (!node.textContent || node.textContent.trim() === '')) {
                 orgEl.removeChild(node);
             }
         });
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
              let value1Array = userValue[key1];
              if (!Array.isArray(value1Array)) {
                value1Array = [value1Array];
              }

              for (let value1 of value1Array) {
                xmlLog.push(`Processing key1: ${key1} with value1: ${JSON.stringify(value1)}`);
                let pLvl2 = this.createElByBestNS(key1); // Create element for the property
                if (!pLvl2 || !pLvl2.nodeType) {
                  xmlLog.push(`Failed to create pLvl2 element for key ${key1}`);
                  continue;
                }

                // --- START SIMPLIFICATION for bf:assigner ---
                // If the root property is bf:adminMetadata and this key is bf:assigner,
                // skip the complex processing and insert the default structure.
                if (ptObj.propertyURI === 'http://id.loc.gov/ontologies/bibframe/adminMetadata' && key1 === 'http://id.loc.gov/ontologies/bibframe/assigner') {
                    xmlLog.push(`[Simplification] Found bf:assigner within bf:adminMetadata. Using default assigner element instead of processing userValue.`);
                    const defaultAssigner = this.buildDefaultAssignerElement(); // This creates <bf:assigner><bf:Organization>...</bf:Organization></bf:assigner>
                    bnodeLvl1.appendChild(defaultAssigner); // Append the whole default structure to the <bf:AdminMetadata> bnode
                    // We created pLvl2 (<bf:assigner>) but won't use it or process its children (value1)
                    xmlLog.push(`[Simplification] Appended default assigner structure.`);
                    continue; // Skip the rest of the loop for this value1 (the assigner userValue)
                }
                // --- END SIMPLIFICATION ---


                if (this.isBnode(value1)){
                  xmlLog.push(`Nested bnode found for key: ${key1}`);
                  let bnodeLvl2 = this.createBnode(value1, key1);
                  if (!bnodeLvl2 || !bnodeLvl2.nodeType) {
                     xmlLog.push(`Failed to create bnodeLvl2 for key ${key1}`);
                     continue;
                  }
                  xmlLog.push(`Created nested bnode: ${bnodeLvl2.tagName}`);

                  // Recursively process properties of the nested bnode
                  for (let key2 of Object.keys(value1).filter(k => (!k.includes('@') ? true : false))){
                    let value2Array = value1[key2];
                    if (!Array.isArray(value2Array)) {
                       value2Array = [value2Array];
                    }

                    // --- START SIMPLIFICATION for nested bf:assigner ---
                    // Also simplify if bf:assigner is found nested deeper
                    if (key2 === 'http://id.loc.gov/ontologies/bibframe/assigner') {
                        xmlLog.push(`[Simplification] Found nested bf:assigner. Using default assigner element.`);
                        const defaultAssigner = this.buildDefaultAssignerElement();
                        bnodeLvl2.appendChild(defaultAssigner); // Append default to the parent bnode (bnodeLvl2)
                        xmlLog.push(`[Simplification] Appended default assigner structure to nested bnode.`);
                        continue; // Skip processing the rest of the loop for this key2
                    }
                    // --- END SIMPLIFICATION ---

                    for (let value2 of value2Array) {
                      // Create element for the nested property (e.g., <bf:assigner>)
                      let pLvl3 = this.createElByBestNS(key2);
                      if (!pLvl3 || !pLvl3.nodeType) {
                         xmlLog.push(`Failed to create pLvl3 element for key ${key2}`);
                         continue;
                      }

                      if (this.isBnode(value2)) {
                         // Handle deeper nesting if necessary (level 3 bnode)
                         let bnodeLvl3 = this.createBnode(value2, key2);
                         // ... process bnodeLvl3 properties ...
                         pLvl3.appendChild(bnodeLvl3);
                      } else if (value2['@id']) {
                         // Handle URI resource reference
                         pLvl3.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:resource', value2['@id']);
                      } else {
                         // Handle literal value
                         let literalVal = value2;
                         if (typeof value2 === 'object' && value2['@value']) {
                            literalVal = value2['@value'];
                         }
                         if (typeof literalVal === 'string' || typeof literalVal === 'number') {
                            pLvl3.textContent = literalVal;
                         } else {
                            xmlLog.push(`Unhandled literal type for key2 ${key2}: ${JSON.stringify(value2)}`);
                            continue;
                         }
                      }
                      bnodeLvl2.appendChild(pLvl3); // Append property to nested bnode
                    }
                  }
                  pLvl2.appendChild(bnodeLvl2); // Append nested bnode to property element
                  bnodeLvl1.appendChild(pLvl2); // Append property element to level 1 bnode

                } else if (value1['@id']) {
                  // Handle simple URI resource reference (e.g., <bf:role rdf:resource="..."/>)
                  xmlLog.push(`Handling URI reference for key: ${key1}`);
                  pLvl2.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:resource', value1['@id']);
                  bnodeLvl1.appendChild(pLvl2); // Append property element to level 1 bnode

                } else {
                  // Handle literal value (could be simple string/number or object with @value/@language)
                  xmlLog.push(`Handling literal for key: ${key1}`);
                  let literalVal = value1;
                  let lang = null;

                  if (typeof value1 === 'object') {
                    if (value1['@value']) {
                      literalVal = value1['@value'];
                      lang = value1['@language'];
                    } else if (value1['rdf:value']) { // Handle cases like barcode where value is under rdf:value
                      literalVal = value1['rdf:value'];
                    } else {
                      // Check if it's an object containing the literal directly (e.g., from language map)
                      const literalKeys = Object.keys(value1).filter(k => !k.startsWith('@'));
                      if (literalKeys.length === 1 && (typeof value1[literalKeys[0]] === 'string' || typeof value1[literalKeys[0]] === 'number')) {
                        literalVal = value1[literalKeys[0]];
                      } else {
                         xmlLog.push(`Unhandled literal object structure for key ${key1}: ${JSON.stringify(value1)}`);
                         continue; // Skip if we can't extract a literal value
                      }
                    }
                  }

                  if (typeof literalVal === 'string' || typeof literalVal === 'number') {
                    pLvl2.textContent = literalVal;
                    if (lang) {
                      pLvl2.setAttribute('xml:lang', lang);
                    }
                    bnodeLvl1.appendChild(pLvl2); // Append property element to level 1 bnode
                  } else {
                    xmlLog.push(`Could not extract literal value for key ${key1}: ${JSON.stringify(value1)}`);
                  }
                }
              } // end for (let value1...)
            } // end for (let key1...)

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
              userValueArray = [userValue]; // Wrap non-array value in an array
            }

            // Process each user value in the array
            for (let userValueItem of userValueArray){
              if (this.hasUserValue(userValueItem)){
                if (await utilsRDF.suggestTypeNetwork(ptObj.propertyURI) == 'http://www.w3.org/2000/01/rdf-schema#Literal'){
                  // Handle top level literals
                  let allXMLFragments = '';
                  // Check if userValueItem is a simple literal or an object with literal values
                  if (typeof userValueItem === 'string' || typeof userValueItem === 'number') {
                    let p1 = this.createLiteral(ptObj.propertyURI, userValueItem);
                    if (p1 !== false && p1.nodeType) { // Ensure p1 is a valid node
                      rootEl.appendChild(p1);
                      xmlLog.push(`Creating literal at root level for ${ptObj.propertyURI} with value ${p1.innerHTML}`);
                      allXMLFragments = formatXML(p1.outerHTML);
                    } else {
                      xmlLog.push(`Failed to create literal for ${ptObj.propertyURI} with value ${userValueItem}`);
                    }
                  } else if (typeof userValueItem === 'object') {
                    // Iterate through keys if it's an object (like language maps)
                    for (let key1 of Object.keys(userValueItem).filter(k => (!k.includes('@') ? true : false))){
                      if (typeof userValueItem[key1] === 'string' || typeof userValueItem[key1] === 'number'){
                        let p1 = this.createLiteral(ptObj.propertyURI, userValueItem[key1]);
                        if (p1 !== false && p1.nodeType) {
                          // Handle language tags if present
                          if (userValueItem['@language']) {
                            p1.setAttribute('xml:lang', userValueItem['@language']);
                          }
                          rootEl.appendChild(p1);
                          xmlLog.push(`Creating literal at root level for ${key1} with value ${p1.innerHTML}`);
                          allXMLFragments += `\n${formatXML(p1.outerHTML)}`;
                        } else {
                          xmlLog.push(`Failed to create literal for ${key1} with value ${userValueItem[key1]}`);
                        }
                      } else {
                        // Handle nested structures if necessary, though less common for root literals
                        xmlLog.push(`Skipping non-literal nested value for key ${key1}`);
                      }
                    }
                  }
                  if (allXMLFragments) {
                    componentXmlLookup[`${rt}-${pt}`] = allXMLFragments.trim();
                  }
                } else if (ptObj.propertyURI != "http://id.loc.gov/ontologies/bibframe/electronicLocator" &&
                           await utilsRDF.suggestTypeNetwork(ptObj.propertyURI) == 'http://www.w3.org/2000/01/rdf-schema#Resource'){
                  // Handle resources (This part seems less likely for non-bnodes, might need review)
                  xmlLog.push(`Handling resource at root level for ${ptObj.propertyURI}`);
                  // ... (logic for handling root-level resources if needed) ...
                } else if (userValueItem['@id']){
                  // Handle simple URI references
                  let p = this.createElByBestNS(ptObj.propertyURI);
                  if (p && p.nodeType) { // Check if p is a valid element
                    p.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:resource', userValueItem['@id']);
                    rootEl.appendChild(p);
                    componentXmlLookup[`${rt}-${pt}`] = formatXML(p.outerHTML);
                  } else {
                     xmlLog.push(`Failed to create element for URI reference ${ptObj.propertyURI}`);
                  }
                } else if (ptObj.propertyURI == 'http://www.w3.org/2000/01/rdf-schema#label'){
                  // Handle simple labels
                  let labelValue = '';
                  if (typeof userValueItem === 'string') {
                    labelValue = userValueItem;
                  } else if (userValueItem['http://www.w3.org/2000/01/rdf-schema#label']) {
                    // Extract label from nested structure if necessary
                    // This might need adjustment based on actual data structure
                    labelValue = userValueItem['http://www.w3.org/2000/01/rdf-schema#label'];
                    if (Array.isArray(labelValue) && labelValue[0]) {
                       labelValue = labelValue[0]['http://www.w3.org/2000/01/rdf-schema#label'] || labelValue[0];
                    }
                    if (typeof labelValue !== 'string') labelValue = JSON.stringify(labelValue); // Fallback
                  }

                  if (labelValue) {
                    let p = this.createElByBestNS(ptObj.propertyURI);
                    if (p && p.nodeType) {
                      p.innerHTML = escapeHTML(labelValue);
                      rootEl.appendChild(p);
                      componentXmlLookup[`${rt}-${pt}`] = formatXML(p.outerHTML);
                    } else {
                      xmlLog.push(`Failed to create element for label ${ptObj.propertyURI}`);
                    }
                  } else {
                     xmlLog.push(`No label value found for ${ptObj.propertyURI}`);
                  }
                } else {
                  // Fallback for simple string/number literals if not caught by suggestTypeNetwork
                  if (typeof userValueItem === 'string' || typeof userValueItem === 'number') {
                     let p1 = this.createLiteral(ptObj.propertyURI, userValueItem);
                     if (p1 !== false && p1.nodeType) {
                       rootEl.appendChild(p1);
                       xmlLog.push(`Creating fallback literal at root level for ${ptObj.propertyURI} with value ${p1.innerHTML}`);
                       componentXmlLookup[`${rt}-${pt}`] = formatXML(p1.outerHTML);
                     } else {
                       xmlLog.push(`Failed to create fallback literal for ${ptObj.propertyURI}`);
                     }
                  } else {
                    xmlLog.push(`Unhandled case for non-bnode root property: ${ptObj.propertyURI} with value ${JSON.stringify(userValueItem)}`);
                    console.warn("Should not be here - unhandled non-bnode root property", ptObj.propertyURI, userValueItem);
                  }
                }
              } else {
                 xmlLog.push(`Skipping item in array because hasUserValue == false`);
              }
            } // <-- closes loop over userValueArray
          } // <-- This closes the else block for `isBnode`
        } else { // <-- This else now correctly corresponds to `if (this.hasUserValue(userValue))`
          xmlLog.push(`Skipping it because hasUserValue == false`);
        }
      
        // Special handling for rdfs:label properties
        if (ptObj.propertyURI == 'http://www.w3.org/2000/01/rdf-schema#label') {
            // does it just have a label?

            // Check if this label comes from a lookup
            if (ptObj.valueConstraint && ptObj.valueConstraint.useValuesFrom && userValue['@id']) {
                const lookupId = userValue['@id'];
                // Attempt to find the label using utilsNetwork.lookupLibrary (assuming it holds the cached data)
                // Make sure utilsNetwork.lookupLibrary is loaded and accessible here
                const lookupEntry = (utilsNetwork.lookupLibrary || []).find(entry => entry['@id'] === lookupId);

                if (lookupEntry && lookupEntry['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'] && lookupEntry['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0] && lookupEntry['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]['@value']) {
                    const labelText = lookupEntry['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]['@value'];
                    let p = this.createRdfsLabel(labelText); // Use helper for namespaced label
                    rootEl.appendChild(p);
                    componentXmlLookup[`${rt}-${pt}`] = formatXML(p.outerHTML);
                } else {
                    // Fallback: If lookup fails, use the @id as resource
                    console.warn(`Could not find label for lookup ID: ${lookupId} in pt: ${pt}. Falling back to rdf:resource.`);
                    let p = this.createElByBestNS(ptObj.propertyURI); // Creates <rdfs:label>
                    p.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:resource', lookupId); // Set rdf:resource attribute
                    rootEl.appendChild(p);
                    componentXmlLookup[`${rt}-${pt}`] = formatXML(p.outerHTML);
                }
            } else {
                // Original logic for non-lookup rdfs:label (with added checks)
                let labelText = '';
                if (typeof userValue === 'string') {
                    labelText = userValue;
                } else if (userValue && typeof userValue === 'object' && userValue['@value']) {
                     labelText = userValue['@value'];
                } else if (userValue && userValue[ptObj.propertyURI] && typeof userValue[ptObj.propertyURI] === 'string') {
                     // Handle cases where the value might be nested under the property URI key
                     labelText = userValue[ptObj.propertyURI];
                } else if (userValue && Array.isArray(userValue[ptObj.propertyURI]) && userValue[ptObj.propertyURI][0] && userValue[ptObj.propertyURI][0][ptObj.propertyURI]) {
                     // Deeper nesting as seen in the original problematic line
                     labelText = userValue[ptObj.propertyURI][0][ptObj.propertyURI];
                } else {
                     console.warn(`Could not determine label text for non-lookup rdfs:label in pt: ${pt}`, userValue);
                     // Fallback or leave empty? Using empty for now.
                }

                let p = this.createRdfsLabel(labelText); // Use helper for namespaced label
                rootEl.appendChild(p);
                componentXmlLookup[`${rt}-${pt}`] = formatXML(p.outerHTML);
            }
        } else if (ptObj.propertyURI === 'http://id.loc.gov/ontologies/bibframe/physicalLocation') {
            console.log('--- Simple physicalLocation handling ---');
            // Try extracting ID/Label more robustly from userValue
            let locationId = null;
            let locationLabel = null;

            if (typeof userValue === 'string') {
                // If userValue is just a string, assume it's the label
                locationLabel = userValue;
                console.log(`[physicalLocation] Using direct string value as label: ${locationLabel}`);
            } else if (userValue && typeof userValue === 'object') {
                // Look for @id first
                locationId = userValue['@id'] || userValue.uri;

                // If no ID, look for nested label structures (like those causing the problem)
                if (!locationId) {
                     const rdfsLabelURI = 'http://www.w3.org/2000/01/rdf-schema#label';
                     if (userValue[rdfsLabelURI] && userValue[rdfsLabelURI][0]) {
                         if (userValue[rdfsLabelURI][0]['@id']) {
                             locationId = userValue[rdfsLabelURI][0]['@id']; // Found ID inside label object
                         } else if (userValue[rdfsLabelURI][0]['@value']) {
                             locationLabel = userValue[rdfsLabelURI][0]['@value']; // Found label value inside label object
                         }
                     }
                     // Check for doubly nested physicalLocation structure seen in logs
                     else if (userValue[ptObj.propertyURI] && userValue[ptObj.propertyURI][0] && userValue[ptObj.propertyURI][0][rdfsLabelURI] && userValue[ptObj.propertyURI][0][rdfsLabelURI][0] && userValue[ptObj.propertyURI][0][rdfsLabelURI][0]['@id']) {
                         locationId = userValue[ptObj.propertyURI][0][rdfsLabelURI][0]['@id'];
                     }
                }
            }

            if (!locationLabel && locationId) {
                console.log(`[physicalLocation] Processing ID: ${locationId}`);
                // Extract location label from ID
                if (locationId.includes('alma:library:')) {
                    const match = locationId.match(/alma:library:([^:]+)/);
                    if (match && match[1]) {
                        locationLabel = match[1];
                    }
                }
                // Fallback if extraction fails
                if (!locationLabel) {
                    locationLabel = locationId.split(':').pop() || locationId;
                }
            }

            if (locationLabel) {
                // Create a simple element with direct text content
                const locationEl = this.createElByBestNS(ptObj.propertyURI);
                locationEl.textContent = locationLabel;
                // Remove existing incorrect ones before adding
                const existing = Array.from(rootEl.querySelectorAll('bf\\:physicalLocation')); // Corrected selector
                existing.forEach(el => el.parentNode?.removeChild(el));
                rootEl.appendChild(locationEl);
                componentXmlLookup[`${rt}-${pt}`] = formatXML(locationEl.outerHTML);
                console.log(`Created physicalLocation with text: ${locationLabel}`);
            } else {
                console.log('[physicalLocation] No valid ID or Label found in userValue.', userValue);
            }
            continue; // Skip standard processing
        } else if (ptObj.propertyURI === 'http://id.loc.gov/ontologies/bibframe/sublocation') {
            console.log('--- Simplified sublocation handling ---');

            // Extract sublocation value more robustly
            let sublocationLabel = null;
            let sublocationId = null; // Keep track of ID if found

            if (typeof userValue === 'string') {
                sublocationLabel = userValue;
            } else if (userValue && typeof userValue === 'object') {
                sublocationId = userValue['@id']; // Check for ID first

                // Look for label in various structures
                const rdfsLabelURI = 'http://www.w3.org/2000/01/rdf-schema#label';
                if (userValue.rdfsLabel) { // Direct property
                    sublocationLabel = userValue.rdfsLabel;
                } else if (userValue[rdfsLabelURI] && userValue[rdfsLabelURI][0]) { // Nested label object
                    if (userValue[rdfsLabelURI][0]['@value']) {
                        sublocationLabel = userValue[rdfsLabelURI][0]['@value'];
                    } else if (userValue[rdfsLabelURI][0]['@id']) {
                        sublocationId = userValue[rdfsLabelURI][0]['@id']; // Get ID if label value is missing
                    }
                }
                // Check for the structure <bf:sublocation><bf:Sublocation><rdfs:label>stor</rdfs:label>...
                else if (userValue['bf:Sublocation'] && userValue['bf:Sublocation'][0] && userValue['bf:Sublocation'][0][rdfsLabelURI] && userValue['bf:Sublocation'][0][rdfsLabelURI][0] && userValue['bf:Sublocation'][0][rdfsLabelURI][0]['@value']) {
                     sublocationLabel = userValue['bf:Sublocation'][0][rdfsLabelURI][0]['@value'];
                }
                 // Check for the structure <bf:sublocation><bf:Sublocation><rdfs:label rdf:resource="..."></rdfs:label>...
                else if (userValue['bf:Sublocation'] && userValue['bf:Sublocation'][0] && userValue['bf:Sublocation'][0][rdfsLabelURI] && userValue['bf:Sublocation'][0][rdfsLabelURI][0] && userValue['bf:Sublocation'][0][rdfsLabelURI][0]['@id']) {
                     sublocationId = userValue['bf:Sublocation'][0][rdfsLabelURI][0]['@id'];
                }


                // If we only found an ID, extract label from it
                if (!sublocationLabel && sublocationId) {
                    console.log(`[sublocation] Extracted ID: ${sublocationId}`);
                    const idParts = sublocationId.split(':');
                    sublocationLabel = idParts[idParts.length - 1]; // e.g., 'stor'
                }
            }


            // If we found a label, create the element with the desired structure
            if (sublocationLabel) {
                // Remove any existing sublocation elements first
                const existingSublocationElements = Array.from(rootEl.querySelectorAll('bf\\:sublocation')); // Correct selector
                if (existingSublocationElements.length > 0) {
                    console.log(`[sublocation] Removing ${existingSublocationElements.length} existing elements.`);
                    existingSublocationElements.forEach(el => el.parentNode?.removeChild(el));
                }

                // Create with exactly the structure you want:
                const sublocationEl = this.createElByBestNS(ptObj.propertyURI); // bf:sublocation
                const sublocationNode = this.createElByBestNS('bf:Sublocation'); // bf:Sublocation
                const labelNode = this.createRdfsLabel(sublocationLabel); // rdfs:label

                sublocationNode.appendChild(labelNode);
                sublocationEl.appendChild(sublocationNode);
                rootEl.appendChild(sublocationEl); // Corrected variable name

                componentXmlLookup[`${rt}-${pt}`] = formatXML(sublocationEl.outerHTML);
                console.log(`Created sublocation with label: ${sublocationLabel}`);
            } else {
                console.log('[sublocation] Could not determine sublocation label from userValue:', userValue);
            }

            continue; // Skip standard processing
        } else if (ptObj.type === 'literal-lang') {
          // ...existing code...
        }
      } // <-- This closes the `for (let pt of profile.rt[rt].ptOrder)` loop

      // Handle any unused XML
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

      // <--- Add cleanup here specifically for Item elements, AFTER processing PTs --->
      if (rootElName === "Item") {
          console.log("[Item Cleanup] Starting cleanup for Item element:", rootEl.outerHTML);

          // --- Physical Location Cleanup (using getElementsByTagNameNS) ---
          // Use getElementsByTagNameNS for robust namespace handling
          const physicalLocationsManual = Array.from(rootEl.getElementsByTagNameNS(utilsRDF.namespace.bf, 'physicalLocation'));
          console.log(`[Item Cleanup] Found ${physicalLocationsManual.length} potential physicalLocation elements using getElementsByTagNameNS.`);

          const physicalLocations = physicalLocationsManual;
          let finalLocationLabelText = null;
          let lookupSource = 'None';

          if (physicalLocations.length > 0) {
              console.log(`[Item Cleanup] Found ${physicalLocations.length} physicalLocation elements. Consolidating...`);

              // Try to find the correct label from the potentially incorrect structures
              for (const pl of physicalLocations) {
                  // ... (rest of the logic to find the best label remains largely the same)
                  // ... but update internal selectors if they were also failing ...
                  console.log('[Item Debug] Processing physicalLocation for cleanup:', pl.outerHTML);
                  let potentialLabel = null;
                  let resourceId = null;

                  // Check for direct text content first, as this is the desired final state
                  if (pl.childNodes.length === 1 && pl.firstChild.nodeType === Node.TEXT_NODE && pl.firstChild.textContent.trim()) {
                      potentialLabel = pl.firstChild.textContent.trim();
                      lookupSource = 'Direct Text';
                      console.log(`[Item Debug] Found direct text label: ${potentialLabel}`);
                      // If we find the direct text version, prioritize it
                      finalLocationLabelText = potentialLabel;
                      break; // Found the best possible version
                  }

                  // Check for the nested structure with rdf:resource
                  const nestedPl = pl.getElementsByTagNameNS(utilsRDF.namespace.bf, 'physicalLocation')[0]; // Find nested bf:physicalLocation
                  if (nestedPl) {
                      const labelInsideNested = nestedPl.getElementsByTagNameNS(utilsRDF.namespace.rdfs, 'label')[0]; // Find nested rdfs:label
                      if (labelInsideNested) {
                          resourceId = labelInsideNested.getAttributeNS(utilsRDF.namespace.rdf, 'resource') || labelInsideNested.getAttribute('rdf:resource');
                          if (resourceId) {
                              console.log(`[Item Cleanup] Found nested structure with resource: ${resourceId}`);
                              // --- Logic to get label from resourceId ---
                              let locationLabel = null;
                              try {
                                  // 1. Try lookup library
                                  if (utilsNetwork.lookupLibrary && Array.isArray(utilsNetwork.lookupLibrary)) {
                                      const entry = utilsNetwork.lookupLibrary.find(e => e['@id'] === resourceId);
                                      if (entry && entry['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']?.[0]?.['@value']) {
                                          locationLabel = entry['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]['@value'];
                                          lookupSource = 'lookupLibrary';
                                          console.log(`[Item Cleanup/LocationLookup] Found label in lookupLibrary: '${locationLabel}'`);
                                      }
                                  }
                                  // 2. If not found, try extracting from URI structure
                                  if (!locationLabel && resourceId.includes('alma:library:')) {
                                      const match = resourceId.match(/alma:library:([^:]+)/);
                                      if (match && match[1]) {
                                          locationLabel = match[1];
                                          lookupSource = 'URI Extraction';
                                          console.log(`[Item Cleanup/LocationLookup] Extracted label from URI: '${locationLabel}'`);
                                      }
                                  }
                                  // 3. Fallback
                                  if (!locationLabel) {
                                      locationLabel = resourceId.split(':').pop() || resourceId;
                                      lookupSource = 'Fallback ID Parsing';
                                      console.log(`[Item Cleanup/LocationLookup] Using fallback label: '${locationLabel}'`);
                                  }
                              } catch (lookupError) {
                                  console.error(`[Item Cleanup/LocationLookup] Error looking up label for ${resourceId}: ${lookupError}`);
                                  locationLabel = resourceId.split(':').pop() || resourceId; // Fallback on error
                                  lookupSource = 'Error Fallback';
                              }
                              potentialLabel = locationLabel;
                              // --- End label lookup logic ---
                          } else {
                               console.warn('[Item Debug] Could not extract resourceId from nested label element.');
                          }
                      } else {
                           console.warn('[Item Debug] Did not find rdfs:label inside nested bf:physicalLocation.');
                      }
                  } else {
                       // Check for direct rdfs:label with rdf:resource (non-nested)
                       const directLabelWithResource = pl.getElementsByTagNameNS(utilsRDF.namespace.rdfs, 'label')[0];
                       if (directLabelWithResource) {
                           resourceId = directLabelWithResource.getAttributeNS(utilsRDF.namespace.rdf, 'resource') || directLabelWithResource.getAttribute('rdf:resource');
                           if (resourceId) {
                               console.log(`[Item Cleanup] Found direct structure with resource: ${resourceId}`);
                               // --- Logic to get label from resourceId ---
                               let locationLabel = null;
                               try {
                                  // 1. Try lookup library
                                  if (utilsNetwork.lookupLibrary && Array.isArray(utilsNetwork.lookupLibrary)) {
                                      const entry = utilsNetwork.lookupLibrary.find(e => e['@id'] === resourceId);
                                      if (entry && entry['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']?.[0]?.['@value']) {
                                          locationLabel = entry['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]['@value'];
                                          lookupSource = 'lookupLibrary';
                                          console.log(`[Item Cleanup/LocationLookup] Found label in lookupLibrary: '${locationLabel}'`);
                                      }
                                  }
                                  // 2. If not found, try extracting from URI structure
                                  if (!locationLabel && resourceId.includes('alma:library:')) {
                                      const match = resourceId.match(/alma:library:([^:]+)/);
                                      if (match && match[1]) {
                                          locationLabel = match[1];
                                          lookupSource = 'URI Extraction';
                                          console.log(`[Item Cleanup/LocationLookup] Extracted label from URI: '${locationLabel}'`);
                                      }
                                  }
                                  // 3. Fallback
                                  if (!locationLabel) {
                                      locationLabel = resourceId.split(':').pop() || resourceId;
                                      lookupSource = 'Fallback ID Parsing';
                                      console.log(`[Item Cleanup/LocationLookup] Using fallback label: '${locationLabel}'`);
                                  }
                               } catch (lookupError) {
                                  console.error(`[Item Cleanup/LocationLookup] Error looking up label for ${resourceId}: ${lookupError}`);
                                  locationLabel = resourceId.split(':').pop() || resourceId; // Fallback on error
                                  lookupSource = 'Error Fallback';
                               }
                               potentialLabel = locationLabel;
                               // --- End label lookup logic ---
                           } else {
                                console.warn('[Item Debug] Could not extract resourceId from direct label element.');
                           }
                       } else {
                            console.warn('[Item Debug] Did not find nested bf:physicalLocation or direct rdfs:label[rdf:resource].');
                       }
                  }

                  // Keep the first valid label found if we haven't found the direct text version yet
                  if (potentialLabel && !finalLocationLabelText) {
                      finalLocationLabelText = potentialLabel;
                      console.log(`[Item Cleanup] Determined potential final location label: '${finalLocationLabelText}' (Source: ${lookupSource})`);
                      // Don't break here, keep looking for the direct text version if possible
                  }
              } // <-- End of for loop

              // Remove ALL existing physicalLocation elements found initially
              physicalLocations.forEach(pl => {
                  if (pl.parentNode) {
                      pl.parentNode.removeChild(pl);
                  }
              });
              console.log(`[Item Cleanup] Finished removing initially found physicalLocation elements.`);

              // If we found a label, create and append ONE clean physicalLocation
              if (finalLocationLabelText !== null) {
                  const newLocationEl = this.createElByBestNS('bf:physicalLocation');
                  newLocationEl.textContent = finalLocationLabelText;
                  rootEl.appendChild(newLocationEl);
                  console.log(`[Item Cleanup] Appended single clean physicalLocation with text: '${finalLocationLabelText}'`);
              } else {
                  console.warn(`[Item Cleanup] Could not determine a final label for physicalLocation. No element added.`);
              }

          } else {
              console.log(`[Item Cleanup] No physicalLocation elements found for item using getElementsByTagNameNS.`);
          }

          // --- Sublocation Cleanup (using getElementsByTagNameNS) ---
          const sublocationsManual = Array.from(rootEl.getElementsByTagNameNS(utilsRDF.namespace.bf, 'sublocation'));
          console.log(`[Item Cleanup] Found ${sublocationsManual.length} potential sublocation elements using getElementsByTagNameNS.`);

          if (sublocationsManual.length > 0) {
              let finalSublocationLabel = null;
              // Try to find the best label from existing structures
              for (const sl of sublocationsManual) {
                  // Use getElementsByTagNameNS for inner elements too
                  const sublocationNode = sl.getElementsByTagNameNS(utilsRDF.namespace.bf, 'Sublocation')[0];
                  if (sublocationNode) {
                      const labelNode = sublocationNode.getElementsByTagNameNS(utilsRDF.namespace.rdfs, 'label')[0];
                      if (labelNode) {
                          // Prioritize the one with direct text content
                          if (!labelNode.hasAttributeNS(utilsRDF.namespace.rdf, 'resource') && !labelNode.hasAttribute('rdf:resource') && labelNode.textContent) {
                              finalSublocationLabel = labelNode.textContent.trim();
                              console.log(`[Item Cleanup] Found final sublocation label (direct text): '${finalSublocationLabel}'`);
                              break; // Found the best version
                          }
                          // Otherwise, store the label from the resource version as a fallback
                          else if (!finalSublocationLabel) {
                              let potentialLabelFromResource = null;
                              const resourceId = labelNode.getAttributeNS(utilsRDF.namespace.rdf, 'resource') || labelNode.getAttribute('rdf:resource');
                              if (resourceId) {
                                  const idParts = resourceId.split(':');
                                  potentialLabelFromResource = idParts[idParts.length - 1];
                                  console.log(`[Item Cleanup] Found potential sublocation label (from resource): '${potentialLabelFromResource}'`);
                              }
                              // Use the text content if available, otherwise use the extracted resource label
                              if (labelNode.textContent && labelNode.textContent.trim()) {
                                  finalSublocationLabel = labelNode.textContent.trim();
                              } else if (potentialLabelFromResource) {
                                  finalSublocationLabel = potentialLabelFromResource;
                              }
                          }
                      }
                  }
              }

              // Remove all existing sublocation elements
              sublocationsManual.forEach(sl => sl.parentNode?.removeChild(sl));

              // If a label was found, create the single correct structure
              if (finalSublocationLabel) {
                  const sublocationEl = this.createElByBestNS('bf:sublocation');
                  const sublocationNode = this.createElByBestNS('bf:Sublocation');
                  const labelNode = this.createRdfsLabel(finalSublocationLabel);
                  
                  sublocationNode.appendChild(labelNode);
                  sublocationEl.appendChild(sublocationNode);
                  rootEl.appendChild(sublocationEl); // Corrected variable name
                  console.log(`[Item Cleanup] Appended single clean sublocation with label: '${finalSublocationLabel}'`);
              } else {
                   console.warn(`[Item Cleanup] Could not determine a final label for sublocation. No element added.`);
              }
          } else {
               console.log(`[Item Cleanup] No sublocation elements found for item using getElementsByTagNameNS.`);
          }

      } // <--- End Item cleanup --->
      // Add the completed root element to the lookup
      tleLookup[rootElName][profile.rt[rt].URI] = rootEl;
      xmlLog.push(`Finished building ${rootElName}`);
    } // <-- This closes the `for (let rt of profile.rtOrder)` loop

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

    for (let URI in tleLookup['Instance']){
      let instance = (new XMLSerializer()).serializeToString(tleLookup['Instance'][URI]);
      instance = xmlParser.parseFromString(instance, "text/xml").children[0];
      
      // Add hasItem relationships for basic version
      let items = this.returnHasItem(URI, orginalProfile, tleLookup);
      if (items.length > 0){
        for (let item of items){
          let p = this.createElByBestNS('bf:hasItem');
          p.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:resource', item.getAttribute('rdf:about'));
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
        instance.appendChild(p);
      }
      rdfBasic.appendChild(instance);
    }

    // Add Items to rdfBasic - CRITICAL FOR ITEM RENDERING
    for (let URI in tleLookup['Item']){
      let item = (new XMLSerializer()).serializeToString(tleLookup['Item'][URI]);
      item = xmlParser.parseFromString(item, "text/xml").children[0];
      rdfBasic.appendChild(item);
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
    
    // DIRECT ITEM HANDLING: Ensure all standalone Items are added directly to the RDF root
    console.log("DEBUG: Processing standalone Items for direct inclusion in RDF root");
    for (let URI in tleLookup['Item']){
      // Skip if this URI doesn't exist or isn't an actual Item
      if (!tleLookup['Item'][URI]) {
        console.log(`DEBUG: Item ${URI} doesn't exist in tleLookup['Item']`);
        continue;
      }
      
      try {
        // Ensure we have a proper Item element
        console.log(`DEBUG: Processing Item ${URI} for inclusion`);
        const item = tleLookup['Item'][URI].cloneNode(true); // Clone to avoid modifying original
        
        if (!item || !item.nodeType) {
          console.log(`DEBUG: Item ${URI} is not a valid node`);
          continue;
        }
        
        // Verify bf:Item is properly created
        console.log(`DEBUG: Item ${URI} nodeName = ${item.nodeName}`);
        
        // Append directly to RDF root - this is the critical part
        rdf.appendChild(item);
        console.log(`DEBUG: Successfully added Item ${URI} directly to RDF root`);
      } catch (error) {
        console.error(`Error adding Item ${URI} to RDF root:`, error);
      }
    }
    
    // Create dataset description element - moved to after Item processing
    let datasetDescriptionEl = document.createElementNS(utilsRDF.namespace.void, 'void:DatasetDescription');
    console.log(`DEBUG: Created DatasetDescription element with name: ${datasetDescriptionEl.nodeName}`);
    
    // Explicitly set namespaces for this element
    datasetDescriptionEl.setAttributeNS("http://www.w3.org/2000/xmlns/", `xmlns:void`, utilsRDF.namespace.void);
    datasetDescriptionEl.setAttributeNS("http://www.w3.org/2000/xmlns/", `xmlns:lclocal`, utilsRDF.namespace.lclocal);

    // Add metadata elements
    let el;
    for (let x of xmlVoidDataRtsUsed){
      el = document.createElementNS(utilsRDF.namespace.lclocal, 'lclocal:rtsused');
      el.textContent = escapeHTML(x);
      datasetDescriptionEl.appendChild(el);
    }
    
    // Add other metadata elements
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
    
    // CRITICAL: Actually append the DatasetDescription to the RDF document
    console.log(`DEBUG: Appending DatasetDescription to root RDF document`);
    rdf.appendChild(datasetDescriptionEl);
    
    // Format XML output
    // Only serialize after ALL elements have been added to the DOM
    console.log(`DEBUG: Serializing final RDF document`);
    let strXml = this.serializePreservingNamespaces(rdf);
    let strXmlBasic = this.serializePreservingNamespaces(rdfBasic);
    let strXmlFormatted = strXml;
    
    // Check that the serialization worked as expected
    console.log(`DEBUG: RDF serialization length: ${strXml.length}`);
    if (!strXml || strXml.length < 100) {
      console.error("XML Serialization problem: Output is too short or empty");
    }
    
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
    bf2MarcXmlElRdf = this.fixBarcodeStructures(bf2MarcXmlElRdf); // Corrected variable name

    // Return the XML in various formats
    return {
      xmlDom: rdf,
      xmlStringFormatted: this.sanitizeXmlString(strXmlFormatted),
      xlmString: this.sanitizeXmlString(strXml),
      bf2Marc: this.sanitizeXmlString(strBf2MarcXmlElBib),
      xlmStringBasic: this.sanitizeXmlString(strXmlBasic),
      voidTitle: xmlVoidDataTitle,
      voidContributor: xmlVoidDataContributor,
      componentXmlLookup: componentXmlLookup
    };
  },

  /**
   * Fixes barcode structures in an XML document
   * @param {Element} xmlDoc - The XML document element to process
   * @return {Element} - The processed XML document element
   */
  fixBarcodeStructures: function(xmlDoc) {
    if (!xmlDoc || typeof xmlDoc.querySelectorAll !== 'function') {
      console.warn("[fixBarcodeStructures] Invalid xmlDoc provided");
      return xmlDoc;
    }
    
    try {
      console.log("[fixBarcodeStructures] Starting barcode structure fix process");
      
      // Find all barcode elements
      const barcodes = xmlDoc.querySelectorAll('bf\\:Barcode');
      console.log(`[fixBarcodeStructures] Found ${barcodes.length} barcode elements`);
      
      barcodes.forEach((barcode, index) => {
        // Check if it already has a proper rdf:value element
        if (barcode.querySelector('rdf\\:value')) {
          console.log(`[fixBarcodeStructures] Barcode ${index} already has rdf:value, skipping`);
          return;
        }
        
        // Get text content directly from the barcode element
        let barcodeText = barcode.textContent && barcode.textContent.trim();
        
        if (barcodeText) {
          console.log(`[fixBarcodeStructures] Fixing barcode ${index} with text content: ${barcodeText}`);
          
          // Clear the text content
          while (barcode.firstChild) {
            barcode.removeChild(barcode.firstChild);
          }
          
          // Create a proper rdf:value element
          const valueEl = document.createElementNS(utilsRDF.namespace.rdf, "rdf:value");
          valueEl.textContent = barcodeText;
          barcode.appendChild(valueEl);
          
          console.log(`[fixBarcodeStructures] Fixed barcode ${index}`);
        }
      });
      
      console.log("[fixBarcodeStructures] Barcode structure fix process complete");
      return xmlDoc;
    } catch (error) {
      console.error(`[fixBarcodeStructures] Error: ${error}`);
      return xmlDoc;
    }
  },
  
  /**
   * Deduplicates assigners in AdminMetadata to ensure there's only one properly structured assigner
   * @param {Element} adminMetadata - The AdminMetadata element to process
   */
  deduplicateAssignersInAdminMetadata: function(adminMetadata) {
    if (!adminMetadata) return;
    
    try {
      const assigners = adminMetadata.querySelectorAll('bf\\:assigner');
      
      // If no assigners, add a default one
      if (assigners.length === 0) {
        const defaultAssigner = this.buildDefaultAssignerElement();
        adminMetadata.appendChild(defaultAssigner);
        return; // Exit after adding default
      }
      
      // Find the best assigner (one with proper Organization structure)
      let bestAssigner = null;
      
      for (let i = 0; i < assigners.length; i++) {
        const assigner = assigners[i];
        const org = assigner.querySelector('bf\\:Organization[rdf\\:about]');
        if (org && org.querySelector('rdfs\\:label')) {
          bestAssigner = assigner;
          break;
        }
      }
      
      // If we found a good assigner, remove others and make sure it's properly structured
      if (bestAssigner) {
        // Ensure the best assigner has the correct structure
        this.cleanAssignerElement(bestAssigner);
        // Remove all other assigners
        assigners.forEach(assigner => {
          if (assigner !== bestAssigner && assigner.parentNode === adminMetadata) {
             adminMetadata.removeChild(assigner);
          }
        });
      } else {
        // No ideal assigner found, pick the first one and try to fix it or add default
        const firstAssigner = assigners[0];
        this.cleanAssignerElement(firstAssigner); // Try cleaning the first one
        // Remove all other assigners
        assigners.forEach(assigner => {
          if (assigner !== firstAssigner && assigner.parentNode === adminMetadata) {
             adminMetadata.removeChild(assigner);
          }
        });
        // If the cleaned first assigner still lacks an org/label, replace with default
        const org = firstAssigner.querySelector('bf\\:Organization[rdf\\:about]');
        if (!org || !org.querySelector('rdfs\\:label')) {
           console.warn("[deduplicateAssigners] First assigner couldn't be fixed, replacing with default.");
           if (firstAssigner.parentNode === adminMetadata) {
               adminMetadata.removeChild(firstAssigner);
           }
           const defaultAssigner = this.buildDefaultAssignerElement();
           adminMetadata.appendChild(defaultAssigner);
        }
      }
    } catch (error) { 
      console.error("[deduplicateAssignersInAdminMetadata] Error:", error);
    }
  },

  /**
   * Cleanup Item elements to fix common issues with physicalLocation and sublocation
   * @param {Element} itemElement - The Item element to clean
   * @return {Element} - The cleaned Item element
   */
  cleanupItemElement: function(itemElement) {
    if (!itemElement || itemElement.tagName !== 'bf:Item') {
      console.warn("[cleanupItemElement] Not an Item element, skipping cleanup");
      return itemElement;
    }
    
    try {
      console.log("[cleanupItemElement] Starting cleanup for Item");
      
      // 1. Fix physicalLocation elements (remove double nesting)
      const physicalLocations = Array.from(itemElement.querySelectorAll('bf\\:physicalLocation'));
      if (physicalLocations.length > 0) {
        console.log(`[cleanupItemElement] Found ${physicalLocations.length} physicalLocation elements`);
        
        // Find the innermost location with a resource or text content
        let bestLocation = null;
        let bestLocationValue = null;
        let bestLocationResource = null;
        
        for (const location of physicalLocations) {
          // Check if there's direct text content
          const directText = location.childNodes.length === 1 && location.firstChild.nodeType === Node.TEXT_NODE
            ? location.childNodes[0].nodeValue.trim()
            : null;
            
          // Check for resource attribute
          const resourceAttr = location.getAttribute('rdf:resource') || location.getAttributeNS(utilsRDF.namespace.rdf, 'resource');
          
          // Prioritize elements with direct text content
          if (directText && (!bestLocationValue || bestLocation.childNodes.length > 1)) {
            bestLocation = location;
            bestLocationValue = directText;
            bestLocationResource = null;
          } 
          // Then prioritize elements with resource attributes
          else if (resourceAttr && !bestLocationValue && !bestLocationResource) {
            bestLocation = location;
            bestLocationValue = null;
            bestLocationResource = resourceAttr;
          }
        }
        
        // Remove all existing locations
        physicalLocations.forEach(location => {
          if (location.parentNode) {
            location.parentNode.removeChild(location);
          }
        });
        
        // Create a new clean location element
        if (bestLocationValue || bestLocationResource) {
          const newLocation = this.createElByBestNS('bf:physicalLocation');
          
          if (bestLocationValue) {
            newLocation.textContent = bestLocationValue;
          } else if (bestLocationResource) {
            newLocation.setAttributeNS(utilsRDF.namespace.rdf, 'rdf:resource', bestLocationResource);
          }
          
          itemElement.appendChild(newLocation);
        }
      }
      
      // 2. Fix sublocation elements (remove duplicates, ensure proper structure)
      const sublocations = Array.from(itemElement.querySelectorAll('bf\\:sublocation'));
      if (sublocations.length > 0) {
        console.log(`[cleanupItemElement] Found ${sublocations.length} sublocation elements`);
        
        let bestSublocation = null;
        let bestSublocationValue = null;
        
        for (const sublocation of sublocations) {
          // Look for proper structure first: bf:sublocation > bf:Sublocation > rdfs:label
          const structuredLabel = sublocation.querySelector('bf\\:Sublocation > rdfs\\:label');
          if (structuredLabel && structuredLabel.textContent) {
            bestSublocation = sublocation;
            bestSublocationValue = structuredLabel.textContent;
            break;
          }
          
          // Next, check for direct text content
          if (!bestSublocationValue && sublocation.textContent && sublocation.textContent.trim()) {
            bestSublocation = sublocation;
            bestSublocationValue = sublocation.textContent.trim();
          }
        }
        
        // Remove all existing sublocations
        sublocations.forEach(sublocation => {
          if (sublocation.parentNode) {
            sublocation.parentNode.removeChild(sublocation);
          }
        });
        
        // Create a new clean sublocation with proper structure
        if (bestSublocationValue) {
          const newSublocation = this.createElByBestNS('bf:sublocation');
          const sublocationNode = this.createElByBestNS('bf:Sublocation');
          const labelNode = this.createRdfsLabel(bestSublocationValue);
          
          sublocationNode.appendChild(labelNode);
          newSublocation.appendChild(sublocationNode);
          itemElement.appendChild(newSublocation);
        }
      }
      
      return itemElement;
    } catch (error) {
      console.error("[cleanupItemElement] Error during cleanup:", error);
      return itemElement;
    }
  },

  /**
   * Sanitizes XML strings to remove parser errors and undefined values
   * This helps prevent the <sourcetext> elements with undefined values from appearing in output
   * @param {string} xmlString - The XML string to sanitize
   * @return {string} The sanitized XML string
   */
  sanitizeXmlString: function(xmlString) {
    if (!xmlString) return xmlString;
    
    try {
      // Remove parser error elements and their content
      xmlString = xmlString.replace(/<sourcetext[^>]*>[\s\S]*?<\/sourcetext>/g, '');
      
      // Remove undefined values that could cause parsing errors
      xmlString = xmlString.replace(/undefined/g, '');
      
      return xmlString;
    } catch (error) {
      console.error("Error sanitizing XML:", error);
      return xmlString; // Return original if error occurs
    }
  },
};


export default utilsExport;