<script>
  import { useProfileStore } from '@/stores/profile'
  import { usePreferenceStore } from '@/stores/preference'
  import { AccordionList, AccordionItem } from "vue3-rich-accordion";
  // import "vue3-rich-accordion/accordion-library-styles.css";
  import draggable from 'vuedraggable'


  import { mapStores, mapState, mapWritableState } from 'pinia'
import { isReadonly } from 'vue';

  export default {
    data() {
      return {
        hideProps:[
          //'http://id.loc.gov/ontologies/bibframe/hasInstance',
          //'http://id.loc.gov/ontologies/bibframe/instanceOf',
          'http://id.loc.gov/ontologies/bibframe/hasItem'
        ],

        activeComponentLibrary: null,
        clDebounce:false,

      }
    },
    components: {
      AccordionList,
      AccordionItem,
      draggable


    },

    computed: {
      ...mapStores(useProfileStore,usePreferenceStore),
      // // gives read access to this.count and this.double
      ...mapState(useProfileStore, ['profilesLoaded','activeProfile', 'dataChanged','rtLookup', 'activeComponent', 'emptyComponents','returnComponentLibrary']),
      // isEmptyComponent is now a getter, accessed via this.profileStore.isEmptyComponent()
      ...mapState(usePreferenceStore, ['styleDefault', 'layoutActive', 'layoutActiveFilter', 'createLayoutMode']),


      ...mapWritableState(useProfileStore, ['activeComponent', 'emptyComponents']),
    },


    methods: {

      // Whether or not a component that isn't explicitly in that layout should be included
      // this is important for adding components when a layout is open
      includeInLayout: function(checkId, targets){
        if (!targets){ return false }
        if (targets.includes(checkId)){ return true}
        //otherwise, get the base of the checkId to compare
        let breakPoint = checkId.lastIndexOf("_")
        let base = checkId.slice(0, breakPoint)
        if (targets.includes(base)){ return true}

        return false

      },

      configComponentLibrary(clId){
        if (this.activeComponentLibrary == clId){
          this.activeComponentLibrary = null
          return
        }
        this.activeComponentLibrary = clId
      },

      configComponentLibraryAssignGroup(event,clId){
        this.profileStore.changeGroupComponentLibrary(clId,event.target.value)



      },

      delComponentLibrary(event,clId){


        let newId = this.profileStore.delComponentLibrary(clId)


      },
      renameComponentLibrary(event,clId,oldLabel){

        let newName = prompt("New Name?",oldLabel )
        if (!newName){return false}
        let newId = this.profileStore.renameComponentLibrary(clId,newName)


      },



      addComponentLibrary(event,clId,supressPropmpt){

        if (event){
          if (this.clDebounce){return false}
          event.preventDefault()
          this.clDebounce = true
          // don't allow multiple clicks fast
          window.setTimeout(()=>{this.clDebounce = false},100)

        }



        if (this.preferenceStore.returnValue('--b-edit-main-splitpane-properties-component-library-prompt-to-add') == true){
          if (!supressPropmpt){
            if (!confirm('Add Component From Library?')) {
              return 'canceled'
            }
          }
        }

        let newId = this.profileStore.addFromComponentLibrary(clId)
        this.activeComponent = this.activeProfile.rt[newId[0]].pt[newId[1]]

        // for (let rt in this.activeProfile.rt){
        //   for (let pt in this.activeProfile.rt[rt].pt){
        //     if (this.activeProfile.rt[rt].pt[pt].id == newId){

        //     }
        //   }
        // }


        return false

      },


      addComponentLibraryGroup(group){


        let sentFirstComponentOfGroup = false
        let supressPrompt = false
        for (let groups of this.returnComponentLibrary){


          if (groups.groups[group]){
            for (let component of groups.groups[group]){


              let r = this.addComponentLibrary(null,component.id,supressPrompt)
              // if the first one returns canceled then stop, otherwise supress the prompt from here on
              if (r == 'canceled'){ return false}else{supressPrompt=true}


            }
          }

        }
        // for (let group of returnComponentLibrary){


        // }



      },


      replacePropertyWithValue(propertyURI){
        return [
          "http://id.loc.gov/ontologies/bibframe/subject",
          "http://id.loc.gov/ontologies/bibframe/geographicCoverage",
          "http://id.loc.gov/ontologies/bibframe/language",
          "http://id.loc.gov/ontologies/bibframe/identifiedBy",
        ].includes(propertyURI)
      },

      returnHeadingLabel(component){
        let propertyURI = null
        let prefix = null
        if (component){
          propertyURI = component.propertyURI
          switch (propertyURI){
            case 'http://id.loc.gov/ontologies/bibframe/subject':
              prefix = '[SH]: '
              break
            case 'http://id.loc.gov/ontologies/bibframe/geographicCoverage':
              prefix = '[GEO]: '
              break
            case 'http://id.loc.gov/ontologies/bibframe/language':
              prefix = '[Lang 008]: '
              break
            case 'http://id.loc.gov/ontologies/bibframe/identifiedBy':
              if (component.userValue && component.userValue[propertyURI]){
                let type = component.userValue[propertyURI][0]["@type"]
                try{
                  prefix = '[' + type.split("/").at(-1).toUpperCase() + ']: '
                } catch(err){
                  prefix = '[Identifier]: '
                }
                break
              } else {
                prefix = '[Identifier]: '
                break
              }
            default:
              prefix = ''
          }
        }

        let returnString = prefix + 'No Value'
        if (component && component.userValue && component.userValue[propertyURI]
        && component.userValue[propertyURI].length>0
        && component.userValue[propertyURI][0]
        && component.userValue[propertyURI][0]['http://www.w3.org/2000/01/rdf-schema#label']
        && component.userValue[propertyURI][0]['http://www.w3.org/2000/01/rdf-schema#label'].length>0
        && component.userValue[propertyURI][0]['http://www.w3.org/2000/01/rdf-schema#label'][0]
        && component.userValue[propertyURI][0]['http://www.w3.org/2000/01/rdf-schema#label'][0]['http://www.w3.org/2000/01/rdf-schema#label']){
          returnString = prefix + component.userValue[propertyURI][0]['http://www.w3.org/2000/01/rdf-schema#label'][0]['http://www.w3.org/2000/01/rdf-schema#label']
        }

        if (component && component.userValue && component.userValue[propertyURI]
        && component.userValue[propertyURI].length>0
        && component.userValue[propertyURI][0]
        && component.userValue[propertyURI][0]['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']
        && component.userValue[propertyURI][0]['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'].length>0
        && component.userValue[propertyURI][0]['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]
        && component.userValue[propertyURI][0]['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']){
          returnString = prefix + component.userValue[propertyURI][0]['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']
        }

        if (component && component.userValue && component.userValue['http://id.loc.gov/ontologies/bibframe/subject']
        && component.userValue['http://id.loc.gov/ontologies/bibframe/subject'].length>0
        && component.userValue['http://id.loc.gov/ontologies/bibframe/subject'][0]
        && component.userValue['http://id.loc.gov/ontologies/bibframe/subject'][0]['@id']
        && component.userValue['http://id.loc.gov/ontologies/bibframe/subject'][0]['@id'].indexOf('/fast/') > -1){

          returnString = returnString + ' (FAST)'
        }

        //identifiers have slightly different pat
        if (component && component.userValue && component.userValue[propertyURI]
            && component.userValue[propertyURI].length>0
            && component.userValue[propertyURI][0]
            && component.userValue[propertyURI][0]['http://www.w3.org/1999/02/22-rdf-syntax-ns#value']
            && component.userValue[propertyURI][0]['http://www.w3.org/1999/02/22-rdf-syntax-ns#value'].length>0
            && component.userValue[propertyURI][0]['http://www.w3.org/1999/02/22-rdf-syntax-ns#value'][0]
            && component.userValue[propertyURI][0]['http://www.w3.org/1999/02/22-rdf-syntax-ns#value'][0]['http://www.w3.org/1999/02/22-rdf-syntax-ns#value']
        ){
          returnString = prefix + component.userValue[propertyURI][0]['http://www.w3.org/1999/02/22-rdf-syntax-ns#value'][0]['http://www.w3.org/1999/02/22-rdf-syntax-ns#value']
        }

        //For GEO, add the GACs code at the end
        if (propertyURI == "http://id.loc.gov/ontologies/bibframe/geographicCoverage"){
          if (component && component.userValue && component.userValue[propertyURI]
              && component.userValue[propertyURI].length>0
              && component.userValue[propertyURI][0]
              && component.userValue[propertyURI][0]['http://id.loc.gov/ontologies/bibframe/code']
              && component.userValue[propertyURI][0]['http://id.loc.gov/ontologies/bibframe/code'].length>0
              && component.userValue[propertyURI][0]['http://id.loc.gov/ontologies/bibframe/code'][0]
              && component.userValue[propertyURI][0]['http://id.loc.gov/ontologies/bibframe/code'][0]['http://id.loc.gov/ontologies/bibframe/code']
          ){
            returnString = returnString + " [" + component.userValue[propertyURI][0]['http://id.loc.gov/ontologies/bibframe/code'][0]['http://id.loc.gov/ontologies/bibframe/code'] + "]"
          }
        }


        return returnString

      },

      returnTemplateTypes: function(templates){

          let titles = []
          for (let t of templates){
              if (this.rtLookup[t] && this.rtLookup[t].resourceLabel){
                  titles.push(this.rtLookup[t].resourceLabel)
              }
          }

          return titles


      },

      change: function(){
          // A property was moved. Make the current state savable and update the xml
          this.dataChanged()
      },


      // if the component has data, and from where
      hasData: function(component){
          let userValue = component.userValue
          let emptyArray = new Array("@root")
          let dataLoaded = component.dataLoaded

          // Use profileStore.isEmptyComponent getter
          if (this.profileStore.isEmptyComponent(JSON.parse(JSON.stringify(component)))){
            return false
          } else if (component.userModified){
            return "user"
          } else if (dataLoaded){
              return "system"
          } else {
              return false
          }
      },

      jumpToElement: function(profileName, elementName){
        // Add check for activeProfile
        if (!this.activeProfile || !this.activeProfile.rt || !this.activeProfile.rt[profileName] || !this.activeProfile.rt[profileName].pt) {
          console.warn("jumpToElement: activeProfile or necessary properties not available yet.");
          return;
        }
        //if it's hidden show it
        let removed
        if (this.preferenceStore.returnValue('--c-general-ad-hoc')){
          removed = this.profileStore.removeFromAdHocMode(profileName, elementName)
        } else {
          removed = true
        }
        //jump to it
        try {
          this.activeComponent = this.activeProfile.rt[profileName].pt[elementName]
        } catch(err){
          console.warn("Coudln't jump to component: ", elementName, "--", err)
        }
      },

      isReadOnlyField: function(component){
        if (component.adminMetadataType && component.adminMetadataType == 'secondary'){
          return true
        }
        return false
      },

      hideAdminField: function(component, profileName){
          let readOnly = this.isReadOnlyField(component)
          let isWork = profileName.includes(':Work')
          let isAdminField = component.propertyURI.includes('adminMetadata')

          return (readOnly) || (isWork && isAdminField )
        },
    },
  }



</script>

<template>
  <!-- Add v-if check for activeProfile and rtOrder -->
  <template v-if="activeProfile && activeProfile.rtOrder">
    <template v-if="preferenceStore.returnValue('--b-edit-main-splitpane-properties-accordion') == true">
      <AccordionList :open-multiple-items="false">
        <template v-for="profileName in activeProfile.rtOrder" :key="profileName">
          <AccordionItem v-if="activeProfile.rt[profileName] && activeProfile.rt[profileName].noData != true"
                        style="color: white;" 
                        :id="'accordion_'+profileName" 
                        default-closed>
            <template #summary>
              <div :class="{'container-type-icon': true }">
                <svg v-if="profileName.split(':').slice(-1)[0] == 'Work'" width="1.5em" height="1.1em" version="1.1" xmlns="http://www.w3.org/2000/svg">
                  <circle :fill="preferenceStore.returnValue('--c-general-icon-work-color')" cx="0.55em" cy="0.6em" r="0.45em"/>
                </svg>
                <svg v-if="profileName.includes('Instance')" :fill="preferenceStore.returnValue('--c-general-icon-instance-color')" style="margin-right: 7px;" width="18px" height="18px" version="1.1" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                  <path d="m5 50l45-45 45 45-45 45z"/>
                </svg>
                <svg v-if="profileName.includes(':Item')" style="margin-right: 1px;" width="1.5em" height="1.1em" version="1.1" xmlns="http://www.w3.org/2000/svg">
                  <rect :fill="preferenceStore.returnValue('--c-edit-main-splitpane-edit-background-color-item')" width="0.85em" height="0.85em" x=".1em" y="0.1em" />
                </svg>
                <svg v-if="profileName.endsWith(':Hub')" version="1.1" viewBox="0 -20 100 100" xmlns="http://www.w3.org/2000/svg">
                  <path fill="royalblue" d="m62.113 24.66 1.9023-15.238 18.875 32.691-7.5469 20.004 15.238 1.9023-32.691 18.875-20.004-7.5469-1.9023 15.238-18.875-32.691 7.5469-20.004-15.238-1.9023 32.691-18.875zm-17.684 15.695-4.0781 15.215 15.215 4.0781 4.0781-15.215z" fill-rule="evenodd"/>
                </svg>
                <span class="sidebar-header-text" v-if="profileName.split(':').slice(-1)[0] == 'Work'">{{$t("message.wordWork")}}</span>
                <span class="sidebar-header-text" v-if="profileName.split(':').slice(-1)[0].indexOf('Instance') > -1">
                  <template v-if="activeProfile.rt[profileName]['@type'] && activeProfile.rt[profileName]['@type'] == 'http://id.loc.gov/ontologies/bflc/SecondaryInstance'">Secondary</template>
                  {{$t("message.wordInstance")}}
                </span>
                <span class="sidebar-header-text" v-if="profileName.split(':').slice(-1)[0].indexOf('Item')>-1">{{$t("message.wordItem")}}</span>
                <span class="sidebar-header-text" v-if="profileName.split(':').slice(-1)[0].indexOf('Hub')>-1">{{$t("message.wordHub")}}</span>
              </div>
            </template>

            <!-- Property list with proper scoping -->
            <div class="accordion-item-content-wrapper">
              <ul class="sidebar-property-ul">
                <template v-if="activeProfile.rt[profileName] && activeProfile.rt[profileName].ptOrder && activeProfile.rt[profileName].ptOrder.length > 0">
                  <template v-for="element in activeProfile.rt[profileName].ptOrder" :key="element">
                    <li 
                      v-if="
                        activeProfile.rt[profileName].pt && 
                        activeProfile.rt[profileName].pt[element] && 
                        !hideAdminField(activeProfile.rt[profileName].pt[element], profileName) && 
                        !activeProfile.rt[profileName].pt[element].deleted && 
                        !hideProps.includes(activeProfile.rt[profileName].pt[element].propertyURI)
                      "
                      @click.stop="jumpToElement(profileName, element)" 
                      :class="[
                        'sidebar-property-li sidebar-property-li-empty', 
                        {'user-populated': hasData(activeProfile.rt[profileName].pt[element]) == 'user'}, 
                        {'system-populated': hasData(activeProfile.rt[profileName].pt[element]) == 'system'}, 
                        {'not-populated-hide': preferenceStore.returnValue('--c-general-ad-hoc') && 
                                              emptyComponents[profileName] && 
                                              emptyComponents[profileName].includes(element) && 
                                              !layoutActive}
                      ]"
                    >
                      <a href="#" @click.stop="jumpToElement(profileName, element)" class="sidebar-property-ul-alink">
                        <template v-if="preferenceStore.returnValue('--b-edit-main-splitpane-properties-number-labels')">
                          {{ activeProfile.rt[profileName].ptOrder.indexOf(element) }}
                        </template>
                        <span v-if="replacePropertyWithValue(activeProfile.rt[profileName].pt[element].propertyURI)">
                          {{ returnHeadingLabel(activeProfile.rt[profileName].pt[element]) }}
                        </span>
                        <span v-else>
                          {{ activeProfile.rt[profileName].pt[element].propertyLabel }}
                        </span>
                      </a>
                      
                      <template v-if="
                        preferenceStore.returnValue('--b-edit-main-splitpane-properties-show-types') && 
                        activeProfile.rt[profileName].pt[element].valueConstraint && 
                        activeProfile.rt[profileName].pt[element].valueConstraint.valueTemplateRefs && 
                        activeProfile.rt[profileName].pt[element].valueConstraint.valueTemplateRefs.length > 1
                      ">
                        <ul class="sidebar-property-ul sidebar-property-ul-sub-ul">
                          <li 
                            class="sidebar-property-li sidebar-property-li-sub-li" 
                            v-for="(t, idx) in returnTemplateTypes(activeProfile.rt[profileName].pt[element].valueConstraint.valueTemplateRefs)"
                            :key="idx"
                          >
                            <a tabindex="-1" href="#" class="sidebar-property-ul-alink sidebar-property-ul-alink-sublink">{{ t }}</a>
                          </li>
                        </ul>
                      </template>
                    </li>
                  </template>
                </template>
                <li v-else class="sidebar-property-li">Loading properties...</li>
              </ul>
            </div>
          </AccordionItem>
        </template>
      </AccordionList>
    </template>

    <!-- Rest of the template remains unchanged -->
    <template v-if="preferenceStore.returnValue('--b-edit-main-splitpane-properties-accordion') == false">
      <div v-for="profileName in activeProfile.rtOrder" class="sidebar" :key="profileName">
        <!-- Add check for activeProfile.rt[profileName] -->
        <div v-if="activeProfile.rt[profileName] && activeProfile.rt[profileName].noData != true">
            <div :class="{'container-type-icon': true, 'sidebar-spacer': (profileName.split(':').slice(-1)[0] == 'Instance' || profileName.split(':').slice(-1)[0] == 'Item')}">
                    <svg v-if="profileName.split(':').slice(-1)[0] == 'Work'" width="1.5em" height="1.1em" version="1.1" xmlns="http://www.w3.org/2000/svg">
                      <circle :fill="preferenceStore.returnValue('--c-general-icon-work-color')" cx="0.55em" cy="0.6em" r="0.45em"/>
                    </svg>
                    <svg v-if="profileName.includes('Instance')" :fill="preferenceStore.returnValue('--c-general-icon-instance-color')" width="20px" height="20px" version="1.1" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                     <path  d="m5 50l45-45 45 45-45 45z"/>
                    </svg>
                    <svg v-if="profileName.includes(':Item')"  viewBox="0 -32 50 72" version="1.1" xmlns="http://www.w3.org/2000/svg">
                      <rect width="40px" height="40px" class="item-icon" />
                    </svg>
                    <svg  v-if="profileName.endsWith(':Hub')" version="1.1" viewBox="0 -20 100 100" xmlns="http://www.w3.org/2000/svg">
                      <path fill="royalblue" d="m62.113 24.66 1.9023-15.238 18.875 32.691-7.5469 20.004 15.238 1.9023-32.691 18.875-20.004-7.5469-1.9023 15.238-18.875-32.691 7.5469-20.004-15.238-1.9023 32.691-18.875zm-17.684 15.695-4.0781 15.215 15.215 4.0781 4.0781-15.215z" fill-rule="evenodd"/>
                    </svg>
                    <span class="sidebar-header-text" v-if="profileName.split(':').slice(-1)[0] == 'Work'">{{$t("message.wordWork")}}</span>
                    <span class="sidebar-header-text" v-if="profileName.split(':').slice(-1)[0] == 'Instance'">{{$t("message.wordInstance")}}</span>
                    <span class="sidebar-header-text" v-if="profileName.split(':').slice(-1)[0] == 'Item'">{{$t("message.wordItem")}}</span>
                    <span class="sidebar-header-text" v-if="profileName.split(':').slice(-1)[0] == 'Hub'">{{$t("message.wordHub")}}</span>
            </div>

            <ul class="sidebar-property-ul">
                            <draggable
                              v-model="activeProfile.rt[profileName].ptOrder"
                              group="people"
                              @start="drag=true"
                              @end="drag=false"
                              item-key="id">
                              <template #item="{element}">
                                <!-- Add checks for activeProfile.rt[profileName].pt[element] -->
                                <li v-if="activeProfile.rt[profileName] && activeProfile.rt[profileName].pt && activeProfile.rt[profileName].pt[element]" @click.stop="activeComponent = activeProfile.rt[profileName].pt[element]" class="sidebar-property-li sidebar-property-li-empty">
                                  <a href="#" @click.stop="activeComponent = activeProfile.rt[profileName].pt[element]" class="sidebar-property-ul-alink">
                                      <template v-if="preferenceStore.returnValue('--b-edit-main-splitpane-properties-number-labels')">{{activeProfile.rt[profileName].ptOrder.indexOf(element)}}</template>
                                      {{activeProfile.rt[profileName].pt[element].propertyLabel}}
                                  </a>
                                  <template v-if="preferenceStore.returnValue('--b-edit-main-splitpane-properties-show-types')">
                                    <template v-if="activeProfile.rt[profileName].pt[element].valueConstraint.valueTemplateRefs.length>1">
                                        <ul class="sidebar-property-ul sidebar-property-ul-sub-ul">
                                            <li class="sidebar-property-li sidebar-property-li-sub-li" :key="t" v-for="t in returnTemplateTypes(activeProfile.rt[profileName].pt[element].valueConstraint.valueTemplateRefs)">
                                              <a tabindex="-1" href="#" class="sidebar-property-ul-alink sidebar-property-ul-alink-sublink" >{{t}}</a>
                                            </li>
                                        </ul>
                                    </template>
                                  </template>
                              </li>
                             </template>
                            </draggable>
              </ul>
          </div>
        </div>
    </template>

    <!-- Component Library Section -->
    <template v-if="activeProfile && preferenceStore.returnValue('--b-edit-main-splitpane-properties-component-library') == true">
      <AccordionList :open-multiple-items="true">
        <AccordionItem v-for="(clProfile, idx) in returnComponentLibrary" 
                       :key="idx" 
                       style="color: white;" 
                       :id="'accordion_'+clProfile.profileId" 
                       default-closed>
          <template #summary>
            <div>
              <span class="material-icons" style="font-size: 18px;padding-left: 2px;">library_add</span>
              <span style="vertical-align: text-bottom;" class="sidebar-header-text">
                {{ clProfile.type == 'default' ? 'Defaults' : 'Library' }}: {{ clProfile.type == 'default' ? '' : clProfile.label }}
              </span>
            </div>
          </template>
          
          <!-- Component Library content -->
          <ul class="sidebar-property-ul">
            <template v-for="(group, groupIdx) in clProfile.groupsOrder" :key="groupIdx">
              <div class="component-group">
                <template v-if="clProfile.groups[group] && clProfile.groups[group].length > 1">
                  <li class="component-librart-group-line"></li>
                </template>

                <template v-if="clProfile.groups[group]">
                  <li v-for="(component, compIdx) in clProfile.groups[group]" 
                      :key="compIdx" 
                      class="sidebar-property-li sidebar-property-li-cl">
                    <button :class="{'material-icons': true, 'component-library-settings-button': true, 'component-library-settings-button-invert': (activeComponentLibrary == component.id)}" 
                            @click="configComponentLibrary(component.id)">
                      settings_applications
                    </button>

                    <div class="component-library-item-container sidebar-property-li-empty" 
                         @click="addComponentLibrary($event, component.id)">
                      <a href="#" @click="addComponentLibrary($event, component.id)">{{ component.label }}</a>
                    </div>
                    
                    <template v-if="activeComponentLibrary == component.id && clProfile.type != 'default'">
                      <div class="component-library-settings">
                        <button class="material-icons simptip-position-right" 
                                data-tooltip="DELETE" 
                                @click="delComponentLibrary($event, component.id)">
                          delete_forever
                        </button>
                        <button class="material-icons simptip-position-right" 
                                data-tooltip="RENAME" 
                                @click="renameComponentLibrary($event, component.id, component.label)">
                          new_label
                        </button>
                        <select @change="configComponentLibraryAssignGroup($event, component.id)">
                          <option value="" :selected="(component.groupId === null)">No Group</option>
                          <option v-for="letter in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'" 
                                  :key="letter" 
                                  :value="letter" 
                                  :selected="(component.groupId === letter)">
                            Group {{ letter }}
                          </option>
                        </select>
                      </div>
                    </template>
                  </li>
                </template>

                <template v-if="clProfile.groups[group] && clProfile.groups[group].length > 1 && clProfile.groups[group][0]">
                  <button class="component-librart-group-button" 
                          @click="addComponentLibraryGroup(clProfile.groups[group][0].groupId)">
                    <span class="material-icons">arrow_upward</span>
                    Add {{clProfile.type != 'default' ? 'Group' : ''}} {{ clProfile.groups[group][0].groupId }}
                    <span class="material-icons">arrow_upward</span>
                  </button>
                </template>
              </div>
            </template>
          </ul>
        </AccordionItem>
      </AccordionList>
    </template>
  </template> <!-- End of v-if="activeProfile && activeProfile.rtOrder" -->
  <template v-else>
    <!-- Optional: Show a loading state or message -->
    <div>Loading properties...</div>
  </template>

</template>

<style>
  .accordion-list {
    width: 100%;
    background: transparent !important;
  }
  .accordion-list .accordion-item {
    margin-top: 6px;
    --content-height: 0px;
    background-color: transparent !important;

    height: calc(0px + 26px);
    overflow: hidden;
    transition: height 300ms ease-in-out;
    border: none;
    font-size: v-bind("preferenceStore.returnValue('--n-edit-main-splitpane-properties-font-size')");


  }
  .accordion-list .accordion-item > .accordion-item__summary {
    padding: 0px;
    cursor: pointer;
    color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-properties-font-color')") !important;
    display: flex;
    justify-content: space-between;
    align-items: center;


    line-height: 24px;
    transition: color 300ms ease-in-out;


  }
  .accordion-list .accordion-item > .accordion-item__summary:hover {
    color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-properties-font-color')") !important;
    transition: color 300ms ease-in-out;
  }
  .accordion-list .accordion-item > .accordion-item__summary > .accordion-item__summary-icon {
    transition: transform 300ms ease-in-out;
  }
  .accordion-list .accordion-item > .accordion-item__summary > .accordion-item__summary-icon--default::before {
    content: "▲";
    line-height: 22px;
  }
  .accordion-list .accordion-item--open {
    height: calc(var(--summary-height) + var(--content-height) + 51px);
    background: var(--acco-lightest);
  }
  .accordion-list .accordion-item--open > .accordion-item__summary > .accordion-item__summary-icon {
    transform: rotate(180deg);
  }
  .accordion-list .accordion-item--open > .accordion-item__summary {
    background: var(--acco-light);
    color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-properties-font-color')") !important;
    border-bottom: 1px solid var(--acco-dark);
  }
  .accordion-list .accordion-item--disabled > .accordion-item__summary {
    color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-properties-font-color')") !important;
    cursor: default;
  }
  .accordion-list .accordion-item--disabled > .accordion-item__summary:hover {
    color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-properties-font-color')") !important;
  }
  .accordion-list .accordion-item > .accordion-item__content {
    background-color: var(--acco-lightest);
    border-top: none;
    padding: 12px;
  }
  .accordion-item-content-wrapper {
    padding: 0;
    margin: 0;
  }
</style>

<style scoped>


.sidebar{
  font-size: v-bind("preferenceStore.returnValue('--n-edit-main-splitpane-properties-font-size')");
}


.container-type-icon{
  color: #ffffff;
  width: inherit;
  text-align: left;
  display: flex;
}

.component-library-item-container{
    width: 100%;

    height: v-bind("preferenceStore.returnValue('--n-edit-main-splitpane-properties-font-size', true) + 0.25  + 'em'");
    max-height: v-bind("preferenceStore.returnValue('--n-edit-main-splitpane-properties-font-size', true) + 0.25  + 'em'");
    overflow: hidden;
    cursor: pointer;


}
.component-library-item-container a{
  color: inherit !important;
  text-decoration:none;
}

.component-librart-group-line{
  border-bottom: solid 1px #6e6e6e;
  height: 1px;
}
.component-librart-group-button{
  width: 100%;
  height: 16px;
  font-size: 12px;

  padding: 0;
}
.component-librart-group-button span{
  font-size: 12px;
}

.sidebar-property-li-cl{
  padding-left: 0 !important;
  position: relative;
}

.sidebar-property-li-cl .component-library-settings-button{
  position: absolute;
    right: -5px;
    font-size: 20px;
    border: none;
    padding: 0;
    background-color: white;
    margin: 0;
    border-radius: 5px;
    display: none;
    z-index: 1000;
}

.component-library-settings-button-invert{
  filter: invert(100%);
}


.sidebar-property-li-cl:hover .component-library-settings-button{
  display: inline-block;
}
.component-library-settings{
    border: solid 0.5px v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-properties-font-color')");
    border-radius: 3px;
    margin-left: 12px;
    padding: 2px;

}

.component-library-settings button{
  font-size: 20px;
}
.component-library-settings select{
  height: 26px;
  vertical-align: top;


}


.sidebar-header-text{
  font-size: v-bind("preferenceStore.returnValue('--n-edit-main-splitpane-properties-font-size', true) + 0.25  + 'em'");
  font-family: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-properties-font-family')");
  color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-properties-font-color')") !important;
}

.sidebar-property-ul{

  font-size: v-bind("preferenceStore.returnValue('--n-edit-main-splitpane-properties-font-size')");
  margin-left: 0;
  padding-left: 0;
  font-family: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-properties-font-family')");
}
.sidebar-property-li{
  cursor: pointer;
  padding-left: v-bind("preferenceStore.returnValue('--n-edit-main-splitpane-properties-font-size', true) / 2  + 'em'");
  list-style: none;
/*  font-size: v-bind("preferenceStore.returnValue('--n-edit-main-splitpane-properties-font-size')");*/
}

.sidebar-property-li:hover{
  background-color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-properties-highlight-background-color')");
}

.sidebar-property-li-empty::before{
  content: "• ";
  color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-properties-empty-indicator-color')") !important;

}

.sidebar-property-ul-alink{
  text-decoration: none;
  color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-properties-font-color')") !important;

}

.sidebar-property-ul-sub-ul{
  padding-left: v-bind("preferenceStore.returnValue('--n-edit-main-splitpane-properties-font-size', true) / 1  + 'em'");
}

.sidebar-property-li-sub-li::before{
  content: "\200B";

}
.sidebar-property-ul-alink-sublink{
  font-size: v-bind("preferenceStore.returnValue('--n-edit-main-splitpane-properties-font-size', true) - 0.15  + 'em'") !important;
/*  font-size: calc((v-bind("preferenceStore.returnValue('--n-edit-main-splitpane-properties-font-size')")) - (0.1em) );*/
/*  font-size: v-bind("preferenceStore.returnValue('--n-edit-main-splitpane-properties-font-size')");*/



/*    font-size: v-bind("preferenceStore.returnValue('--n-edit-main-splitpane-properties-font-size')");*/

}

.sidebar-spacer{
  padding-top: 1em;
  margin-top: 1em;
  padding-bottom: 1em;
  border-top: solid 1px v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-properties-font-color')");

}


.item-icon{
  fill:v-bind("preferenceStore.returnValue('--c-general-icon-item-color')");
  stroke-width:0.5;
  stroke:rgb(0,0,0)
}

li.system-populated:before {
    font-family: 'Material Icons';
    content: 'radio_button_unchecked';
    color: white !important;
}

li.user-populated:before {
    font-family: 'Material Icons';
    content: 'task_alt';
    color: white !important;
}

li.not-populated-hide:before{
  font-family: 'Material Icons';
  content: 'visibility_off';
  color: white !important;
}

.sidebar-property-ul .component-group:nth-child(even){
  background-color: grey;
}
.sidebar-property-ul li {
  list-style: none;
}


</style>
