<template>

  <splitpanes class="default-theme" horizontal>

    <pane class="header" :size="returnPixleAsPercent(preferenceStore.returnValue('--n-edit-main-splitpane-nav-height',true))">
      <Nav/>
    </pane>

    <pane>

      <div>

      <splitpanes>



        <pane class="load" v-if="displayAllRecords">
          <button @click="displayAllRecords=false;displayDashboard=true">Close</button>
          <div id="all-records-table">
            <DataTable  :loading="isLoadingAllRecords" :rows="allRecords" striped hoverable>

              <!-- { "Id": "e1078432", "RTs": [ "lc:RT:bf2:Monograph:Work" ], "Type": "Monograph", "Status": "unposted", "Urls": [ "http://id.loc.gov/resources/works/e1078432", "http://id.loc.gov/resources/instances/e1078432" ], "Time": "2024-07-10:17:11:53", "User": "asdf (asdf)" } -->

              <template #tbody="{row}">

                <td>
                  <a href="#" @click.prevent="loadFromAllRecord(row.Id)">{{ row.Id }}</a>

                </td>

                <td v-text="(row.RTs) ? row.RTs.join(', ') : row.RTs"/>
                <td v-text="row.Type"/>
                <td v-text="row.Title"/>
                <td v-text="row.Status"/>
                <td>
                  <div v-for="u in row.Urls">
                    <a v-if="u.indexOf('/works/') >-1" :href="u" target="_blank">Work</a>
                    <a v-else-if="u.indexOf('/instances/') >-1" :href="u" target="_blank">Instance</a>
                    <a v-else :href="u" target="_blank">{{ u }}</a>

                  </div>

                </td>
                <td v-text="row.Time"/>
                <td v-text="row.User"/>

              </template>

            </DataTable>

          </div>



        </pane>

        <pane class="load" v-if="displayDashboard" >



          <div class="load-columns">

            <div class="load-test-data-column">
              <h1>
                <span style="font-size: 1.15em; vertical-align: bottom; margin-right: 5px;" class="material-icons">cloud_download</span>
                <span>Load</span></h1>

              <form ref="urlToLoadForm" v-on:submit.prevent="loadUrl">
                <input placeholder="URL to resource or identifier to search" class="url-to-load" type="text" @input="loadSearch" v-model="urlToLoad" ref="urlToLoad">
                <p>Need to search title or author? Use <a href="https://id.loc.gov" target="_blank">ID.LOC.GOV</a>.</p>
              </form>

              <!-- Display the options after a URL is entered -->
              <div v-if="urlEntered">
                <h3>Load with profile:</h3>
                <div class="load-buttons">
                  <button class="load-button" @click="loadUrl(s.instance)" v-for="s in startingPointsFiltered">{{s.name}}</button>
                </div>
              </div>

              <ol>

                  <li v-if="searchByLccnResults && searchByLccnResults.length === 0">No results...</li>

                  <template v-if="searchByLccnResults && typeof searchByLccnResults === 'string'">

                    <li>Searching...</li>

                  </template>
                  <template v-else>

                    <li v-for="(r,idx) in searchByLccnResults" :key="r.idURL">
                        <div style="display:flex">

                            <div style="flex:2;">{{++idx}}. <span style="font-weight:bold">{{r.label}}</span></div>
                            <div style="flex:1">
                              <a :href="r.bfdbURL" style="padding-right: 10px;" target="_blank">View online</a>
                              <span v-if="searchByLccnResults.length == 1" style="display:none;">
                                <label :for="'lccnsearch'+idx">Select</label><input type="radio" v-model="lccnLoadSelected" :value="r" name="lccnToLoad" :id="'lccnsearch'+idx" :name="'lccnsearch'+idx" checked="true" />
                              </span>
                              <span v-else>
                                <label :for="'lccnsearch'+idx" style="font-weight:bold;">Select</label><input type="radio" v-model="lccnLoadSelected" :value="r" name="lccnToLoad" :id="'lccnsearch'+idx" :name="'lccnsearch'+idx" />
                              </span>
                            </div>

                          <!-- <div style="flex:1"><a href="#" target="_blank" @click.prevent="instanceEditorLink = r.bfdbPackageURL; testInstance()">Retrieve</a></div> -->

                        </div>
                      </li>





                  </template>


                  </ol>
                <hr>



              <h2>Test Data:</h2>
              <table id="test-data-table">
                  <tr class="test-data" v-for="t in testData">
                    <td><a :href="t.idUrl">{{t.label}}</a></td>
                    <td><button @click="loadTestData(t)">Load with {{ t.profile }} </button></td>
                  </tr>
                </table>
              <!-- <details>
                <summary>Test Data</summary>

              </details> -->


            </div>

            <div>

              <h1>
                <span style="font-size: 1.25em; vertical-align: bottom; margin-right: 3px;"  class="material-icons">edit_note</span>
                <span>Your Descriptions</span></h1>
                <a href="#" @click="loadAllRecords" style="color: inherit;">Show All Records</a>
                <div>

                  <div class="saved-records-empty" v-if="continueRecords.length==0">
                    No saved records found.
                  </div>
                  <ul class="continue-record-list">
                    <li class="continue-record" v-for="record in continueRecords" >
                      <router-link :to="{ name: 'Edit', params: { recordId: record.eid}}">
                        <div><span class="continue-record-title">{{record.title}}</span><span v-if="record.contributor"> by {{record.contributor}}</span><span> ({{record.lccn}})</span></div>
                        <div class="continue-record-lastedit"><span v-if="record.status=='posted'">Posted</span><span v-if="record.status=='unposted'">last edited</span> <span>{{ returnTimeAgo(record.timestamp) }}</span></div>
                      </router-link>
                      <div class="material-icons" v-if="record.status=='posted'" title="Posted record">check_box</div>



                    </li>



                  </ul>



                </div>


            </div>


            <div>

              <h1 style="margin-bottom: 10px;">
                <span style="font-size: 1.25em; vertical-align: bottom; margin-right: 3px;"  class="material-icons">edit_document</span>
                <span>Create New Description</span></h1>
                <div style="padding:5px;">
                Use these blank templates to create a new description. Note that in Alma the Work must exist first, then an Instance can be exported.
                </div>
                <details>
                  <summary><span style="text-decoration: underline;">Click Here</span> to access blank record templates.</summary>
                  <div>
                    <div class="load-buttons">
                      <button class="load-button" @click="loadUrl(s.instance)" v-for="s in startingPointsFiltered">{{s.name}}</button>


                    </div>
                  </div>
                </details>



            </div>

          </div>



        </pane>



      </splitpanes>
      </div>
    </pane>
  </splitpanes>


</template>


<script>

  import { Splitpanes, Pane } from 'splitpanes'
  import 'splitpanes/dist/splitpanes.css'
  import { usePreferenceStore } from '@/stores/preference'
  import { useConfigStore } from '@/stores/config'
  import { useProfileStore } from '@/stores/profile'

  import { mapStores, mapState, mapWritableState } from 'pinia'

  import Nav from "@/components/panels/nav/Nav.vue";

  import utilsProfile from '@/lib/utils_profile';
  import utilsNetwork from '@/lib/utils_network';
  import utilsParse from '@/lib/utils_parse';
  import short from 'short-uuid'
  import TimeAgo from 'javascript-time-ago'
  import en from 'javascript-time-ago/locale/en'


  import { DataTable } from "@jobinsjp/vue3-datatable"
  import "@jobinsjp/vue3-datatable/dist/style.css"
  import axios from 'axios'


  if (TimeAgo.getDefaultLocale() != 'en'){TimeAgo.addDefaultLocale(en)}
  const timeAgo = new TimeAgo('en-US')

  const decimalTranslator = short("0123456789");



  export default {
    components: { Splitpanes, Pane, Nav, DataTable },
    data() {
      return {

        urlToLoad:'',

        continueRecords: [],

        urlToLoadIsHttp: false,

        searchByLccnResults: null,
        lccnToSearchTimeout: null,

        lccnLoadSelected:false,


        displayDashboard:true,
        displayAllRecords: false,
        isLoadingAllRecords:false,

        allRecords: [],
        urlEntered: false,
        searchType: null // NEW: track type of search

      }
    },
    computed: {
      // other computed properties
      // ...
      // gives access to this.counterStore and this.userStore
      ...mapStores(usePreferenceStore),
      ...mapStores(useProfileStore),
      ...mapState(usePreferenceStore, ['styleDefault','panelDisplay']),
      ...mapState(useConfigStore, ['testData']),
      ...mapState(useProfileStore, ['startingPoints','profiles']),
      ...mapWritableState(useProfileStore, ['activeProfile', 'emptyComponents','activeProfilePosted','activeProfilePostedTimestamp']),


      // // gives read access to this.count and this.double
      // ...mapState(usePreferenceStore, ['profilesLoaded']),

      startingPointsFiltered(){
        let points = []
        for (let k in this.startingPoints){

          if (this.startingPoints[k].work && this.startingPoints[k].instance){
            points.push(this.startingPoints[k])
          }


        }

        points.push( { "name": "HUB", "work": null, "instance": "lc:RT:bf2:HubBasic:Hub", "item": null },)

        console.log(points)
        return points
      }


    },

    methods: {


      loadFromAllRecord: function(eId){


        this.profileStore.prepareForNewRecord()

        this.$router.push({ name: 'Edit', params: { recordId: eId } })


      },





      allRecordsRowClick: function(row){



      },

      loadAllRecords: async function(event){
        event.preventDefault()
        
        this.displayDashboard = false
        this.displayAllRecords = true
        this.isLoadingAllRecords = true
        
        let allRecordsRaw = await utilsNetwork.searchSavedRecords()
        console.log("All records raw data:", allRecordsRaw);
        
        this.allRecords = []
        for (let r of allRecordsRaw){
          let obj = {
            'Id': r.eid,
            'RTs': r.rstused,
            'Type': r.typeid,
            'Title': r.title,
            'Status': r.status,
            'Urls': r.externalid,
            'Time': r.time,
            'User': r.user,
          }
          this.allRecords.push(obj)
        }
        
        // Sort by timestamp (newest first) if available
        if (this.allRecords.length > 0 && this.allRecords[0].Time) {
          this.allRecords.sort((a, b) => {
            // Convert time strings to comparable values
            const timeA = new Date(a.Time.replace(/:/g, '-')).getTime();
            const timeB = new Date(b.Time.replace(/:/g, '-')).getTime();
            return timeB - timeA; // Descending order (newest first)
          });
        }
        
        this.isLoadingAllRecords = false
      },

      returnTimeAgo: function(timestamp){
        return timeAgo.format(timestamp*1000)
      },


      returnPixleAsPercent: function(pixles){
        return pixles/window.innerHeight*100
      },

      loadTestData: function(meta){


        let href = window.location.href.split("/")
        console.log("href[3]:", href[3])
        this.urlToLoad = `/test_files/${meta.lccn}.xml`
        this.urlToLoadIsHttp = true
        this.loadUrl(meta.profileId)
      },

      loadYourRecord: async function(){



      },

      // NEW: Helper to detect identifier type
      detectSearchType(input) {
        const trimmed = input.trim();
        // MMSID: 8-19 digits, all numeric, and starts with 99
        if (/^99\d{6,17}$/.test(trimmed)) return 'mmsid';
        // POD: UUID format (36 chars with hyphens)
        if (/^[0-9a-fA-F-]{36}$/.test(trimmed)) return 'pod';
        // LCCN: fallback, allow digits, letters, hyphens, dots, spaces
        if (/^[0-9A-Za-z-. ]+$/.test(trimmed)) return 'lccn';
        return null;
      },

      // UPDATED: loadSearch to support new endpoints
      loadSearch: function() {
        this.lccnLoadSelected = null
        this.urlEntered = this.urlToLoad.trim() !== ''
        if (this.urlToLoad.startsWith("http://") || this.urlToLoad.startsWith("https://")) {
          this.urlToLoadIsHttp = true
          return false
        } else {
          this.urlToLoadIsHttp = false
        }
        if (this.urlToLoad.length < 8) { return false }

        window.clearTimeout(this.lccnToSearchTimeout)
        this.searchByLccnResults = 'Searching...'
        this.searchType = this.detectSearchType(this.urlToLoad)
        console.log("Detected search type:", this.searchType, "for input:", this.urlToLoad)

        this.lccnToSearchTimeout = window.setTimeout(async () => {
          if (this.searchType === 'mmsid') {
            // Penn Alma MMSID search
            const url = `https://quartz.bibframe.app/alma/?version=1.2&operation=searchRetrieve&recordSchema=lc_bf_instance&query=alma.mms_id="${this.urlToLoad}"`
            console.log("MMSID search URL:", url)
            try {
              const resp = await axios.get(url)
              console.log("MMSID search response:", resp)
              const xml = resp.data
              // Check for <numberOfRecords> > 0
              const numMatch = xml.match(/<numberOfRecords>(\d+)<\/numberOfRecords>/)
              const numRecords = numMatch ? parseInt(numMatch[1], 10) : 0
              if (numRecords > 0 && xml.includes('<bf:Instance')) {
                // Extract the rdf:about attribute from <bf:Instance>
                const aboutMatch = xml.match(/<bf:Instance[^>]+rdf:about="([^"]+)"/)
                const instanceAbout = aboutMatch ? aboutMatch[1] : '(no instance URL)'
                this.searchByLccnResults = [{
                  label: `MMSID: ${this.urlToLoad} (${instanceAbout})`,
                  bfdbURL: url,
                  bfdbPackageURL: url,
                  idURL: url,
                  instanceAbout // you can use this elsewhere if needed
                }]
                this.lccnLoadSelected = this.searchByLccnResults[0]
                console.log("MMSID searchByLccnResults:", this.searchByLccnResults)
              } else {
                this.searchByLccnResults = []
                console.log("No records found in MMSID response.")
              }
            } catch (e) {
              console.error("Error fetching MMSID:", e)
              this.searchByLccnResults = []
            }
          } else if (this.searchType === 'pod') {
            // POD search
            const url = `https://quartz.bibframe.app/pod/${this.urlToLoad}.xml`
            console.log("POD search URL:", url)
            try {
              const resp = await axios.get(url)
              console.log("POD search response:", resp)
              this.searchByLccnResults = [{
                label: `POD: ${this.urlToLoad}`,
                bfdbURL: url,
                bfdbPackageURL: url,
                idURL: url
              }]
              this.lccnLoadSelected = this.searchByLccnResults[0]
              console.log("POD searchByLccnResults:", this.searchByLccnResults)
            } catch (e) {
              console.error("Error fetching POD:", e)
              this.searchByLccnResults = []
            }
          } else {
            // Default: LCCN
            console.log("Searching by LCCN:", this.urlToLoad)
            this.searchByLccnResults = await utilsNetwork.searchInstanceByLCCN(this.urlToLoad)
            console.log("LCCN searchByLccnResults:", this.searchByLccnResults)
            if (this.searchByLccnResults.length == 1) {
              this.lccnLoadSelected = this.searchByLccnResults[0]
            }
          }
        }, 500)
      },

      loadUrl: async function(useInstanceProfile, multiTestFlag) {
        if (this.lccnLoadSelected) {
          this.urlToLoad = this.lccnLoadSelected.bfdbPackageURL
          console.log("loadUrl: using bfdbPackageURL:", this.urlToLoad)
        }

        if (this.urlToLoad.trim() !== '') {
          console.log("Fetching XML from:", this.urlToLoad)
          let xml = await utilsNetwork.fetchBfdbXML(this.urlToLoad)
          console.log("Fetched XML:", xml ? xml.substring(0, 200) : "No XML returned")
          if (!xml) {
            alert("There was an error retrieving that URL. Are you sure it is correct: " + this.urlToLoad)
            return false
          }

          let xmlToParse = xml
          
          // MMSID processing temporarily disabled
          /*
          if (this.searchType === 'mmsid') {
            // Only extract RDF for MMSID
            let rdfMatch = xml.match(/<rdf:RDF[\s\S]*?<\/rdf:RDF>/)
            if (rdfMatch) {
              let rdfBlock = rdfMatch[0]
              // Patch in missing namespaces if needed
              if (!rdfBlock.includes('xmlns:bf=')) {
                rdfBlock = rdfBlock.replace(
                  '<rdf:RDF',
                  `<rdf:RDF
                    xmlns:bf="http://id.loc.gov/ontologies/bibframe/"
                    xmlns:bflc="http://id.loc.gov/ontologies/bflc/"
                    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
                    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
                    xmlns:sinopia="http://sinopia.io/vocabulary/"`
                )
              }
              xmlToParse = rdfBlock
            } else {
              xmlToParse = xml
              console.warn("Could not find <rdf:RDF> block, passing full XML to parser.")
            }
          }
          */
          
          // For LCCN and POD, just use the full XML
          utilsParse.parseXml(xmlToParse)
        }

        // find the right profile to use from the instance profile name used
        let useProfile = null
        console.log("this.profiles",this.profiles)
        console.log("useInstanceProfile",useInstanceProfile)
        for (let key in this.profiles){
          if (this.profiles[key].rtOrder.indexOf(useInstanceProfile)>-1){
            useProfile = JSON.parse(JSON.stringify(this.profiles[key]))
          }
        }

        this.activeProfilePosted = false
        this.activeProfilePostedTimestamp = false

        // check if the input field is empty
        if (this.urlToLoad == "" && useProfile===null){
          alert("Please enter the URL or Identifier of the record you want to load.")
          return false
        }

        if (useProfile===null){
          alert('No profile selected. Select a profile under "Load with profile."')
          return false
        }

        if (this.urlToLoad.trim() !== ''){



          // we might need to load in a item
          if (utilsParse.hasItem>0){
            // loop the number of ITEMS there are in the XML
            Array.from(Array(utilsParse.hasItem)).map((_,i) => {
              let useItemRtLabel
              // look for the RT for this item
              useItemRtLabel = useInstanceProfile.replace(':Instance',':Item')

              let foundCorrectItemProfile = false
              for (let pkey in this.profiles){
                for (let rtkey in this.profiles[pkey].rt){
                  if (rtkey == useItemRtLabel){
                    let useRtLabel =  useItemRtLabel + '-' + (i+1)
                    let useItem = JSON.parse(JSON.stringify(this.profiles[pkey].rt[rtkey]))

                    // make the guids for all the properties unique
                    for (let ptk in useItem.pt){
                      useItem.pt[ptk]['@guid'] = short.generate()
                    }


                    // console.log('using',this.profiles[pkey].rt[rtkey])
                    foundCorrectItemProfile = true
                    useProfile.rtOrder.push(useRtLabel)
                    useProfile.rt[useRtLabel] = useItem
                    // console.log(JSON.parse(JSON.stringify(useProfile)))
                  }
                }
              }


              if (!foundCorrectItemProfile){
                console.warn('error: foundCorrectItemProfile not set ---------')
                console.warn(this.rtLookup[useItemRtLabel])
              }
            });
          }
        }

        if (!useProfile.log){
          useProfile.log = []
        }

        // setup the log and set the procinfo so the post process knows what to do with this record
        useProfile.log.push({action:'loadInstance',from:this.urlToLoad})
        useProfile.procInfo= "update instance"

        // also give it an ID for storage
        if (!useProfile.eId){
          let uuid = 'e' + decimalTranslator.new()
          uuid = uuid.substring(0,8)
          useProfile.eId= uuid
          useProfile.neweId = true
        }


        if (!useProfile.user){
          useProfile.user = this.preferenceStore.returnUserNameForSaving
        }

        if (!useProfile.status){
          useProfile.status = 'unposted'
        }




        if (this.urlToLoad.trim() !== ''){
          let profileDataMerge  = await utilsParse.transformRts(useProfile)
          this.activeProfile = profileDataMerge
        }else{
          // if there is not url they are making it from scratch, so we need to link the instances and work together
          useProfile = utilsParse.linkInstancesWorks(useProfile)

          this.activeProfile = useProfile

          // prime this for ad hoc mode
          for (let rt in this.activeProfile.rt){
            this.emptyComponents[rt] = []
            for (let element in this.activeProfile.rt[rt].pt){
              // const e = this.activeProfile.rt[rt].pt[element]
              // if (e.mandatory != 'true'){
              //   this.emptyComponents[rt].push(element)
              // }
              this.profileStore.addToAdHocMode(rt, element)
            }
          }
        }

        if (multiTestFlag){
          this.$router.push(`/multiedit/`)
          return true
        }

        this.$router.push(`/edit/${useProfile.eId}`)



      },


     async refreshSavedRecords(){
        let records = await utilsNetwork.searchSavedRecords(this.preferenceStore.returnUserNameForSaving)
        console.log("Processing records for display:", records);
        
        // Option 1: Remove all filtering - show ALL records
        this.continueRecords = Array.isArray(records) ? records : Object.values(records);
        
        // Sort by timestamp to show newest records first
        if (this.continueRecords.length > 0 && this.continueRecords[0].timestamp) {
          this.continueRecords.sort((a, b) => b.timestamp - a.timestamp);
        }
      },









    },

    mounted: async function(){
      this.refreshSavedRecords()

	  //reset the title
	  document.title = `Marva`;

    },



    created: async function(){

      this.refreshSavedRecords()

      // this is checking to see if the route is available to load the passed URL to it
      let intervalLoadUrl = window.setInterval(()=>{
          if (this.$route && this.$route.query && this.$route.query.url){

            this.urlToLoad = this.$route.query.url
            this.urlToLoadIsHttp=true
            window.clearInterval(intervalLoadUrl)

          }

        },500)

        let intervalLoadProfile = window.setInterval(()=>{
          if (this.$route && this.$route.query && this.$route.query.profile && this.startingPointsFiltered && this.startingPointsFiltered.length>0){
            console.log("Weerrr looookiinnn at the profile!", this.$route.query.profile)
            let possibleInstanceProfiles = this.startingPointsFiltered.map((v)=>v.instance)
            if (possibleInstanceProfiles.indexOf(this.$route.query.profile) >-1){
              this.loadUrl(this.$route.query.profile)
            }
            window.clearInterval(intervalLoadProfile)
            // loadUrl
          }

        },600)


    }
  }

</script>

<style>
  .dt-bg-gray-50{
    background-color: v-bind("preferenceStore.returnValue('--c-edit-modals-background-color-accent')")  !important;
    color: v-bind("preferenceStore.returnValue('--c-edit-modals-text-color')")  !important;

  }
  .dt-bg-white{
    background-color: v-bind("preferenceStore.returnValue('--c-edit-modals-background-color')")  !important;
    color: v-bind("preferenceStore.returnValue('--c-edit-modals-text-color')")  !important;



  }
</style>

<style scoped>


#test-data-table{
  width:100%;



}

#all-records-table{

  height: 90vh;
  overflow-y: auto;

}


.test-data:nth-child(odd) {

  background-color: v-bind("preferenceStore.returnValue('--c-edit-modals-background-color')")  !important;
  color: v-bind("preferenceStore.returnValue('--c-edit-modals-text-color')")  !important;

  background-color: v-bind("preferenceStore.returnValue('--c-edit-modals-background-color-accent')")  !important;

}

.test-data a{
  color:inherit!important;
  text-decoration: none;

}
.test-data a:hover{
  text-decoration: underline;
}
.test-data button{
  width: 100%;
}
.saved-records-empty{
  margin-top: 2em;
  margin-left: 1em;
  font-style: italic;
}

label{
  cursor: pointer;
}

  ol{
    list-style: none;
    padding-left: 0;
    margin-bottom: 2em;
  }

  .continue-record .material-icons{
      position: absolute;
      right: 0;
      top: 0;
      color: limegreen;
    }

  .continue-record-list{
    margin-top: 1em;
    padding-left: 0.1em;
    list-style: none;
    height: 85vh;
    overflow-y: auto;

  }

  .continue-record a{
    text-decoration: none;
    color: inherit !important;
  }

  .continue-record:hover{
    box-shadow: 0px 0px 3px -1px rgba(0,0,0,0.46);
    background-color: whitesmoke;

  }

  .continue-record-list li:nth-of-type(1n+100) {
    display: none;
  }

  .continue-record-title{
    font-style: italic;
  }
  .continue-record{
    border: solid 1px lightgray;
    padding: 4px;
    position: relative;

  }
  .continue-record-lastedit{
    color: grey;
  }
  .load-columns{
    display: flex;
  }

  .load-columns > div{
    flex: 1;
  }
  .url-to-load{
    font-size: 1.25em;
    margin-bottom: 1em;
    margin-top: 1em;


    width: 80%;
  }
  .load-buttons{
    text-align: justify;
  }
  .load-button{
    font-size: 1.25em;
    margin: 0.25em;
    background-color: white;
    border: solid 1px var(--c-black-mute);
    border-radius: 2px;
    cursor: pointer;
  }
  .load-button:hover{
    border: solid 1px var(--c-black);
    background-color: var(--c-white-soft);
  }

  .header{
    background-color: white !important;
  }
  body{
    background-color: white;
  }

  .load{
    background-color: v-bind("preferenceStore.returnValue('--c-edit-modals-background-color')")  !important;
    color: v-bind("preferenceStore.returnValue('--c-edit-modals-text-color')")  !important;

    padding: 1em;
  }
  hr{
    margin-bottom: 2em;
    margin-top: 2em;
  }
  summary{
    cursor: pointer;
  }
  .load-test-data-column{
    height: 95vh;
    overflow-y: auto;
    padding-bottom: 5em;
  }
  .header{
    background-color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-nav-background-color')") !important;

  }




</style>
