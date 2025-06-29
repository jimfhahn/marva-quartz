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
          // if (returnUrls.env == 'production' && jsonuri.includes("authorities/names")){
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
              if (n['http://www.loc.gov/mads/rdf/v1#code'] && n['http://www.loc.gov/mads/rdf/v1#code'][0]['@type'] == 'http://id.loc.gov/datatypes/codes/gac') {
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
                // console.log(n['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'])
                title = JSON.parse(JSON.stringify(n['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']))
              }
              if (n['@id'] && n['@id'] == data.uri && n['http://id.loc.gov/ontologies/bflc/marcKey']){
                // don't mush them together anymore add them along with their lang value
                // title = title + n['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'].map(function (v) { return v['@value'] + ' '; })
                // console.log(n['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'])
                marcKey = JSON.parse(JSON.stringify(n['http://id.loc.gov/ontologies/bflc/marcKey']))
              }


              if (n['@id'] && n['@id'] == data.uri && n['@type']){
                  n['@type'].forEach((t)=>{
                      if (results.type===null){
                          results.type = this.rdfType(t)
                          results.typeFull = t
                      }
                  })

                  if (n['@type'].includes("http://www.loc.gov/mads/rdf/v1#DeprecatedAuthority")){
                    results.depreciated = true

                  }

              }

              citation = citation.trim()
              variant = variant.trim()

              let sourcePos = sourceOrder.indexOf(sourceId)
              if (citation != ''){
                results.source.splice(sourcePos, 1, citation)
              }

              if (variant != ''){ results.variant.push(variant)}
              if (title && title.length>0){
                results.title = title
              }
              if (marcKey && marcKey.length>0){
                results.marcKey = marcKey
              }



              if (n['@type'] && n['@type'] == 'http://id.loc.gov/ontologies/bibframe/Title'){
                if (n['bibframe:mainTitle']){
                  results.title = n['bibframe:mainTitle']
                }
              }
              if (n['@type'] && (n['@type'] == 'http://id.loc.gov/ontologies/bibframe/Agent' || n['@type'].indexOf('http://id.loc.gov/ontologies/bibframe/Agent') > -1 )){
                if (n['bflc:name00MatchKey']){
                  results.contributor.push(n['bflc:name00MatchKey']);
                }
              }
              if (n['bibframe:creationDate'] && n['bibframe:creationDate']['@value']){
                results.date = n['bibframe:creationDate']['@value'];
              }
              if (n['@type'] && n['@type'] == 'http://id.loc.gov/ontologies/bibframe/GenreForm'){
                if (n['bibframe:mainTitle']){
                  results.genreForm = n['rdf-schema:label'];
                }
              }
            });


          }

          // clean up any empty ones so they don't display
          Object.keys(results.nodeMap).forEach((k)=>{
            if (results.nodeMap[k].length==0){
              delete results.nodeMap[k]
            }
          })

          return results;
        },


    /**
    * Returns a short version based on the RDF type
    * @param {string} type - the URI of the type
    * @return {string} - a MADSRDF type of the string
    */
    rdfType: function(type){
      var rdftype = null;

      if (type == 'http://www.loc.gov/mads/rdf/v1#PersonalName' || type == 'http://id.loc.gov/ontologies/bibframe/Person') {
        rdftype = 'PersonalName';
      } else if (type == 'http://id.loc.gov/ontologies/bibframe/Topic' || type == 'http://www.loc.gov/mads/rdf/v1#Topic') {
        rdftype = 'Topic';
      } else if (type == 'http://www.loc.gov/mads/rdf/v1#Place' || type == 'http://id.loc.gov/ontologies/bibframe/Place' || type == 'http://www.loc.gov/mads/rdf/v1#Geographic' || type == 'http://www.loc.gov/mads/rdf/v1#HierarchicalGeographic') {
        rdftype = 'Geographic';
      } else if (type == 'http://www.loc.gov/mads/rdf/v1#Temporal'){
        rdftype= 'Temporal';
      } else if (type == 'http://www.loc.gov/mads/rdf/v1#Organization' || type == 'http://www.loc.gov/mads/rdf/v1#CorporateName' || type == 'http://id.loc.gov/ontologies/bibframe/Organization') {
        rdftype = 'CorporateName';
      } else if (type == 'http://www.loc.gov/mads/rdf/v1#Family' || type == 'http://id.loc.gov/ontologies/bibframe/Family') {
        rdftype = "FamilyName";
      } else if (type == 'http://www.loc.gov/mads/rdf/v1#Meeting' || type == 'http://id.loc.gov/ontologies/bibframe/Meeting') {
        rdftype = 'ConferenceName';
      } else if (type == 'http://www.loc.gov/mads/rdf/v1#Jurisdiction' || type == 'http://id.loc.gov/ontologies/bibframe/Jurisdiction') {
        rdftype = 'Geographic';
      } else if (type == 'http://id.loc.gov/ontologies/bibframe/GenreForm' || type == 'http://www.loc.gov/mads/rdf/v1#GenreForm') {
        rdftype = 'GenreForm';
      } else if (type == 'http://id.loc.gov/ontologies/bibframe/Role') {
        rdftype = 'Role';
      }else if (type == 'http://id.loc.gov/ontologies/madsrdf/v1.html#ComplexSubject') {
        rdftype = 'ComplexSubject';
      }else if (type == 'http://www.loc.gov/mads/rdf/v1#NameTitle') {
        rdftype = 'NameTitle';
      }else if (type == 'http://www.loc.gov/mads/rdf/v1#Title') {
        rdftype = 'Title';
      }else if (type == 'http://www.loc.gov/mads/rdf/v1#ComplexSubject') {
        rdftype = 'ComplexSubject';
      }else if (type == 'Q5') {
        rdftype = 'PersonalName';
      }else if (type == 'http://id.loc.gov/ontologies/bibframe/Work') {
        rdftype = 'Work';
      }else if (type == 'http://id.loc.gov/ontologies/bibframe/Instance') {
        rdftype = 'Instance';
      }










      return rdftype;
    },

    /**
    * Maps common Wikidata entity types to MADS RDF types
    * @param {string} wikidataId - The Wikidata QID
    * @return {string} - The corresponding MADS RDF type shortname
    */
    wikidataTypeToRdf: function(wikidataId){
      // Common Wikidata entity types
      switch (wikidataId) {
        // People
        case 'Q5': // human
        case 'Q215627': // person
        case 'Q3658341': // literary character
          return 'PersonalName';
          
        // Organizations
        case 'Q43229': // organization
        case 'Q161726': // company
        case 'Q31855': // research institute
        case 'Q4830453': // business
        case 'Q783794': // company
        case 'Q7210356': // institution
        case 'Q891723': // public company
          return 'CorporateName';
          
        // Places
        case 'Q2221906': // geographic location
        case 'Q27096213': // geographic entity
        case 'Q82794': // geographic region
        case 'Q15284': // municipality
        case 'Q6256': // country
        case 'Q515': // city
        case 'Q484170': // community
        case 'Q3957': // town
        case 'Q5119': // capital
          return 'Geographic';
        
        // Taxonomic ranks (like our spider example)
        case 'Q16521': // taxon
        case 'Q147897': // family (taxonomy)
        case 'Q37517': // biological classification
        case 'Q7432': // species
        case 'Q38348': // family
        case 'Q146481': // breed
          return 'Topic';
          
        // Concepts, subjects, etc.
        case 'Q151885': // concept
        case 'Q1190554': // occurrence
        case 'Q35120': // event
        case 'Q17537576': // creative work
        case 'Q571': // book
        case 'Q11424': // film
        case 'Q7725634': // literary work
        case 'Q1004': // work of art
          return 'Topic';
          
        default:
          return null; // Return null for unknown types
      }
    },

    /**
    * Attempts to guess the entity type from its description
    * @param {string} description - The entity description
    * @return {string} - The guessed MADS RDF type shortname
    */
    guessTypeFromDescription: function(description){
      // Convert to lowercase for case-insensitive matching
      const desc = description.toLowerCase();
      
      // Check for person indicators
      if (desc.includes('person') || 
          desc.includes('author') || 
          desc.includes('writer') || 
          desc.includes('actor') || 
          desc.includes('politician') || 
          desc.includes('scientist')) {
        return 'PersonalName';
      }
      
      // Check for organization indicators
      if (desc.includes('organization') || 
          desc.includes('company') || 
          desc.includes('corporation') || 
          desc.includes('institution') || 
          desc.includes('university') || 
          desc.includes('government')) {
        return 'CorporateName';
      }
      
      // Check for place indicators
      if (desc.includes('country') || 
          desc.includes('city') || 
          desc.includes('town') || 
          desc.includes('region') || 
          desc.includes('place') ||
          desc.includes('location') ||
          desc.includes('geographic')) {
        return 'Geographic';
      }
      
      // Default to Topic for everything else
      return 'Topic';
    },

    fetchBfdbXML: async function(url){
      if (url.includes('/works/')){
        url = url.replace(/\.jsonld/,'.rdf')
      }
      url = url.replace(/\.jsonld/,'.xml')
      if (!url.includes('?')){
        url = url + '?nocache='+Date.now()
      }
      console.log("[fetchBfdbXML] Fetching:", url)
      let r
      try{
        r = await this.fetchSimpleLookup(url)
        if (r === false || r === null || r === undefined || r === '') {
          console.warn("[fetchBfdbXML] No data returned from fetchSimpleLookup for URL:", url)
          return null
        }
        console.log("[fetchBfdbXML] Data returned (first 200 chars):", typeof r === 'string' ? r.substring(0,200) : r)
        return r
      }catch (error) {
        console.error("[fetchBfdbXML] Error fetching record:", error)
        return null
      }
    },



    /**
    *
    * @typedef {subjectLinkModeResolveLCSHResult} subjectLinkModeResolveLCSHResult
    * @property {string} lccn - the lccn searched
    */

    /**
    *
    * @async
    * @param {string} lcsh - the LCSH string MARC encoded
    * @return {subjectLinkModeResolveLCSHResult} - A {@link subjectLinkModeResolveLCSHResult} result
    */

    subjectLinkModeResolveLCSH: async function(lcsh, searchType=null){
      if (this.subjectSearchActive){
        for (let controller in this.controllers){
          this.controllers[controller].abort()
          this.controllers[controller] = new AbortController()
        }
      }
      this.subjectSearchActive = true

      let result = {
        resultType: '',
        msg: ''
      }

      let regexResults

      lcsh=lcsh.trim()

      lcsh = lcsh.normalize()

      if (!lcsh){
        result.resultType = 'ERROR'
        result.msg = 'REGEX Error: That value doesn\'t look like a valid MARC encoded LCSH string (undefined)'
      }else if (lcsh && typeof lcsh != 'string'){
        result.resultType = 'ERROR'
        result.msg = 'REGEX Error: That value doesn\'t look like a valid MARC encoded LCSH string (not string)'
      }

      lcsh=lcsh.replace(/[\|\$\‡]{1}[bcd]{1}/g, ' ').replace(/\s{2,}/g, ' ')

      // .replace(/\$b/g,' ').replace(/\|b/g,' ').replace(/‡b/g,' ')
      //          .replace(/\$c/g,'').replace(/\|c/g,'').replace(/‡c/g,'')
      //          .replace(/\$d/g,'').replace(/\|d/g,'').replace(/‡d/g,'')
      //          .replace(/\s{2,}/g, ' ')

      // if it doesn't have a $a or ‡a in the start of the string add it
      // often times copying from a system they dont include the $a
      if (lcsh.substring(0,2) != '$a' && lcsh.substring(0,2) != '‡a' && lcsh.substring(0,2) != '|a'){
        lcsh = '$a' + lcsh
      }


      // check to see if there are two geographic headings in a row, if there is then
      // it is likely a indirect geographic so collapse the $zABCD$zXYZ into $zABCD--XYZ
      if (lcsh.match(/[$‡|]z.*([$‡|]z.*)/) && lcsh.match(/[$‡|]z.*([$‡|]z.*)/).length === 2){
        let secondDollarZ = lcsh.match(/[$]z.*([$]z.*)/)[1]
        let collapsedDollarZ
        if (lcsh.match(/[$]z.*([$]z.*)/)){
          collapsedDollarZ = secondDollarZ.replace('$z','--')
        }else if (lcsh.match(/[|]z.*([|]z.*)/)){
          collapsedDollarZ = secondDollarZ.replace('|z','--')
        }else {
          collapsedDollarZ = secondDollarZ.replace('‡z','--')
        }
        lcsh = lcsh.replace(secondDollarZ,collapsedDollarZ)

		//if there is a space before the hyphens remove it. It prevents matches
		if (lcsh.includes(" --")){
			lcsh = lcsh.replace(" --", "--")
		}
		//Also remove spaces after the hyphens
		if (lcsh.includes("-- ")){
			lcsh = lcsh.replace("-- ", "--")
		}

      }


      // first we have to test the encoded string to see if it is valid
      let dollarCount = lcsh.split(/[$‡|]/).length-1

      if (dollarCount > 0){
        if (dollarCount == 1){
          regexResults = lcsh.match(/([$‡|][avxyz].*)/)
        }else if (dollarCount == 2){
          regexResults = lcsh.match(/([$‡|][avxyz].*)([$‡|][avxyz].*)/)
        }else if (dollarCount == 3){
          regexResults = lcsh.match(/([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)/)
        }else if (dollarCount == 4){
          regexResults = lcsh.match(/([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)/)
        }else if (dollarCount == 5){
          regexResults = lcsh.match(/([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)/)
        }else if (dollarCount == 6){
          regexResults = lcsh.match(/([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)/)
        }else if (dollarCount == 7){
          regexResults = lcsh.match(/([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)/)
        }else if (dollarCount == 8){
          regexResults = lcsh.match(/([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)([$‡|][avxyz].*)/)
        }else{
          result.resultType = 'ERROR'
          result.msg = 'REGEX Error: That value doesn\'t look like a valid MARC encoded LCSH string (too long? invalid format?)'
        }

        // console.log('regexResults',regexResults)
        try{
          regexResults = regexResults.slice(1,regexResults.length)
          for (let r of regexResults){
            if (r.slice(0,2).toLowerCase() != '$v' &&
                r.slice(0,2).toLowerCase() != '$a' &&
                r.slice(0,2).toLowerCase() != '$x' &&
                r.slice(0,2).toLowerCase() != '$y' &&
                r.slice(0,2).toLowerCase() != '$z' &&
                r.slice(0,2).toLowerCase() != '‡v' &&
                r.slice(0,2).toLowerCase() != '‡a' &&
                r.slice(0,2).toLowerCase() != '‡x' &&
                r.slice(0,2).toLowerCase() != '‡y' &&
                r.slice(0,2).toLowerCase() != '‡z' &&
                r.slice(0,2).toLowerCase() != '|v' &&
                r.slice(0,2).toLowerCase() != '|a' &&
                r.slice(0,2).toLowerCase() != '|x' &&
                r.slice(0,2).toLowerCase() != '|y' &&
                r.slice(0,2).toLowerCase() != '|z'
                ){
              // console.log(r.slice(0,2).toLowerCase())
              result.resultType = 'ERROR'
              result.msg = 'REGEX Error: That value doesn\'t look like a valid MARC encoded LCSH string (error spliting into seperate values)'
            }
          }
        }catch{
          result.resultType = 'ERROR'
          result.msg = 'REGEX Error: That value doesn\'t look like a valid MARC encoded LCSH string (error spliting into seperate values)'
        }


      }else{
        result.resultType = 'ERROR'
        result.msg = 'REGEX Error: That value doesn\'t look like a valid MARC encoded LCSH string'
      }

      if (result.resultType == 'ERROR'){ return result}

      // it looks like its probably well formated marc lcsh heading
      let headings = regexResults.slice(0,regexResults.length).map((r)=>{
        return {
          type: r.slice(1,2),
          label: r.slice(2,r.length).trim().replace(/\.[$‡|]/gu, '').replace(/\.$/,'') // remove any trailing periods
        }
      })


      // mark which ones are subdivisions
      for (const [i, r] of headings.entries()) {
        if (i > 0){
          r.subdivision = true
          r.primary = false
        }else{
          r.subdivision = false
          r.primary = true
        }

        // and their type if it is easily known, set it to default topic
        if (r.type == 'a'){
          r.rdfType = 'http://www.loc.gov/mads/rdf/v1#Topic'
        } else if (r.type == 'v'){
          r.rdfType = 'http://www.loc.gov/mads/rdf/v1#GenreForm'
        } else if (r.type == 'x'){
          r.rdfType = 'http://www.loc.gov/mads/rdf/v1#Topic'
        } else if (r.type == 'z'){
          r.rdfType = 'http://www.loc.gov/mads/rdf/v1#Geographic'
        } else if (r.type == 'y'){
          r.rdfType = 'http://www.loc.gov/mads/rdf/v1#Temporal'
        } else{
          r.rdfType = 'http://www.loc.gov/mads/rdf/v1#Topic'
        }


      }

      // the complex heading is just xyz--abc--mnl used to see if the full heading is already authorized
      let complexHeading = headings.map((r)=>{ return r.label }).join('--')
      let subjectUrlComplex = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url.replace('<QUERY>',complexHeading).replace('&count=25','&count=5').replace("<OFFSET>", "1")+'&rdftype=ComplexType'
      let searchPayloadSubjectsComplex = {
        processor: 'lcAuthorities',
        url: [subjectUrlComplex],
        searchValue: complexHeading
      }

      for (let heading of headings){

        let foundHeading = false
        // console.log("---------------------\n",heading,"\n------------------------\n")

        // if after the first loop looking at the piramry if it hits a full authorized complex stop looping
        if (result && result.resultType && result.resultType=='COMPLEX'){
          break
        }

        let searchVal = heading.label
        //encode the URLs
        searchVal = encodeURIComponent(searchVal)

        // we'll define all this for each one but not nessisarly use all of them

        let namesUrl = useConfigStore().lookupConfig['http://id.loc.gov/authorities/names'].modes[0]['NAF All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")
        let namesUrlSubdivision = useConfigStore().lookupConfig['http://id.loc.gov/authorities/names'].modes[0]['NAF All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")+'&memberOf=http://id.loc.gov/authorities/subjects/collection_Subdivisions'

        let subjectUrlSimple = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")+'&rdftype=SimpleType'
        let subjectUrlSimpleSubdivison = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")+'&rdftype=SimpleType&memberOf=http://id.loc.gov/authorities/subjects/collection_Subdivisions'
        let subjectUrlTemporal = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")+'&memberOf=http://id.loc.gov/authorities/subjects/collection_TemporalSubdivisions'
        let subjectUrlGenre = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")+'&rdftype=GenreForm'

        let worksUrlAnchored = useConfigStore().lookupConfig['https://id.loc.gov/resources/works'].modes[0]['Works - Left Anchored'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")
        let hubsUrlAnchored = useConfigStore().lookupConfig['https://id.loc.gov/resources/works'].modes[0]['Hubs - Left Anchored'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")

        let subjectUrlHierarchicalGeographic = useConfigStore().lookupConfig['HierarchicalGeographic'].modes[0]['All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")
        let subjectUrlHierarchicalGeographicLCSH = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")+ '&rdftype=HierarchicalGeographic'

        let subjectUrlGeographicLCSH = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")+'&rdftype=Geographic&memberOf=http://id.loc.gov/authorities/subjects/collection_Subdivisions'
        let subjectUrlGeographicLCNAF = useConfigStore().lookupConfig['http://id.loc.gov/authorities/names'].modes[0]['NAF All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")+'&rdftype=Geographic&memberOf=http://id.loc.gov/authorities/subjects/collection_Subdivisions'

        let subjectChildren = useConfigStore().lookupConfig['http://id.loc.gov/authorities/childrensSubjects'].modes[0]['LCSHAC All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")
        let childrenSubjectSubdivision = useConfigStore().lookupConfig['http://id.loc.gov/authorities/childrensSubjects'].modes[0]['LCSHAC All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=4').replace("<OFFSET>", "1")+'&memberOf=http://id.loc.gov/authorities/subjects/collection_Subdivisions'

        const exactUri = 'https://id.loc.gov/authorities/<SCHEME>/label/' + searchVal
        let exactName = exactUri.replace('<SCHEME>', 'names')
        let exactSubject = exactUri.replace('<SCHEME>', 'subjects')

        let exactPayloadName = {
          processor: 'lcAuthorities',
          url: [exactName],
          searchValue: searchVal,
          subjectSearch: true,
          signal: this.controllers.exactName.signal,
        }

        let exactPayloadSubject = {
          processor: 'lcAuthorities',
          url: [exactSubject],
          searchValue: searchVal,
          subjectSearch: true,
          signal: this.controllers.exactSubject.signal,
        }

        // console.log('subjectUrlSimpleSubdivison',subjectUrlSimpleSubdivison)
        let searchPayloadNames = {
          processor: 'lcAuthorities',
          url: [namesUrl],
          searchValue: searchVal,
          signal: this.controllers.controllerNames.signal
        }
        let searchPayloadNamesSubdivision = {
          processor: 'lcAuthorities',
          url: [namesUrlSubdivision],
          searchValue: searchVal,
          signal: this.controllers.controllerNamesSubdivision.signal
        }

        let searchPayloadSubjectsSimple = {
          processor: 'lcAuthorities',
          url: [subjectUrlSimple],
          searchValue: searchVal,
          signal: this.controllers.controllerSubjectsSimple.signal
        }
        let searchPayloadSubjectsSimpleSubdivision = {
          processor: 'lcAuthorities',
          url: [subjectUrlSimpleSubdivison],
          searchValue: searchVal,
          signal: this.controllers.controllerPayloadSubjectsSimpleSubdivision.signal
        }

        let searchPayloadTemporal = {
          processor: 'lcAuthorities',
          url: [subjectUrlTemporal],
          searchValue: searchVal,
          signal: this.controllers.controllerTemporal.signal
        }

        let searchPayloadGenre = {
          processor: 'lcAuthorities',
          url: [subjectUrlGenre],
          searchValue: searchVal,
          signal: this.controllers.controllerGenre.signal
        }

        let searchPayloadHierarchicalGeographic = {
          processor: 'lcAuthorities',
          url: [subjectUrlHierarchicalGeographic],
          searchValue: searchVal,
          signal: this.controllers.controllerHierarchicalGeographic.signal
        }
        let searchPayloadHierarchicalGeographicLCSH = {
          processor: 'lcAuthorities',
          url: [subjectUrlHierarchicalGeographicLCSH],
          searchValue: searchVal,
          signal: this.controllers.controllerHierarchicalGeographicLCSH.signal
        }

        let searchPayloadGeographicLCSH = {
          processor: 'lcAuthorities',
          url: [subjectUrlGeographicLCSH],
          searchValue: searchVal,
          signal: this.controllers.controllerGeographicLCSH.signal
        }
        let searchPayloadGeographicLCNAF = {
          processor: 'lcAuthorities',
          url: [subjectUrlGeographicLCNAF],
          searchValue: searchVal,
          signal: this.controllers.controllerGeographicLCNAF.signal
        }

        let searchPayloadWorksAnchored = {
          processor: 'lcAuthorities',
          url: [worksUrlAnchored],
          searchValue: searchVal,
          signal: this.controllers.controllerWorksAnchored.signal
        }
        let searchPayloadHubsAnchored = {
          processor: 'lcAuthorities',
          url: [hubsUrlAnchored],
          searchValue: searchVal,
          signal: this.controllers.controllerHubsAnchored.signal
        }

        let searchPayloadChildren = {
          processor: 'lcAuthorities',
          url: [subjectChildren],
          searchValue: searchVal,
          signal: this.controllers.controllerCyak.signal
        }

        let searchPayloadChildrenSub = {
          processor: 'lcAuthorities',
          url: [childrenSubjectSubdivision],
          searchValue: searchVal,
          signal: this.controllers.controllerCyak.signal
        }

        let resultsNames =[]
        let resultsNamesSubdivision =[]


        let resultsSubjectsSimple=[]
        let resultsSubjectsComplex=[]
        let resultsHierarchicalGeographic=[]
        let resultsHierarchicalGeographicLCSH=[]
        let resultsWorksAnchored=[]
        let resultsHubsAnchored=[]
        let resultsPayloadSubjectsSimpleSubdivision=[]
        let resultsPayloadSubjectsTemporal=[]

        let resultsGeographicLCNAF =[]
        let resultsGeographicLCSH =[]

        let resultsChildren = []
        let resultsChildrenSubDiv = []

        let resultsGenre=[]

        let resultsExactName = []
        let resultsExactSubject = []

        // if it is a primary heading then we need to search LCNAF, HUBS, WORKS, and simple subjects, and do the whole thing with complex subjects
        if (heading.primary){
          // resultsNames = await this.searchComplex(searchPayloadNames)
          [resultsNames, resultsNamesSubdivision, resultsSubjectsSimple, resultsPayloadSubjectsSimpleSubdivision, resultsSubjectsComplex, resultsHierarchicalGeographic,resultsHierarchicalGeographicLCSH, resultsWorksAnchored, resultsHubsAnchored, resultsChildren, resultsChildrenSubDiv, resultsExactName, resultsExactSubject] = await Promise.all([
              this.searchComplex(searchPayloadNames),
              this.searchComplex(searchPayloadNamesSubdivision),
              this.searchComplex(searchPayloadSubjectsSimple),
              this.searchComplex(searchPayloadSubjectsSimpleSubdivision),
              this.searchComplex(searchPayloadSubjectsComplex),
              this.searchComplex(searchPayloadHierarchicalGeographic),
              this.searchComplex(searchPayloadHierarchicalGeographicLCSH),
              this.searchComplex(searchPayloadWorksAnchored),
              this.searchComplex(searchPayloadHubsAnchored),
              this.searchComplex(searchPayloadChildren),
              this.searchComplex(searchPayloadChildrenSub),
              this.searchExact(exactPayloadName),
              this.searchExact(exactPayloadSubject),
          ]);

          // console.log("searchPayloadSubjectsSimpleSubdivision",searchPayloadSubjectsSimpleSubdivision)
          // console.log("resultsPayloadSubjectsSimpleSubdivision",resultsPayloadSubjectsSimpleSubdivision)

          // take out the literal values that are automatically added
          resultsNames = resultsNames.filter((r)=>{ return (!r.literal) })
          resultsNamesSubdivision = resultsNamesSubdivision.filter((r)=>{ return (!r.literal) })
          resultsSubjectsSimple = resultsSubjectsSimple.filter((r)=>{ return (!r.literal) })
          resultsSubjectsComplex = resultsSubjectsComplex.filter((r)=>{ return (!r.literal) })
          resultsHierarchicalGeographic = resultsHierarchicalGeographic.filter((r)=>{ return (!r.literal) })
          resultsHierarchicalGeographicLCSH = resultsHierarchicalGeographicLCSH.filter((r)=>{ return (!r.literal) })
          resultsWorksAnchored = resultsWorksAnchored.filter((r)=>{ return (!r.literal) })
          resultsHubsAnchored = resultsHubsAnchored.filter((r)=>{ return (!r.literal) })
          resultsPayloadSubjectsSimpleSubdivision = resultsPayloadSubjectsSimpleSubdivision.filter((r)=>{ return (!r.literal) })
          resultsChildren = resultsChildren.filter((r)=>{ return (!r.literal) })
          resultsChildrenSubDiv = resultsChildrenSubDiv.filter((r)=>{ return (!r.literal) })

          resultsExactName = resultsExactName.filter((term) =>  Object.keys(term).includes("suggestLabel") )
          resultsExactSubject = resultsExactSubject.filter((term) =>  Object.keys(term).includes("suggestLabel") )

          // console.log("Yeeth")
          // console.log("resultsNames",resultsNames)
          // console.log("resultsSubjectsSimple",resultsSubjectsSimple)
          // console.log("resultsPayloadSubjectsSimpleSubdivision",resultsPayloadSubjectsSimpleSubdivision)
          // console.log("resultsSubjectsComplex",resultsSubjectsComplex)
          // console.log("resultsHierarchicalGeographic",resultsHierarchicalGeographic)
          // console.log("resultsWorksAnchored",resultsWorksAnchored)
          // console.log("resultsHubsAnchored",resultsHubsAnchored)

          // first see if we matched the whole thing
          // console.log("resultsSubjectsComplex",resultsSubjectsComplex)
          // console.log("heading",heading)
          if (resultsSubjectsComplex.length>0){
            for (let r of resultsSubjectsComplex){
              // console.log("r ",r)
              if (complexHeading.toLowerCase().trim().toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.label.toLowerCase().trim().toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '')){
                result.resultType = 'COMPLEX'
                r.heading = heading
                result.hit = r
                // console.log("r",r)
                foundHeading=true
                break
              }
            }
            if (foundHeading){ break }
          }

          // remove any sub divisions from the main one
          let subdivisionUris = resultsPayloadSubjectsSimpleSubdivision.map(  (r) => { return r.uri } )
          resultsSubjectsSimple = resultsSubjectsSimple.filter((r) => { return subdivisionUris.indexOf(r.uri) } )

          // do the same for names
          subdivisionUris = resultsNamesSubdivision.map(  (r) => { return r.uri } )
          resultsNames = resultsNames.filter((r) => { return subdivisionUris.indexOf(r.uri) } )

          // console.log("resultsSubjectsSimple",resultsSubjectsSimple)

          // there's an exact match on the Known-Label lookup
          let exact = resultsExactSubject.concat(resultsExactName)
          if (exact.length == 1){ // if there's only 1 exact match, use it.
            for (let r of exact){
              result.resultType = 'KNOWN-LABEL'
              if (!result.hit){ result.hit = [] }
              r.heading = heading
              result.hit.push(r)
              foundHeading = true
              break
            }
            if (foundHeading){ continue }
          }

          // see if there is a match for CYAK
          if (searchType && searchType.includes(":Topic:Childrens:")){
            if (resultsChildren.length>0){
              for (let r of resultsChildren){
                // lower case, remove end space, make double whitespace into one and remove any punctuation
                if (heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.label.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '') || heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.vlabel.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '')){
                  result.resultType = 'PRECOORD-LCSH'
                  if (!result.hit){ result.hit = [] }
                  r.heading = heading
                  result.hit.push(r)
                  foundHeading = true
                  break
                }
              }
              if (foundHeading){ continue }
            }
          } else {
            // if not see if we matched a simple subject that is not a subdivison
            if (resultsSubjectsSimple.length>0){
              for (let r of resultsSubjectsSimple){
                // lower case, remove end space, make double whitespace into one and remove any punctuation
                if (heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.label.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '') || heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.vlabel.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '')){
                  result.resultType = 'PRECOORD-LCSH'
                  if (!result.hit){ result.hit = [] }
                  r.heading = heading
                  result.hit.push(r)
                  foundHeading = true
                  break
                }
              }
              if (foundHeading){ continue }
            }
          }

          // see if we matched a LCNAF name as primary compontant
          if (resultsNames.length>0){
            for (let r of resultsNames){
              // lower case, remove end space, make double whitespace into one and remove any punctuation
              if (heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.label.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '')){
                result.resultType = 'PRECOORD-NAF'
                if (!result.hit){ result.hit = [] }
                r.heading = heading
                result.hit.push(r)
                foundHeading = true
                break
              }
            }
            if (foundHeading){ continue }
          }

          // see if we matched a Work name as primary compontant
          if (resultsWorksAnchored.length>0){
            for (let r of resultsWorksAnchored){
              // lower case, remove end space, make double whitespace into one and remove any punctuation
              if (heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.label.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '')){
                result.resultType = 'PRECOORD-WORK'
                if (!result.hit){ result.hit = [] }
                r.heading = heading
                result.hit.push(r)
                foundHeading = true
                break
              }
            }
            if (foundHeading){ continue }
          }

          // see if we matched a Hub name as primary compontant
          if (resultsHubsAnchored.length>0){
            for (let r of resultsHubsAnchored){
              // lower case, remove end space, make double whitespace into one and remove any punctuation
              if (heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.label.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '')){
                result.resultType = 'PRECOORD-HUB'
                if (!result.hit){ result.hit = [] }
                r.heading = heading
                result.hit.push(r)
                foundHeading = true
                break
              }
            }
            if (foundHeading){ continue }
          }

          if (!foundHeading){
            if (!result.hit){ result.hit = [] }
            // wasn't found, we need to make it a literal
            result.hit.push(        {
              label: heading.label,
              suggestLabel: heading.label,
              uri: null,
              literal: true,
              depreciated: false,
              extra: '',
              heading: heading
            })
          }


        }else{ // is not primary
          // since it is not the primary it is going to be a subdivision
          // and we have some options that cannot happen like names/works/hubs
          // next we narrow it down furtrher to the type of subdivision
          //
          //

          if (heading.type === 'z'){ // geographic

            // we need to search both direct and indirect headings
            [resultsHierarchicalGeographic,resultsHierarchicalGeographicLCSH, resultsGeographicLCNAF, resultsGeographicLCSH] = await Promise.all([
                this.searchComplex(searchPayloadHierarchicalGeographic),
                this.searchComplex(searchPayloadHierarchicalGeographicLCSH),
                this.searchComplex(searchPayloadGeographicLCNAF),
                this.searchComplex(searchPayloadGeographicLCSH)
            ]);

            resultsHierarchicalGeographic = resultsHierarchicalGeographic.filter((r)=>{ return (!r.literal) })
            resultsHierarchicalGeographicLCSH = resultsHierarchicalGeographicLCSH.filter((r)=>{ return (!r.literal) })
            resultsGeographicLCNAF = resultsGeographicLCNAF.filter((r)=>{ return (!r.literal) })
            resultsGeographicLCSH = resultsGeographicLCSH.filter((r)=>{ return (!r.literal) })

            if (resultsHierarchicalGeographic.length>0){
              for (let r of resultsHierarchicalGeographic){
                // lower case, remove end space, make double whitespace into one and remove any punctuation
                if (heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.label.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '')){
                  r.heading = heading
                  result.hit.push(r)

                  foundHeading = true
                  break
                }
              }
              if (foundHeading){ continue }
            }
            if (resultsHierarchicalGeographicLCSH.length>0){
              for (let r of resultsHierarchicalGeographicLCSH){
                // lower case, remove end space, make double whitespace into one and remove any punctuation
                if (heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.label.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '')){
                  r.heading = heading
                  result.hit.push(r)

                  foundHeading = true
                  break
                }
              }
              if (foundHeading){ continue }
            }


            if (resultsGeographicLCNAF.length>0){
              for (let r of resultsGeographicLCNAF){
                // lower case, remove end space, make double whitespace into one and remove any punctuation
                if (heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.label.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '')){
                  r.heading = heading
                  result.hit.push(r)


                  foundHeading = true
                  break
                }
              }
              if (foundHeading){ continue }
            }
            if (resultsGeographicLCSH.length>0){
              for (let r of resultsGeographicLCSH){
                // lower case, remove end space, make double whitespace into one and remove any punctuation
                if (heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.label.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '')){
                  r.heading = heading
                  result.hit.push(r)


                  foundHeading = true
                  break
                }
              }
              if (foundHeading){ continue }
            }

            if (!foundHeading){
              // wasn't found, we need to make it a literal
              result.hit.push(        {
                label: heading.label,
                suggestLabel: heading.label,
                uri: null,
                literal: true,
                depreciated: false,
                extra: '',
                heading: heading
              })
            }

          } else if (heading.type === 'x' || heading.type === 'a'){ // general topical subdivision

            [resultsPayloadSubjectsSimpleSubdivision] = await Promise.all([
                this.searchComplex(searchPayloadSubjectsSimpleSubdivision)
            ]);

            // take out the literal values that are automatically added
            resultsPayloadSubjectsSimpleSubdivision = resultsPayloadSubjectsSimpleSubdivision.filter((r)=>{ return (!r.literal) })
            if (resultsPayloadSubjectsSimpleSubdivision.length>0){
              for (let r of resultsPayloadSubjectsSimpleSubdivision){
                // lower case, remove end space, make double whitespace into one and remove any punctuation
                if (heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.label.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '')){
                  r.heading = heading
                  result.hit.push(r)


                  foundHeading = true
                }
              }
              if (foundHeading){ continue }
            }

            //CYAK subdivisions
            if (resultsChildrenSubDiv.length>0 && searchType.includes(":Topic:Childrens:")){
              for (let r of resultsChildrenSubDiv){
                // lower case, remove end space, make double whitespace into one and remove any punctuation
                if (heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.label.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '')){
                  r.heading = heading
                  result.hit.push(r)


                  foundHeading = true
                }
              }
              if (foundHeading){ continue }
            }


            if (!foundHeading){
              // wasn't found, we need to make it a literal
              result.hit.push(        {
                label: heading.label,
                suggestLabel: heading.label,
                uri: null,
                literal: true,
                depreciated: false,
                extra: '',
                heading: heading
              })
            }



          } else if (heading.type === 'y'){ // Temporal

            [resultsPayloadSubjectsTemporal] = await Promise.all([
                this.searchComplex(searchPayloadTemporal)
            ]);

            // take out the literal values that are automatically added
            resultsPayloadSubjectsTemporal = resultsPayloadSubjectsTemporal.filter((r)=>{ return (!r.literal) })
            if (resultsPayloadSubjectsTemporal.length>0){
              for (let r of resultsPayloadSubjectsTemporal){
                // lower case, remove end space, make double whitespace into one and remove any punctuation
                if (heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.label.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '')){
                  r.heading = heading
                  result.hit.push(r)


                  foundHeading = true
                }
              }
              if (foundHeading){ continue }
            }


            if (!foundHeading){
              // wasn't found, we need to make it a literal
              result.hit.push(        {
                label: heading.label,
                suggestLabel: heading.label,
                uri: null,
                literal: true,
                depreciated: false,
                extra: '',
                heading: heading
              })
            }


          } else if (heading.type === 'v'){ // Genre

            [resultsGenre] = await Promise.all([
                this.searchComplex(searchPayloadGenre)
            ]);

            // take out the literal values that are automatically added
            resultsGenre = resultsGenre.filter((r)=>{ return (!r.literal) })
            if (resultsGenre.length>0){
              for (let r of resultsGenre){
                // lower case, remove end space, make double whitespace into one and remove any punctuation
                if (heading.label.toLowerCase().trim().replace(/\s+/g,' ').replace(/[\p{P}$+<=>^`|~]/gu, '') == r.label.toLowerCase().trim().replace(/[\p{P}$+<=>^`|~]/gu, '')){
                  r.heading = heading
                  result.hit.push(r)


                  foundHeading = true
                }
              }
              if (foundHeading){ continue }
            }


            if (!foundHeading){
              // wasn't found, we need to make it a literal
              result.hit.push(        {
                label: heading.label,
                suggestLabel: heading.label,
                uri: null,
                literal: true,
                depreciated: false,
                extra: '',
                heading: heading
              })
            }


          }
        }
      }


      let marcKeyPromises = []
      // we want to double check the rdfType heading to make sure if we need to ask id to get more clarity about the rdfType
      if (Array.isArray(result.hit)){
        // it wont be an array if its a complex heading
        for (let r of result.hit){
          if (!r.literal && r.uri.indexOf('id.loc.gov/authorities/names/') > 0){
            let responseUri = await this.returnRDFType(r.uri + '.madsrdf_raw.jsonld')
            if (responseUri){
              r.heading.rdfType = responseUri
            }
            // also we need the MARCKeys
            marcKeyPromises.push(this.returnMARCKey(r.uri + '.madsrdf_raw.jsonld'))
          }
        }

        let marcKeyPromisesResults = await Promise.all(marcKeyPromises);
        for (let marcKeyResult of marcKeyPromisesResults){
          for (let r of result.hit){
            if (r.uri == marcKeyResult.uri){
              r.marcKey = marcKeyResult.marcKey
            }
          }
        }
      }else if (result.hit && result.resultType == 'COMPLEX') {
        // if they are adding a complex value still need to lookup the marc key
        let marcKeyResult = await this.returnMARCKey(result.hit.uri + '.madsrdf_raw.jsonld')

        result.hit.marcKey = marcKeyResult.marcKey
      }
      // console.log("result",result)

      this.subjectSearchActive = false

      return result
    },

    /**
    * Send the URI it returns the URI to the MADS RDF type, mostly used for authoirties/names uris from id.loc.gov
    * @async
    * @param {string} uri - the URI to the authority we want to find the RDF type for
    * @return {string} - The URI of the likely MADSRDF rdf type
    */
    returnRDFType: async function(uri){

      uri=uri.trim()
      let uriToLookFor = uri

      // just clean up the URI a little we are probably asking for a id.loc.gov authority url
      if (uri.indexOf('id.loc.gov')>-1){

        // most uris in the id.loc.gov dataset do not have https in the data uris
        uriToLookFor = uriToLookFor.replace('https://','http://')

        uriToLookFor = uriToLookFor.replace('.madsrdf_raw.jsonld','')

        // any trailing slashers
        if (uri[uri.length-1] === '/'){
          uri = uri.slice(0,-2)
        }

        uri=uri.replace('.html','.json')

        // add in the filetype for the request if not yet
        if (uri.indexOf('.json')===-1){
          uri=uri+'.json'
        }
      }

      let data = await this.fetchSimpleLookup(uri,true)

      if (uri.indexOf('id.loc.gov')>-1){

        for (let d of data){

          // loop through the graphs
          if (d && d['@id'] && d['@id'] == uriToLookFor){
            // this is the right graph
            if (d['@type']){
              for (let type of d['@type']){

                // for now we are looking for spefic mads types
                if (type == 'http://www.loc.gov/mads/rdf/v1#Temporal'){ return 'http://www.loc.gov/mads/rdf/v1#Temporal'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#ComplexSubject'){ return 'http://www.loc.gov/mads/rdf/v1#ComplexSubject'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#ConferenceName'){ return 'http://www.loc.gov/mads/rdf/v1#ConferenceName'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#CorporateName'){ return 'http://www.loc.gov/mads/rdf/v1#CorporateName'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#FamilyName'){ return 'http://www.loc.gov/mads/rdf/v1#FamilyName'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#Geographic'){ return 'http://www.loc.gov/mads/rdf/v1#Geographic'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#GenreForm'){ return 'http://www.loc.gov/mads/rdf/v1#GenreForm'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#Language'){ return 'http://www.loc.gov/mads/rdf/v1#Language'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#MainTitleElement'){ return 'http://www.loc.gov/mads/rdf/v1#MainTitleElement'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#Meeting'){ return 'http://www.loc.gov/mads/rdf/v1#Meeting'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#NameTitle'){ return 'http://www.loc.gov/mads/rdf/v1#NameTitle'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#PersonalName'){ return 'http://www.loc.gov/mads/rdf/v1#PersonalName'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#Temporal'){ return 'http://www.loc.gov/mads/rdf/v1#Temporal'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#Title'){ return 'http://www.loc.gov/mads/rdf/v1#Title'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#Topic'){ return 'http://www.loc.gov/mads/rdf/v1#Topic'}
                else if(type == 'http://www.loc.gov/mads/rdf/v1#SimpleType'){ return 'http://www.loc.gov/mads/rdf/v1#SimpleType'}
              }
            }
          }
        }
      }

      return false

    },

    /**
    * Send the URI it returns the MARC Key, mostly used for authoirties/names uris from id.loc.gov
    * @async
    * @param {string} uri - the URI to the authority we want to find the RDF type for
    * @return {string} - The URI of the likely MADSRDF rdf type
    */
    returnMARCKey: async function(uri){
      uri=uri.trim()

      // marc keys don't exist on the RWO so if they are asking for a RWO switch it to a auth
      uri = uri.replace('/rwo/agents/','/authorities/names/')


      let uriToLookFor = uri

      // just clean up the URI a little we are probably asking for a id.loc.gov authority url
      if (uri.indexOf('id.loc.gov')>-1){

        // most uris in the id.loc.gov dataset do not have https in the data uris
        uriToLookFor = uriToLookFor.replace('https://','http://')



        uriToLookFor = uriToLookFor.replace('.madsrdf_raw.jsonld','')

        // any trailing slashers
        if (uri[uri.length-1] === '/'){
          uri = uri.slice(0,-2)
        }

        uri=uri.replace('.html','.json')

        // add in the filetype for the request if not yet
        if (uri.indexOf('.json')===-1){
          uri=uri+'.json'
        }
      }
      console.log("uriuriuriuriuriuriuriuriuriuri",uri)
      let data = await this.fetchSimpleLookup(uri,true)

      if (data && uri.indexOf('id.loc.gov')>-1){

        for (let d of data){
          // loop through the graphs
          if (d && d['@id'] && d['@id'] == uriToLookFor){
            // this is the right graph
            if (d['http://id.loc.gov/ontologies/bflc/marcKey']){
              for (let marcKey of d['http://id.loc.gov/ontologies/bflc/marcKey']){
                if (marcKey['@value'] && !marcKey['@language']){
                  return {marcKey: marcKey['@value'], uri: uriToLookFor}
                }
              }
            }
          }
        }
      }

      return false

    },


    /**
    *
    * @async
    * @param {string} searchVal - the value to search lcsh for
    * @param {string} complexVal - The orginal full string
    * @param {string} mode - the search mode LCSHNAF GEO WORKS HUBS
    * @return {} -
    */
    subjectSearch: async function(searchVal,complexVal,mode){
      //encode the URLs
      searchVal = encodeURIComponent(searchVal)
      complexVal = encodeURIComponent(complexVal)

      if (this.subjectSearchActive){
        for (let controller in this.controllers){
          this.controllers[controller].abort()
          this.controllers[controller] = new AbortController()
        }
      }

      const numResultsNames = usePreferenceStore().returnValue('--b-edit-complex-number-names')
      const numResultsComplex = usePreferenceStore().returnValue('--b-edit-complex-number-complex')
      const numResultsSimple = usePreferenceStore().returnValue('--b-edit-complex-number-simple')
      const numResultsCyac = usePreferenceStore().returnValue('--b-edit-complex-number-cyac')


      this.subjectSearchActive = true
      let namesUrl = useConfigStore().lookupConfig['http://id.loc.gov/authorities/names'].modes[0]['NAF All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count='+numResultsNames).replace("<OFFSET>", "1")+'&memberOf=http://id.loc.gov/authorities/names/collection_NamesAuthorizedHeadings'
      let namesUrlSubdivision = useConfigStore().lookupConfig['http://id.loc.gov/authorities/names'].modes[0]['NAF All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")+'&memberOf=http://id.loc.gov/authorities/subjects/collection_Subdivisions'

      let subjectUrlComplex = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url.replace('<QUERY>',complexVal).replace('&count=25','&count='+numResultsComplex).replace("<OFFSET>", "1")+'&rdftype=ComplexType'+'&memberOf=http://id.loc.gov/authorities/subjects/collection_LCSHAuthorizedHeadings'
      let subjectUrlSimple = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count='+numResultsSimple).replace("<OFFSET>", "1")+'&rdftype=SimpleType'+'&memberOf=http://id.loc.gov/authorities/subjects/collection_LCSHAuthorizedHeadings'
      let subjectUrlSimpleSubdivison = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")+'&rdftype=SimpleType&memberOf=http://id.loc.gov/authorities/subjects/collection_Subdivisions'
      let subjectUrlTemporal = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")+'&memberOf=http://id.loc.gov/authorities/subjects/collection_TemporalSubdivisions'
      let subjectUrlGenre = useConfigStore().lookupConfig['http://id.loc.gov/authorities/subjects'].modes[0]['LCSH All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=5').replace("<OFFSET>", "1")+'&rdftype=GenreForm'

      let worksUrlKeyword = useConfigStore().lookupConfig['https://id.loc.gov/resources/works'].modes[0]['Works - Keyword'].url.replace('<QUERY>',searchVal).replace('&count=25','&count='+numResultsSimple).replace("<OFFSET>", "1")
      let worksUrlAnchored = useConfigStore().lookupConfig['https://id.loc.gov/resources/works'].modes[0]['Works - Left Anchored'].url.replace('<QUERY>',searchVal).replace('&count=25','&count='+numResultsSimple).replace("<OFFSET>", "1")

      let hubsUrlKeyword = useConfigStore().lookupConfig['https://id.loc.gov/resources/works'].modes[0]['Hubs - Keyword'].url.replace('<QUERY>',searchVal).replace('&count=25','&count='+numResultsSimple).replace("<OFFSET>", "1")
      let hubsUrlAnchored = useConfigStore().lookupConfig['https://id.loc.gov/resources/works'].modes[0]['Hubs - Left Anchored'].url.replace('<QUERY>',searchVal).replace('&count=25','&count='+numResultsSimple).replace("<OFFSET>", "1")

      let childrenSubject = useConfigStore().lookupConfig['http://id.loc.gov/authorities/childrensSubjects'].modes[0]['LCSHAC All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count='+numResultsCyac).replace("<OFFSET>", "1")+'&-memberOf=http://id.loc.gov/authorities/subjects/collection_Subdivisions'
      let childrenSubjectComplex = useConfigStore().lookupConfig['http://id.loc.gov/authorities/childrensSubjects'].modes[0]['LCSHAC All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count='+numResultsCyac).replace("<OFFSET>", "1")+'&rdftype=ComplexType'
      let childrenSubjectSubdivision = useConfigStore().lookupConfig['http://id.loc.gov/authorities/childrensSubjects'].modes[0]['LCSHAC All'].url.replace('<QUERY>',searchVal).replace('&count=25','&count=4').replace("<OFFSET>", "1")+'&memberOf=http://id.loc.gov/authorities/subjects/collection_Subdivisions'

      let searchValHierarchicalGeographic = searchVal.replaceAll('‑','-') //.split(' ').join('--')

      let subjectUrlHierarchicalGeographic = useConfigStore().lookupConfig['HierarchicalGeographic'].modes[0]['All'].url.replace('<QUERY>',searchValHierarchicalGeographic).replace('&count=25','&count='+numResultsComplex).replace("<OFFSET>", "1")

      const exactUri = 'https://id.loc.gov/authorities/<SCHEME>/label/' + searchVal
      let exactName = exactUri.replace('<SCHEME>', 'names')
      let exactSubject = exactUri.replace('<SCHEME>', 'subjects')
      //children's subjects is supported by known-label lookup?

      if (mode == 'GEO'){
        subjectUrlHierarchicalGeographic = subjectUrlHierarchicalGeographic.replace('&count=4','&count=12').replace("<OFFSET>", "1")
      }

      searchVal = decodeURIComponent(searchVal)
      complexVal = decodeURIComponent(complexVal)

      let exactPayloadName = {
        processor: 'lcAuthorities',
        url: [exactName],
        searchValue: searchVal,
        subjectSearch: true,
        signal: this.controllers.exactName.signal,
      }

      let exactPayloadSubject = {
        processor: 'lcAuthorities',
        url: [exactSubject],
        searchValue: searchVal,
        subjectSearch: true,
        signal: this.controllers.exactSubject.signal,
      }

      let searchPayloadNames = {
        processor: 'lcAuthorities',
        url: [namesUrl],
        searchValue: searchVal,
        subjectSearch: true,
        signal: this.controllers.controllerNames.signal,
      }
      let searchPayloadNamesSubdivision = {
        processor: 'lcAuthorities',
        url: [namesUrlSubdivision],
        searchValue: searchVal,
        subjectSearch: true,
        signal: this.controllers.controllerNamesSubdivision.signal,
      }

      let searchPayloadSubjectsSimple = {
        processor: 'lcAuthorities',
        url: [subjectUrlSimple],
        searchValue: searchVal,
        subjectSearch: true,
        signal: this.controllers.controllerSubjectsSimple.signal,
      }
      let searchPayloadSubjectsSimpleSubdivision = {
        processor: 'lcAuthorities',
        url: [subjectUrlSimpleSubdivison],
        searchValue: searchVal,
        subjectSearch: true,
        signal: this.controllers.controllerPayloadSubjectsSimpleSubdivision.signal,
      }
      let searchPayloadTemporal = {
        processor: 'lcAuthorities',
        url: [subjectUrlTemporal],
        searchValue: searchVal
      }
      let searchPayloadGenre = {
        processor: 'lcAuthorities',
        url: [subjectUrlGenre],
        searchValue: searchVal
      }

      let searchPayloadSubjectsComplex = {
        processor: 'lcAuthorities',
        url: [subjectUrlComplex],
        searchValue: searchVal,
        subjectSearch: true,
        signal: this.controllers.controllerSubjectsComplex.signal,
      }

      let searchPayloadChildrenSubjects = {
        processor: 'lcAuthorities',
        url: [childrenSubject],
        searchValue: searchVal,
        subjectSearch: true,
        signal: this.controllers.controllerSubjectsSimple.signal,
      }
      let searchPayloadChildrenSubjectsComplex = {
        processor: 'lcAuthorities',
        url: [childrenSubjectComplex],
        searchValue: searchVal,
        subjectSearch: true,
        signal: this.controllers.controllerSubjectsComplex.signal,
      }
      let searchPayloadChildrenSubjectsSubdivision = {
        processor: 'lcAuthorities',
        url: [childrenSubjectSubdivision],
        searchValue: searchVal,
        subjectSearch: true,
        signal: this.controllers.controllerPayloadSubjectsSimpleSubdivision.signal,
      }


      let searchPayloadHierarchicalGeographic = {
        processor: 'lcAuthorities',
        url: [subjectUrlHierarchicalGeographic],
        searchValue: searchValHierarchicalGeographic,
        subjectSearch: true,
        signal: this.controllers.controllerHierarchicalGeographic.signal,
      }

      let searchPayloadWorksAnchored = {
        processor: 'lcAuthorities',
        url: [worksUrlAnchored],
        searchValue: searchVal,
        subjectSearch: true,
        signal: this.controllers.controllerWorksAnchored.signal,
      }

      let searchPayloadWorksKeyword = {
        processor: 'lcAuthorities',
        url: [worksUrlKeyword],
        searchValue: searchVal,
        subjectSearch: true,
        signal: this.controllers.controllerWorksKeyword.signal,
      }

      let searchPayloadHubsAnchored = {
        processor: 'lcAuthorities',
        url: [hubsUrlAnchored],
        searchValue: searchVal,
        subjectSearch: true,
        signal: this.controllers.controllerHubsAnchored.signal,
      }

      let searchPayloadHubsKeyword = {
        processor: 'lcAuthorities',
        url: [hubsUrlKeyword],
        searchValue: searchVal,
        subjectSearch: true,
        signal: this.controllers.controllerHubsKeyword.signal,
      }



      let resultsNames =[]
      let resultsNamesSubdivision =[]

      let resultsSubjectsSimple=[]
      let resultsPayloadSubjectsSimpleSubdivision=[]
      let resultsSubjectsComplex=[]
      let resultsHierarchicalGeographic=[]
      let resultsWorksAnchored=[]
      let resultsWorksKeyword=[]
      let resultsHubsAnchored=[]
      let resultsHubsKeyword=[]

      let resultsChildrenSubjects = []
      let resultsChildrenSubjectsComplex = []
      let resultsChildrenSubjectsSubdivisions = []

      let resultsExactName = []
      let resultsExactSubject = []

      if (mode == "LCSHNAF"){
        [resultsNames, resultsNamesSubdivision, resultsSubjectsSimple, resultsPayloadSubjectsSimpleSubdivision, resultsSubjectsComplex, resultsHierarchicalGeographic, resultsExactName, resultsExactSubject] = await Promise.all([
            this.searchComplex(searchPayloadNames),
            this.searchComplex(searchPayloadNamesSubdivision),
            this.searchComplex(searchPayloadSubjectsSimple),
            this.searchComplex(searchPayloadSubjectsSimpleSubdivision),
            this.searchComplex(searchPayloadSubjectsComplex),
            this.searchComplex(searchPayloadHierarchicalGeographic),
            this.searchExact(exactPayloadName),
            this.searchExact(exactPayloadSubject),
        ]);

      } else if (mode == "CHILD"){
        [resultsNames, resultsNamesSubdivision, resultsChildrenSubjects, resultsChildrenSubjectsComplex, resultsChildrenSubjectsSubdivisions] = await Promise.all([
            this.searchComplex(searchPayloadNames),
            this.searchComplex(searchPayloadNamesSubdivision),
            this.searchComplex(searchPayloadChildrenSubjects),
            this.searchComplex(searchPayloadChildrenSubjectsComplex),
            this.searchComplex(searchPayloadChildrenSubjectsSubdivision)
        ]);

      }else if (mode == "GEO"){

        [resultsHierarchicalGeographic] = await Promise.all([
            this.searchComplex(searchPayloadHierarchicalGeographic)
        ]);

      }else if (mode == "WORKS"){

        [resultsWorksAnchored,resultsWorksKeyword ] = await Promise.all([
            this.searchComplex(searchPayloadWorksAnchored),
            this.searchComplex(searchPayloadWorksKeyword)
        ]);

      }else if (mode == "HUBS"){

        [resultsHubsAnchored,resultsHubsKeyword ] = await Promise.all([
            this.searchComplex(searchPayloadHubsAnchored),
            this.searchComplex(searchPayloadHubsKeyword)
        ]);

      }


      // drop the litearl value from names and complex
      if (resultsNames.length>0){
        resultsNames.pop()
      }
      resultsNamesSubdivision = resultsNamesSubdivision.filter((r) => {return (!r.literal)})
      if (resultsSubjectsComplex.length>0){
        resultsSubjectsComplex.pop()
      }
      if (resultsChildrenSubjectsComplex.length>0){
        resultsChildrenSubjectsComplex.pop()
      }


      if (resultsSubjectsSimple.length>0){
        resultsSubjectsSimple.push(resultsSubjectsSimple.pop())
        // resultsSubjectsSimple.reverse()
      }

      // resultsSubjectsComplex.reverse()


      // don't do literals

      let newresultsHierarchicalGeographic = []
      for (let x of resultsHierarchicalGeographic){
        if (!x.literal){
          newresultsHierarchicalGeographic.push(x)
        }
      }
      resultsHierarchicalGeographic = newresultsHierarchicalGeographic
      // resultsHierarchicalGeographic = [{
      //     "label": "Ohio--Cleveland",
      //     "suggestLabel": "Ohio--Cleveland",
      //     "uri": "http://id.loc.gov/authorities/names/n79086863",
      //     "literal": false,
      //     "extra": "",
      //     "labelOrginal": "Ohio--Cleveland",
      //     "picked": false
      // }]


      if (mode == "WORKS"){
        // over write the subjects if we are doing a work search
        resultsSubjectsSimple = resultsWorksAnchored
        resultsSubjectsComplex = resultsWorksKeyword
      }
      if (mode == "HUBS"){
        // over write the subjects if we are doing a work search
        resultsSubjectsSimple = resultsHubsAnchored
        resultsSubjectsComplex = resultsHubsKeyword
      }

      //determine position of search and set results accordingly
      let searchPieces = complexVal.split("--")
      let pos = searchPieces.indexOf(searchVal)

      if (resultsExactName && resultsExactName.length > 0){
        resultsExactName = resultsExactName.filter((term) =>  Object.keys(term).includes("suggestLabel") )
      }
      if (resultsExactSubject && resultsExactSubject.length > 0){
        resultsExactSubject = resultsExactSubject.filter((term) =>  Object.keys(term).includes("suggestLabel") )
      }

      let exact = []

      // Limit the exact results based on position in the heading. If pos >=1, the term needs to be a Subdivision
      if (pos >= 1){
        let isSubdivisionSubject = resultsExactSubject.length > 0 ? resultsExactSubject.map((term) => term.collections)[0].some(c => {return c == 'Subdivisions'}) : false
        let isSubdivisionName = resultsExactName.length > 0 ? resultsExactName.map((term) => term.collections)[0].some(c => {return c == 'Subdivisions'}) : false

        if (isSubdivisionName){
          exact = exact.concat(resultsExactName)
        }
        if (isSubdivisionSubject){
          exact = exact.concat(resultsExactSubject)
        }
      }
      if (pos == 0){
        exact = exact.concat(resultsExactName)
        exact = exact.concat(resultsExactSubject)
      }

      let results = {
        'subjectsSimple': pos == 0 ? resultsSubjectsSimple : resultsPayloadSubjectsSimpleSubdivision,
        'subjectsComplex': resultsSubjectsComplex,
        'names': pos == 0 ? resultsNames : resultsNamesSubdivision,
        'hierarchicalGeographic':  pos == 0 ? [] : resultsHierarchicalGeographic,
        'subjectsChildren': pos == 0 ? resultsChildrenSubjects : resultsChildrenSubjectsSubdivisions,
        'subjectsChildrenComplex': resultsChildrenSubjectsComplex,
        'exact': exact
      }

      this.subjectSearchActive = false
      return results

    },

    /**
    * Send the UNPOSTED record to the back end
    * @async
    * @param {string} xml - the XML from the export process
    * @param {string} eId - the editor id
    * @return {void} -
    */
    // TODO: The user reported an error "Type annotations can only be used in TypeScript files" pointing to the 'log' parameter on the next line.
    // However, no type annotation was visible in the provided code. Assuming a type annotation like ': any' was present but not shown, it should be removed.
    // If the error persists, check the project's build/lint configuration or the exact location reported by the tool.
    saveRecord: async function(xml, eId){
      const putMethod = {
        method: 'PUT', // Method itself
        headers: {
          'Content-type': 'application/xml', // Indicates the content
        },
        body: xml // We send data in JSON format
      }
      // console.log(putMethod)
      let url = useConfigStore().returnUrls.ldpjs +'ldp/' + eId

      await fetch(url, putMethod)
      .then(response => response.text())
      .then((responseText)=>{
        // console.log(responseText)
      })
      // .then(data => console.log(data)) // Manipulate the data retrieved back, if we want to do something with it
      .catch((err) => {
       console.log(err, " => ", url)
       alert("Error: Could not save the record!", err)
      }) // Do something with the error
     },

    /**
    * Retrive the UNPOSTED record from the back end
    * @async
    * @param {string} xml - the XML from the export process
    * @param {string} eId - the editor id
    * @return {void} -
    */
    loadSavedRecord: async function(id) {

       let url = useConfigStore().returnUrls.ldpjs +'ldp/' + id

       // let options = {}
       // if (json){
       //   options = {headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}, mode: "cors"}
       // }
       // console.log('options:',options)
       try{
         let response = await fetch(url);

         let data =  await response.text()

         return  data;

       }catch(err){
         //alert("There was an error retriving the record from:",url)
         console.error(err);

         // Handle errors here
       }
     },

     searchSavedRecords: async function(user, search) {

      let utilUrl = useConfigStore().returnUrls.util
      let utilPath = useConfigStore().returnUrls.env

      let url
      if (user && !search){
        url = `${utilUrl}myrecords/${utilPath}/${user}`
      }else if (user && search){
        url = `${utilUrl}allrecords/${utilPath}/${search}/${user}`
      }else{
        url = `${utilUrl}allrecords/${utilPath}/`
      }
      let r = await this.fetchSimpleLookup(url)

      if (r!==false){

        let rSorted = [];
        for (let id in r) {
            rSorted.push(r[id]);
        }
        rSorted.sort(function(a, b) {
            return b.timestamp - a.timestamp ;
        });

        console.log("Records data received:", r);  // Shows what's actually returned
        return rSorted

      }

      return []

  },

  /**
   * Validate a record sent to backend
   */
  validate: async function(xml){
    // dynamically use template from activeProfile, defaulting to 'monograph'
    const templateValue = (useConfigStore().activeProfile && useConfigStore().activeProfile.templateType) || 'monograph';
    let url = useConfigStore().returnUrls.validate + "?template=" + templateValue;
    try {
      const rawResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/rdf+xml'
        },
        body: xml
      });
      if (!rawResponse.ok) {
        const errorText = await rawResponse.text();
        console.error(`Validation failed: ${rawResponse.status} ${rawResponse.statusText}: ${errorText}`);
        // Optionally, log the error to your modal here:
        // this.logErrorToModal(`Validation failed: ${rawResponse.status} ${rawResponse.statusText}`);
        return { error: { message: `Validation failed: ${rawResponse.status} ${rawResponse.statusText}` } };
      }
      const content = await rawResponse.json();
      return content;
    } catch(err) {
      console.error("Validation error:", err);
      return { error: { message: err.message } };
    }
  },

  /**
  * Publish the NAR
  * @async
  * @param {string} xml - The xml string
  * @return {obj} - {status:false, msg: ""}
  */

  publishNar: async function(xml){


    let url = useConfigStore().returnUrls.publishNar

    let uuid = translator.toUUID(translator.new())

    const rawResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({marcxml:xml})
    });
    const content = await rawResponse.json();

    // console.log(content);

    if (content && content.publish && content.publish.status && content.publish.status == 'published'){

      return {status:true, postLocation: (content.postLocation) ? content.postLocation : null }

    }else{

      // alert("Did not post, please report this error--" + JSON.stringify(content,null,2))


      return {status:false, postLocation: (content.postLocation) ? content.postLocation : null, msg: JSON.stringify(content.publish,null,2), msgObj: content.publish}
    }
  },



  /**
  * Send off a rdf bibframe xml files in the format <rdf:RDF><bf:Work/><bf:Instance/>...etc...</rdf:RDF>
  * @async
  * @param {string} xml - The xml string
  * @param {boolean} html - return the response as HTML
  * @return {string} - the MARC in XML response
  */
  marcPreview: async function(xml, html=false){
    if (!xml){
      return ""
    }

    let url = useConfigStore().returnUrls.util + 'marcpreview'
    if (html) {
      url = url + '/html'
    } else {
      url = url + '/text'
    }
    const rawResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({rdfxml:xml})
    });
    const content = await rawResponse.json();

    return content

  },

  async publishRecord(xmlString, profile, publishUrl) {
    if (!profile || !profile.eId) {
      throw new Error('Profile or EID is not defined');
    }
    let uuid = translator.toUUID(translator.new());
    
    try {
      const rawResponse = await fetch(publishUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: uuid, rdfxml: xmlString, eid: profile.eId, hub: profile.hub })
      });
      
      if (!rawResponse.ok) {
        throw new Error(`Failed to publish: ${rawResponse.status} ${rawResponse.statusText}`);
      }
      
      const content = await rawResponse.json();
      console.log("Raw server response:", content);
      
      // Initialize arrays for MMS IDs
      let instanceMmsIds = [];
      let workMmsIds = [];
      let holdingInfo = null;
      
      // Handle nested work.mms_id format
      if (content.name && content.name.work && content.name.work.mms_id) {
        workMmsIds = Array.isArray(content.name.work.mms_id) ?
          content.name.work.mms_id : [content.name.work.mms_id];
      }
      
      // Handle nested instance.mms_id format
      if (content.name && content.name.instance && content.name.instance.mms_id) {
        instanceMmsIds = Array.isArray(content.name.instance.mms_id) ?
          content.name.instance.mms_id : [content.name.instance.mms_id];
          
        // Extract holding information if present
        if (content.name.instance.holding) {
          holdingInfo = {
            holding_id: content.name.instance.holding.holding_id,
            item_id: content.name.instance.holding.item_id
          };
        }
      }
      
      // Format response consistently for all publish types
      const response = {
        status: true,
        publish: {
          status: 'published'
        },
        postLocation: content.postLocation || null,
        name: {
          instance_mms_id: instanceMmsIds,
          work_mms_id: workMmsIds
        }
      };
      
      // Add holding information to the response if available
      if (holdingInfo) {
        response.name.instance = {
          mms_id: instanceMmsIds.length > 0 ? instanceMmsIds[0] : null,
          holding: holdingInfo
        };
      }
      
      return response;
    } catch (error) {
      console.error("Error publishing record:", error);
      return {
        status: false,
        publish: {
          status: 'error',
          message: error.message
        },
        postLocation: null,
        name: {
          instance_mms_id: [],
          work_mms_id: []
        }
      };
    }
  },

    /**
    * A result from searching ID by LCCN
    * @typedef {lccnSearchResult} lccnSearchResult
    * @property {string} lccn - the lccn searched
    * @property {string} label - the label to display in a search result
    * @property {string} bfdbURL - the http url to the bfdb url\
    * @property {string} idURL - the http url to the id.loc.gov page for instance
    * @property {string} bfdbPackageURL - the http url to the data package for this instance
    */

    /**
    * Looks for instances by LCCN against ID, returns into for them to be displayed and load the resource
    * @param {string} lccn - the lccn to search for
    * @return {array} - An array of {@link lccnSearchResult} results
    */
    searchInstanceByLCCN: async function(lccn){
      lccn = lccn.replaceAll(' ','')

      // ID needs the lccn to have a space between letters and the numbers
      // If there isn't one, make the adjustment
      const re = /^[a-z]{2}/g
      const found = lccn.match(re)
      if (found != null){
        lccn = lccn.slice(0,2) + " " + lccn.slice(2)
      }

      try{
        let req = await fetch(useConfigStore().returnUrls.id + `resources/instances/suggest2?q=${lccn}&searchtype=keyword&nocache=${Date.now()}` )
        let results = await req.json()

        let returnVal = []

        for (let r of results.hits){

          let bfdbPackageURL = useConfigStore().returnUrls.bfdb + r.uri.split('id.loc.gov/')[1] + '.convertedit-pkg.xml'

          if (useConfigStore().returnUrls.publicEndpoints){
            bfdbPackageURL = useConfigStore().returnUrls.id + r.uri.split('id.loc.gov/')[1] + '.cbd.rdf'
          }

          returnVal.push({
            lccn: lccn,
            label: r.aLabel,
            bfdbURL: useConfigStore().returnUrls.bfdb + r.uri.split('id.loc.gov/')[1],
            idURL: useConfigStore().returnUrls.id + r.uri.split('id.loc.gov/')[1],
            bfdbPackageURL: bfdbPackageURL
          })

        }

        // Add this log to inspect the LCCN results
        console.log("[searchInstanceByLCCN] Returning:", returnVal)

        return returnVal

      }catch{
        return ["Error searching LCCN"]
      }

    },

    /**
    * Request string transliteration via the backend scriptshifter API
    * @async
    * @param {string} lang - The scriptshifter language code
    * @param {string} text - The string to send to scriptshifter
    * @param {boolean} capitalize - ask to caplitalize all the words
    * @param {string} t_dir - s2r or r2s, not both directions are supported for all languages
    * @return {object|false} - the response from the service
    */
    scriptShifterRequestTrans: async function(lang,text,capitalize,t_dir){

            let url = useConfigStore().returnUrls.scriptshifter + 'trans'

      let r = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lang: lang,
          text:text,
          capitalize:capitalize,
          t_dir:t_dir
        })

      })

      let results =  await r.text()
      if (r.status !== 200){
        alert(results)
        return false
      }else{

        results = JSON.parse(results)

        // capitalize the first char if that preference is set true
        if (results.output){
          if (usePreferenceStore().returnValue('--b-scriptshifter-capitalize-first-letter')){
            results.output = results.output.charAt(0).toUpperCase() + results.output.slice(1);
          }
        }
        return results
      }


    },


    /**
    * Do Shelflisting search against BFDB
    *
    * @param {string} search - the call number to search for
    * @param {details} contributor - the data for contributor, title, subject, and date
    * @param {string} dir - asc or desc
    * @return {array} - results from API
    */
    searchShelfList: async function(search, details, dir){
      if (!dir){
        dir ='ascending'
      }

      let urlSearch = "lds/browse.xqy?bq=" + search +"&browse-order=" + dir + "&browse=class" + details + "&mime=json"

      // try{
        //let req = await fetch(useConfigStore().returnUrls.shelfListing + `browse/class/${dir}/${search}.json` )
        let req = await fetch(useConfigStore().returnUrls.shelfListing + urlSearch )
        let results = await req.json()

        // let results = [{"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20C66%202016", "term":"TF148 C66 2016", "frequency":"", "creator":"", "title":"Trains", "pubdate":"2016", "subject":"Railroad trains--Juvenile literature", "altsubject":"Railroad trains"}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.A46%202021", "term":"TF148 .A46 2021", "frequency":"", "creator":"", "title":"Listen up!", "pubdate":"2021", "subject":"Railroad trains--Juvenile literature", "altsubject":"Trains--Ouvrages pour la jeunesse"}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.A47%201983", "term":"TF148 .A47 1983", "frequency":"", "creator":"", "title":"Going on a train", "pubdate":"1983", "subject":"Railroads--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.A5%201993", "term":"TF148 .A5 1993", "frequency":"", "creator":"", "title":"Trains at work", "pubdate":"1993", "subject":"Railroads--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B24%201999", "term":"TF148 .B24 1999", "frequency":"", "creator":"", "title":"The best book of trains", "pubdate":"1999", "subject":"Railroad trains--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B26%201998", "term":"TF148 .B26 1998", "frequency":"", "creator":"", "title":"Amazing trains", "pubdate":"1998", "subject":"Railroads--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B27%201986", "term":"TF148 .B27 1986", "frequency":"", "creator":"", "title":"Trains", "pubdate":"1986", "subject":"Railroads--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B3%201949", "term":"TF148 .B3 1949", "frequency":"", "creator":"", "title":"A book of trains", "pubdate":"1949", "subject":"Railroads--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B45%201984", "term":"TF148 .B45 1984", "frequency":"", "creator":"", "title":"Amazing trains of the world", "pubdate":"1984", "subject":"Railroads--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B4594%202018", "term":"TF148 .B4594 2018", "frequency":"", "creator":"", "title":"Trains", "pubdate":"2017", "subject":"Railroad trains--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B48%201990", "term":"TF148 .B48 1990", "frequency":"", "creator":"", "title":"The train book", "pubdate":"1990", "subject":"Railroads--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B49%201998", "term":"TF148 .B49 1998", "frequency":"", "creator":"", "title":"Big book of trains", "pubdate":"1998", "subject":"Railroad trains--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B49%202016", "term":"TF148 .B49 2016", "frequency":"", "creator":"", "title":"The big book of trains", "pubdate":"2016", "subject":"Locomotives--Juvenile literature", "altsubject":"Railroad trains--Juvenile literature"}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B55", "term":"TF148 .B55", "frequency":"", "creator":"", "title":"Great trains of the world", "pubdate":"1953", "subject":"Railroads--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B69%201995", "term":"TF148 .B69 1995", "frequency":"", "creator":"", "title":"Trains", "pubdate":"1995", "subject":"Railroads--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B692%202017", "term":"TF148 .B692 2017", "frequency":"", "creator":"", "title":"Trains", "pubdate":"2017", "subject":"Railroad trains--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B693%202003", "term":"TF148 .B693 2003", "frequency":"", "creator":"", "title":"Railroading", "pubdate":"2003", "subject":"Railroads--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B696%201996", "term":"TF148 .B696 1996", "frequency":"", "creator":"", "title":"Freight trains", "pubdate":"1996", "subject":"Railroads--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B7", "term":"TF148 .B7", "frequency":"", "creator":"", "title":"Richard learns about railroading", "pubdate":"1969", "subject":"Railroads--Juvenile literature", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TF148%20.B717%202016", "term":"TF148 .B717 2016", "frequency":"", "creator":"", "title":"Rolling down the Avenue", "pubdate":"2016", "subject":"Street-railroads--Juvenile literature", "altsubject":""}]
        // results = [{"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20H316%202005", "term":"TT820 H316 2005", "frequency":"", "creator":"", "title":"Decorative knitting", "pubdate":"2005", "subject":"Knitting", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20H813145%202008", "term":"TT820 H813145 2008", "frequency":"", "creator":"", "title":"Knit aid", "pubdate":"2008", "subject":"Knitting", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A115%201991", "term":"TT820 .A115 1991", "frequency":"", "creator":"", "title":"42 favorite crochet motifs", "pubdate":"1992", "subject":"Crocheting--Patterns", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A1155%202023", "term":"TT820 .A1155 2023", "frequency":"", "creator":"", "title":"60 quick crochet projects for beginners", "pubdate":"2023", "subject":"Crocheting--Patterns", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A1156%202024", "term":"TT820 .A1156 2024", "frequency":"", "creator":"", "title":"60 quick granny squares", "pubdate":"2024", "subject":"Crocheting--Patterns", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A1158%202012", "term":"TT820 .A1158 2012", "frequency":"", "creator":"", "title":"101 crochet stitch patterns & edgings", "pubdate":"2012", "subject":"Crocheting", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A116%202002", "term":"TT820 .A116 2002", "frequency":"", "creator":"", "title":"101 double-ended hook stitches", "pubdate":"2002", "subject":"Crocheting--Patterns", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A117%201996", "term":"TT820 .A117 1996", "frequency":"", "creator":"", "title":"101 fun-to-crochet projects", "pubdate":"1996", "subject":"Crocheting--Patterns", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A119%201995", "term":"TT820 .A119 1995", "frequency":"", "creator":"", "title":"150 favorite crochet designs", "pubdate":"1995", "subject":"Crocheting--Patterns", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A11912%202017", "term":"TT820 .A11912 2017", "frequency":"", "creator":"", "title":"200 fun things to crochet", "pubdate":"2017", "subject":"Crocheting--Patterns", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A11913%202017", "term":"TT820 .A11913 2017", "frequency":"", "creator":"", "title":"200 fun things to knit", "pubdate":"2017", "subject":"Knitting--Patterns", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A1194%202015", "term":"TT820 .A1194 2015", "frequency":"", "creator":"", "title":"500 crochet stitches", "pubdate":"2015", "subject":"Crocheting--Technique", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A1196%202008", "term":"TT820 .A1196 2008", "frequency":"", "creator":"", "title":"A to Z of crochet", "pubdate":"2008", "subject":"Crocheting", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A11968%202009", "term":"TT820 .A11968 2009", "frequency":"", "creator":"", "title":"A to Z of knitting", "pubdate":"2009", "subject":"Knitting--Handbooks, manuals, etc.", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A1197%202020", "term":"TT820 .A1197 2020", "frequency":"", "creator":"", "title":"A-Z of knitting", "pubdate":"2020", "subject":"Knitting", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A19", "term":"TT820 .A19", "frequency":"", "creator":"", "title":"The complete book of knitting", "pubdate":"1971", "subject":"Knitting", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A33%202019", "term":"TT820 .A33 2019", "frequency":"", "creator":"", "title":"Fair Isle mittens", "pubdate":"2019", "subject":"Crocheting", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A42%202007", "term":"TT820 .A42 2007", "frequency":"", "creator":"", "title":"The natural knitter", "pubdate":"2007", "subject":"Knitting", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A48", "term":"TT820 .A48", "frequency":"", "creator":"", "title":"Le Tricot", "pubdate":"1977", "subject":"Knitting", "altsubject":""}, {"lookup":"/lds/search.xqy?count=10&sort=score-desc&pg=1&precision=exact&qname=idx:lcclass&q=TT820%20.A5149%202020", "term":"TT820 .A5149 2020", "frequency":"", "creator":"", "title":"Knitting & crocheting all-in-one", "pubdate":"2020", "subject":"Knitting--Patterns", "altsubject":""}]
        // if (selectedIndex > -1){
        //   results.splice(selectedIndex, 0, {
        //     term:'-----',
        //     title:'Would Appear Here',
        //     creator:'',
        //     pubdate:"------",
        //     lookup:'#'
        //   })
        // }





        return results

    },

    sendErrorReportLog: function(log, filename, profileAsJson) {
      let url = useConfigStore().returnUrls.util + 'errorlog/';

      fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          log: log,
          filename: filename,
          profile: profileAsJson
        })
      });
    },



    checkVersionOutOfDate: async function(){


      let versionPath = (useConfigStore().returnUrls.env === 'production') ? 'version/editor' : 'version/editor/stage'

      let url = useConfigStore().returnUrls.util + versionPath + "?blastdacache=" + Date.now()
      let content

      try{


        const rawResponse = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },

        });
        content = await rawResponse.json();
      }catch{
        // if sometihng network goes wrong just say were not out of date
        return false

      }

      let ourVer = useConfigStore().versionMajor + (useConfigStore().versionMinor * 0.1) + (useConfigStore().versionPatch* 0.01)
      let curVer = content.major + (content.minor* 0.1) + (content.patch* 0.01)
      console.log("ourVer:",ourVer,"curVer:",curVer)
      if (ourVer < curVer){
        return true
      }else{
        return false
      }

    },

    logActiveTemplate: function() {  // Changed to consistent style with other methods
        // Use optional chaining and a default value to avoid errors if the store is not initialized
        const templateType = useConfigStore()?.activeProfile?.templateType || 'monograph';
        console.log('Active template type:', templateType);
    }, // No comma after the last property

    /**
   * Posts an instance to the server and returns the raw response with holding information
   * @param {object} instanceData - The instance data to post
   * @return {object} - The server response including holding information
   */
  postInstanceToServer: async function(instanceData) {
    try {
      const config = useConfigStore();
      // Use the instancepublish URL which is defined in the config
      const url = config.returnUrls.instancepublish;
      
      console.log("Posting instance to:", url);
      
      // Make the post request to the server
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(instanceData)
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      
      // Get the raw response that contains the holding information
      const data = await response.json();
      console.log("Raw server response:", data);
      
      // Return the raw response with holding information intact
      return data;
    } catch (error) {
      console.error("Error posting instance to server:", error);
      throw error;
    }
  },
}

export default utilsNetwork;