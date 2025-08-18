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
    * @async
    * @param {array} uris - the id vocabulary to query
    * @return {object} - returns the results processing
    */
    loadSimpleLookup: async function(uris){
        // TODO make this better for multuple lookup list (might not be needed)
        if (!Array.isArray(uris)){
          uris=[uris]
        }
        for (let uri of uris){
          let url = uri
          // TODO more checks here
          if (!uri.includes('.json') && !uri.includes("suggest2")){
              url = url + '.json'
          }

          if (!this.lookupLibrary[uri]){
              let data = await this.fetchSimpleLookup(url)
              data = this.simpleLookupProcess(data,uri)
              this.lookupLibrary[uri] = data
              return data
          }else{
              return this.lookupLibrary[uri]
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
    * Loads the library to sublocation mapping from the JSON file
    */
    loadLibrarySubLocationMapping: async function() {
      if (this.librarySubLocationMap) {
        return this.librarySubLocationMap;
      }
      
      try {
        const response = await fetch('/librarySubLocationMapping.json')
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        this.librarySubLocationMap = await response.json()
        return this.librarySubLocationMap
      } catch (error) {
        console.error('Error loading library sublocation mapping:', error)
        this.librarySubLocationMap = {}
        return this.librarySubLocationMap;
      }
    },

  /**
    * Gets filtered sublocations for a specific library
    */
    getSubLocationsForLibrary: function(libraryId) {
      if (!this.librarySubLocationMap) {
        return this.lookupLibrary['/subLocation'] || []
      }
      
      const sublocationIds = this.librarySubLocationMap[libraryId]
      
      if (!sublocationIds || sublocationIds.length === 0) {
        // Return only UNASSIGNED if no mapping exists
        if (this.lookupLibrary['/subLocation'] && Array.isArray(this.lookupLibrary['/subLocation'])) {
          return this.lookupLibrary['/subLocation'].filter(sub => 
            sub && sub['@id'] === 'UNASSIGNED'
          )
        }
        return []
      }
      
      // Filter the full sublocation list based on the mapping
      if (this.lookupLibrary['/subLocation'] && Array.isArray(this.lookupLibrary['/subLocation'])) {
        return this.lookupLibrary['/subLocation'].filter(sub => 
          sub && sub['@id'] && sublocationIds.includes(sub['@id'])
        )
      }
      
      return []
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

      let options = {signal: signal}
      if (json){
        options = {headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}, mode: "cors", signal: signal}
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
                  }else if (k == 'LC Classification'){
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

    /**
    * Generates MARC preview from MARC XML
    */
    marcPreview: async function(marcXml, htmlFormat = false) {
    // Return an array instead of an object to match expected format
    if (!marcXml) return []
    
    // Return array format that the calling code expects
    return [{
      marc: marcXml,
      preview: htmlFormat ? `<div class="marc-preview">${marcXml}</div>` : marcXml
    }]
  }
};

export default utilsNetwork;