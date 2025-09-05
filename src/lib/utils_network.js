import {useConfigStore} from "../stores/config";
import {usePreferenceStore} from "../stores/preference";

import short from 'short-uuid'
const translator = short();



const utilsNetwork = {

    // where to look for the string
    possibleLabelURIs: [
        'http://www.loc.gov/mads/rdf/v1#authoritativeLabel',
        'http://www.w3.org/2004/02/skos/core#prefLabel',
        'http://www.w3.org/2000/01/rdf-schema#label'
    ],


    // a cache to keep previosuly requested vocabularies and lookups in memory for use again
    lookupLibrary : {},

    // library to sublocation mapping data
    librarySubLocationMap: null,

    //Controllers to manage searches
    controllers: {
      "controllerNames": new AbortController(),
      "controllerNamesSubdivision": new AbortController(),
      "controllerSubjectsSimple": new AbortController(),
      "controllerPayloadSubjectsSimpleSubdivision": new AbortController(),
      "controllerSubjectsComplex": new AbortController(),
      "controllerHierarchicalGeographic": new AbortController(),
      "controllerWorksAnchored": new AbortController(),
      "controllerWorksKeyword": new AbortController(),
      "controllerHubsAnchored": new AbortController(),
      "controllerHubsKeyword": new AbortController(),
      "controllerTemporal": new AbortController(),
      "controllerGenre": new AbortController(),
      "controllerHierarchicalGeographicLCSH": new AbortController(),
      "controllerGeographicLCSH": new AbortController(),
      "controllerGeographicLCNAF": new AbortController(),
      "controllerCyak": new AbortController(),
      "exactName": new AbortController(),
      "exactSubject": new AbortController(),
    },
    subjectSearchActive: false,

    /**
    * processes the data returned from id vocabularies
    *
      try {
        const complexLookupRaw = await this.fetchSimpleLookup(`https://id.loc.gov/authorities/subjects/label/${encodeURIComponent(fullHeadingLabel)}.json`, true);
        let complexId = null;
        if (complexLookupRaw) {
          if (Array.isArray(complexLookupRaw)) {
            // Find the ComplexType node
            const complexNode = complexLookupRaw.find(n => Array.isArray(n['@type']) ? n['@type'].includes('http://www.loc.gov/mads/rdf/v1#ComplexType') : n['@type'] === 'http://www.loc.gov/mads/rdf/v1#ComplexType');
            if (complexNode && complexNode['@id']) {
              complexId = complexNode['@id'];
            }
          } else if (complexLookupRaw['@id']) {
            // Single object shape (unlikely but supported)
            complexId = complexLookupRaw['@id'];
          }
        }
        if (complexId) {
          let mk = await this.lookupMarcKeyFromUri(complexId);
            result.resultType = 'COMPLEX';
            result.hit = {
              uri: complexId,
              label: fullHeadingLabel,
              heading: { subdivision: false, rdfType: headings[0].rdfType },
              extra: { marcKeys: mk && mk.marcKey ? [mk.marcKey] : [] , components: headings }
            };
            return result;
        } else if (!complexLookupRaw) {
          result._complexLookup404 = true;
          console.info('[LinkMode] Complex heading 404 (not authorized):', fullHeadingLabel);
        }
      } catch (e) {
        result._complexLookupError = true;
      }
          }

        }
    },


    /**
    * processes the data returned
    *
    * @async
    * @param {array} data - the results from the vocabulary data endpoint
    * @param {boolean} parentURI - the URI to look for in extacting the values
    * @return {object} - returns the results processing
    */

    simpleLookupProcess: function(data,parentURI){

        let dataProcessed = {


            // all the URIs will live here but also the metadata obj about the uris
            metadata : {
                uri: parentURI,
                values: {}
            }

        }

        if (Array.isArray(data)){
            // basic ID simple Lookup response
            // assume anything in this array is a possible value except
            // something that has the parent URI

            data.forEach((d)=>{
                let label = null
                let labelData = null                // it has a URI and that URI is not the parent uri
                // assume it is one of the values we want
                // also skip any blank nodes
                if (d['@id'] && d['@id'] != parentURI && !d['@id'].includes('_:') ){

                    this.possibleLabelURIs.forEach((labelURI)=>{
                        // if it has this label URI and does not yet have a label
                        if (d[labelURI] && !dataProcessed[d['@id']]){

                            label = this.returnValue(d[labelURI])

                            let labelWithCode = []
                            // build the metadata for each item that will go along it with structured fields
                            let metadata = {uri:d['@id'], label: [], code: [], displayLabel: [] }
                            label.forEach((l)=>{
                                labelWithCode.push(`${l} (${d['@id'].split('/').pop()})`)
                                metadata.displayLabel.push(`${l.trim()} (${d['@id'].split('/').pop()})`)

                                metadata.label.push(l.trim())
                                metadata.code.push(d['@id'].split('/').pop())

                            })
                            labelData = metadata
                            label = labelWithCode
                        }
                    })
                } else if (parentURI.includes("suggest2") && d.uri && d.aLabel) {
                  this.possibleLabelURIs.forEach((result)=>{
                    // if it has this label URI and does not yet have a label
                    if ( !dataProcessed[result.uri] ){

                        label = d.aLabel

                        let labelWithCode = []
                        // build the metadata for each item that will go along it with structured fields
                        let metadata = {uri:d.uri, label: [], code: [], displayLabel: [] }
                        label.forEach((l)=>{
                            labelWithCode.push(`${l} (${d.uri.split('/').pop()})`)
                            metadata.displayLabel.push(`${l.trim()} (${d.uri.split('/').pop()})`)

                            metadata.label.push(l.trim())
                            metadata.code.push(d.uri.split('/').pop())

                        })
                        labelData = metadata
                        label = labelWithCode
                    }
                })
                }else if (d['http://id.loc.gov/ontologies/RecordInfo#recordStatus']){
                    // this is just a record info blank node, skip it
                    return false
                }else{

                    // this is the parent uri obj in the response, skip it
                    return false
                }

                if (label === null){
                    console.error('lookupUtility: Was expecting this to have a label', d)
                    return false
                }

                dataProcessed[d['@id']] = label
                dataProcessed.metadata.values[d['@id']] = labelData
            })


        }else{

            // TODO more use cases
            dataProcessed = data
        }

        return dataProcessed
    },

    /**
    * Loads the nested library structure that includes sublocations
    */
    loadNestedLibraryData: async function() {
      // If we already have a processed lookup, return it
      if (this.lookupLibrary['/libraryWithSublocations.json'] && this.lookupLibrary['/libraryWithSublocations.json'].metadata) {
        return this.lookupLibrary['/libraryWithSublocations.json'];
      }

      try {
        const response = await fetch('/libraryWithSublocations.json')
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const nestedLibraryData = await response.json()
        // keep the raw array around in case something expects it
        this.lookupLibrary['/libraryWithSublocations.json_raw'] = nestedLibraryData

        // convert to the processed lookup format expected by LookupSimple
        const processed = this._convertNestedToLookup(nestedLibraryData)
        this.lookupLibrary['/libraryWithSublocations.json'] = processed

        return processed
      } catch (error) {
        console.error('Error loading nested library data:', error)
        return { metadata: { values: {} } }
      }
    },

    /**
     * Convert an array of nested library objects into the lookup format used by the UI
     */
    _convertNestedToLookup: function(nestedLibraryData) {
      if (!nestedLibraryData || !Array.isArray(nestedLibraryData)) {
        return { metadata: { values: {} } }
      }

      const lookupData = { metadata: { values: {} } }
      nestedLibraryData.forEach((library) => {
        const libraryId = library['@id']
        // attempt to find a label in the expected place, fall back to id
        const labelVal = library['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']?.[0]?.['@value'] || libraryId

        // Create display label array - the filter logic expects an array of strings at lookupData[libraryId]
        lookupData[libraryId] = [labelVal]

        // Create metadata for this library
        lookupData.metadata.values[libraryId] = {
          uri: libraryId,
          label: [labelVal],
          displayLabel: [labelVal],
          authLabel: labelVal,
          code: [libraryId]
        }

        // Also expose the original library object for sublocation access
        lookupData[libraryId + '_original'] = library
      })

      return lookupData
    },

    /**
    * Gets sublocations for a specific library from nested structure
    */
    getSubLocationsForLibrary: function(libraryId) {
      // Prefer processed lookup form if available
      const processed = this.lookupLibrary['/libraryWithSublocations.json']
      if (processed && processed[libraryId + '_original'] && processed[libraryId + '_original'].sublocations) {
        return processed[libraryId + '_original'].sublocations
      }

      // Fallback to raw array
      const nestedLibraryData = this.lookupLibrary['/libraryWithSublocations.json_raw'] || this.lookupLibrary['/libraryWithSublocations.json']
      if (!nestedLibraryData) return []

      if (Array.isArray(nestedLibraryData)){
        const library = nestedLibraryData.find(lib => lib['@id'] === libraryId)
        if (library && library.sublocations) return library.sublocations
      }

      return []
    },

    /**
    * Gets the nested library data structure for lookup fields
    */
    getNestedLibraryLookupData: function() {
      // Return the processed lookup data directly
      return this.lookupLibrary['/libraryWithSublocations.json'] || { metadata: { values: {} } }
    },

    /**
    * Gets sublocation lookup data for a specific library
    */
    getSublocationLookupDataForLibrary: function(libraryId) {
      const sublocations = this.getSubLocationsForLibrary(libraryId)
      if (!sublocations || sublocations.length === 0) {
        return { metadata: { values: {} } }
      }
      
      const lookupData = { metadata: { values: {} } }
      
      sublocations.forEach((sublocation, index) => {
        const sublocationId = sublocation['@id']
        const sublocationLabel = sublocation['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']?.[0]?.['@value'] || sublocationId
        
        // Create display label array - the filter logic expects an array of strings at lookupData[sublocationId]
        lookupData[sublocationId] = [sublocationLabel]
        
        // Create metadata for this sublocation
        lookupData.metadata.values[sublocationId] = {
          uri: sublocationId,
          label: [sublocationLabel],
          displayLabel: [sublocationLabel],
          authLabel: sublocationLabel,
          code: [sublocationId]
        }
      })
      
      return lookupData
    },

    /**
    * Legacy method - now loads nested structure instead of separate mapping
    * @deprecated Use loadNestedLibraryData instead
    */
    loadLibrarySubLocationMapping: async function() {
      console.warn('loadLibrarySubLocationMapping is deprecated, use loadNestedLibraryData instead')
      return await this.loadNestedLibraryData()
    },


    /**
    * Does a suggest2 lookup against ID provided the vocabulary to look into
    *
    * @async
    * @param {string} uris - the uri(s) to the ID vocabulary to search
    * @param {boolean} keyword - the query term
    * @return {object} - returns the result of the suggest search
    */

    loadSimpleLookupKeyword: async function(uris,keyword,inclueUsage){
      if (!Array.isArray(uris)){
        uris=[uris]
      }

      let results = {metadata:{ uri:uris[0]+'KEYWORD', values:{}  }}
      for (let uri of uris){


        // build the url,  dont end in a slash
        if (uri.at(-1) == '/'){
          uri[-1] = ''
        }

        // if we are in production do a special check here to use internal servers
        let returnUrls = useConfigStore().returnUrls
        if (returnUrls.env == "production"){
          uri = uri.replace('http://id.loc.gov/', returnUrls.id)
          uri = uri.replace('https://id.loc.gov/', returnUrls.id)
        }

        let url = `${uri}/suggest2/?q=${keyword}&count=25`
        if (inclueUsage){
          url = url + "&usage=true"
        }

        let r = await this.fetchSimpleLookup(url)

        if (r.hits && r.hits.length==0){
          url = `${uri}/suggest2/?q=${keyword}&count=25&searchtype=keyword`
          if (inclueUsage){
            url = url + "&usage=true"
          }
          r = await this.fetchSimpleLookup(url)
        }


        if (r.hits && r.hits.length>0){
          for (let hit of r.hits){
            results.metadata.values[hit.uri] = {uri:hit.uri, label: [hit.suggestLabel], authLabel:hit.aLabel, code: (hit.code) ? hit.code.split(" ") : [], displayLabel: [hit.suggestLabel], contributions: (hit.contributions) ? hit.contributions : null, more: (hit.more) ? hit.more : {}}
            results[hit.uri] = [hit.suggestLabel.includes("USE") ? hit.aLabel : hit.suggestLabel]
          }

        }

      }

      this.lookupLibrary[uris[0]+'KEYWORD'] = results

      return results
    },

    /**
     * Get the exact match from the known-label lookup. This only really returns a header with the URL for the term.
     * We've got to get that URL and then get the madsrdf for it and process that to get the details for the term.
     *
     * @async
     * @param {string} url - the URL to ask for, if left blank it just pulls in the profiles
     * @param {signal} signal - signal that will be used to abort the call if needed
     * @return {object|string} - returns the JSON object parsed into JS Object or the text body of the response depending if it is json or not
     */
    fetchExactLookup: async function(url, signal=null){
      let options = {signal: signal}
      let response = await fetch(url,options);

      let results
      try {
        let id = response.headers.get("x-uri").split("/").at(-1)
        let payload = {
            processor: 'lcAuthorities',
            url: ["https://id.loc.gov/suggest2/?q="+id],
            searchValue: id,
            subjectSearch: true,
            signal: this.controllers.exactSubject.signal,
        }
        results = this.searchComplex(payload)
      } catch(err){
        return []
      }

      return results
    },
    /**
    * The lower level function used by a lot of other fuctions to make fetch calls to pull in data
    *
    * fetches the profile data from supplied URL or from the config URL if empty
    * @async
    * @param {string} url - the URL to ask for, if left blank it just pulls in the profiles
    * @param {boolean} json - if defined and true will treat the call as a json request, addding some headers to ask for json
    * @param {signal} signal - signal that will be used to abort the call if needed
    * @return {object|string} - returns the JSON object parsed into JS Object or the text body of the response depending if it is json or not
    */
    fetchSimpleLookup: async function(url, json, signal=null) {
      url = url || config.profileUrl
      if (url.includes("id.loc.gov")){
        url = url.replace('http://','https://')
      }

      // if we use the memberOf there might be a id URL in the params, make sure its not https
      url = url.replace('memberOf=https://id.loc.gov/','memberOf=http://id.loc.gov/')

      let options = { signal: signal }
      if (json){
        // NOTE: For simple GET requests to id.loc.gov we only send the Accept header.
        // Adding a Content-Type header on a GET makes the request "non-simple" per the
        // Fetch / CORS spec and triggers a preflight OPTIONS request. id.loc.gov often
        // does not answer these custom preflights in a way browsers accept, producing
        // "CORS Preflight Did Not Succeed" errors. Keeping only Accept avoids the
        // preflight and matches upstream behavior.
        options = { headers: { 'Accept': 'application/json' }, mode: 'cors', signal }
      }
      try{
        console.log("[fetchSimpleLookup] Fetching URL:", url, "Options:", options)
        let response = await fetch(url,options);
        console.log("[fetchSimpleLookup] Response status:", response.status)
        let data = null
        if (response.status == 404){
          console.warn("[fetchSimpleLookup] 404 Not Found for URL:", url)
          return false
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('xml') || contentType.includes('rdf')) {
          data = await response.text();
          console.log("[fetchSimpleLookup] XML/RDF response text (first 200 chars):", data ? data.substring(0,200) : "EMPTY");
        } else {
          const responseText = await response.text();
          if (!responseText || responseText.trim() === '') {
            console.warn("[fetchSimpleLookup] Empty response received from URL:", url);
            return false;
          }
          try {
            data = JSON.parse(responseText);
          } catch (parseError) {
            console.error("[fetchSimpleLookup] JSON parse error for URL:", url, "Error:", parseError.message);
            console.debug("[fetchSimpleLookup] Response text:", responseText);
            return false;
          }
        }
        return data;
      } catch(err) {
        if (err.name == 'AbortError'){
          // don't do anything
          // console.error("There was an error retriving the record from ", url, ". Likely from the search being aborted because the user was typing.");
        } else {
          console.error("[fetchSimpleLookup] Network error for URL:", url, "Error:", err);
        }
        return false;
      }
    },


    // returns the literal value based on the jsonld structure
    returnValue: function(input){
        let value = []
        if (Array.isArray(input)){
            input.forEach((v)=>{
                if (typeof v === 'object'){
                    if (v['@value']){
                        value.push(v['@value'])
                    }else{
                        console.warn('lookupUtility: lookup parse error, Was expecting a @value in this object:',v)
                    }
                }else if (typeof v === 'string' || typeof v === 'number'){
                    value.push(v)
                }else{
                    console.warn('lookupUtility: lookup parse error, Was expecting some sort of value here:',v)
                }
            })
        }
        return value
    },



    /**
    * Payload to pass to searchComplex
    * @typedef {searchPayload} searchPayload
    * @property {string} processor - flag to tell how to process the results, can be "lcAuthorities" or "wikidataAPI"
    * @property {string} searchValue - the search value being searched for
    * @property {array} url - array of urls to use
    */

    /**
    * A single result from searchComplex
    * @typedef {searchComplexResult} searchComplexResult
    * @property {string} label - the authorative label
    * @property {string} suggestLabel - the suggest label
    * @property {string} uri - the URI to the resource
    * @property {boolean} literal - if its a literal response or not, the literal is often added in there as an option
    * @property {boolean} depreciated - if true the term is depreciated according to the service
    * @property {string} extra - any other extra info to make available in the interface
    */

    /**
     * Tries to find the exact match of a term using the known-label lookup
     * @param {object} - the {@link searchPayload} to look for
     */
    searchExact: async function(searchPayload){
      let urlTemplate = searchPayload.url
      if (searchPayload.searchValue.length >= 3){
        let r = await this.fetchExactLookup(urlTemplate[0], searchPayload.signal)
        return r
      }
      return []
    },


    nacoLccn: async function(){

      let returnUrls = useConfigStore().returnUrls

      let r = await fetch(returnUrls.util + 'lccnnaco')
      console.log(r)
      let data = await r.json()
      return data.id

    },

    /**
    * Looks for instances by LCCN against ID, returns into for them to be displayed and load the resource
    * @param {searchPayload} searchPayload - the {@link searchPayload} to look for
    * @param {allowAbort} --
    * @return {array} - An array of {@link searchComplexResult} results
    */
    searchComplex: async function(searchPayload){
      // console.log("searchPayload",searchPayload)
        let returnUrls = useConfigStore().returnUrls

        let urlTemplate = searchPayload.url

        // console.log("######################################")
        // console.log("url ", urlTemplate)

        if (!Array.isArray(urlTemplate)){
            urlTemplate=[urlTemplate]
        }


        // if we're in lc authortities mode then check if we are doing a keyword search
        // searchtype=keyword

        if (searchPayload.processor == 'lcAuthorities'){
          for (let idx in urlTemplate){

            if (urlTemplate[idx].includes('q=?')){
              urlTemplate[idx] = urlTemplate[idx].replace('q=?','q=')+'&searchtype=keyword'
            }

          }

        }


        let results = []
        for (let url of urlTemplate) {

            // kind of hack, change to the public endpoint if we are in dev or public mode
            if (returnUrls.dev || returnUrls.publicEndpoints){
              url = url.replace('http://id.','https://id.')
              url = url.replace('https://preprod-8230.id.loc.gov','https://id.loc.gov')
              url = url.replace('https://test-8080.id.lctl.gov','https://id.loc.gov')
              url = url.replace('https://id.loc.gov','https://id.loc.gov')
              url = url.replace('https://id.loc.gov','https://id.loc.gov')
            } else { // if it's not dev or public make sure we're using 8080
              url = url.replace('https://preprod-8288.id.loc.gov','https://id.loc.gov')
            }


            url = url + "&blastdacache=" + Date.now()

            // don't allow a ? in the keyword if it is already marked as keyword search
            if (url.includes('searchtype=keyword') && url.includes('q=?')){
              url = url.replace('q=?','q=')
            }

            let r = await this.fetchSimpleLookup(url, false, searchPayload.signal)

            //Config only allows 25 results, this will add something to the results
            // to let the user know there are more names.
            let overflow = 0
            if (r.hits && r.hits.length < r.count){
              // It looks like the count is 1 more than the number of hits, why?
              overflow = (r.count - r.hits.length)
            }

            if (r.hits && searchPayload.processor == 'lcAuthorities'){
                // process the results as a LC suggest service
                // console.log("URL",url)
                // console.log("r",r)
                for (let hit of r.hits){
                  let hitAdd = {
                    collections: hit.more.collections ? hit.more.collections : [],
                    label: hit.aLabel,
                    vlabel: hit.vLabel,
                    suggestLabel: hit.suggestLabel,
                    uri: hit.uri,
                    literal:false,
                    depreciated: false,
                    extra: hit.more,
                    total: r.count,
                    undifferentiated: false
                  }

                  if (hitAdd.label=='' && hitAdd.suggestLabel.includes('DEPRECATED')){
                    hitAdd.label  = hitAdd.suggestLabel.split('(DEPRECATED')[0] + ' DEPRECATED'
                    hitAdd.depreciated = true
                  }
                  if (hit.more && hit.more.undifferentiated && hit.more.undifferentiated == 'Name not-unique'){
                    hitAdd.undifferentiated = true
                  }
                  results.push(hitAdd)
                }


                // Old suggest service below

                // let labels = r[1]
                // let uris = r[3]
                // for (let i = 0; i <= labels.length; i++) {
                //   if (uris[i]!= undefined){
                //       results.push({
                //         label: labels[i],
                //         uri: uris[i],
                //         extra: ''

                //       })
                //   }
                // }

            } else if (r.search && searchPayload.processor == 'wikidataAPI'){
                for (let hit of r.search){
                  results.push({
                    label: hit.label || (hit.display && hit.display.label) || "Unknown Label",
                    suggestLabel: hit.label || (hit.display && hit.display.label) || "Unknown Label",
                    uri: hit.concepturi,
                    literal: false,
                    extra: hit.description ? { description: hit.description } : {}
                  })
                }
            }

        }

        // always add in the literal they searched for at the end
        // if it is not a hub or work

        if (!searchPayload.url[0].includes('/works/') && !searchPayload.url[0].includes('/hubs/')){
          results.push({
            label: searchPayload.searchValue,
            // Add explicit properties to ensure parent component can access the value
            title: searchPayload.searchValue,
            displayLabel: searchPayload.searchValue,
            rdfsLabel: searchPayload.searchValue,
            uri: null,
            literal: true,
            extra: '',
            fullText: searchPayload.searchValue // Ensure the full text is preserved
          })
        }

        // console.log(results,"<results")
        return results

    },




    /**
    * What is returned from the context request
    * @typedef {contextResult} contextResult
    * @property {boolean} contextValue - xxxxxxxxx
    * @property {array} source - xxxxxxxxx
    * @property {string} type - xxxxxxxxx
    * @property {string} typeFull - xxxxxxxxx
    * @property {string} aap - xxxxxxxxx
    * @property {array} variant - xxxxxxxxx
    * @property {string} uri - xxxxxxxxx
    * @property {string} title - xxxxxxxxx
    * @property {array} contributor - xxxxxxxxx
    * @property {string} date - xxxxxxxxx
    * @property {string} genreForm - xxxxxxxxx
    * @property {object} nodeMap - xxxxxxxxx
    */

    /**
    * Kicks off the main process to return details about a URI, this is used in the
    * complex lookup modal
    * @param {string} uri - The URI to use, probably a id.loc.gov link
    * @return {array} - An array of {@link contextResult} results
    */
    returnContext: async function(uri){
      let returnUrls = useConfigStore().returnUrls
      let results
      let d
      try {
        d = await this.fetchContextData(uri)
        d.uri = uri
      } catch {
        return false
      }

      if (d && uri.includes('resources/works/') || uri.includes('resources/hubs/')){
        results = await this.extractContextDataWorksHubs(d)
      }else if (d){
        results =  this.extractContextData(d)
      }

      return results
    },

    /**
    * Talks to the server, a lot of ID logic
    * @param {string} uri  - The URI to use, probably a id.loc.gov link
    * @return {object} - the data response
    */
    fetchContextData: async function(uri){
          let returnUrls = useConfigStore().returnUrls

          if ((uri.startsWith('http://id.loc.gov') || uri.startsWith('https://id.loc.gov')) && uri.match(/(authorities|vocabularies)/)) {
            var jsonuri = uri + '.madsrdf_raw.jsonld';




          }else if (uri.includes('resources/works/') || uri.includes('resources/hubs/')){

            jsonuri = uri + '.bibframe.json';

          }else if (uri.includes('http://www.wikidata.org/entity/')){
            jsonuri = uri.replace('http://www.wikidata.org/entity/','https://www.wikidata.org/wiki/Special:EntityData/')
            jsonuri = jsonuri + '.json';
          } else {
            jsonuri = uri + '.jsonld';
          }



          //if we are in production use preprod
          // if (returnUrls.env == 'production'){
            if (returnUrls.env == 'production'){
            jsonuri = jsonuri.replace('http://id.', 'https://id.')
            jsonuri = jsonuri.replace('https://id.', 'https://id.')
          }

          // rewrite the url to the config if we are using staging
          if (returnUrls.env == 'staging' && !returnUrls.dev){
            let stageUrlPrefix = returnUrls.id.split('loc.gov/')[0]


            // console.log('stageUrlPrefix',stageUrlPrefix)

            jsonuri = jsonuri.replace('http://id.', stageUrlPrefix)
            jsonuri = jsonuri.replace('https://id.', stageUrlPrefix)
          }
          // console.log(jsonuri)
          // console.log(returnUrls)



          // unless we are in a dev or public mode

          if (returnUrls.dev || returnUrls.publicEndpoints){
            jsonuri = jsonuri.replace('http://id.','https://id.')
            jsonuri = jsonuri.replace('https://preprod-8230.id.loc.gov','https://id.loc.gov')
            jsonuri = jsonuri.replace('https://test-8080.id.lctl.gov','https://id.loc.gov')
            jsonuri = jsonuri.replace('https://id.loc.gov','https://id.loc.gov')
            jsonuri = jsonuri.replace('http://id.loc.gov','https://id.loc.gov')
            jsonuri = jsonuri.replace('https://preprod-8288.id.loc.gov','https://id.loc.gov')
          }

          if (jsonuri.includes('gpo_') && jsonuri.includes('preprod') ){
            jsonuri = jsonuri.replace('https://id.','https://id.')
          }
          jsonuri = jsonuri.replace('http://','https://')

          
          try{
            let response = await fetch(jsonuri);
            let data =  await response.json()
            return  data;

          }catch(err){
            console.error(err);

            // Handle errors here
          }


    },


    /**
    * Extract data from the data for hubs
    * @param {object} data - The URI to use, probably a id.loc.gov link
    * @return {array} - An array of {@link contextResult} results
    */
    extractContextDataWorksHubs: async function(data){
      let returnUrls = useConfigStore().returnUrls

      console.log("extractContextDataWorksHubs called with data:", {
        uri: data.uri,
        isHub: data.uri.includes('/hubs/'),
        dataKeys: data ? Object.keys(data) : 'no data',
        hasGraph: data && data['@graph'] ? data['@graph'].length : 'no @graph'
      });

      var results = { contextValue: true, source: [], type: null, typeFull: null, aap:null, variant : [], uri: data.uri, title: null, contributor:[], date:null, genreForm: null, nodeMap:{}, marcKey: null};

      if (data.uri.includes('/works/')){
        results.type = 'Work'
        results.typeFull='http://id.loc.gov/ontologies/bibframe/Work'
      }else{
        results.type = 'Hub'
        results.typeFull='http://id.loc.gov/ontologies/bibframe/Hub'
      }

      // Handle both @graph and direct array formats
      let dataArray = data;
      if (data['@graph']) {
        dataArray = data['@graph'];
      }

      let instances = []

      // grab the title
      for (let val of dataArray){

        if (val['@id']){
          if (val['@id'] == data.uri){
            console.log("ExtractContextDataWorksHubs - Processing main Hub entity:", {
              id: val['@id'],
              keys: Object.keys(val),
              hasMarcKey: !!val['http://id.loc.gov/ontologies/bflc/marcKey'],
              hasLabel: !!val['http://www.w3.org/2000/01/rdf-schema#label'],
              hasAAP: !!val['http://id.loc.gov/ontologies/bflc/aap'],
              fullMarcKeyData: val['http://id.loc.gov/ontologies/bflc/marcKey'],
              fullLabelData: val['http://www.w3.org/2000/01/rdf-schema#label']
            });
            
            // this is the main graph
            for (let k in val){
              //add the marcKey to the nodeMap, so nothing needs to happen downstream //here
              if (k == 'http://id.loc.gov/ontologies/bflc/marcKey'){
                try {
                  if (val[k] && Array.isArray(val[k]) && val[k][0]) {
                    if (typeof val[k][0] === 'string') {
                      results.nodeMap["marcKey"] = [val[k][0]]
                      results.marcKey = [val[k][0]]
                    } else if (val[k][0]['@value']) {
                      results.nodeMap["marcKey"] = [val[k][0]['@value']]
                      results.marcKey = [val[k][0]['@value']]
                    }
                    console.log("ExtractContextDataWorksHubs - Successfully extracted marcKey:", results.marcKey, "from data:", val[k]);
                  }
                } catch (err) {
                  console.warn("Error extracting marcKey:", err, val[k]);
                }
              }
              //find the title
              if (k == 'http://www.w3.org/2000/01/rdf-schema#label'){
                try {
                  if (val[k] && Array.isArray(val[k]) && val[k][0]) {
                    if (typeof val[k][0] === 'string') {
                      results.title = val[k][0]
                    } else if (val[k][0]['@value']) {
                      results.title = val[k][0]['@value']
                    }
                    console.log("ExtractContextDataWorksHubs - Successfully extracted title:", results.title, "from data:", val[k]);
                  }
                } catch (err) {
                  console.warn("Error extracting title:", err, val[k]);
                }
              }

              if (k == 'http://id.loc.gov/ontologies/bflc/aap'){
                try {
                  if (val[k] && Array.isArray(val[k]) && val[k][0]) {
                    if (typeof val[k][0] === 'string') {
                      results.aap = val[k][0]
                    } else if (val[k][0]['@value']) {
                      results.aap = val[k][0]['@value']
                    }
                    console.log("Successfully extracted aap:", results.aap);
                  }
                } catch (err) {
                  console.warn("Error extracting aap:", err, val[k]);
                }
              }



              if (k == 'http://id.loc.gov/ontologies/bibframe/hasInstance'){
                let counter = 1
                for (let i of val['http://id.loc.gov/ontologies/bibframe/hasInstance']){
                  if (counter>4){
                    break
                  }
                  counter++

                  let url = i['@id']
                  
                  if (url.includes('/instances/') || url.includes('/works/') || url.includes('/hubs/')){
                    if (returnUrls.env === 'production'){
                      url = url.replace('https://id.','https://id.')
                      url = url.replace('http://id.','http://id.')
                    }
                  }

                  if (returnUrls.dev || returnUrls.publicEndpoints){
                    url = url.replace('http://id.','https://id.')
                    url = url.replace('https://preprod-8230.id.loc.gov','https://id.loc.gov')
                    url = url.replace('https://test-8080.id.lctl.gov','https://id.loc.gov')
                    url = url.replace('https://id.loc.gov','https://id.loc.gov')
                    url = url.replace('http://id.loc.gov','https://id.loc.gov')
                    url = url.replace('https://preprod-8288.id.loc.gov','https://id.loc.gov')
                  }




                  let response = await fetch(url.replace('http://','https://')+'.nt');
                  let text  = await response.text()

                  let instanceText = ""
                  for (let line of text.split('\n')){


                    if (line.includes(`<${i["@id"]}> <http://www.w3.org/2000/01/rdf-schema#label>`)){
                      let t = line.split('>')[2]
                      t= t.split('@')[0]
                      t = t.replaceAll('"','')
                      t= t.replace(' .','')
                      instanceText = instanceText + t
                    }
                    if (line.includes(`<${i["@id"]}> <http://id.loc.gov/ontologies/bibframe/provisionActivityStatement>`)){
                      let t = line.split('>')[2]
                      t= t.split('@')[0]
                      t = t.replaceAll('"','')
                      t= t.replace(' .','')
                      instanceText = instanceText + t
                    }



                  }
                  instances.push(instanceText)



                  // https://id.loc.gov/resources/instances/18109312.nt

                }


              }




            }

          }


          // subjects
          if (val['http://www.loc.gov/mads/rdf/v1#isMemberOfMADSScheme']){

            if (!results.nodeMap['Subjects']){
              results.nodeMap['Subjects'] = []
            }

            if (val['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']){
              results.nodeMap['Subjects'].push(val['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]['@value'])
            }


          }



        }

      }


      if (!results.title){
        results.title = results.aap
      }


      if (instances.length>0){
        results.nodeMap['Instances'] = instances
      }

      // Enhanced logging for Hub context extraction results
      console.log("ExtractContextDataWorksHubs - Final results:", {
        uri: results.uri,
        title: results.title,
        marcKey: results.marcKey,
        nodeMapMarcKey: results.nodeMap.marcKey,
        nodeMapKeys: Object.keys(results.nodeMap),
        hasValidMarcKey: !!(results.marcKey && results.marcKey.length > 0),
        hasValidTitle: !!results.title
      });

      return results
    },

    /**
    * Extract data from the data not hubs
    * @param {object} data - The URI to use, probably a id.loc.gov link
    * @return {array} - An array of {@link contextResult} results
    */
    extractContextData: function(data){
      data.uri = data.uri.replace("https://", "http://id.loc.gov/")

          var results = {
            contextValue: true,
            source: [],
            type: null,
            typeFull: null,
            variant : [],
            uri: data.uri,
            title: [],
            marcKey: [],
            contributor:[],
            date:null,
            genreForm: null,
            nodeMap:{},
            extra: {}, // Initialize extra object for all responses
            useMADSRDF: true, // Add flag to force MADS RDF format for Wikidata entities
          };
          if (data.uri.includes('wikidata.org')){
              if (data.entities){
                  let qid = Object.keys(data.entities)[0];
                  if (data.entities[qid].labels && data.entities[qid].labels.en){
                      results.title = data.entities[qid].labels.en.value;
                  }
                  if (data.entities[qid].descriptions && data.entities[qid].descriptions.en){
                      results.extra.description = data.entities[qid].descriptions.en.value;
                  }
                  if (data.entities[qid].aliases && data.entities[qid].aliases.en){
                      data.entities[qid].aliases.en.forEach(alias => {
                          results.variant.push(alias.value);
                      });
                  }
                  
                  // Check for P31 (instance of) claim
                  if (data.entities[qid].claims && data.entities[qid].claims.P31){
                      // Look at all P31 claims, not just the first one
                      for (let p31Claim of data.entities[qid].claims.P31) {
                          if (p31Claim.mainsnak && p31Claim.mainsnak.datavalue && p31Claim.mainsnak.datavalue.value){
                              let typeId = p31Claim.mainsnak.datavalue.value.id;
                              let typeUri = this.wikidataTypeToRdf(typeId);
                              if (typeUri) {
                                  results.type = typeUri;
                                  results.typeFull = "http://www.loc.gov/mads/rdf/v1#" + typeUri;
                                  break;
                              }
                          }
                      }
                  }
                  
                  // If no type was determined and we have a description, try to guess
                  if (!results.type && results.extra.description) {
                      results.type = this.guessTypeFromDescription(results.extra.description);
                      if (results.type) {
                          results.typeFull = "http://www.loc.gov/mads/rdf/v1#" + results.type;
                      }
                  }
                  
                  // If we still don't have a type, default to Topic
                  if (!results.type) {
                      results.type = "Topic";
                      results.typeFull = "http://www.loc.gov/mads/rdf/v1#Topic";
                  }
                  
                  // Save Wikidata QID explicitly for reference 
                  results.wikidataQID = qid;
                  results.wikidataURI = "http://www.wikidata.org/entity/" + qid;
              }
          } else if (
              data.uri.includes('id.loc.gov/resources/works/')
          ){
            let uriIdPart = data.uri.split('/').slice(-1)[0]

            //find the right graph
            for (let g of data){
              if (
                    g
                    && g['@id']
                    && (
                      g['@id'].endsWith(`/works/${uriIdPart}`)
                      || g['@id'].endsWith(`/instances/${uriIdPart}`)
                      || g['@id'].endsWith(`/hubs/${uriIdPart}`)
                    )
              ){
                if (
                  (g['@id'].endsWith(`/works/${uriIdPart}`) && data.uri.includes('id.loc.gov/resources/works/')) ||
                  (g['@id'].endsWith(`/instances/${uriIdPart}`) && data.uri.includes('id.loc.gov/resources/instances/')) ||
                  (g['@id'].endsWith(`/hubs/${uriIdPart}`) && data.uri.includes('id.loc.gov/resources/hubs/'))
                ){
                  if (g['http://www.w3.org/2000/01/rdf-schema#label'] && g['http://www.w3.org/2000/01/rdf-schema#label'][0]){
                    results.title = g['http://www.w3.org/2000/01/rdf-schema#label'][0]['@value']
                  }else if (g['http://id.loc.gov/ontologies/bflc/aap'] && g['http://id.loc.gov/ontologies/bflc/aap'][0]){
                    results.title = g['http://id.loc.gov/ontologies/bflc/aap'][0]['@value']
                  }

                  if (g['@type'] && g['@type'][0]){
                    results.type = this.rdfType(g['@type'][0])
                    results.typeFull = g['@type'][0]
                  }
                }
              }
            }
            // console.log(uriIdPart)
          }else{
            // if it is in jsonld format
            if (data['@graph']){
              data = data['@graph'];
            }

            var nodeMap = {};

            data.forEach(function(n){
              if (n['http://www.loc.gov/mads/rdf/v1#birthDate']){
                nodeMap['Birth Date'] = n['http://www.loc.gov/mads/rdf/v1#birthDate'].map(function(d){ return d['@value']})
              }
              if (n['http://www.loc.gov/mads/rdf/v1#birthPlace']){
                nodeMap['Birth Place'] = n['http://www.loc.gov/mads/rdf/v1#birthPlace'].map(function(d){ return d['@id']})
              }

              if (n['http://www.loc.gov/mads/rdf/v1#associatedLocale']){
                nodeMap['Associated Locale'] = n['http://www.loc.gov/mads/rdf/v1#associatedLocale'].map(function(d){ return d['@id']})
              }
              if (n['http://www.loc.gov/mads/rdf/v1#fieldOfActivity']){
                nodeMap['Field of Activity'] = n['http://www.loc.gov/mads/rdf/v1#fieldOfActivity'].map(function(d){ return d['@id']})
              }
              if (n['http://www.loc.gov/mads/rdf/v1#gender']){
                nodeMap['Gender'] = n['http://www.loc.gov/mads/rdf/v1#gender'].map(function(d){ return d['@id']})
              }
              if (n['http://www.loc.gov/mads/rdf/v1#occupation']){
                nodeMap['Occupation'] = n['http://www.loc.gov/mads/rdf/v1#occupation'].map(function(d){ return d['@id']})
              }
              if (n['http://www.loc.gov/mads/rdf/v1#associatedLanguage']){
                nodeMap['Associated Language'] = n['http://www.loc.gov/mads/rdf/v1#associatedLanguage'].map(function(d){ return d['@id']})
              }
              if (n['http://www.loc.gov/mads/rdf/v1#deathDate']){
                nodeMap['Death Date'] = n['http://www.loc.gov/mads/rdf/v1#deathDate'].map(function(d){ return d['@value']})
              }
              if (n['http://www.loc.gov/mads/rdf/v1#hasBroaderAuthority']){
                nodeMap['Has Broader Authority'] = n['http://www.loc.gov/mads/rdf/v1#hasBroaderAuthority'].map(function(d){ return d['@id']})
              }
              if (n['http://www.loc.gov/mads/rdf/v1#hasNarrowerAuthority']){
                nodeMap['Has Narrower Authority'] = n['http://www.loc.gov/mads/rdf/v1#hasNarrowerAuthority'].map(function(d){ return d['@id']})
              }
              if (n['http://www.loc.gov/mads/rdf/v1#isMemberOfMADSCollection']){
                nodeMap['MADS Collection'] = n['http://www.loc.gov/mads/rdf/v1#isMemberOfMADSCollection'].map(function(d){ return d['@id']})
              }
              if (n['http://www.loc.gov/mads/rdf/v1#code'] && n['http://id.loc.gov/datatypes/codes/gac'] && n['http://www.loc.gov/mads/rdf/v1#code'][0]['@type'] == 'http://id.loc.gov/datatypes/codes/gac') {
                nodeMap['GAC(s)'] = n['http://www.loc.gov/mads/rdf/v1#code'].map(function(d){
                        if (d['@type'] == 'http://id.loc.gov/datatypes/codes/gac') {
                            return d['@value']
                        }
                    })
              }
              if ( n['@type'].includes('http://id.loc.gov/ontologies/lcc#ClassNumber') !== false ){
                if (!nodeMap['LC Classification']){
                  nodeMap['LC Classification'] = []
                }
                if (n['http://www.loc.gov/mads/rdf/v1#code'] && n['http://id.loc.gov/ontologies/bibframe/assigner']){
                  nodeMap['LC Classification'].push(`${n['http://www.loc.gov/mads/rdf/v1#code'][0]['@value']} (${n['http://id.loc.gov/ontologies/bibframe/assigner'][0]['@id'].split('/').pop()})`)
                }else if (n['http://www.loc.gov/mads/rdf/v1#code']){
                  nodeMap['LC Classification'].push(n['http://www.loc.gov/mads/rdf/v1#code'][0]['@value'])
                }
              }
              if (n['http://www.loc.gov/mads/rdf/v1#classification']){
                nodeMap['Classification'] = n['http://www.loc.gov/mads/rdf/v1#classification'].map(function(d){ return d['@value']})
                nodeMap['Classification'] = nodeMap['Classification'].filter((v)=>{(v)})
              }

            })

            // pull out the labels
            data.forEach(function(n){

              // loop through all the possible types of row
              Object.keys(nodeMap).forEach(function(k){
                if (!results.nodeMap[k]) { results.nodeMap[k] = [] }
                // loop through each uri we have for this type
                //console.log(nodeMap[k])
                nodeMap[k].forEach(function(uri){

                  if (k == 'MADS Collection'){
                    if (results.nodeMap[k].indexOf(uri.split('/').slice(-1)[0].replace('collection_',''))==-1){
                      results.nodeMap[k].push(uri.split('/').slice(-1)[0].replace('collection_',''))
                    }
                  }else if (k == 'Classification'){
                    if (nodeMap[k].length>0){
                      results.nodeMap[k]=nodeMap[k]
                    }
                  } else if (k == 'LC Classification'){
                    if (nodeMap[k].length>0){
                      results.nodeMap[k]=nodeMap[k]
                    }

                  } else if (k == 'GAC(s)'){
                    if (nodeMap[k].length>0){
                      results.nodeMap[k]=nodeMap[k]
                    }
                  } else if (k == 'marcKey'){
                    if (nodeMap[k].length>0){
                      results.nodeMap[k]=nodeMap[k]
                    }
                  } else if (n['@id'] && n['@id'] == uri){
                    if (n['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']){
                      n['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'].forEach(function(val){
                        if (val['@value']){
                          results.nodeMap[k].push(val['@value']);
                        }
                      })
                    }else if (n['http://www.w3.org/2000/01/rdf-schema#label']){
                      n['http://www.w3.org/2000/01/rdf-schema#label'].forEach(function(val){
                        if (val['@value']){
                          results.nodeMap[k].push(val['@value']);
                        }
                      })
                    }else{
                      console.log("NO label found for ",n)

                    }

                  }else if (uri.includes('id.loc.gov')){

                    // just add the uri slug if it is a ID uri, we don't want to look up in real time
                    let slug = uri.split('/').slice(-1)[0]
                    if (results.nodeMap[k].indexOf(slug)==-1){
                      results.nodeMap[k].push(slug)
                    }
                  }
                })
              })
            })
            //Make sure to maintain the source order
            let sourceOrder = []
            data.forEach((n) => {
              if (n["http://www.loc.gov/mads/rdf/v1#hasSource"]){
                sourceOrder = n["http://www.loc.gov/mads/rdf/v1#hasSource"].map((source) => source["@id"])
              }
            })

            results.source = sourceOrder
            // populate with the sourceOrder, this will allow .splice() to insert citation in the right place

            data.forEach((n)=>{
              var variant = '';
              var citation = '';
              // var seeAlso = '';
              var title = [];
              var marcKey = [];
              let sourceId = ''

              if (n['http://www.loc.gov/mads/rdf/v1#citation-source']) {
                citation = citation + " Source: " + n['http://www.loc.gov/mads/rdf/v1#citation-source'].map(function (v) { return v['@value'] + ' '; })
                sourceId = n["@id"]
              }
              if (n['http://www.loc.gov/mads/rdf/v1#citation-note']) {
                citation = citation + " Note: " + n['http://www.loc.gov/mads/rdf/v1#citation-note'].map(function (v) { return v['@value'] + ' '; })
                sourceId = n["@id"]
              }
              if (n['http://www.loc.gov/mads/rdf/v1#citation-status']) {
                citation = citation + " Status: " + n['http://www.loc.gov/mads/rdf/v1#citation-status'].map(function (v) { return v['@value'] + ' '; })
                sourceId = n["@id"]
              }
              if (n['http://www.loc.gov/mads/rdf/v1#citationSource']) {
                citation = citation + " Source: " + n['http://www.loc.gov/mads/rdf/v1#citationSource'].map(function (v) { return v['@value'] + ' '; })
                sourceId = n["@id"]
              }
              if (n['http://www.loc.gov/mads/rdf/v1#citationNote']) {
                citation = citation + " Note: " + n['http://www.loc.gov/mads/rdf/v1#citationNote'].map(function (v) { return v['@value'] + ' '; })
                sourceId = n["@id"]
              }
              if (n['http://www.loc.gov/mads/rdf/v1#citationStatus']) {
                citation = citation + " Status: " + n['http://www.loc.gov/mads/rdf/v1#citationStatus'].map(function (v) { return v['@value'] + ' '; })
                sourceId = n["@id"]
              }



              if (n['http://www.loc.gov/mads/rdf/v1#variantLabel']) {
                variant = variant + n['http://www.loc.gov/mads/rdf/v1#variantLabel'].map(function (v) { return v['@value'] + ' '; })
              }

              // if (n['http://www.w3.org/2000/01/rdf-schema#seeAlso']) {
              //   seeAlso = seeAlso + n['http://www.w3.org/2000/01/rdf-schema#seeAlso'].map(function (v) { return v['@value'] + ' '; })
              // }




              if (n['@id'] && n['@id'] == data.uri && n['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']){
                // don't mush them together anymore add them along with their lang value
                // title = title + n['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'].map(function (v) { return v['@value'] + ' '; })
                console.log('Found authoritative label');
              }
            });

            return results;
          }
    },

    // Generates MARC preview from MARC XML
    marcPreview: async function(marcXml, htmlFormat = false) {
      if (!marcXml) return [];
      const fallbackPreview = (xml) => [{ marc: xml, preview: htmlFormat ? `<div class="marc-preview">${xml}</div>` : xml }];

      try {
        const returnUrls = useConfigStore().returnUrls || {};
        if (returnUrls.util) {
          let url = returnUrls.util + 'marcpreview';
          url = url + (htmlFormat ? '/html' : '/text');
          const rawResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ rdfxml: marcXml })
          });

          if (!rawResponse.ok) {
            console.warn('[marcPreview] non-OK response', rawResponse.status);
          } else {
            // Try to safely extract content in multiple ways
            let content = null;
            const contentType = (rawResponse.headers.get('content-type') || '').toLowerCase();
            try {
              if (contentType.includes('application/json') || contentType.includes('json')) {
                content = await rawResponse.json();
              } else {
                // Some servers return JSON-like text or empty body; try parsing text first
                const txt = await rawResponse.text();
                if (txt && txt.trim() !== '') {
                  try {
                    content = JSON.parse(txt);
                  } catch (err) {
                    // Not JSON, treat as raw marc output
                    content = txt;
                  }
                } else {
                  // empty body
                  content = null;
                }
              }
            } catch (err) {
              console.warn('[marcPreview] parse error', err);
              content = null;
            }

            // Normalize into expected array format
            const normalizeItem = (item) => {
              // If item is a plain string, treat as marc stdout
              if (typeof item === 'string') {
                return { 
                  marc: item, 
                  preview: htmlFormat ? `<div class="marc-preview">${item}</div>` : item,
                  version: 'current',
                  name: 'current'
                };
              }

              // If item already has marc/preview shape
              const marcVal = item && (item.marc || (item.results && item.results.stdout) || item.stdout || item.value || item.output || null);
              const previewVal = item && (item.preview || item.html || item.preview_html || item.marcRecord || null);
              
              // Extract version information from various possible locations
              const versionVal = item && (
                item.version || 
                item.name || 
                (item.results && (item.results.version || item.results.name)) ||
                (item.metadata && (item.metadata.version || item.metadata.name)) ||
                'current'
              );

              return {
                marc: marcVal || marcXml,
                preview: previewVal || (htmlFormat ? `<div class="marc-preview">${marcVal || marcXml}</div>` : (marcVal || marcXml)),
                version: versionVal,
                name: versionVal,
                // keep original results for debugging if present
                results: item && item.results ? item.results : (item && item.stdout ? { stdout: item.stdout } : {})
              };
            };

            if (Array.isArray(content)) {
              const out = content.map(normalizeItem);
              return out;
            } else if (content && typeof content === 'object') {
              // object response, possibly { marc:..., preview:... } or { results: { stdout: ... }, preview: ... }
              return [normalizeItem(content)];
            } else if (typeof content === 'string') {
              // raw string marc output
              return [normalizeItem(content)];
            }
          }
        }
      } catch (err) {
        console.error('[marcPreview] error', err);
      }

      // fallback
      return fallbackPreview(marcXml);
    },

    // Add searchSavedRecords to query saved records endpoints
    searchSavedRecords: async function(user, search) {
      try {
        const returnUrls = useConfigStore().returnUrls || {};
        const utilUrl = returnUrls.util || '';
        const utilPath = returnUrls.env || '';

        let url;
        if (user && !search) {
          url = `${utilUrl}myrecords/${utilPath}/${user}`;
        } else if (user && search) {
          url = `${utilUrl}allrecords/${utilPath}/${search}/${user}`;
        } else {
          url = `${utilUrl}allrecords/${utilPath}/`;
        }

        const r = await this.fetchSimpleLookup(url);
        if (r !== false && r !== null) {
          const results = [];
          // normalise object keyed by id into array
          if (Array.isArray(r)) {
            for (const it of r) results.push(it);
          } else if (typeof r === 'object') {
            for (const k in r) {
              if (Object.prototype.hasOwnProperty.call(r, k)) results.push(r[k]);
            }
          }
          // sort by timestamp/time if present
          results.sort((a, b) => {
            const at = (a && (a.timestamp || a.time)) ? Number(a.timestamp || a.time) : 0;
            const bt = (b && (b.timestamp || b.time)) ? Number(b.timestamp || b.time) : 0;
            return bt - at;
          });
          console.log('[searchSavedRecords] Records data received:', results);
          return results;
        }
      } catch (err) {
        console.error('[searchSavedRecords] error', err);
      }
      return [];
    },

    // Add loadSavedRecord to fetch a saved record from the backend
    loadSavedRecord: async function(identifier) {
      try {
        const returnUrls = useConfigStore().returnUrls || {};
        // prefer LDPJS if configured (upstream pattern), otherwise use util/getrecord
        if (returnUrls.ldpjs && identifier) {
          const url = `${returnUrls.ldpjs}ldp/${identifier}`;
          console.log('[loadSavedRecord] Fetching LDPJS saved record from:', url);
          const response = await fetch(url, { method: 'GET' });
          if (!response.ok) { console.warn('[loadSavedRecord] non-OK LDPJS response', response.status); return false; }
          const text = await response.text();
          return text;
        }

        // fallback to util endpoint
        const idPart = encodeURIComponent(identifier);
        const url = `${returnUrls.util}getrecord/${returnUrls.env}/${idPart}`;
        console.log('[loadSavedRecord] Fetching saved record from:', url);
        const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (!response.ok) {
          console.warn('[loadSavedRecord] Non-OK response:', response.status);
          return false;
        }
        const data = await response.json();
        // normalize common response shapes
        if (data.record) return data.record;
        if (data.results && Array.isArray(data.results)) return data.results;
        return data;
      } catch (err) {
        console.error('[loadSavedRecord] Error loading saved record:', err);
        return false;
      }
    },

    // Replace/robustify the version check to handle different remote formats
    checkVersionOutOfDate: async function() {
      try {
        const returnUrls = useConfigStore().returnUrls || {};
        const versionPath = (returnUrls.env === 'production') ? 'version/editor' : 'version/editor/stage';
        const url = `${returnUrls.util}${versionPath}?blastdacache=${Date.now()}`;

        const rawResponse = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (!rawResponse.ok) {
          console.warn('[checkVersionOutOfDate] version endpoint returned', rawResponse.status);
          return false;
        }

        const remote = await rawResponse.json();
        const cfg = useConfigStore();
        const toNumber = (v) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        };

        const ourVer = toNumber(cfg.versionMajor) + toNumber(cfg.versionMinor) * 0.1 + toNumber(cfg.versionPatch) * 0.01;

        let remoteVer = 0;
        // remote may be {major,minor,patch} or {version: '1.2.3'} or a single numeric/string value
        if (remote && typeof remote === 'object') {
          if (remote.version !== undefined && remote.version !== null) {
            if (typeof remote.version === 'string' && remote.version.includes('.')) {
              const parts = remote.version.split('.');
              remoteVer = toNumber(parts[0]) + toNumber(parts[1] || 0) * 0.1 + toNumber(parts[2] || 0) * 0.01;
            } else {
              remoteVer = toNumber(remote.version);
            }
          } else if (remote.major !== undefined) {
            remoteVer = toNumber(remote.major) + toNumber(remote.minor) * 0.1 + toNumber(remote.patch) * 0.01;
          } else {
            // last resort, try to coerce
            remoteVer = toNumber(remote);
          }
        } else {
          remoteVer = toNumber(remote);
        }

        console.log('[checkVersionOutOfDate] ourVer:', ourVer, 'remoteVer:', remoteVer);
        return ourVer < remoteVer;
      } catch (err) {
        console.error('[checkVersionOutOfDate] error:', err);
        return false;
      }
    },

    // Save a record to the backend (XML string and optional identifier)
    saveRecord: async function(xmlString, identifier=null, options={}){
      try {
        const returnUrls = useConfigStore().returnUrls || {};
        // If ldpjs configured and identifier provided, use PUT to LDPJS (upstream pattern)
        if (returnUrls.ldpjs && identifier) {
          const url = `${returnUrls.ldpjs}ldp/${identifier}`;
          console.log('[saveRecord] PUT to LDPJS:', url);
          const putMethod = {
            method: 'PUT',
            headers: { 'Content-Type': 'application/xml' },
            body: xmlString
          };
          const r = await fetch(url, putMethod);
          if (!r.ok) { console.warn('[saveRecord] LDPJS save non-OK', r.status); return false; }
          const text = await r.text();
          return { status: true, body: text };
        }

        // Otherwise use util/saverecord endpoint if configured
        const idPart = identifier ? `/${encodeURIComponent(identifier)}` : '';
        const url = `${returnUrls.util}saverecord/${returnUrls.env}${idPart}`;
        console.log('[saveRecord] Posting to:', url);
        const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
        const body = JSON.stringify({ xml: xmlString, options: options });
        const resp = await fetch(url, { method: 'POST', headers, body });
        if (!resp.ok) {
          const txt = await resp.text().catch(()=>null);
          console.warn('[saveRecord] non-OK response', resp.status, txt);
          return false;
        }
        // server may respond with json or plain text
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          return await resp.json();
        }
        return await resp.text();
      } catch (err) {
        console.error('[saveRecord] error saving record:', err);
        return false;
      }
    },

    /**
     * Publishes a record to Alma/backend publishing service
     * @async
     * @param {string} xmlString - The XML content to publish
     * @param {object} profile - The profile object containing record metadata  
     * @param {string} publishUrl - The URL to publish to
     * @return {Promise<object>} - Response from publishing service
     */
    publishRecord: async function(xmlString, profile, publishUrl) {
      try {
        console.log('[publishRecord] Publishing to:', publishUrl);
        
        if (!xmlString) {
          throw new Error('No XML content provided for publishing');
        }
        
        if (!publishUrl) {
          throw new Error('No publish URL provided');
        }

        const headers = { 
          'Accept': 'application/json', 
          'Content-Type': 'application/json' 
        };
        
        // Format the request body to match the expected server format
        const requestBody = {
          name: profile?.neweId || profile?.eId || crypto.randomUUID(),
          rdfxml: xmlString,
          eid: profile?.eId || profile?.neweId
        };
        
        console.log('[publishRecord] Request body structure:', {
          hasName: !!requestBody.name,
          hasRdfxml: !!requestBody.rdfxml,
          hasEid: !!requestBody.eid,
          xmlLength: requestBody.rdfxml ? requestBody.rdfxml.length : 0
        });
        
        const body = JSON.stringify(requestBody);
        
        const response = await fetch(publishUrl, { 
          method: 'POST', 
          headers, 
          body 
        });
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => null);
          console.warn('[publishRecord] non-OK response', response.status, errorText);
          
          // Try to get more details about the server error
          console.error('[publishRecord] Response headers:', Object.fromEntries(response.headers.entries()));
          console.error('[publishRecord] Response status text:', response.statusText);
          console.error('[publishRecord] Response URL:', response.url);
          
          // Try to parse error text as JSON to get more details
          let serverError = null;
          if (errorText) {
            try {
              serverError = JSON.parse(errorText);
              console.error('[publishRecord] Parsed server error:', serverError);
            } catch (e) {
              console.error('[publishRecord] Raw server error text:', errorText);
            }
          }
          
          throw new Error(`Publishing failed with status ${response.status}: ${errorText}`);
        }
        
        // Parse response based on content type
        const contentType = response.headers.get('content-type') || '';
        let result;
        
        if (contentType.includes('application/json')) {
          result = await response.json();
        } else {
          const textResult = await response.text();
          // Try to parse as JSON in case content-type header is wrong
          try {
            result = JSON.parse(textResult);
          } catch {
            result = { status: true, message: textResult };
          }
        }
        
        console.log('[publishRecord] Success:', result);
        return result;
        
      } catch (error) {
        console.error('[publishRecord] Error during publish:', error);
        throw error;
      }
    },

    /**
     * Posts instance data to the server
     * @async
     * @param {Object} requestData - Object containing name, rdfxml, and eid
     * @return {Object} - Server response
     */
    postInstanceToServer: async function(requestData) {
      try {
        console.log('[postInstanceToServer] Posting instance data:', {
          hasName: !!requestData.name,
          hasRdfxml: !!requestData.rdfxml,
          hasEid: !!requestData.eid,
          xmlLength: requestData.rdfxml ? requestData.rdfxml.length : 0
        });
        
        const { useConfigStore } = await import('@/stores/config');
        const config = useConfigStore();
        const instanceUrl = config.returnUrls.instancepublish;
        
        if (!instanceUrl) {
          throw new Error('Instance publish URL not configured');
        }
        
        const headers = { 
          'Accept': 'application/json', 
          'Content-Type': 'application/json' 
        };
        
        const body = JSON.stringify(requestData);
        
        console.log('[postInstanceToServer] Posting to:', instanceUrl);
        
        const response = await fetch(instanceUrl, { 
          method: 'POST', 
          headers, 
          body 
        });
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => null);
          console.error('[postInstanceToServer] non-OK response', response.status, errorText);
          
          // Try to get more details about the server error
          console.error('[postInstanceToServer] Response headers:', Object.fromEntries(response.headers.entries()));
          console.error('[postInstanceToServer] Response status text:', response.statusText);
          console.error('[postInstanceToServer] Response URL:', response.url);
          
          // Try to parse error text as JSON to get more details
          let serverError = null;
          if (errorText) {
            try {
              serverError = JSON.parse(errorText);
              console.error('[postInstanceToServer] Parsed server error:', serverError);
            } catch (e) {
              console.error('[postInstanceToServer] Raw server error text:', errorText);
            }
          }
          
          throw new Error(`Instance posting failed with status ${response.status}: ${errorText}`);
        }
        
        // Parse response based on content type
        const contentType = response.headers.get('content-type') || '';
        let result;
        
        if (contentType.includes('application/json')) {
          result = await response.json();
        } else {
          const textResult = await response.text();
          // Try to parse as JSON in case content-type header is wrong
          try {
            result = JSON.parse(textResult);
          } catch {
            result = { status: true, message: textResult };
          }
        }
        
        console.log('[postInstanceToServer] Success:', result);
        return result;
        
      } catch (error) {
        console.error('[postInstanceToServer] Error during instance post:', error);
        throw error;
      }
    },

    /**
     * Fetches BFDB XML content from a URL with environment-specific URL handling
     * @async
     * @param {string} url - the BFDB URL to fetch XML from
     * @return {string|boolean} - returns the XML content as string or false on error
     */
    fetchBfdbXML: async function(url) {
      if (!url || typeof url !== 'string') {
        console.error("[fetchBfdbXML] Invalid URL provided:", url)
        return false
      }

      try {
        const { useConfigStore } = await import('@/stores/config')
        let returnUrls = useConfigStore().returnUrls
        
        // Apply environment-specific URL transformations like other functions
        if (returnUrls.env == "production") {
          url = url.replace('http://id.loc.gov/', returnUrls.id)
          url = url.replace('https://id.loc.gov/', returnUrls.id)
        }
        
        if (returnUrls.env == 'staging' && !returnUrls.dev) {
          let stageUrlPrefix = returnUrls.id.split('loc.gov/')[0]
          url = url.replace('http://id.loc.gov/', stageUrlPrefix + 'loc.gov/')
          url = url.replace('https://id.loc.gov/', stageUrlPrefix + 'loc.gov/')
        }

        console.log("[fetchBfdbXML] Fetching BFDB XML from URL:", url)
        
        const response = await fetch(url)
        console.log("[fetchBfdbXML] Response status:", response.status)
        
        if (response.status == 404) {
          console.warn("[fetchBfdbXML] 404 Not Found for URL:", url)
          return false
        }
        
        if (!response.ok) {
          console.error("[fetchBfdbXML] HTTP error for URL:", url, "Status:", response.status)
          return false
        }
        
        const xmlData = await response.text()
        console.log("[fetchBfdbXML] XML response (first 200 chars):", xmlData ? xmlData.substring(0,200) : "EMPTY")
        
        if (!xmlData || xmlData.trim() === '') {
          console.warn("[fetchBfdbXML] Empty XML response from URL:", url)
          return false
        }
        
        return xmlData
        
      } catch (err) {
        console.error("[fetchBfdbXML] Error fetching XML from URL:", url, "Error:", err)
        return false
      }
    },

    /**
     * Search for instances by LCCN
     * @async
     * @param {string} lccn - The LCCN to search for
     * @return {Promise<Array>} Array of search results
     */
    searchInstanceByLCCN: async function(lccn) {
      try {
        const { useConfigStore } = await import('@/stores/config')
        const returnUrls = useConfigStore().returnUrls || {};
        
        // Use the search API with specific LCCN query
        // This returns an Atom feed format, not standard JSON
        const searchUrl = `https://id.loc.gov/search/?q=${encodeURIComponent(lccn)}&format=json&count=25`;
        console.log("LCCN search URL:", searchUrl);
        
        const response = await this.fetchSimpleLookup(searchUrl, true);
        
        if (!response || !Array.isArray(response)) {
          console.log("No search results found for LCCN:", lccn);
          return [];
        }
        
        // Parse the Atom feed format response
        const results = [];
        
        // Look for atom:entry elements in the response array
        for (let i = 0; i < response.length; i++) {
          const item = response[i];
          
          // Check if this is an atom:entry
          if (Array.isArray(item) && item[0] === "atom:entry") {
            let title = "";
            let instanceUri = "";
            let rdfUri = "";
            
            // Parse the entry content (starts from index 2, after tag name and attributes)
            for (let j = 2; j < item.length; j++) {
              const element = item[j];
              
              if (Array.isArray(element)) {
                // Extract title
                if (element[0] === "atom:title" && element.length > 2) {
                  title = element[2];
                }
                
                // Extract links
                if (element[0] === "atom:link" && element[1]) {
                  const attrs = element[1];
                  if (attrs.href && attrs.href.includes('/instances/')) {
                    if (attrs.type === "application/rdf+xml") {
                      rdfUri = attrs.href;
                    } else if (attrs.rel === "alternate" && !attrs.type) {
                      instanceUri = attrs.href;
                    }
                  }
                }
              }
            }
            
            // If we found an instance, add it to results
            if (instanceUri && rdfUri) {
              const instanceId = instanceUri.split('/').pop();
              
              results.push({
                label: title || `Instance: ${instanceId}`,
                bfdbURL: instanceUri,
                bfdbPackageURL: rdfUri, // The RDF/XML link from the Atom feed
                idURL: instanceUri
              });
            }
          }
        }
        
        // If no results from the general search, try with "lccn:" prefix
        if (results.length === 0) {
          console.log("No instance results found, trying LCCN-specific search");
          
          const lccnSearchUrl = `https://id.loc.gov/search/?q=lccn:${encodeURIComponent(lccn)}&format=json&count=25`;
          const lccnResponse = await this.fetchSimpleLookup(lccnSearchUrl, true);
          
          if (lccnResponse && Array.isArray(lccnResponse)) {
            // Parse the same Atom feed format for the lccn: prefixed search
            for (let i = 0; i < lccnResponse.length; i++) {
              const item = lccnResponse[i];
              
              if (Array.isArray(item) && item[0] === "atom:entry") {
                let title = "";
                let instanceUri = "";
                let rdfUri = "";
                
                for (let j = 2; j < item.length; j++) {
                  const element = item[j];
                  
                  if (Array.isArray(element)) {
                    if (element[0] === "atom:title" && element.length > 2) {
                      title = element[2];
                    }
                    
                    if (element[0] === "atom:link" && element[1]) {
                      const attrs = element[1];
                      if (attrs.href && attrs.href.includes('/instances/')) {
                        if (attrs.type === "application/rdf+xml") {
                          rdfUri = attrs.href;
                        } else if (attrs.rel === "alternate" && !attrs.type) {
                          instanceUri = attrs.href;
                        }
                      }
                    }
                  }
                }
                
                if (instanceUri && rdfUri) {
                  const instanceId = instanceUri.split('/').pop();
                  
                  results.push({
                    label: title || `Instance: ${instanceId}`,
                    bfdbURL: instanceUri,
                    bfdbPackageURL: rdfUri,
                    idURL: instanceUri
                  });
                }
              }
            }
          }
        }
        
        console.log("LCCN search results:", results);
        return results;
        
      } catch (error) {
        console.error('Error searching by LCCN:', error);
        return [];
      }
    },

    /**
     * Validates RDF/XML against SHACL shapes
     * @async
     * @param {string} rdfXml - the RDF/XML to validate
     * @param {string} profileId - the profile ID to validate against
     * @return {object} - returns validation results with conforms boolean and violations array
     */
    validate: async function(rdfXml, profileId = null) {
      try {
        const { useConfigStore } = await import('@/stores/config')
        const returnUrls = useConfigStore().returnUrls || {};
        
        if (!returnUrls.validate) {
          console.error('[validate] No validate URL configured');
          return {
            conforms: false,
            violations: ['No validation service URL configured']
          };
        }
        
        // Use template from activeProfile, defaulting to 'monograph'
        const templateValue = (useConfigStore().activeProfile && useConfigStore().activeProfile.templateType) || profileId || 'monograph';
        const url = returnUrls.validate + "?template=" + templateValue;
        console.log('[validate] Validating against:', url);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/rdf+xml'
          },
          body: rdfXml
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[validate] Validation failed: ${response.status} ${response.statusText}: ${errorText}`);
          return {
            conforms: false,
            violations: [`Validation failed: ${response.status} ${response.statusText}`]
          };
        }
        
        const result = await response.json();
        console.log('[validate] Validation result:', result);
        
        // Return the result as-is, assuming it already has the right format
        return result;
        
      } catch (error) {
        console.error('[validate] Error during validation:', error);
        return {
          conforms: false,
          violations: [`Validation error: ${error.message}`]
        };
      }
    },

    /**
     * Search for subjects using various search modes
     * @param {string} searchString - The search term
     * @param {string} searchStringFull - The full search string
     * @param {string} searchMode - The search mode
     * @returns {Promise<Object>} Search results
     */
    subjectSearch: async function(searchString, searchStringFull, searchMode) {
      let nafResults = {
        names: [],
        subjectsComplex: [],
        subjectsSimple: [],
        subjectsChildren: [],
        subjectsChildrenComplex: [],
        hierarchicalGeographic: [],
        exact: []
      };

      searchString = searchString.normalize();
      searchStringFull = searchStringFull.normalize();

      let searchStringUse = searchString;
      let isComplex = false;

      if (searchString.includes(' -- ')) {
        isComplex = true;
        searchStringUse = searchString.split(' -- ')[0];
      }

      // Different search modes
      if (searchMode === 'LCSHNAF') {
        let url = 'https://id.loc.gov/authorities/subjects/suggest2/?q=' + searchStringUse;
        if (isComplex) {
          url = 'https://id.loc.gov/authorities/subjects/suggest2/?q=' + searchString.replaceAll(' -- ', '--');
        }

        console.log("🔍 Calling LCSH API:", url);
        // Get LCSH results
        const lcshData = await this.fetchSimpleLookup(url, true);
        console.log("🔍 LCSH API response:", lcshData);
        if (lcshData && lcshData.hits) {
          console.log("🔍 Processing", lcshData.hits.length, "LCSH hits");
          for (let h of lcshData.hits) {
            console.log("🔍 LCSH hit:", h.suggestLabel, "URI:", h.uri);
            // Check for complex subjects (with subdivisions)
            if (h.suggestLabel.includes(' -- ') || h.suggestLabel.includes('--')) {
              h.heading = { subdivision: false };
              h.literal = false;
              nafResults.subjectsComplex.push(h);
              console.log("🔍 Added to subjectsComplex:", h.suggestLabel);
            } else {
              h.heading = { subdivision: false };
              h.literal = false;
              nafResults.subjectsSimple.push(h);
              console.log("🔍 Added to subjectsSimple:", h.suggestLabel);
            }
          }
        }

        // Get NAF results
        url = 'https://id.loc.gov/authorities/names/suggest2/?q=' + searchStringUse;
        console.log("🔍 Calling NAF API:", url);
        const nafData = await this.fetchSimpleLookup(url, true);
        console.log("🔍 NAF API response:", nafData);
        if (nafData && nafData.hits) {
          console.log("🔍 Processing", nafData.hits.length, "NAF hits");
          for (let h of nafData.hits) {
            console.log("🔍 NAF hit:", h.suggestLabel, "URI:", h.uri);
            h.rdfType = 'Topic';
            h.heading = {
              rdfType: h.rdfType,
              subdivision: false
            };
            h.literal = false;
            nafResults.names.push(h);
            console.log("🔍 Added to names:", h.suggestLabel);
          }
        }
      } else if (searchMode === 'CHILD') {
        let url = 'https://id.loc.gov/authorities/childrensSubjects/suggest2/?q=' + searchStringUse;
        if (isComplex) {
          url = 'https://id.loc.gov/authorities/childrensSubjects/suggest2/?q=' + searchString.replaceAll(' -- ', '--');
        }

        const childData = await this.fetchSimpleLookup(url, true);
        if (childData && childData.hits) {
          for (let h of childData.hits) {
            if (h.suggestLabel.includes(' -- ') || h.suggestLabel.includes('--')) {
              h.heading = { subdivision: false };
              h.literal = false;
              nafResults.subjectsChildrenComplex.push(h);
            } else {
              h.heading = { subdivision: false };
              h.literal = false;
              nafResults.subjectsChildren.push(h);
            }
          }
        }
      } else if (searchMode === 'GEO') {
        const url = 'https://id.loc.gov/authorities/subjects/suggest2/?q=' + searchStringUse + '&filter=scheme:http://id.loc.gov/authorities/subjects/collection_GeographicSubdivisions';
        const geoData = await this.fetchSimpleLookup(url, true);
        if (geoData && geoData.hits) {
          for (let h of geoData.hits) {
            h.heading = { subdivision: true };
            h.literal = false;
            nafResults.hierarchicalGeographic.push(h);
          }
        }
      } else if (searchMode === 'WORKS') {
        const { useConfigStore } = await import('@/stores/config')
        const returnUrls = useConfigStore().returnUrls || {};
        const endpoint = returnUrls.works || 'https://id.loc.gov/resources/works/';
        const url = `${endpoint}suggest2/?q=${searchString}&count=25`;
        
        const worksData = await this.fetchSimpleLookup(url, true);
        if (worksData && worksData.hits) {
          for (let h of worksData.hits) {
            h.rdfType = 'Work';
            h.heading = {
              rdfType: h.rdfType,
              subdivision: false
            };
            h.literal = false;
            nafResults.names.push(h);
          }
        }
      } else if (searchMode === 'HUBS') {
        const { useConfigStore } = await import('@/stores/config')
        const returnUrls = useConfigStore().returnUrls || {};
        const endpoint = returnUrls.hubs || 'https://id.loc.gov/resources/hubs/';
        const url = `${endpoint}suggest2/?q=${searchString}&count=25`;
        
        const hubsData = await this.fetchSimpleLookup(url, true);
        if (hubsData && hubsData.hits) {
          for (let h of hubsData.hits) {
            h.rdfType = 'Hub';
            h.heading = {
              rdfType: h.rdfType,
              subdivision: false
            };
            h.literal = false;
            nafResults.names.push(h);
          }
        }
      }

      console.log("🔍 Final nafResults:", {
        subjectsSimple: nafResults.subjectsSimple.length,
        subjectsComplex: nafResults.subjectsComplex.length,
        names: nafResults.names.length,
        subjectsChildren: nafResults.subjectsChildren.length,
        subjectsChildrenComplex: nafResults.subjectsChildrenComplex.length,
        hierarchicalGeographic: nafResults.hierarchicalGeographic.length
      });
      console.log("🔍 Sample data:", nafResults);

      return nafResults;
    },

    /**
     * Resolve an LCSH MARC-encoded subject string using multi-endpoint subdivision logic
     * (Geographic, Temporal, Genre/Form, Children’s, Topic, etc.) closely mirroring upstream.
     * Returns either a COMPLEX heading match or a SIMPLE array of component matches/literals.
     *
     * result.resultType: 'ERROR' | 'COMPLEX' | 'SIMPLE'
     */
    subjectLinkModeResolveLCSH: async function(lcsh, searchType = null){
      // Abort any in‑flight subject searches (upstream parity)
      if (this.subjectSearchActive){
        for (let controller in this.controllers){
          try { this.controllers[controller].abort(); } catch {}
          this.controllers[controller] = new AbortController();
        }
      }
      this.subjectSearchActive = true;

      const result = { resultType: '', msg: '', hit: [] };

      if (!lcsh || typeof lcsh !== 'string' || lcsh.trim() === ''){
        result.resultType = 'ERROR';
        result.msg = 'Enter a MARC encoded LCSH string (e.g. $a Dogs $z Portugal $x History).';
        return result;
      }

      lcsh = lcsh.normalize().trim();
      if (!lcsh.includes('$')){
        result.resultType = 'ERROR';
        result.msg = 'Value must contain MARC subfield codes beginning with $.';
        return result;
      }

      // Extract subfields: $a, $x, $y, $z, $v and $d (name dates) (ignore others for now)
      // NOTE: $d will be merged with preceding $a when forming a PersonalName heading.
      const regex = /\$([avxyzd])\s*([^$]+)/g;
      let m; const headings = [];
      while ((m = regex.exec(lcsh)) !== null){
        const code = m[1];
        const label = m[2].trim().replace(/[—–]/g,'-');
        if (!label) continue;
        let rdfType = 'http://www.loc.gov/mads/rdf/v1#Topic';
        if (code === 'v') rdfType = 'http://www.loc.gov/mads/rdf/v1#GenreForm';
        else if (code === 'y') rdfType = 'http://www.loc.gov/mads/rdf/v1#Temporal';
        else if (code === 'z') rdfType = 'http://www.loc.gov/mads/rdf/v1#Geographic';
        // $d treated specially later (dates part of PersonalName, not its own subdivision)
        headings.push({ label, type: code, rdfType, subdivision: (code !== 'a' && code !== 'd') });
      }

      if (headings.length === 0 || headings.filter(h=>h.type==='a').length === 0){
        result.resultType = 'ERROR';
        result.msg = 'No $a (main heading) found.';
        return result;
      }

      // Merge $d (dates) immediately following the first $a into the PersonalName label.
      // Upstream behavior: Personal names often represented as $a Name, Surname, $d 1900-1999
      // We'll combine into single heading for resolution attempts.
      if (headings.length > 1 && headings[0].type === 'a' && headings[1].type === 'd') {
        headings[0].label = `${headings[0].label.replace(/[,\s]+$/,'')}, ${headings[1].label}`;
        // Mark as PersonalName candidate via heuristic (comma + 4-digit year pattern)
        headings[0]._maybePersonalName = /\b\d{3,4}\b/.test(headings[1].label) || /,\s*\d{3,4}/.test(headings[0].label);
        // Remove the $d heading (not treated as separate subdivision)
        headings.splice(1,1);
      } else if (headings[0].type === 'a') {
        // Heuristic: name if contains comma and year range ANYWHERE
        headings[0]._maybePersonalName = /,\s*[^$]+\b\d{3,4}(-\d{0,4})?\b/.test(headings[0].label);
      }

      const fullHeadingLabel = headings.map(h=>h.label).join('--');

      // Attempt exact complex heading first
      try {
        const complexLookupRaw = await this.fetchSimpleLookup(`https://id.loc.gov/authorities/subjects/label/${encodeURIComponent(fullHeadingLabel)}.json`, true);
        let complexRecord = null;
        if (Array.isArray(complexLookupRaw)) {
          // Find an object with @id that looks like a subjects authority
            complexRecord = complexLookupRaw.find(o => o && o['@id'] && o['@id'].includes('/authorities/subjects/')) || null;
        } else if (complexLookupRaw && complexLookupRaw['@id']) {
          complexRecord = complexLookupRaw;
        }
        if (complexRecord && complexRecord['@id']){
          try {
            let mk = await this.lookupMarcKeyFromUri(complexRecord['@id']);
            result.resultType = 'COMPLEX';
            result.hit = {
              uri: complexRecord['@id'],
              label: fullHeadingLabel,
              heading: { subdivision: false, rdfType: headings[0].rdfType },
              extra: { marcKeys: mk && mk.marcKey ? [mk.marcKey] : [] , components: headings }
            };
            result.msg = 'Authorized complex heading';
            return result;
          } catch(e){
            // Even if marcKey lookup fails, still treat as complex
            result.resultType = 'COMPLEX';
            result.hit = {
              uri: complexRecord['@id'],
              label: fullHeadingLabel,
              heading: { subdivision: false, rdfType: headings[0].rdfType },
              extra: { marcKeys: [], components: headings }
            };
            result.msg = 'Authorized complex heading (marcKey lookup failed)';
            return result;
          }
        }
        if (!complexRecord){
          result._complexLookup404 = true;
          console.info('[LinkMode] Complex heading not directly authorized (array scan produced no match):', fullHeadingLabel);
        }
      } catch (e) {
        result._complexLookupError = true;
      }

      // SPECIAL CASE: single-component main heading (only one $a) that 404s on complex label lookup.
      // Many country / jurisdiction names (e.g., "United States") should still authorize.
      if (headings.length === 1 && headings[0].type === 'a' && !result.resultType) {
        try {
          const { useConfigStore } = await import('@/stores/config');
          const cfg = useConfigStore().lookupConfig;
          const searchVal = encodeURIComponent(headings[0].label);
          const norm = (s)=> s.toLowerCase().trim().replace(/\s+/g,' ');
          const targetNorm = norm(headings[0].label);
          const controllers = this.controllers;
          if (!controllers.controllerSingleMain1) controllers.controllerSingleMain1 = new AbortController();
          if (!controllers.controllerSingleMain2) controllers.controllerSingleMain2 = new AbortController();
          if (!controllers.controllerSingleMain3) controllers.controllerSingleMain3 = new AbortController();

          const payloadFactory = (url, key)=> ({
            processor: 'lcAuthorities',
            url: [url],
            searchValue: headings[0].label,
            signal: controllers[key].signal
          });

          let urlsSingle = [];
          try {
            // Broad subjects ALL
            if (cfg['http://id.loc.gov/authorities/subjects']){
              const subjAll = cfg['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url;
              urlsSingle.push({u: subjAll.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace('<OFFSET>','1'), key:'controllerSingleMain1'});
            }
          } catch{}
          try {
            // Geographic hierarchical
            if (cfg['HierarchicalGeographic']){
              const hierGeo = cfg['HierarchicalGeographic'].modes[0]['All'].url;
              urlsSingle.push({u: hierGeo.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace('<OFFSET>','1'), key:'controllerSingleMain2'});
            }
          } catch{}
          try {
            // Names ALL
            const namesCfg = cfg['http://preprod.id.loc.gov/authorities/names'] || cfg['http://id.loc.gov/authorities/names'];
            if (namesCfg){
              const modeBlock = namesCfg.modes[0];
              for (const k in modeBlock){ if (k.toLowerCase().includes('all')) { urlsSingle.push({u: modeBlock[k].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace('<OFFSET>','1'), key:'controllerSingleMain3'}); break; } }
            }
          } catch {}

          // Execute sequentially (simpler; small count)
          let authorizedHit = null;
          for (const spec of urlsSingle){
            try {
              let rset = await this.searchComplex(payloadFactory(spec.u, spec.key));
              rset = (rset||[]).filter(r=>r && !r.literal);
              for (const r of rset){
                if (!r.label) continue;
                if (norm(r.label) === targetNorm){
                  authorizedHit = r; break;
                }
              }
              if (authorizedHit) break;
            } catch {}
          }

          if (authorizedHit){
            // Attempt marcKey enrichment
            try { let mk = await this.lookupMarcKeyFromUri(authorizedHit.uri); authorizedHit.extra = authorizedHit.extra||{}; authorizedHit.extra.marcKeys = mk && mk.marcKey ? [mk.marcKey] : []; } catch{}
            authorizedHit.heading = headings[0];
            result.resultType = 'SIMPLE';
            result.hit = [ authorizedHit ];
            result.msg = 'Single authorized heading resolved';
            return result;
          }
        } catch(e){ /* non-fatal */ }
      }

      // Build endpoint templates once (mirrors upstream construction logic)
      const { useConfigStore } = await import('@/stores/config');
      const returnUrls = useConfigStore().returnUrls;

      // Helpers for normalization & comparison
      const normalizeForMatch = (s)=> s.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu,'');

      // For each component, try targeted searches (index aware for name heuristics)
      for (let i=0; i<headings.length; i++){
        const heading = headings[i];
        const searchVal = encodeURIComponent(heading.label);
        let foundHeading = false;
        let candidateResults = [];

        // Prepare payload factory
        const payload = (url, controllerKey)=> ({
          processor: 'lcAuthorities',
          url: [url],
          searchValue: heading.label,
          signal: this.controllers[controllerKey].signal
        });

        const urls = {};
        try {
          // Base subjects endpoint (environment aware)
          const subjAll = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url;
          // Children subjects
          const childAll = useConfigStore().lookupConfig['http://id.loc.gov/authorities/childrensSubjects'].modes[0]['LCSHAC All'].url;
          // Hierarchical Geographic scheme (direct)
          const hierGeo = useConfigStore().lookupConfig['HierarchicalGeographic'].modes[0]['All'].url;
          // NAF geographic
          const nafGeo = useConfigStore().lookupConfig['http://preprod.id.loc.gov/authorities/names'].modes[0]['NAF Geographic'].url;
          // Names (Personal/Corporate) generic "All" mode – attempt both preprod and prod keys
          let namesConfig = useConfigStore().lookupConfig['http://preprod.id.loc.gov/authorities/names'] || useConfigStore().lookupConfig['http://id.loc.gov/authorities/names'];
          if (namesConfig) {
            // Grab first mode object and find an 'All' key
            const modeBlock = namesConfig.modes[0];
            for (const k in modeBlock) {
              if (k.toLowerCase().includes('all')) { urls.namesAll = modeBlock[k].url; break; }
            }
          }

          urls.simpleSubdivision = subjAll.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace('<OFFSET>','1') + '&rdftype=SimpleType&memberOf=http://id.loc.gov/authorities/subjects/collection_TopicSubdivisions';
          urls.temporal = subjAll.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace('<OFFSET>','1') + '&memberOf=http://id.loc.gov/authorities/subjects/collection_TemporalSubdivisions';
          urls.genre = subjAll.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace('<OFFSET>','1') + '&rdftype=GenreForm';
          urls.geoHier = hierGeo.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace('<OFFSET>','1');
          urls.geoHierLCSH = subjAll.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace('<OFFSET>','1') + '&rdftype=HierarchicalGeographic';
          urls.geoLCSH = subjAll.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace('<OFFSET>','1') + '&rdftype=Geographic&memberOf=http://id.loc.gov/authorities/subjects/collection_Subdivisions';
          urls.geoLCNAF = nafGeo.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace('<OFFSET>','1');
          urls.children = childAll.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace('<OFFSET>','1');
          urls.childrenSub = childAll.replace('<QUERY>',searchVal).replace('&count=25','&count=4').replace('<OFFSET>','1') + '&memberOf=http://id.loc.gov/authorities/subjects/collection_Subdivisions';
        } catch (e) {
          // If lookupConfig missing, we fallback to direct id.loc.gov label lookup below
        }

        // Strategy by subfield type
        const pushMatches = async (arr)=>{
          if (!arr) return;
          for (let r of arr){
            if (foundHeading) break;
            if (r && !r.literal){
              if (normalizeForMatch(heading.label) === normalizeForMatch(r.label)){
                r.heading = heading;
                if (r.uri){
                  try {
                    let mk = await this.lookupMarcKeyFromUri(r.uri);
                    r.extra = r.extra || {}; r.extra.marcKeys = mk && mk.marcKey ? [mk.marcKey] : [];
                  } catch {}
                }
                result.hit.push(r);
                foundHeading = true;
              }
            }
          }
        };

        try {
          // Personal / Corporate Name resolution attempt (only for first $a, heuristic flagged)
          if (i === 0 && heading.type === 'a' && heading._maybePersonalName && urls.namesAll){
            try {
              const nameUrl = urls.namesAll.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace('<OFFSET>','1');
              let nameResults = await this.searchComplex(payload(nameUrl,'controllerNamesAll'));
              nameResults = (nameResults || []).filter(r=>!r.literal);
              for (let r of nameResults){
                if (foundHeading) break;
                if (normalizeForMatch(heading.label.replace(/\.$/,'')) === normalizeForMatch((r.label||'').replace(/\.$/,''))){
                  r.heading = heading;
                  // Set rdfType to PersonalName if heuristic matched; attempt detection for Corporate
                  if (heading._maybePersonalName){ r.heading.rdfType = 'http://www.loc.gov/mads/rdf/v1#PersonalName'; }
                  if (r.uri){
                    try { let mk = await this.lookupMarcKeyFromUri(r.uri); r.extra = r.extra || {}; r.extra.marcKeys = mk && mk.marcKey ? [mk.marcKey] : []; } catch {}
                  }
                  result.hit.push(r);
                  foundHeading = true;
                }
              }
            } catch(e){ /* Non-fatal */ }
            if (foundHeading) {
              // continue to next heading without falling into subject logic
              if (!result._resolution){ result._resolution = { authorized: [], literal: [] }; }
              result._resolution.authorized.push(heading.label);
              continue;
            }
          }
          if (heading.type === 'z') { // Geographic
            let [hg, hgL, geoN, geoL] = await Promise.all([
              urls.geoHier ? this.searchComplex(payload(urls.geoHier,'controllerHierarchicalGeographic')) : [],
              urls.geoHierLCSH ? this.searchComplex(payload(urls.geoHierLCSH,'controllerHierarchicalGeographicLCSH')) : [],
              urls.geoLCNAF ? this.searchComplex(payload(urls.geoLCNAF,'controllerGeographicLCNAF')) : [],
              urls.geoLCSH ? this.searchComplex(payload(urls.geoLCSH,'controllerGeographicLCSH')) : []
            ]);
            hg = hg.filter(r=>!r.literal); hgL = hgL.filter(r=>!r.literal); geoN = geoN.filter(r=>!r.literal); geoL = geoL.filter(r=>!r.literal);
            await pushMatches(hg); if (foundHeading) continue;
            await pushMatches(hgL); if (foundHeading) continue;
            await pushMatches(geoN); if (foundHeading) continue;
            await pushMatches(geoL); if (foundHeading) continue;
          } else if (heading.type === 'y'){ // Temporal
            let temporal = urls.temporal ? await this.searchComplex(payload(urls.temporal,'controllerTemporal')) : [];
            temporal = temporal.filter(r=>!r.literal);
            await pushMatches(temporal); if (foundHeading) continue;
          } else if (heading.type === 'v'){ // Genre/Form
            let genre = urls.genre ? await this.searchComplex(payload(urls.genre,'controllerGenre')) : [];
            genre = genre.filter(r=>!r.literal);
            await pushMatches(genre); if (foundHeading) continue;
          } else if (heading.type === 'x' || heading.type === 'a'){ // Topic / general
            let simpleSub = urls.simpleSubdivision ? await this.searchComplex(payload(urls.simpleSubdivision,'controllerPayloadSubjectsSimpleSubdivision')) : [];
            simpleSub = simpleSub.filter(r=>!r.literal);
            await pushMatches(simpleSub); if (foundHeading) continue;
            if (searchType && searchType.includes(':Topic:Childrens:')){
              let childSub = urls.childrenSub ? await this.searchComplex(payload(urls.childrenSub,'controllerCyak')) : [];
              childSub = childSub.filter(r=>!r.literal);
              await pushMatches(childSub); if (foundHeading) continue;
            }
            // Fallback: main heading might actually be a geographic authorized heading (e.g., $aUnited States)
            if (!foundHeading && heading.type === 'a') {
              try {
                let [hg, hgL, geoN, geoL] = await Promise.all([
                  urls.geoHier ? this.searchComplex(payload(urls.geoHier,'controllerGeoFallbackHier')) : [],
                  urls.geoHierLCSH ? this.searchComplex(payload(urls.geoHierLCSH,'controllerGeoFallbackHierL')) : [],
                  urls.geoLCNAF ? this.searchComplex(payload(urls.geoLCNAF,'controllerGeoFallbackNAF')) : [],
                  urls.geoLCSH ? this.searchComplex(payload(urls.geoLCSH,'controllerGeoFallbackLCSH')) : []
                ]);
                const geoSets = [hg, hgL, geoN, geoL].map(a => (a||[]).filter(r=>!r.literal));
                for (const set of geoSets){
                  if (foundHeading) break;
                  for (const r of set){
                    if (foundHeading) break;
                    if (r && r.label && normalizeForMatch(heading.label) === normalizeForMatch(r.label)){
                      // Coerce rdfType to Geographic
                      heading.rdfType = 'http://www.loc.gov/mads/rdf/v1#Geographic';
                      r.heading = heading;
                      if (r.uri){
                        try { let mk = await this.lookupMarcKeyFromUri(r.uri); r.extra = r.extra || {}; r.extra.marcKeys = mk && mk.marcKey ? [mk.marcKey] : []; } catch {}
                      }
                      result.hit.push(r);
                      foundHeading = true;
                    }
                  }
                }
                if (foundHeading) continue;
              } catch(e){ /* Silent fallback */ }

              // Broad Subjects ALL fallback (unfiltered) – some main headings (e.g., country names) are SimpleType but not subdivision members
              if (!foundHeading && urls.simpleSubdivision && useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects']) {
                try {
                  const subjAll = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url;
                  const broadUrl = subjAll.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace('<OFFSET>','1');
                  let broadResults = await this.searchComplex(payload(broadUrl,'controllerSubjectsAllMainA'));
                  broadResults = (broadResults||[]).filter(r=>!r.literal);
                  for (const r of broadResults){
                    if (foundHeading) break;
                    if (r && r.label && normalizeForMatch(heading.label) === normalizeForMatch(r.label)){
                      r.heading = heading;
                      if (r.uri){
                        try { let mk = await this.lookupMarcKeyFromUri(r.uri); r.extra = r.extra || {}; r.extra.marcKeys = mk && mk.marcKey ? [mk.marcKey] : []; } catch {}
                      }
                      result.hit.push(r);
                      foundHeading = true;
                    }
                  }
                  if (foundHeading) continue;
                } catch(e){ /* non-fatal */ }
              }

              // Names ALL fallback (Corporate/Jurisdiction) – e.g., United States often lives in NAF
              if (!foundHeading && urls.namesAll) {
                try {
                  const namesAllUrl = urls.namesAll.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace('<OFFSET>','1');
                  let namesAllResults = await this.searchComplex(payload(namesAllUrl,'controllerNamesAllCorporate'));
                  namesAllResults = (namesAllResults||[]).filter(r=>!r.literal);
                  for (const r of namesAllResults){
                    if (foundHeading) break;
                    if (r && r.label && normalizeForMatch(heading.label) === normalizeForMatch(r.label)){
                      // If upstream identifies as CorporateName or Geographic, preserve; else set CorporateName heuristic
                      heading.rdfType = (r.rdfType && r.rdfType.includes('Corporate')) ? r.rdfType : (r.rdfType && r.rdfType.includes('Geographic') ? r.rdfType : 'http://www.loc.gov/mads/rdf/v1#CorporateName');
                      r.heading = heading;
                      if (r.uri){
                        try { let mk = await this.lookupMarcKeyFromUri(r.uri); r.extra = r.extra || {}; r.extra.marcKeys = mk && mk.marcKey ? [mk.marcKey] : []; } catch {}
                      }
                      result.hit.push(r);
                      foundHeading = true;
                    }
                  }
                  if (foundHeading) continue;
                } catch(e){ /* ignore */ }
              }
            }
          }
        } catch (e) {
          // Endpoint failure => fallback literal handling below
        }

        if (!foundHeading){
          // Fallback literal component
            result.hit.push({
              label: heading.label,
              suggestLabel: heading.label,
              uri: null,
              literal: true,
              depreciated: false,
              extra: { marcKeys: [] },
              heading: heading
            });
        }

        // Track resolution state for diagnostics
        if (!result._resolution){ result._resolution = { authorized: [], literal: [] }; }
        if (foundHeading){
          result._resolution.authorized.push(heading.label);
        } else {
          result._resolution.literal.push(heading.label);
        }
      }

      result.resultType = 'SIMPLE';
      // Upstream-inspired: if every component resolved to an authorized (non-literal) heading, attempt to promote to COMPLEX
      try {
        const allAuthorized = Array.isArray(result.hit) && result.hit.length === headings.length && result.hit.every(h => h && h.uri && !h.literal);
        if (allAuthorized) {
          const { useConfigStore } = await import('@/stores/config');
          const subjAll = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url;
          const complexUrl = subjAll
            .replace('<QUERY>', encodeURIComponent(fullHeadingLabel))
            .replace('&count=25','&count=5')
            .replace('<OFFSET>','1') + '&rdftype=ComplexType';
          const complexPayload = {
            processor: 'lcAuthorities',
            url: [complexUrl],
            searchValue: fullHeadingLabel,
            subjectSearch: true,
            signal: this.controllers.controllerSubjectsComplex.signal
          };
          let complexCandidates = await this.searchComplex(complexPayload);
          if (Array.isArray(complexCandidates)) {
            // Filter non-literals
            complexCandidates = complexCandidates.filter(r => r && !r.literal);
            // Normalize labels for comparison
            const norm = (s)=> s.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu,'');
            const targetNorm = norm(fullHeadingLabel);
            const complexHit = complexCandidates.find(r => r.label && norm(r.label) === targetNorm || (r.vlabel && norm(r.vlabel) === targetNorm));
            if (complexHit) {
              // Enrich with marcKey if possible
              try {
                let mk = await this.lookupMarcKeyFromUri(complexHit.uri);
                result.resultType = 'COMPLEX';
                result.hit = {
                  uri: complexHit.uri,
                  label: fullHeadingLabel,
                  heading: { subdivision: false, rdfType: headings[0].rdfType },
                  extra: { marcKeys: mk && mk.marcKey ? [mk.marcKey] : [], components: headings }
                };
                result.msg = 'Promoted to authorized complex heading (all components authorized).';
                return result;
              } catch(e){
                // If marcKey lookup fails, still promote
                result.resultType = 'COMPLEX';
                result.hit = {
                  uri: complexHit.uri,
                  label: fullHeadingLabel,
                  heading: { subdivision: false, rdfType: headings[0].rdfType },
                  extra: { marcKeys: [], components: headings }
                };
                result.msg = 'Promoted to complex heading (marcKey lookup failed).';
                return result;
              }
            } else {
              // Could not find a ComplexType record; keep SIMPLE but annotate
              result.msg = (result.msg ? result.msg + ' ' : '') + 'All components authorized; no ComplexType record found.';
            }
          }
        }
      } catch (e) {
        console.info('[LinkMode] Complex promotion attempt failed (non-fatal):', e.message);
      }
      // Provide a human readable reason if complex failed
      if (result._complexLookup404){
        result.msg = 'Complex authorized heading not found (404); components resolved individually.';
      }
      if (result._resolution && result._resolution.literal.length>0){
        result.msg = (result.msg? result.msg + ' ' : '') + 'Unmatched components treated as literals: ' + result._resolution.literal.join(', ');
      }
      return result;
    },

};

export default utilsNetwork;