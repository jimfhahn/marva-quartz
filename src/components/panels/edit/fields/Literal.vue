<template>

  <template v-if="preferenceStore.returnValue('--b-edit-main-splitpane-edit-inline-mode') == true">
    <template v-if="inlineModeShouldDisplay">

      <template v-if="literalValues.length===1 && literalValues[0].value === ''">

          <span class="bfcode-display-mode-holder-label" :title="structure.propertyLabel">{{profileStore.returnBfCodeLabel(structure)}}:</span>
          <!-- <span @focus="inlineEmptyFocus" contenteditable="true" class="inline-mode-editable-span" ><span class="inline-mode-editable-span-space-maker">&nbsp;</span></span>         -->
          <input type="text" @focusin="focused" @keyup="navKey"  @input="valueChanged($event,true)" class="inline-mode-editable-span-input can-select" :ref="'input_' + literalValues[0]['@guid']" :data-guid="literalValues[0]['@guid']" />

      </template>
      <template v-else>

        <template v-for="lValue in literalValues">
          <span class="bfcode-display-mode-holder-label" :title="structure.propertyLabel">{{profileStore.returnBfCodeLabel(structure)}}:</span>
          <span contenteditable="true" @focusin="focused" @blur="blured" class="inline-mode-editable-span can-select" @keyup="navKey" @input="valueChanged" :ref="'input_' + lValue['@guid']" :data-guid="lValue['@guid']">{{lValue.value}}</span>
        </template>


      </template>

      <Transition name="action">
        <div class="literal-action-inline-mode" v-if="showActionButton && myGuid == activeField">
          <action-button :clickmode="true" :structure="structure"  :small="true" :type="'literal'" :guid="guid"  @action-button-command="actionButtonCommand" />
      </div>
    </Transition>

    </template>


  </template>

  <template v-else>    
    <div class="lookup-fake-input" v-if="showField" >
      <div class="literal-holder" @click="focusClick(lValue)" v-for="lValue in literalValues">
        <!-- <div>Literal ({{propertyPath.map((x)=>{return x.propertyURI}).join('>')}})</div> -->
        <div class="literal-field">


          <template v-if="preferenceStore.returnValue('--b-edit-main-splitpane-edit-shortcode-display-mode') == false">
            <div v-if="preferenceStore.returnValue('--b-edit-main-splitpane-edit-show-field-labels')"  class="lookup-fake-input-label">{{structure.propertyLabel}}</div>
          </template>
          <form autocomplete="off" >
            <template v-if="preferenceStore.returnValue('--b-edit-main-splitpane-edit-shortcode-display-mode') == true">

              <div class="bfcode-display-mode-holder">
                <div class="bfcode-display-mode-holder-label" :title="structure.propertyLabel">{{profileStore.returnBfCodeLabel(structure)}}</div>
                <div class="bfcode-display-mode-holder-value">
                  <textarea
                    :class="['literal-textarea', 'can-select',{'bfcode-textarea': preferenceStore.returnValue('--b-edit-main-splitpane-edit-shortcode-display-mode')}]"
                    v-model="lValue.value"
                    v-on:keydown.enter.prevent="submitField"
                    autocomplete="off"
                    @focusin="focused"
                    @blur="blured"
                    @input="valueChanged"
                    @keyup="navKey"
                    :ref="'input_' + lValue['@guid']"
                    :data-guid="lValue['@guid']"
                    :disabled="readOnly"
                    ></textarea>
                </div>
              </div>



            </template>
            <template v-else>
              <template v-if="structure.propertyURI == 'http://id.loc.gov/ontologies/bflc/nonSortNum'">
                <select id="nonSort-selection" @change="valueChanged" :ref="'input_' + lValue['@guid']" :data-guid="lValue['@guid']" style="margin-top: .5em;">
                  <option v-for="(n, opt) in 10" :value="opt" :selected="opt == lValue['value']">{{ opt }}</option>
                </select>
              </template>
              <template v-else>
                <textarea
                  :class="['literal-textarea', 'can-select',{}]"
                  v-model="lValue.value"
                  v-on:keydown.enter.prevent="submitField"
                  autocomplete="off"
                  @focusin="focused"
                  @blur="blured"
                  @input="valueChanged"
                  @keyup="navKey"
                  @keydown="keyDown"
                  :ref="'input_' + lValue['@guid']"
                  :data-guid="lValue['@guid']"
                  :disabled="readOnly"
                  ></textarea>
              </template>

            </template>





          </form>
        </div>
        <span class="lang-display" v-if="lValue['@language'] !== null">{{ lValue['@language'] }}</span>

          <Transition name="action">
            <div class="literal-action" v-if="showActionButton && myGuid == activeField">
              <action-button :type="'literal'" :structure="structure" :fieldGuid="lValue['@guid']"  :guid="guid"  @action-button-command="actionButtonCommand" />
            </div>
        </Transition>
      </div>
    </div>

    <div class="lcc-action-zone" v-if="lccFeatureData !== false && preferenceStore.returnValue('--b-shelflist-show-cutter-helpers')">
      <div v-if="structure.propertyURI=='http://id.loc.gov/ontologies/bibframe/classificationPortion'">

        <a style="color:black" v-if="lccFeatureData.classNumber" :href="'https://classweb.org/min/minaret?app=Class&mod=Search&look=1&query=&index=id&cmd2=&auto=1&Fspan='+lccFeatureData.classNumber+'&Fcaption=&Fkeyword=&Fterm=&Fcap_term=&count=75&display=1&table=schedules&logic=0&style=0&cmd=Search'" target="_blank">ClassWeb Search: {{ lccFeatureData.classNumber }}</a><br/>
        <a style="color:black" v-if="lccFeatureData.firstSubject" :href="'https://classweb.org/min/minaret?app=Corr&mod=Search&count=75&auto=1&close=1&display=1&menu=/Auto/&iname=sh2l&iterm='+lccFeatureData.firstSubject" target="_blank">ClassWeb Search: {{ lccFeatureData.firstSubject }}</a>


      </div>


      <div v-if="structure.propertyURI=='http://id.loc.gov/ontologies/bibframe/itemPortion'">
        <!-- { "title": "knitter's handy book of patterns", "classNumber": "TT820", "cutterNumber": ".B877 2002", "titleNonSort": 4, "contributors": [ { "type": "PrimaryContribution", "label": "Budd, Ann, 1956-" } ], "firstSubject": "Knitting--Patterns" } -->
        <div style="display: flex;">
          <div style="flex:1">
          <fieldset v-if="(lccFeatureData.contributors && lccFeatureData.contributors.length>0) || lccFeatureData.title" >
            <legend>Cutter Calculator</legend>

            <template v-if="lccFeatureData.contributors">

              <template v-if="lccFeatureData.contributors[0]">
                <div>
                  <span style="font-weight: bold;">{{lccFeatureData.contributors[0].label.substring(0,parseInt(cutterCalcLength))}}</span>
                  <span>{{lccFeatureData.contributors[0].label.substring(parseInt(cutterCalcLength))}}</span>
                  <input type="text" :value="usePeriodInCutter() + calculateCutter(lccFeatureData.contributors[0].label,cutterCalcLength).substring(0,cutterCalcLength)">
                  <a style="font-size: 0.85em; padding-left: 0.5em;" @click.prevent="setLccInfo(lccFeatureData.cutterGuid,calculateCutter(lccFeatureData.contributors[0].label,cutterCalcLength).substring(0,cutterCalcLength))" href="#">Use</a>
                </div>

                <div>
                  <span style="font-weight: bold;">{{lccFeatureData.contributors[0].secondLetterLabel.substring(0,parseInt(cutterCalcLength))}}</span>
                  <span>{{lccFeatureData.contributors[0].secondLetterLabel.substring(parseInt(cutterCalcLength))}}</span>
                  <input type="text" :value="usePeriodInCutter() + calculateCutter(lccFeatureData.contributors[0].secondLetterLabel,cutterCalcLength).substring(0,cutterCalcLength)">
                  <a style="font-size: 0.85em; padding-left: 0.5em;" @click.prevent="setLccInfo(lccFeatureData.cutterGuid,calculateCutter(lccFeatureData.contributors[0].secondLetterLabel,cutterCalcLength).substring(0,cutterCalcLength))" href="#">Use</a>
                </div>




              </template>
              <template v-if="lccFeatureData.contributors[1]">
                <div>
                  <span style="font-weight: bold;">{{lccFeatureData.contributors[1].label.substring(0,cutterCalcLength)}}</span>
                  <span>{{lccFeatureData.contributors[1].label.substring(parseInt(cutterCalcLength))}}</span>
                  <input type="text" :value="usePeriodInCutter() + calculateCutter(lccFeatureData.contributors[1].label,parseInt(cutterCalcLength)).substring(0,parseInt(cutterCalcLength))">
                  <a style="font-size: 0.85em; padding-left: 0.5em;" @click.prevent="setLccInfo(lccFeatureData.cutterGuid,calculateCutter(lccFeatureData.contributors[1].label,parseInt(cutterCalcLength)).substring(0,parseInt(cutterCalcLength)))" href="#">Use</a>
                </div>
              </template>
              <template v-if="lccFeatureData.title">
                <div>
                  <span style="font-weight: bold;">{{lccFeatureData.title.substring(0,parseInt(cutterCalcLength))}}</span>
                  <span>{{lccFeatureData.title.substring(parseInt(cutterCalcLength),parseInt(cutterCalcLength)+12)}}</span>
                  <input type="text" :value="usePeriodInCutter() + calculateCutter(lccFeatureData.title,parseInt(cutterCalcLength)).substring(0,parseInt(cutterCalcLength))">
                  <a style="font-size: 0.85em; padding-left: 0.5em;" @click.prevent="setLccInfo(lccFeatureData.cutterGuid,calculateCutter(lccFeatureData.title,parseInt(cutterCalcLength)).substring(0,parseInt(cutterCalcLength)))" href="#">Use</a>
                </div>
              </template>

              <div>
                  <span style="font-weight: bold;">{{freeFormCutter.substring(0,parseInt(cutterCalcLength))}}</span>
                  <span>{{freeFormCutter.substring(parseInt(cutterCalcLength),parseInt(cutterCalcLength)+12)}}</span>
                  <input placeholder="Free Form Cutter Input" v-model="freeFormCutter">
                  <input type="text" :value="usePeriodInCutter() + calculateCutter(freeFormCutter,parseInt(cutterCalcLength)).substring(0,parseInt(cutterCalcLength))">
                  <a style="font-size: 0.85em; padding-left: 0.5em;" @click.prevent="setLccInfo(lccFeatureData.cutterGuid,calculateCutter(freeFormCutter,parseInt(cutterCalcLength)).substring(0,parseInt(cutterCalcLength)))" href="#">Use</a>
                </div>


            </template>

            <div>
              <input type="range" v-model="cutterCalcLength" id="cutterCalcLength" name="cutterCalcLength" min="0" max="6" step="1" />
              <label for="cutterCalcLength" style="font-size: 0.8em; vertical-align: text-top;">Calc Length ({{ cutterCalcLength }})</label>
            </div>


          </fieldset>
          </div>
          <div>
            <ul>
              <template v-for="(item, idx) in preferences">
                <li v-if="preferenceStore.returnValue(item[1]) != ''">
                  <a :href="preferenceStore.returnValue(item[1])" target="_blank">
                    {{ preferenceStore.returnValue(item[0]) != "" ? preferenceStore.returnValue(item[0]) : preferenceStore.returnValue(item[1])}}
                    <span class="material-icons" style="font-size: 14px;">open_in_new</span>
                  </a>
                </li>
              </template>
            </ul>
          </div>
          <div style="flex:1;     display: flex;justify-content: center;align-items: center;">
              <button @click="openShelfListSearch">Shelf List Search</button>
          </div>
        </div>
      </div>
    </div>


  </template>


</template>

<script>


import short from 'short-uuid'


import { useProfileStore } from '@/stores/profile'
import { usePreferenceStore } from '@/stores/preference'
import { useConfigStore } from '@/stores/config'

import { mapStores, mapState, mapWritableState } from 'pinia'

import utilsMisc from '@/lib/utils_misc'
import utilsNetwork from '@/lib/utils_network'


import ActionButton from "@/components/panels/edit/fields/helpers/ActionButton.vue";

export default {
  name: "Literal",
  components: {
    ActionButton,
    // EditLiteralEditor,
    // EditLabelRemark,
    // Keypress: () => import('vue-keypress')
  },

  props: {
    guid: String,
    nested: Boolean,
    propertyPath: Array,
    level: Number,
    structure: Object,
    readOnly: Boolean
  },

  methods: {

    usePeriodInCutter(){

      if (this.lccFeatureData && this.lccFeatureData.classNumber && this.lccFeatureData.classNumber.indexOf(".") > -1){
        return ''
      }else{
        return '.'
      }


    },

    openShelfListSearch(){
      this.activeShelfListData = {
        class: this.lccFeatureData.classNumber,
        cutter:this.lccFeatureData.cutterNumber,
        classGuid:this.lccFeatureData.classGuid,
        cutterGuid: this.lccFeatureData.cutterGuid,
        componentPropertyPath: this.propertyPath,
        componentGuid: this.guid,
        contributor: this.lccFeatureData.contributors.length > 0 ? this.lccFeatureData.contributors[0].label : "",
        title: this.lccFeatureData.title,
        subj: this.lccFeatureData.firstSubject,
        date: ""  //not in `lccFeatureData`
      }
      this.showShelfListingModal = true


    },


    async setLccInfo(fieldGuid,lccVal){

      this.lccFeatureDataCounter++
      if (fieldGuid == null){
        fieldGuid = short.generate()
      }
      lccVal = `${this.usePeriodInCutter()}${lccVal}`
      await this.profileStore.setValueLiteral(this.guid,fieldGuid,this.propertyPath,lccVal,null)




    },

    calculateCutter(toCut,howLong){
      return utilsMisc.calculateCutter(toCut,howLong)
    },

    inlineEmptyFocus: function(event){
      if (event.target.innerText.trim() === ''){
        event.target.innerText=''
      }
    },

    navKey: function(event){



      if (event && event.code === 'ArrowUp'){
        utilsMisc.globalNav('up',event.target)
      }
      if (event && event.code === 'ArrowDown'){

        utilsMisc.globalNav('down',event.target)
      }


      if (event && event.keyCode == 220 && event.ctrlKey == true){
        let id = `action-button-${event.target.dataset.guid}`
        document.getElementById(id).click()
      }



    },

    focusClick: function(lValue){

      this.$refs['input_' + lValue['@guid']][0].focus()
    },

    focused: function(){



      // set the state active field
      this.activeField = this.myGuid

      // if enabled show the action button
      if (this.preferenceStore.returnValue('--b-edit-general-action-button-display')){
        this.showActionButton=true
      }else{
        this.showActionButton=false
      }

      // does annoying height change when moving into field
      // this.expandHeightToContent()

    },
    blured: function(){
      // this.$nextTick(()=>{
      //   this.showActionButton=false
      // });
    },

    expandHeightToContent: function(){

      for (let key of Object.keys(this.$refs)){
        if (key.startsWith('input_')){
          if (this.$refs[key] && this.$refs[key][0]){
            this.$refs[key][0].style.height =  this.$refs[key][0].scrollHeight + "px"
          }
        }
      }

    },

    runMacroExpressMacro(event){

      for (let macro of this.diacriticUseValues){
            if (event.code == macro.code && event.ctrlKey == macro.ctrlKey && event.altKey == macro.altKey && event.shiftKey == macro.shiftKey){
              // console.log("run this macro", macro)

              let insertAt = event.target.value.length

              if (event.target && event.target.selectionStart){
                insertAt=event.target.selectionStart
              }
              let inputV
              if (event.target){
                inputV = event.target
              }else{
                console.warn("ERROR: Field not found")
                return false
              }



              if (!macro.combining){

                // there is behavior where if it is a digit shortcut the numerial is still sent
                // so if thats the case remove the last digit from the value
                if (event.code.includes('Digit')){
                  // if it is in fact a digit char then remove it
                  if (inputV.value.charAt(insertAt) == event.code.replace('Digit','')){
                    // remove the last char
                    // inputV.value = inputV.value.slice(0, -1);
                    inputV.value = inputV.value.slice(0,insertAt) + inputV.value.slice(insertAt)

                  }
                }

                // same for euqal key
                if (event.code == 'Equal'){
                  if (inputV.value.charAt(inputV.value.length-1) == '='){
                    // remove the last char
                    // inputV.value = inputV.value.slice(0, -1);
                    inputV.value = inputV.value.slice(0,insertAt) + inputV.value.slice(insertAt)

                  }
                }
                // same for Backquote key

                if (event.code == 'Backquote'){

                  if (inputV.value.charAt(inputV.value.length-1) == '`'){
                    // remove the last char
                    // inputV.value = inputV.value.slice(0, -1);
                    inputV.value = inputV.value.slice(0,insertAt) + inputV.value.slice(insertAt)
                  }

                }


                // it is not a combining unicode char so just insert it into the value
                if (inputV.value){
                  // inputV.value=inputV.value+macro.codeEscape

                  inputV.value = inputV.value.substring(0, insertAt) + macro.codeEscape + inputV.value.substring(insertAt);


                  if (insertAt){
                    this.$nextTick(()=>{
                      inputV.setSelectionRange(insertAt+1,insertAt+1)

                      this.$nextTick(()=>{
                        inputV.focus()
                      })

                    })
                  }else{

                      this.$nextTick(()=>{
                        inputV.focus()
                      })

                  }




                  }else{
                    inputV.value = macro.codeEscape
                  }

                }else{


                  // same for Backquote key

                  if (event.code == 'Backquote'){

                    if (inputV.value.charAt(inputV.value.length-1) == '`'){
                      // remove the last char
                      inputV.value = inputV.value.slice(0, -1);
                    }

                    }


                    // little cheap hack here, on macos the Alt+9 makes ª digits 1-0 do this with Alt+## but we only
                    // have one short cut that uses Alt+9 so just remove that char for now
                    inputV.value=inputV.value.replace('ª','')

                    inputV.value = inputV.value.substring(0, insertAt) + macro.codeEscape + inputV.value.substring(insertAt);
                    // inputV.value=inputV.value+macro.codeEscape

                    inputV.setSelectionRange(insertAt+1,insertAt+1)
                    inputV.focus()


                    if (insertAt){
                    this.$nextTick(()=>{
                      inputV.setSelectionRange(insertAt+1,insertAt+1)

                      this.$nextTick(()=>{
                        inputV.focus()
                      })

                    })
                    }else{

                      this.$nextTick(()=>{
                        inputV.focus()
                      })

                    }
                }

                event.preventDefault()
                event.stopPropagation()
                return false
            }
          }



    },


    // we need to check to see if they are attempting to do a couple different types of macros, if they are then stop the event but kick off the macro action
    keyDown: function(event){

      if (this.nextInputIsVoyagerModeDiacritics){



        // they are pressing shift in about to press antoher macro shrotcut
        if (event.key == 'Shift'){
          return false
        }

        if (this.diacriticPacks.voyager[event.code]){


          let useMacro
          for (let macro of this.diacriticPacks.voyager[event.code]){
            if (macro.shiftKey == event.shiftKey){
              useMacro = macro
              break
            }
          }

          let inputV = event.target
          let insertAt = event.target.value.length
          if (event.target && event.target.selectionStart){
            insertAt=event.target.selectionStart
          }

          if (!useMacro.combining){
          // it is not a combining unicode char so just insert it into the value
            if (inputV.value){
              // inputV.value=inputV.value+useMacro.codeEscape
              inputV.value = inputV.value.substring(0, insertAt) + useMacro.codeEscape + inputV.value.substring(insertAt);
            }else{
              inputV.value = useMacro.codeEscape
            }
          }else{
                // inputV.value=inputV.value+useMacro.codeEscape
                inputV.value = inputV.value.substring(0, insertAt) + useMacro.codeEscape + inputV.value.substring(insertAt);
          }

          if (insertAt){
          this.$nextTick(()=>{
            inputV.setSelectionRange(insertAt+1,insertAt+1)

            this.$nextTick(()=>{
              inputV.focus()
            })

          })
          }else{

            this.$nextTick(()=>{
              inputV.focus()
            })

          }



        }


        // turn off mode
        this.nextInputIsVoyagerModeDiacritics  =false

        event.target.style.removeProperty('background-color')
        event.preventDefault()
        return false
      }



        if (event.ctrlKey == true){
          if (this.diacriticUse.length>0){
            for (let macro of this.diacriticUseValues){
              if (event.code == macro.code && event.ctrlKey == macro.ctrlKey && event.altKey == macro.altKey && event.shiftKey == macro.shiftKey){
                // console.log("run this macro", macro)
                event.preventDefault()

                this.runMacroExpressMacro(event)
                this.valueChanged(event)
                return false

              }
            }
          }

          if (event.code == 'KeyE'){
            if (!this.preferenceStore.returnValue('--b-diacritics-disable-voyager-mode')){

              event.target.style.backgroundColor="chartreuse"
              this.nextInputIsVoyagerModeDiacritics = true
              event.preventDefault()
              return false
            }

          }

          //

        }
    },

    valueChanged: async function(event,setFocus){
      let v = event.target.value

      if (event.target.tagName === 'SPAN'){
        v = event.target.innerText
        if (event.data && event.data === '|'){
          event.target.innerText = event.target.innerText.slice(0,-1)
          event.preventDefault()
          return false
        }
      }

      let useTextMacros=this.preferenceStore.returnValue('--o-diacritics-text-macros')

      if (useTextMacros && useTextMacros.length>0){
        for (let m of useTextMacros){
          v = v.replace(m.lookFor,m.replaceWith)
        }
      }

      // if the value is empty then wait 2 seconds and check if it is empty again, if it is then continue with the removal
      if (v == ''){
        await new Promise(r => setTimeout(r, 2000));
        if (event && event.target && event.target.value != ''){
          return false
        }
      }


      await this.profileStore.setValueLiteral(this.guid,event.target.dataset.guid,this.propertyPath,v,event.target.dataset.lang)

      if (setFocus){

        let r = 'input_' + this.literalValues[0]['@guid']
        let el = this.$refs[r][0]

        el.focus();
        if (typeof window.getSelection != "undefined"
                && typeof document.createRange != "undefined") {
            var range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        } else if (typeof document.body.createTextRange != "undefined") {
            var textRange = document.body.createTextRange();
            textRange.moveToElementText(el);
            textRange.collapse(false);
            textRange.select();
        }

      }
      this.expandHeightToContent()
    },



    actionButtonCommand: async function(cmd,options){




      if (cmd == 'addField'){
        this.profileStore.setValueLiteral(this.guid,short.generate(),this.propertyPath,"new value",null,true)
      }

      if (cmd == 'trans'){

        let fieldValue = this.literalValues.filter((v)=>{ return (v['@guid'] == options.fieldGuid) })
        let transValue = await utilsNetwork.scriptShifterRequestTrans(options.lang,fieldValue[0].value,null,options.dir)


        let toLang = null
        let fromLang = null
        if (this.scriptShifterLangCodes[options.lang]){
          fromLang = this.scriptShifterLangCodes[options.lang].code
          toLang = this.scriptShifterLangCodes[options.lang].code.split("-")[0] + "-Latn"
          if (options.dir && options.dir.toLowerCase() == 'r2s'){
            toLang = this.scriptShifterLangCodes[options.lang].code
            fromLang = this.scriptShifterLangCodes[options.lang].code.split("-")[0] + "-Latn"
          }

        }

        // add the new string
        this.profileStore.setValueLiteral(this.guid,short.generate(),this.propertyPath,transValue.output,toLang,true)

        // but also make sure the old string has the language tag
        this.profileStore.setValueLiteral(this.guid,fieldValue[0]['@guid'],this.propertyPath,fieldValue[0]['value'],fromLang)




      }

      if (cmd == 'setLiteralLang'){


        this.literalLangInfo={
          propertyPath: this.propertyPath,
          componentGuid: this.guid,
          values: this.profileStore.returnLiteralValueFromProfile(this.guid,this.propertyPath)
        }


        this.literalLangShow=true


      }


      this.$refs['input_' + this.literalValues[0]['@guid']][0].focus()



    },



  },
  computed: {
    // other computed properties
    // ...
    // gives access to this.counterStore and this.userStore
    ...mapStores(useProfileStore),
    ...mapStores(usePreferenceStore),

    ...mapState(useConfigStore, ['scriptShifterLangCodes', 'lccFeatureProperties']),
    ...mapState(usePreferenceStore, ['diacriticUseValues', 'diacriticUse','diacriticPacks']),
    ...mapWritableState(useProfileStore, ['showShelfListingModal','activeField','activeProfile', 'literalLangShow', 'literalLangInfo','dataChangedTimestamp','activeShelfListData']),
    ...mapState(usePreferenceStore, ['showPrefModal','showPrefModalgroup','styleDefault', 'showPrefModalGroup', 'fontFamilies']),

    myGuid(){
      return `${this.structure['@guid']}--${this.guid}`
    },

    literalValues(){
      // profileStore.setActiveField()
      let values = this.profileStore.returnLiteralValueFromProfile(this.guid,this.propertyPath)
      if (values === false){
        values = [{
          value: '',
          '@lang': null,
          '@guid': short.generate()
        }]
      }

      if (values.length == 0){
        this.hasNoData=true
        if (this.readOnly){
          this.showField=false
        }

      }else if(values.length > 0 && values.filter((v) => { return (v.value.length>0) }).length == 0 ){
        this.hasNoData=true
        if (this.readOnly){
          this.showField=false
        }
      }else{
        this.hasNoData=false
      }


      return values

    },

    lccFeatureData(){
      this.lccFeatureDataCounter
      if (this.lccFeatureProperties.indexOf(this.propertyPath[this.propertyPath.length-1].propertyURI)>-1){
        let data = this.profileStore.returnLccInfo(this.guid, this.structure)
        if (data.contributors && data.contributors.length>0){
          data.contributors[0].secondLetterLabel = data.contributors[0].label.substring(1)
        }        
        return data
      }
      return false
    },


    inlineModeShouldDisplay(){


      if (this.profileStore.inlinePropertyHasValue(this.guid, this.structure,this.propertyPath)){
        return true
      } else if (this.profileStore.inlineFieldIsToggledForDisplay(this.guid, this.structure)){
        return true

      }else{
        // no value in it, but maybe its the "main" property, so display it anyway
        if (this.profileStore.inlineIsMainProperty(this.guid, this.structure,this.propertyPath)){
          return true
        }
      }

      return false

    }




  },


  watch: {


    // literalValues(newliteralValues, oldliteralValues) {
    //   console.log(newliteralValues, this.guid, this.structure)
    //   if (this.lccFeatureProperties.indexOf(this.propertyPath[this.propertyPath.length-1].propertyURI)>-1){
    //     this.lccFeatureData = this.profileStore.returnLccInfo(this.guid, this.structure)
    //   }
    // }
    dataChangedTimestamp(newVal, oldVal) {      
      this.lccFeatureDataCounter++
    }



  },

  data: function() {
    return {

      activeGuid: this.guid,

      freeFormCutter: '',

      // used as toggle to show the button when field is focused
      showActionButton: false,

      lccFeatureDataCounter: 0,

      hasNoData: false,
      showField: true,

      cutterCalcLength: 2,
      nextInputIsVoyagerModeDiacritics: false,

      preferences: {},

    }
  },

  mounted: function(){
    this.$nextTick().then(() => {
      this.expandHeightToContent()
    })

    //get the preferences to load into the page
    for (let k in this.styleDefault){
      if (k.includes("shelflist")){
        let o = Object.assign({}, this.styleDefault[k])
        if (o.index in this.preferences){
          //save `k` so the information in the page will match the preferences in real time
          this.preferences[o.index].push(k)
        } else {
          this.preferences[o.index] = [k]
        }
      }
    }
  },
  created: function(){

    this.$nextTick().then(() => {
      this.expandHeightToContent()
    })
  },
};
</script>

<style scoped>

fieldset{
  border: solid 1px rgb(133, 133, 133);
}
.literal-textarea{
  background-color: transparent;
}

.lcc-action-zone{
  background-color: whitesmoke;
  padding: 0.55em;
  border-left: solid 1px rgb(133, 133, 133);
  border-right: solid 1px rgb(133, 133, 133);

}
.lang-display{
  background-color: aliceblue;
  border-radius: 1em;
  padding: 2px;
}

.inline-mode-editable-span-input{
  display: inline;
  outline: none;
  border: none;
  font-size: v-bind("preferenceStore.returnValue('--n-edit-main-literal-font-size')");
  height: v-bind("preferenceStore.returnValue('--n-edit-main-literal-font-size')");


}
.inline-mode-editable-span-input:focus-within {
  background-color: #dfe5f1;
}
.inline-mode-editable-span-input:hover {
  background-color: #dfe5f1;
}
.inline-mode-editable-span{
  display: inline;
  padding: 0.2em;
  font-size: v-bind("preferenceStore.returnValue('--n-edit-main-literal-font-size')");
  outline: none;
  margin-right: 15px;
}
.inline-mode-editable-span-space-maker{
  display: inline-block;
  background-color: red;
  min-width: 250px;
}
.inline-mode-editable-span:focus-within {
  background-color: #dfe5f1;
}


.bfcode-textarea{
  margin-top: 0 !important;
  margin-left: 5px;
}

.bfcode-display-mode-holder{
  display: flex;
  align-items: center;
}
.bfcode-display-mode-holder-label{
  flex-shrink: 1;
  max-width: 100px;
  font-family: monospace;
  padding-right: 10px;
  color:gray;
}
.bfcode-display-mode-holder-value{
  flex-grow: 1;
}


/*translate fade (top to down)*/
.translate-fade-down-enter-active, .translate-fade-down-leave-active {
    transition: all 250ms;
    transition-timing-function: cubic-bezier(.53,2,.36,.85);
}
.translate-fade-down-enter, .translate-fade-down-leave-active {
    opacity: 0;
}
.translate-fade-down-enter, .translate-fade-down-leave-to {
    position: absolute;
}
.translate-fade-down-enter {
    transform: translateY(-10px);
}
.translate-fade-down-leave-active {
    transform: translateY(10px);
}



.lookup-fake-input-label{
  position: absolute;
  font-size: v-bind("preferenceStore.returnValue('--n-edit-main-splitpane-edit-show-field-labels-size')");


  z-index: 1;
  top: -4px;
  left: 2px;
  color: gray;
}



textarea{
  border: none;
  overflow: hidden;
  outline: none;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-box-shadow: none;
  -moz-box-shadow: none;
  box-shadow: none;
  resize: none;
  width: 100%;
  font-size: v-bind("preferenceStore.returnValue('--n-edit-main-literal-font-size')");

  height: 1.25em;
  line-height: 1.25em;
  margin-top: 0.5em;
}

.lookup-fake-input{
  min-height: 2em;
  background-color: transparent;
  
  
}

textarea:focus-within{
  background-color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-edit-focused-field-color')");
}

.literal-holder:focus-within{
  background-color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-edit-focused-field-color')");
}
.literal-holder:focus-within textarea{
  background-color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-edit-focused-field-color')");
}
textarea:hover{
  background-color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-edit-focused-field-color')");
}

.literal-holder:hover{
  background-color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-edit-focused-field-color')");
}
.literal-holder:hover textarea{
  background-color: v-bind("preferenceStore.returnValue('--c-edit-main-splitpane-edit-focused-field-color')");
}

.literal-holder{
  display: flex;
  align-items: center;
}

.literal-field{
  flex-grow:1;
  position: relative;
}
.literal-action{
  flex-shrink:1;
}

.literal-action-inline-mode{
  display: inline-block;
}

#nonSort-selection{
  margin-top: .5em;
  margin-bottom: .25em;
  height: auto !important;
}
</style>
