<template>

  <template  v-if="structure.valueConstraint.valueTemplateRefs.length > 1">


    <template v-if="preferenceStore.returnValue('--b-edit-main-splitpane-edit-inline-mode') == true">


      <select style="display: inline; width: 20px; border-color:whitesmoke; background-color: transparent;" @change="templateChange($event)">
          <option v-for="rt in allRtTemplate" :value="rt.id" :selected="(rt.id === thisRtTemplate.id)">{{rt.resourceLabel}}</option>
      </select>

    </template>
    <template v-else>
      <select :id="structure['@guid']" @change="templateChange($event)" style=" background-color: transparent;">
          <option v-for="rt in allRtTemplate" :value="rt.id" :selected="(rt.id === thisRtTemplate.id)">{{rt.resourceLabel}}</option>
      </select>
    </template>
  </template>

  <Main v-for="(pt,idx) in thisRtTemplate.propertyTemplates"
    :level="level"
    :propertyPath="propertyPath"
    :nested="true"
    :guid="guid"
    :inheritedStructure="thisRtTemplate.propertyTemplates[idx]"
    :readOnly="readOnly"/>


  <!--

  <div v-if="dynamic == 'singleTemplate'">

    <EditMainComponent  v-for="(pt,idx) in activeTemplate.propertyTemplates"
      :level="level"
      :bnodeProperty="bnodeProperty"
      :propertyPath="propertyPath"
      :ptGuid="ptGuid"
      :isMini="isMini"
      :key="idx"
      :position="idx"
      :activeTemplate="Object.assign({nested:true},activeTemplate)"
      :structure="activeTemplate.propertyTemplates[idx]"
      :profileCompoent="profileCompoent"
      :profileName="profileName"
      :grandParentStructureObj="parentStructureObj"
      :parentStructureObj="structure"
      :parentStructure="['nothing']"
      :nested="true">
    </EditMainComponent>


  </div>


  <div v-else-if="nested == false" :class="'component-container' + ' component-container-' + settingsDisplayMode">

    <div :class="'component-container-title' + ' component-container-title-' + settingsDisplayMode ">{{structure.propertyLabel}}<EditLabelRemark :remark="structure.remark" /></div>
    <div :class="'component-container-input-container' + ' component-container-input-container-' + settingsDisplayMode">

      <template  v-if="structure.valueConstraint.valueTemplateRefs.length > 1">
        <div class="component-container-fake-input no-upper-right-border-radius no-lower-right-border-radius no-upper-border" style="flex:4; max-height: 3em;">
          <div style="display: flex">
            <div style="flex:1">
              <form autocomplete="off">
                <input bfeType="EditTemplateRefComponent-nested"  :id="assignedId"  v-on:focus="focused" class="selectable-input" autocomplete="off" @keydown="multiTemplateSelectKeydown($event)" type="text" v-bind:value="multiTemplateSelect" style="width: 95%; border:none; height: 90%; font-size: 1.5em; padding: 0.1em; background: none">
              </form>
            </div>
            <button tabindex="-1" class="temp-icon-switch fake-real-button simptip-position-top" :data-tooltip="labels.refComponentSwitchButton" @click="multiTemplateSelectKeydown($event, true)">
            </button>
          </div>
        </div>
      </template>
      <div v-if="activeTemplate != null && activeTemplate.propertyTemplates.length > 0">

        <EditMainComponent  v-for="(pt,idx) in activeTemplate.propertyTemplates"
        :level="level"
        :bnodeProperty="bnodeProperty"
        :propertyPath="propertyPath"
        :ptGuid="ptGuid"
        :key="idx"
        :isMini="isMini"
        :activeTemplate="activeTemplate"
        :structure="activeTemplate.propertyTemplates[idx]"
        :parentStructureObj="structure"
        :parentStructure="['nothing']"
        :profileCompoent="profileCompoent"
        :profileName="profileName"
        :nested="true">
        </EditMainComponent>
      </div>
      <div v-else>
        <span>Missing resource template {{structure.valueConstraint.valueTemplateRefs}}</span>
        {{activeTemplate}}
      </div>

    </div>

  </div>

  <div v-else-if="nested == true">
      <template v-if="structure.valueConstraint.valueTemplateRefs.length > 1">
        <div class="component-container-fake-input no-upper-right-border-radius no-lower-right-border-radius no-upper-border" style="flex:4;  max-height: 3em">
          <div style="display: flex">
            <div style="flex:1">
              <form autocomplete="off">
                <input bfeType="EditTemplateRefComponent-unnested" :id="assignedId"  v-on:focus="focused" class="selectable-input" autocomplete="off" @keydown="multiTemplateSelectKeydown($event)" type="text" v-bind:value="multiTemplateSelect" style="width: 95%; border:none; height: 90%; font-size: 1.5em; padding: 0.1em; background: none">
              </form>
            </div>
            <button tabindex="-1" class="temp-icon-switch fake-real-button simptip-position-top" :data-tooltip="labels.refComponentSwitchButton"  @click="multiTemplateSelectKeydown($event, true)">
            </button>
          </div>
        </div>
      </template>
      <template v-if="activeTemplate != null && activeTemplate.propertyTemplates.length > 0">

        <EditMainComponent  v-for="(pt,idx) in activeTemplate.propertyTemplates"
          :ptGuid="ptGuid"
          :level="level"
          :bnodeProperty="bnodeProperty"
          :propertyPath="propertyPath"
          :key="idx"
          :isMini="isMini"
          :position="idx"
          :activeTemplate="Object.assign({nested:true},activeTemplate)"
          :structure="activeTemplate.propertyTemplates[idx]"
          :profileCompoent="profileCompoent"
          :profileName="profileName"
          :grandParentStructureObj="parentStructureObj"
          :parentStructureObj="structure"
          :parentStructure="['nothing']"
          :nested="true">
        </EditMainComponent>
      </template>

  </div>



 -->



</template>

<script>



// import EditMainComponent from "@/components/EditMainComponent.vue";


// import { mapState } from 'vuex'
// import uiUtils from "@/lib/uiUtils"
// import labels from "@/lib/labels"
// import EditLabelRemark from "@/components/EditLabelRemark.vue";


// import Main from "@/components/panels/edit/fields/Main.vue";

import { useProfileStore } from '@/stores/profile'
import { usePreferenceStore } from '@/stores/preference'

import { mapStores, mapState } from 'pinia'


export default {
  name: "Ref",
  components: {
    // EditLabelRemark,
    // Main : () => import('@/components/panels/edit/fields/Main.vue')

  },
  props: {
    structure: Object,
    propertyPath: Array,
    level: Number,
    guid:String,
    readOnly: Boolean

    // parentStructure: Array,
    // parentStructureObj: Object,
    // profileCompoent: String,
    // parentURI: String,
    // profileName: String,
    // nested: Boolean,
    // isMini: Boolean,
    // dynamic: String,
    // ptGuid: String,
    // bnodeProperty: String,



  },
  data: function() {
    return {

      manualOverride: null,


      // multiTemplateSelect: "",
      // multiTemplateSelectURI: "",
      // multiTemplateSelectOptions: [],
      // activeTemplate: null,
      // propertyTemplatesOrderLookup: {},
      // propertyTemplatesOrderTypeLookup: {},
      // labels: labels,
      // internalAssignID:false,

    }
  },
  computed:{

    ...mapStores(useProfileStore),
    ...mapStores(usePreferenceStore),

    ...mapState(useProfileStore, ['rtLookup']),



    thisRtTemplate(){
      if (this.manualOverride !== null){
        for (let tmpid of this.structure.valueConstraint.valueTemplateRefs){
          console.log('tmpid',tmpid)
          if (tmpid === this.manualOverride){
            let use = JSON.parse(JSON.stringify(this.rtLookup[tmpid]))
            console.log(use)
            return use
          }
        }
        return true
      }

      // // grab the first component from the struecture, but there might be mutluple ones
      let useId = this.structure.valueConstraint.valueTemplateRefs[0]
      let foundBetter = false

      let userValue = this.structure.userValue

      // use the first value in the userValue
      if (userValue[this.structure.propertyURI] && userValue[this.structure.propertyURI][0]){
        userValue = this.structure.userValue[this.structure.propertyURI][0]
      }

      // do we have user data and a possible @type to use
      if (userValue['@type']){
        // loop thrugh all the refs and see if there is a URI that matches it better
        this.structure.valueConstraint.valueTemplateRefs.forEach((tmpid)=>{
          if (foundBetter) return false
          if (this.structure.id != this.rtLookup[tmpid].id && this.rtLookup[tmpid].resourceURI === userValue['@type']){
            useId = tmpid
            foundBetter = true
          }

          for (let key in userValue){
            if (Array.isArray(userValue[key])){
              for (let val of userValue[key]){
                if (val['@type'] && this.rtLookup[tmpid].resourceURI === val['@type']){
                  useId = tmpid
                  foundBetter = true
                }
              }
            }
          }

        })
      } else {
		  //There's no userValue, we'll use the parent's userValue to check
		  //	if there's a template that might be even better-er
		  // But, we're only going to look deeper for bf:contribution

		  let parentUserValue
		  try {
			  parentUserValue = this.$parent.$parent.structure.userValue
	      } catch {
			  parentUserValue = null
		  }

		  for (let idx in this.structure.valueConstraint.valueTemplateRefs){
			  let template = this.structure.valueConstraint.valueTemplateRefs[idx]
			  if (parentUserValue && parentUserValue["@root"] == "http://id.loc.gov/ontologies/bibframe/contribution" && parentUserValue["http://id.loc.gov/ontologies/bibframe/contribution"]){
				  let target = parentUserValue["http://id.loc.gov/ontologies/bibframe/contribution"][0]["http://id.loc.gov/ontologies/bibframe/agent"]
				  if (target){
                      let type = target[0]["@type"]
                      if (type && this.rtLookup[template].resourceURI === type){
                        useId = template
                      }
				  }
			  }
		  }
	  }


      // do not render recursivly if the thing we are trying to render recursivly is one the of the things thAT WER ARE RENDERING TO BEGIN WITHHHHH!!!1
      // if (this.parentStructure && this.parentStructure.indexOf(useId) ==-1){
        if (this.rtLookup[useId]){
          let use = JSON.parse(JSON.stringify(this.rtLookup[useId]))

          return use
          // this.multiTemplateSelect = use.resourceLabel
          // this.multiTemplateSelectURI = useId
          // this.activeTemplate = use

          // this.buildPropertyTemplatesOrderLookup()

      }else{
        console.warn("Could not find the template in the rtLookup: ",useId )
      }

      //   // little hack here for now
      //   if (useId == 'lc:RT:bf2:Monograph:Dissertation'){
      //     this.multiTemplateSelect = this.rtLookup[useId].resourceLabel
      //     this.multiTemplateSelectURI = useId
      //     this.activeTemplate = this.rtLookup[useId]
      //     this.buildPropertyTemplatesOrderLookup()
      //   }

      //   if (useId == 'lc:RT:bf2:Hub:Contribution'){
      //     this.multiTemplateSelect = this.rtLookup[useId].resourceLabel
      //     this.multiTemplateSelectURI = useId
      //     this.activeTemplate = this.rtLookup[useId]
      //     this.buildPropertyTemplatesOrderLookup()
      //   }



      // }

    },

    allRtTemplate(){
      let templates = []
      for (let id of this.structure.valueConstraint.valueTemplateRefs){
        templates.push(JSON.parse(JSON.stringify(this.rtLookup[id])))
      }
      return templates
    },





  },
  // computed: mapState({
    // rtLookup: 'rtLookup',
    // activeInput: 'activeInput',
    // activeProfile: 'activeProfile',
    // settingsDisplayMode: 'settingsDisplayMode',


    // assignedId (){

    //   // return uiUtils.assignID(this.structure,this.parentStructure)
    //   if (this.internalAssignID){
    //     return this.internalAssignID
    //   }else{
    //     this.internalAssignID = uiUtils.assignID(this.structure,this.parentStructure)
    //     return this.internalAssignID
    //   }
    // },


    // to access local state with `this`, a normal function must be used
    // lookupVocab (state) {
    //   // let uri = this.structure.valueConstraint.useValuesFrom[0]

    //   // let returnVal = []
    //   // Object.keys(state.lookupLibrary).forEach((s)=>{

    //   // })

    //   // if (state.lookupLibrary[this.structure.valueConstraint.useValuesFrom[0]]){

    //   //   return state.lookupLibrary[this.structure.valueConstraint.useValuesFrom[0]]
    //   // }else{
    //   //   return []
    //   // }
    //   return state.lookupLibrary[this.structure.valueConstraint.useValuesFrom[0]]


    // }
  // }),
  created: function () {
  },
  methods: {

    templateChange(event){
      let nextRef = this.allRtTemplate.filter((v)=>{ return (v.id === event.target.value) })[0]
      let thisRef = this.thisRtTemplate

      //If the selection is for Children's Subjects, use manual override
      if(nextRef.id == "lc:RT:bf2:Topic:Childrens:Components"){
        this.manualOverride = "lc:RT:bf2:Topic:Childrens:Components"
      } else {
        this.manualOverride = null
      }

      this.profileStore.changeRefTemplate(this.guid, this.propertyPath, nextRef, thisRef)
    }




    // buildPropertyTemplatesOrderLookup: function(){


    //   this.propertyTemplatesOrderLookup = {}
    //   this.activeTemplate.propertyTemplates.forEach((pt, i)=>{
    //     this.propertyTemplatesOrderLookup[pt.propertyURI+pt.propertyLabel] = i
    //   })

    //   // fill in the order type, start end or middle, solo

    //   if (this.activeTemplate.propertyTemplates.length==1){
    //     let useId = this.activeTemplate.propertyTemplates[0].propertyURI + this.activeTemplate.propertyTemplates[0].propertyLabel
    //     this.propertyTemplatesOrderTypeLookup[useId] = 'solo'
    //   }else if (this.activeTemplate.propertyTemplates.length==2){
    //     let useId = this.activeTemplate.propertyTemplates[0].propertyURI + this.activeTemplate.propertyTemplates[0].propertyLabel
    //     this.propertyTemplatesOrderTypeLookup[useId] = 'start'
    //     useId = this.activeTemplate.propertyTemplates[1].propertyURI + this.activeTemplate.propertyTemplates[1].propertyLabel
    //     this.propertyTemplatesOrderTypeLookup[useId] = 'end'
    //   }else if (this.activeTemplate.propertyTemplates.length>2){
    //     this.activeTemplate.propertyTemplates.forEach((pt, i)=>{
    //       if (i == 0){
    //         this.propertyTemplatesOrderTypeLookup[pt.propertyURI+pt.propertyLabel] = 'start'
    //       } else if (i == this.activeTemplate.propertyTemplates.length-1){
    //         this.propertyTemplatesOrderTypeLookup[pt.propertyURI+pt.propertyLabel] = 'end'
    //       } else {
    //         this.propertyTemplatesOrderTypeLookup[pt.propertyURI+pt.propertyLabel] = 'middle'
    //       }
    //     })

    //   }



    // },

    // multiTemplateSelectKeydown: function(event, buttonPush){


    //   // if they click the button fake the event like they pressed arrow key
    //   if (buttonPush=== true){
    //     event = {
    //       key : 'ArrowRight',
    //       // the input
    //       target: event.target.parentNode.querySelector('input')
    //     }
    //     // put focus back on input so the keys work if used
    //     event.target.parentNode.querySelector('input').focus()
    //   }


    //   if (event.key==='ArrowRight' || event.key==='ArrowLeft'){
    //     // get the current pos, and if we are at the end loop back to the beginning
    //     let nextRefID
    //     let currentRefID

    //     if (event.key==='ArrowRight'){
    //       let currPos = this.structure.valueConstraint.valueTemplateRefs.indexOf(this.multiTemplateSelectURI)
    //       currentRefID = this.structure.valueConstraint.valueTemplateRefs[currPos]
    //       if (currPos+1 > this.structure.valueConstraint.valueTemplateRefs.length-1){
    //         currPos=-1
    //       }
    //       nextRefID = this.structure.valueConstraint.valueTemplateRefs[currPos+1]


    //     }else{

    //       let currPos = this.structure.valueConstraint.valueTemplateRefs.indexOf(this.multiTemplateSelectURI)
    //       currentRefID = this.structure.valueConstraint.valueTemplateRefs[currPos]


    //       if (currPos == 0){
    //         currPos=this.structure.valueConstraint.valueTemplateRefs.length
    //       }

    //       nextRefID = this.structure.valueConstraint.valueTemplateRefs[currPos-1]

    //     }


    //     // get the profile ready before we change the UI
    //     this.$store.dispatch("refTemplateChange", { self: this, profileName:this.profileName, profileComponet: this.profileCompoent, structure: this.structure, template:this.activeTemplate, parentId: this.structure.parentId, nextRef:this.rtLookup[nextRefID], thisRef: this.rtLookup[currentRefID] }).then(() => {

    //       let nextRef = JSON.parse(JSON.stringify(this.rtLookup[nextRefID]))

    //       this.multiTemplateSelect = nextRef.resourceLabel
    //       this.multiTemplateSelectURI = nextRefID
    //       this.activeTemplate = nextRef

    //       this.buildPropertyTemplatesOrderLookup()
    //       this.focused(event)
    //       uiUtils.renderBorders(true)




    //     })






    //   }else if (event.key==='Tab'){
    //     return true


    //   }else{
    //     event.preventDefault();
    //     return false
    //   }


    // },
    // focused: function(event){

    //   // just make sure it is turned on so they can nav out of the field


    //   this.$nextTick(()=>{
    //      this.$store.dispatch("enableMacroNav")
    //   })



    //   this.$store.dispatch("setActiveInput", { self: this, id: event.target.id, profileCompoent: this.profileCompoent, profileName: this.profileName }).then(()=>{

    //     // now focus the side bars
    //     this.$nextTick(()=>{
    //       uiUtils.focusSidebars()
    //     })


    //   })
    // }



  }


};
</script>


<style scoped>
select{
  width: 100%;
  border-bottom: none;
  border-top: none;
}
/*.component-container-fake-input:focus-within {
  border: solid 1px #a6acb7;
  background-color: #dfe5f1;
}
input{
  border: none;
  color: transparent;
  text-shadow: 0 0 0 gray;
  text-align: left;
}
.fake-real-button{
  height: 4em;
  min-width: 4em;
  background-color: transparent;
  border: none;
  outline: none;
  margin: 0.15em;
}

input{
  outline:none;
}
h3 {
  margin: 40px 0 0;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  display: inline-block;
  margin: 0 10px;
}
a {
  color: #42b983;
}
form{
  height: 100%;
}*/

</style>
