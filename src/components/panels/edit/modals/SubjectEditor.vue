<template>
  <VueFinalModal
    :hide-overlay="false"
    :overlay-transition="'vfm-fade'"
    :content-transition="'vfm-fade'"
    :click-to-close="true"
    :esc-to-close="true"
    @closed="closeEditor()"
    :background="'non-interactive'"
    :lock-scroll="true"
    class="complex-lookup-modal"
    content-class="complex-lookup-modal-content"
  >
    <div ref="complexLookupModalContainer" class="complex-lookup-modal-container">
      <div :style="`position: relative; ${this.preferenceStore.styleModalBackgroundColor()}; ${this.preferenceStore.styleModalTextColor()}`" class="subject-container-outer">
        <div style="position:absolute; right:2em; top:  0.25em; z-index: 100;">
          <div class="menu-buttons">
            <button @click="closeEditor()">Close</button>
          </div>
        </div>

        <div style="padding: 0.5em;">
          <button @click="editorModeSwitch('build')" data-tooltip="Build LCSH headings using a lookup list" class="subjectEditorModeButtons simptip-position-left" style="margin-right: 1em; background-color: black; height: 2em; display: inline-flex;">
            <span :class="[{ 'subjectEditorModeTextEnabled': (subjectEditorMode==='build') }]">Build Mode</span>
          </button>
          <button @click="editorModeSwitch('link')" data-tooltip="Build LCSH headings by entering a MARC encoded string" class="subjectEditorModeButtons simptip-position-left" style="background-color: black; height: 2em; display: inline-flex;">
            <span :class="[{ 'subjectEditorModeTextEnabled': (subjectEditorMode==='link') }]">Link Mode</span>
          </button>
        </div>

        <template v-if="subjectEditorMode=='build'">
          <div :class="['subject-editor-container', {'subject-editor-container-lowres':lowResMode}]" :style="`${this.preferenceStore.styleModalBackgroundColor()}`">
            <div :style="`${this.preferenceStore.styleModalBackgroundColor()};`" :class="['subject-editor-container-left', {'subject-editor-container-left-lowres':lowResMode}]">
              <div id="search-in-holder" style="position: absolute; top:0">
                <span>Search In:</span>
                <button @click="searchModeSwitch('LCSHNAF')" :data-tooltip="'Shortcut: CTRL+ALT+1'" :class="['simptip-position-bottom',{'active':(searchMode==='LCSHNAF')}]">LCSH/NAF</button>
                <button @click="searchModeSwitch('CHILD')" :data-tooltip="'Shortcut: CTRL+ALT+2'" :class="['simptip-position-bottom',{'active':(searchMode==='CHILD')}]">Children's Subjects</button>
                <button @click="searchModeSwitch('GEO')" :data-tooltip="'Shortcut: CTRL+ALT+3'" :class="['simptip-position-bottom',{'active':(searchMode==='GEO')}]">Indirect Geo</button>
                <button @click="searchModeSwitch('WORKS')" :data-tooltip="'Shortcut: CTRL+ALT+4'" :class="['simptip-position-bottom',{'active':(searchMode==='WORKS')}]">Works</button>
                <button @click="searchModeSwitch('HUBS')" :data-tooltip="'Shortcut: CTRL+ALT+5'" :class="['simptip-position-bottom',{'active':(searchMode==='HUBS')}]">Hubs</button>
              </div>

              <div :style="`flex:1; align-self: flex-end; height: 95%; ${this.preferenceStore.styleModalBackgroundColor()}`" :class="{'scroll-all':  preferenceStore.returnValue('--b-edit-complex-scroll-all') && !preferenceStore.returnValue('--b-edit-complex-scroll-independently')}">
                <div v-if="activeSearch!==false">{{activeSearch}}</div>
                <div v-if="searchResults !== null" style="height: 95%">
                  <!-- Complex subjects -->
                  <div v-if="searchResults && searchResults.subjectsComplex && searchResults.subjectsComplex.length>0" class="subject-section">
                    <span class="subject-results-heading">Complex</span>
                    <div v-for="(subjectC,idx) in searchResults.subjectsComplex" @click="selectContext(idx)" @mouseover="loadContext(idx)" :data-id="idx" :key="subjectC.uri" :class="['fake-option', {'unselected':(pickPostion != idx), 'selected':(pickPostion == idx), 'picked': (pickLookup[idx] && pickLookup[idx].picked)}]">
                      {{subjectC.suggestLabel}}
                    </div>
                  </div>

                  <!-- Simple subjects -->
                  <div v-if="searchResults && searchResults.subjectsSimple && searchResults.subjectsSimple.length>0" class="subject-section">
                    <span class="subject-results-heading">Simple</span>
                    <div v-for="(subject,idx) in searchResults.subjectsSimple" @click="selectContext(searchResults.subjectsComplex.length + idx)" @mouseover="loadContext(searchResults.subjectsComplex.length + idx)" :data-id="searchResults.subjectsComplex.length + idx" :key="subject.uri" :class="['fake-option', {'unselected':(pickPostion != searchResults.subjectsComplex.length + idx ), 'selected':(pickPostion == searchResults.subjectsComplex.length + idx ), 'picked': (pickLookup[searchResults.subjectsComplex.length + idx] && pickLookup[searchResults.subjectsComplex.length + idx].picked), 'literal-option':(subject.literal)}]">
                      {{subject.suggestLabel}}
                      <span v-if="subject.literal">[Literal]</span>
                    </div>
                  </div>

                  <!-- Names -->
                  <div v-if="searchResults && searchResults.names && searchResults.names.length>0" class="subject-section">
                    <span class="subject-results-heading">LCNAF</span>
                    <div v-for="(name,idx) in searchResults.names" @click="selectContext((searchResults.names.length - idx)*-1)" @mouseover="loadContext((searchResults.names.length - idx)*-1)" :data-id="(searchResults.names.length - idx)*-1" :key="name.uri" :class="['fake-option', {'unselected':(pickPostion != (searchResults.names.length - idx)*-1 ), 'selected':(pickPostion == (searchResults.names.length - idx)*-1 ),'picked': (pickLookup[(searchResults.names.length - idx)*-1] && pickLookup[(searchResults.names.length - idx)*-1].picked)}]">
                      {{name.suggestLabel}} [LCNAF]
                    </div>
                  </div>
                </div>
              </div>

              <!-- Results Panel (Right Side) -->
              <div :style="`${this.preferenceStore.styleModalBackgroundColor()}; ${this.preferenceStore.styleModalTextColor()};`" :class="['subject-editor-container-right', {'subject-editor-container-right-lowres':lowResMode}]">
                <div v-if="contextRequestInProgress" style="font-weight: bold;">Retrieving data...</div>
                <div class="modal-context" v-if="Object.keys(contextData).length>0">
                  <h3 v-if="contextData.title">
                    <span class="modal-context-icon" v-if="contextData.rdftypes">
                      <AuthTypeIcon :type="contextData.rdftypes.includes('Hub') ? 'Hub' : contextData.rdftypes[0]"></AuthTypeIcon>
                    </span>
                    {{ Array.isArray(contextData.title) ? contextData.title[0]["@value"] : contextData.title }}
                  </h3>

                  <div class="modal-context-meta" v-if="contextData.rdftypes || contextData.marcKey || (contextData.uri && contextData.literal != true)">
                    <span v-if="contextData.rdftypes">{{ contextData.rdftypes.includes('Hub') ? 'Hub' : contextData.rdftypes[0] }}</span>
                    <span v-if="contextData.marcKey"> • {{ contextData.marcKey }}</span>
                    <span v-if="contextData.uri && contextData.literal != true"> • <a style="color:#2c3e50" :href="contextData.uri" target="_blank">id.loc.gov</a></span>
                  </div>

                  <template v-for="key in panelDetailOrder">
                    <div v-if="contextData[key] && contextData[key].length>0">
                      <div class="modal-context-data-title">{{ this.labelMap[key] }}:</div>
                      <ul>
                        <li class="modal-context-data-li" v-for="(v, idx) in contextData[key]" v-bind:key="'var' + idx">
                          {{v}}
                        </li>
                      </ul>
                    </div>
                  </template>
                </div>
              </div>
            </div>

            <div class="">
              <div class="component-container-fake-input">
                <div style="display: flex;">
                  <div style="flex:1; position: relative;">
                    <form autocomplete="off" style="height: 3em;">
                      <input v-on:keydown.enter.prevent="navInput" placeholder="Enter Subject Headings Here" ref="subjectInput" autocomplete="off" type="text" v-model="subjectString" @input="subjectStringChanged" @keydown="navInput" @keyup="navString" @click="navStringClick" class="input-single-subject subject-input" id="subject-input">
                    </form>
                    <div v-for="(c, idx) in components" :ref="'cBackground' + idx" :class="['color-holder',{'color-holder-okay':(c.uri !== null || c.literal)},{'color-holder-type-okay':(c.type !== null || showTypes===false)}]" v-bind:key="idx">
                      {{c.label}}
                    </div>
                  </div>
                </div>
              </div>

              <div ref="toolbar" style="display: flex;">
                <div style="flex:2">
                  <ol v-if="showTypes" :class="['type-list-ol',{'type-list-ol-lowres':lowResMode}]">
                    <li :class="['type-item', {'type-item-selected':(type.selected)}]" v-for="type in activeTypes" :key="type.value" @click="setTypeClick($event,type.value)" :style="`${this.preferenceStore.styleModalTextColor()}`">{{type.label}}</li>
                  </ol>
                </div>
                <div style="flex:1">
                  <button v-if="okayToAdd==true" style="float: right;margin: 0.6em;" @click="add" :class="[{'add-button-lowres':lowResMode}]">Add [SHIFT+Enter]</button>
                  <button v-else-if="okayToAdd==false && subjectString.length==0" disabled style="float: right;margin: 0.6em; display: none;" :class="[{'add-button-lowres':lowResMode}]">Can't Add</button>
                  <button v-else-if="okayToAdd==false" disabled style="float: right;margin: 0.6em;" :class="[{'add-button-lowres':lowResMode}]">Can't Add</button>
                </div>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <!-- Link mode template content -->
          <div style="padding: 5px;">
            <div class="component-container-fake-input" style="margin-top:2em">
              <div style="display: flex;">
                <div style="flex:1; position: relative;">
                  <form autocomplete="off" style="height: 3em;">
                    <input v-on:keydown.enter.prevent="linkModeTextChange" @input="linkModeOnInput" placeholder="Enter MARC encoded LCSH value" autocomplete="off" type="text" v-model="linkModeString" ref="subjectInput" class="input-single-subject subject-input">
                  </form>
                  <label style="display:block; margin-top:4px; font-size:0.7em; user-select:none;">
                    <input type="checkbox" v-model="linkModeDebug"> Debug parse
                  </label>
                </div>
              </div>
            </div>

            <!-- Examples / Guidance -->
            <div v-if="showLinkExamples" class="link-mode-examples" :style="`${this.preferenceStore.styleModalTextColor()}`">
              <div class="examples-header">
                <strong>Examples (using subfields)</strong>
                <button type="button" class="examples-toggle" @click="showLinkExamples=false">Hide</button>
              </div>
              <ul class="examples-list">
                <li v-for="ex in linkExamples" :key="ex.value">
                  <code :title="'Click to copy'" @click="copyExample(ex.value)">{{ ex.display }}</code>
                  <button type="button" class="copy-btn" @click="copyExample(ex.value)" :aria-label="'Copy '+ex.value">Copy</button>
                  <span class="example-desc">{{ ex.desc }}</span>
                </li>
              </ul>
              <div class="examples-notes">
                IMPORTANT: The two spaces after the tag must be real spaces (ASCII 0x20). Do not use middle dots, non‑breaking spaces, or tabs. A warning icon means at least one component was not matched and will be treated as a literal.
              </div>
            </div>
            <div v-else class="link-mode-examples-collapsed">
              <button type="button" class="examples-toggle" @click="showLinkExamples=true">Show MARC syntax examples</button>
            </div>

            <ul v-if="!linkModeSearching">
              <li v-if="linkModeResults===false">Type a MARC-encoded subject string (with $ signs between subdivisions). Results will appear automatically; press Enter to link.</li>
            </ul>

            <!-- Live preview of parsed/linked components for Link Mode -->
            <div v-if="linkModeResults && linkModeResults.resultType" style="margin: 0.75em 0 0.25em 0;">
              <div v-if="linkModeResults.resultType==='COMPLEX'">
                <span v-if="linkModeResults.hit" class="marc-deliminated-lcsh-mode-entity">
                  <span class="material-icons marc-deliminated-lcsh-mode-icon">check_circle</span>
                  <a :href="linkModeResults.hit.uri" target="_blank">{{ linkModeResults.hit.label }}</a>
                </span>
              </div>
              <div v-else-if="linkModeResults.hit && Array.isArray(linkModeResults.hit)">
                <template v-for="(heading, i) in linkModeResults.hit" :key="'lmh-'+i">
                  <span v-if="heading.literal===false" class="marc-deliminated-lcsh-mode-entity">
                    <span class="material-icons marc-deliminated-lcsh-mode-icon">check_circle</span>
                    <a :href="heading.uri" target="_blank">{{ heading.label }}</a>
                  </span>
                  <span v-else class="marc-deliminated-lcsh-mode-entity">
                    <span class="material-icons marc-deliminated-lcsh-mode-icon-warning">warning</span>
                    {{ heading.label }}
                  </span>
                </template>
              </div>
            </div>

            <div style="display: flex;">
              <div style="flex:2">
                <h1 v-if="linkModeSearching"><span id="loading-icon">⟳</span> Working...</h1>
                <button v-if="linkModeSearching===false" style="margin-right: 1em; margin-left: 2em" @click="linkModeTextChange({key:'Enter',shiftKey:false})">Link Components [Enter]</button>
                <button v-if="linkModeResults && linkModeResults.resultType && linkModeResults.resultType!=='ERROR' && linkModeResults.hit" style="" @click="addLinkMode">Add Heading [SHIFT+Enter]</button>
              </div>
              <div style="flex:1">
                <button style="float:right; margin-right:1em" @click="closeEditor">Close</button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </VueFinalModal>
</template>

<style type="text/css" scoped>
  /* Ensure spacing between link mode entities and prevent icon text crowding when icon font not loaded */
  .marc-deliminated-lcsh-mode-entity { margin-right: 0.6em; }
  .marc-deliminated-lcsh-mode-entity .material-icons { vertical-align: middle; margin-right: 2px; }
  /* Fallback styling: if material icon font fails, ensure readable separation */
  .marc-deliminated-lcsh-mode-icon::after, .marc-deliminated-lcsh-mode-icon-warning::after { content: '\00a0'; }
  .subject-lookup-modal-container{
    margin-left: auto;
    margin-right: auto;
    background-color: white;
    width: 85vw;
    height: 95vh;
  }

  body #app{
    background-color: white !important;
  }

  .subject-editor-container{
    width: 99%;
    margin-left: auto;
    margin-right: auto;
    /* height: 470px; */
    height: 90%;
  }

  .subject-editor-container-lowres{
    height: 350px;
    max-height: 350px;
  }

  .add-button-lowres{
    margin-top: 0 !important;
  }

  .subject-editor-container-left{
    display: flex;
    height: 95%;
    position: relative;
    overflow-y: hidden;
  }

  .subject-editor-container-left .modal-context-data-li{
    font-size: 1em;
  }

  .subject-editor-container-left-lowres{
    font-size: 0.75em !important;
    height: 352px;
    max-height: 352px;

  }

  .subject-editor-container-right{
    flex:1;
    align-self: flex-start;
    padding: 2em;
    /* height: 503px; */
    height: 100%;
    overflow-y: scroll;
    background: whitesmoke;
  }

  .subject-editor-container-right-lowres{
    height: 304px;
    max-height: 304px;
  }


  .type-list-ol{
    padding-left: 0
  }

  .type-list-ol-lowres{
    margin: 0;
  }




  .color-holder{
    font-size: 1.5em;
    position: absolute;
    padding-top: 0.3em;

    pointer-events: none;
    border-style: solid;
    border-width: 3px;
    border-color: rgb(255 132 132 / 52%);
    border-radius: 0.25em;
    color: transparent;

    background-color: rgb(255 132 132 / 25%);
    /*letter-spacing: -0.04em;*/

    height: 1.5em;
    font-family: sans-serif;

    left: 0;
    top: 0;



  }

  .subject-input{
    font-family: sans-serif;
  }


  .input-single{
    width: 95%;
    border:none;
    height: 100%;
    font-size: 1.5em;


    background: none;
    transition-property: color;
    transition-duration: 500ms;
  }
  .input-single:focus {outline:none !important}


  .fake-option{
    font-size: 1.25em;
    cursor: pointer;
  }

  .fake-option:hover{
    background-color: whitesmoke;
  }

  .literal-option{
    font-style: italic;
  }

  .unselected::before {
    content: "• ";
    color: #999999;
  }

  .selected{
    background-color: whitesmoke;
  }
  .selected::before {
    content: "> ";
    color: #999999;
  }
  .picked{
    font-weight: bold;
  }

  .picked::before{
    content: "✓ " !important;
    transition-property: all;
    transition-duration: 500ms;
    font-weight: bold;
    color: green;
    font-size: larger;
  }



  .modal-context-data-title{
    font-size: 1.2em;
    font-weight: bold;
  }

  .modal-context-meta{
    margin: 4px 0 12px 0;
    color: #2c3e50;
  }

  .modal-context ul{
    margin-top: 0;
    margin-bottom: 0;
  }
  .modal-context-data-li{
    font-size: 0.85em;
  }

  .modal-context  h3{
    margin: 0;
    padding: 0;
  }

  .modal-context-icon{
    font-family: "fontello", Avenir, Helvetica, Arial, sans-serif;
    font-size: 1.25em;
    padding-right: 0.25em;

  }

  .color-holder-okay{
    background-color: #0080001f;
  }

  .color-holder-type-okay{
    border-color: #00800047;
  }

  .type-item{
    display: inline-block;
    border: solid 1px #9aa4a4;
    border-radius: 0.5em;
    padding: 0.1em;
    margin-left: 1em;
    cursor: pointer;
    background-color: transparent;
  }

  .type-item::before{
    content: " ";
  }


  .type-item-selected{
    background-color: #0080001f;
    border: solid 3px;
  }

.input-single-subject{
  width: 99%;
  border:none;
  font-size: 1.5em;
  min-height: 1.5em;
  max-height: 1.5em;
  background:none;

  background-color: #fff;
  border: 1px solid #9aa4a4;
  border-top-right-radius: 0.5em;
  border-bottom-right-radius: 0.5em;



}

.input-single-subject:focus {outline:0;}



#search-in-holder button{
  font-size: 0.85em;
  background-color: white;
  color: black;
  border: solid 1px #c1c1c1;
}

#search-in-holder .active{
background-color: whitesmoke;
-webkit-box-shadow: inset 0px 0px 5px #c1c1c1;
-moz-box-shadow: inset 0px 0px 5px #c1c1c1;
box-shadow: inset 0px 0px 5px #c1c1c1;

}

.subjectEditorModeButtons{
  display: inline-flex;
  font-size: 0.9em;
  color: white;
  font-size: 1.1em;
  line-height: 1.5em;
}

.subjectEditorModeTextEnabled{
  text-decoration: underline;

}


.link-mode-good-heading, .link-mode-bad-heading{
font-size: 1.15em;
font-weight: bold;
}
.link-mode-good-heading-alink{
color: inherit;
}
.link-mode-subdivision{
padding-left: 0.25em;
padding-right: 0.25em;
}
.link-mode-good-heading::before {
  content: "✓ " !important;
  transition-property: all;
  transition-duration: 500ms;
  font-weight: bold;
  color: green;
  font-size: larger;
}
.link-mode-bad-heading::before {
  content: "x " !important;
  transition-property: all;
  transition-duration: 500ms;
  font-weight: bold;
  color: darkred;
  font-size: x-large;
}

/* Link Mode Examples */
.link-mode-examples {
  margin: 0.75em 0 0.5em 0;
  padding: 0.75em 1em;
  border: 1px solid #c7c7c7;
  background: #fafafa;
  border-radius: 6px;
  font-size: 0.85em;
}
.link-mode-examples code {
  background: #eee;
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
  white-space: pre;
}
.link-mode-examples .examples-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.examples-toggle {
  font-size: 0.75em;
  background: #e5e5e5;
  border: 1px solid #bbb;
  padding: 2px 6px;
  cursor: pointer;
  border-radius: 4px;
}
.examples-toggle:hover { background: #dcdcdc; }
.examples-list {
  margin: 0.25em 0 0.5em 1.1em;
  padding: 0;
}
.examples-list li { margin-bottom: 2px; }
.examples-notes { line-height: 1.3em; }
.link-mode-examples-collapsed { margin: 0.5em 0; }
.copy-btn {
  margin-left: 6px;
  font-size: 0.65em;
  padding: 2px 6px;
  background: #eef;
  border: 1px solid #aac;
  border-radius: 4px;
  cursor: pointer;
}
.copy-btn:hover { background: #dde; }
.example-desc { margin-left: 6px; color: #555; }

.clear-selected-button {
margin-top: 10px;
}

.menu-buttons{
	margin-right: 5px;
	padding-top: 5px;
	padding-left: 15px;
	float: right;
}

.subject-section{
  border-top: solid black;
  border-bottom: solid-black;
}

.scrollable-subjects {
  overflow-y: scroll;
}

.small-container{
  height: 33%;
}
.medium-container{
  height: 50%;
}
.large-container{
  height: 90%;
}

/* document.documentElement.clientHeight */
.scroll-all {
  overflow-y: scroll;
}

.subject-container-outer{
  /* height: v-bind('returnBrowserHeight()'); */
  height: 100%;
}

.subject-variant {
  color: #ffc107;
  font-weight: bold;
}

/*
.left-menu-list-item-has-data::before {
  content: "✓ " !important;
  color: #999999;
}

li::before {
  content: "• ";
  color: #999999;
}*/

</style>

<style>
  div.may-sub-container span span.material-icons-outlined {
    font-size: .8em;
    position: relative;
    top: -3px;
  }
</style>

<script>

import { usePreferenceStore } from '@/stores/preference'
import { useConfigStore } from '@/stores/config'
import { mapStores, mapState } from 'pinia'
import { VueFinalModal } from 'vue-final-modal'

import AuthTypeIcon from "@/components/panels/edit/fields/helpers/AuthTypeIcon.vue";

import utilsNetwork from '@/lib/utils_network';



const debounce = (callback, wait) => {
  let timeoutId = null;
  return function(...args){
    const context = this;
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      try {
        callback.apply(context, args);
      } catch (e) {
        console.error('Debounced function error:', e);
      }
    }, wait);
  };
}





export default {
name: "SubjectEditor",
components: {
  VueFinalModal,
  AuthTypeIcon,

},
props: {
  structure: Object,
  searchValue: String,
  authorityLookup: String,
  isLiteral: Boolean,
  profileData: Object,
  searchType: String,
  fromPaste: Boolean,
},

watch: {
  // // watch when the undoindex changes, means they are undoing redoing, so refresh the
  // // value in the acutal input box
  searchValue: function(){
    this.subjectString = this.searchValue
    this.linkModeString = this.searchValue
  },

},

data: function() {
  return {
    searching: false,

    // subjectEditorMode: 'subjectEditorMode',
    subjectEditorMode: 'build',

    contextData: {nodeMap:{}},
    authorityLookupLocal: null,

    subjectString: '',
    components: [],
    lookup: {},
    searchResults: null,
    activeSearch: false,

    pickPostion: 0,
  pickLookup: Object.create(null),
    pickCurrent: null,
    activeComponent: null,
    oldActiveComponent: null,
    activeComponentIndex:0,
    oldActiveComponentIndex: 99,
    contextRequestInProgress: false,
    componetLookup: {},
    localContextCache: {},
    nextInputIsTypeSelection:false,
  // prevent pickLookup rebuilds while fetching context on hover
  skipPickBuild: false,
    typeLookup:{},
    okayToAdd: false,
    lowResMode: false,

    searchMode: "LCSHNAF",

    linkModeString: "",
    linkModeResults: false,
    linkModeSearching: false,
  linkModeRequestSeq: 0,
  showLinkExamples: true,
    linkExamples: [
  // Updated: parser now supports $d (dates) merged with preceding $a for PersonalNames
  { display: '$aKnitting', value: '$aKnitting', desc: 'Topical heading ($a)' },
  { display: '$aKnitting$vPatterns', value: '$aKnitting$vPatterns', desc: 'Topical + genre/form ($v) subdivision' },
  { display: '$aCookbooks', value: '$aCookbooks', desc: 'Genre/Form (simple single component)' },
  { display: '$aWoolf, Virginia,$d1882-1941', value: '$aWoolf, Virginia,$d1882-1941', desc: 'Personal name with dates ($a + $d merged)' }
    ],
  linkModeDebug: false,

    showTypes: false,

    initialLoad: true, // when this load the first time

    nextInputIsVoyagerModeDiacritics: false,

    activeTypes: {
      'madsrdf:Topic': {label:'Topic / Heading ($a $x)', value:'madsrdf:Topic',selected:false},
      'madsrdf:GenreForm': {label:'Genre ($v)', value:'madsrdf:GenreForm',selected:false},
      'madsrdf:Geographic': {label:'Geographic ($z)', value:'madsrdf:Geographic',selected:false},
      'madsrdf:Temporal': {label:'Chronological ($y)', value:'madsrdf:Temporal',selected:false},
      'madsrdf:PersonalName': {label:'Personal Name ($a $d)', value:'madsrdf:PersonalName',selected:false},
      'madsrdf:CorporateName': {label:'Corporate Name ($a)', value:'madsrdf:CorporateName',selected:false},
    },

    labelMap: {
      "notes": "Notes",
      "nonlatinLabels": "Non-Latin Authoritative Labels",
      "variantLabels": "Variants",
      "birthdates": "Date of Birth",
      "birthplaces": "Place of Birth",
      "locales": "Associated Locales",
      "activityfields": "Fields of Activity",
      "occupations": "Occupations",
      "languages": "Associated Languages",
      "lcclasss": "LC Classification",
      "broaders": "Has Broader Authority",
      "gacs": "GAC(s)",
      "collections": "MADS Collections",
      "sources": "Sources",
      "subjects": "Subjects",
      "marcKey": "MARC Key",
    },
    panelDetailOrder: [
      "notes","nonlatinLabels","variantLabels","birthdates",
      "birthplaces","locales","activityfields","occupations",
      "languages","lcclasss","broaders","gacs","collections",
      "sources", "subjects"
    ],



  }
},

computed: {

  ...mapStores(usePreferenceStore),
  ...mapState(usePreferenceStore, ['diacriticUseValues', 'diacriticUse','diacriticPacks']),



},
methods: {
  // Normalize marcKey values from various shapes into a clean string or null
  normalizeMarcKey(val){
    try{
      if (!val) return null
      if (typeof val === 'string') return val.trim() || null
      if (Array.isArray(val)){
        const pref = val.find(v => v && typeof v === 'object' && v['@value'] && (v['@language'] === undefined || v['@language'] === null || v['@language'] === ''))
        if (pref && pref['@value']) return String(pref['@value'])
        const first = val.find(v => typeof v === 'string' || (v && typeof v === 'object' && v['@value']))
        if (!first) return null
        return typeof first === 'string' ? (first.trim() || null) : (first['@value'] ? String(first['@value']) : null)
      }
      if (typeof val === 'object' && val['@value']) return String(val['@value'])
      return null
    } catch { return null }
  },
  copyExample(str){
    try {
      navigator.clipboard.writeText(str)
      console.log('Copied example:', str)
    } catch(err){
      // Fallback: create a temp textarea
      const ta = document.createElement('textarea')
      ta.value = str
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
  },
  // Debounced auto-search for Link Mode as the user types
  linkModeOnInput: debounce(async function() {
    const q = (this.linkModeString || '').trim()
    // Basic guard to avoid hammering the API on empty/short inputs
  if (!q || q.length < 2) {
      this.linkModeResults = false
      this.linkModeSearching = false
      return
    }
    // Only run auto-preview for MARC-encoded strings (must include a subfield marker)
    if (!/[\$‡|]/.test(q)) {
      this.linkModeResults = false
      this.linkModeSearching = false
      return
    }
    const reqId = ++this.linkModeRequestSeq
    this.linkModeSearching = true
    try {
      const res = await utilsNetwork.subjectLinkModeResolveLCSH(q)
      // Discard stale responses
      if (reqId !== this.linkModeRequestSeq || q !== (this.linkModeString || '').trim()) return
      this.linkModeResults = res
      if (this.linkModeDebug) {
        this.debugLogLinkMode('AUTO', q, res)
      }
    } catch (e) {
      console.error('linkMode auto-search failed', e)
      this.linkModeResults = false
    } finally {
      // Only clear the searching flag if this is the latest request
      if (reqId === this.linkModeRequestSeq) this.linkModeSearching = false
    }
  }, 400),
  hasOverFlow: function(element){
    let overflow = element.scrollHeight > element.clientHeight
    return overflow
  },
  // Convenience to extract a normalized marcKey from a pickLookup item or context entry
  safeGetMarcKeyFrom(item){
    if (!item) return null
    // prefer top-level marcKey, else extra.marcKey, else nodeMap.marcKey
    const candidates = [item.marcKey, item.extra && item.extra.marcKey, item.nodeMap && item.nodeMap.marcKey]
    for (const c of candidates){
      const mk = this.normalizeMarcKey(c)
      if (mk) return mk
    }
    return null
  },
  // Return the number of search results that are populated.
  // Used to determine how tall to make each set of search results
  numPopulatedResults: function(){
    let count = 0
    for (let key of Object.keys(this.searchResults)){
      if (this.searchResults[key].length>=1){
        count++
      }
    }
    return count
  },

  //parse complex headings so we can have complete and broken up headings
  parseComplexSubject: async function(uri){
    let data = await utilsNetwork.fetchSimpleLookup(uri + ".json", true)
    let components = false
    let subfields = false
    let marcKey = false
    for (let el of data){
      if (el["@id"] == uri){
        marcKey = el["http://id.loc.gov/ontologies/bflc/marcKey"][0]["@value"]
        // we're not looking at a GEO heading, so the components will be URIs
        // GEO won't have URIs, so they can be ignored
        if(!el["@type"].includes("http://www.loc.gov/mads/rdf/v1#HierarchicalGeographic")){
          components = el["http://www.loc.gov/mads/rdf/v1#componentList"]
		  break
        }
      }
    }

    //get the subfields from the marcKey
    if (marcKey){
      subfields = marcKey.slice(5)
      // subfields = subfields.match(/\$./g)
	  subfields = subfields.match(/\$[axyzv]{1}/g)
    }

    return {"components": components, "subfields": subfields, "marcKey": marcKey}
  },

  /**
   * When loading from an existing subject, the component lookup
   * needs to be build, so the components will have URIs, types,
   * and be flaged as literals or not
   *
   * @param {obj} incomingSubjects - the existing subject data
   */
  buildLookupComponents: function(incomingSubjects){
    this.typeLookup = {}

    if (!incomingSubjects || typeof incomingSubjects == "undefined"){
        return
    }

    let lookUp

    // The subject is made of multiple parts
    if (Array.isArray(incomingSubjects)){
        for (let subjIdx in incomingSubjects){
          this.componetLookup[subjIdx] = {}
          let type = incomingSubjects[subjIdx]["@type"]

          if (type.includes("http://www.loc.gov/mads/rdf/v1#Topic") || type.includes("http://id.loc.gov/ontologies/bibframe/Topic")){
            this.typeLookup[subjIdx] = 'madsrdf:Topic'
          }
          if (type.includes("http://www.loc.gov/mads/rdf/v1#GenreForm")){
            this.typeLookup[subjIdx] = 'madsrdf:GenreForm'
          }
          if ( type.includes("http://www.loc.gov/mads/rdf/v1#Geographic") || type.includes("http://www.loc.gov/mads/rdf/v1#HierarchicalGeographic")){
            this.typeLookup[subjIdx] = 'madsrdf:Geographic'
          }
          if (type.includes("http://www.loc.gov/mads/rdf/v1#Temporal")){
            this.typeLookup[subjIdx] = 'madsrdf:Temporal'
          }
          if (type.includes("Hub") || type.includes("Work")){
            this.typeLookup[subjIdx] = type
          }


          if (Object.keys(incomingSubjects[subjIdx]).includes("http://www.loc.gov/mads/rdf/v1#authoritativeLabel")){
            lookUp = "http://www.loc.gov/mads/rdf/v1#authoritativeLabel"
          } else {
            lookUp = "http://www.w3.org/2000/01/rdf-schema#label"
          }
          try {
            let label = incomingSubjects[subjIdx][lookUp][0][lookUp].replaceAll("--", "‑‑")

            //Set up componentLookup, so the component builder can give them URIs
            this.componetLookup[subjIdx][label] = {
              label: incomingSubjects[subjIdx][lookUp][0][lookUp],
              literal: incomingSubjects[subjIdx]["@id"] ? false : true,
              uri: incomingSubjects[subjIdx]["@id"] ? incomingSubjects[subjIdx]["@id"] : null,
              type: this.typeLookup[subjIdx],
              marcKey: incomingSubjects[subjIdx]["http://id.loc.gov/ontologies/bflc/marcKey"] ? incomingSubjects[subjIdx]["http://id.loc.gov/ontologies/bflc/marcKey"][0]["http://id.loc.gov/ontologies/bflc/marcKey"] : ""
            }

          } catch(err){
            console.error(err)
          }
        }
    } else {
        // dealing with a complex subject
        this.componetLookup[0] = {}
        let type = incomingSubjects["@type"] ? incomingSubjects["@type"] : ""

        if (type.includes("http://www.loc.gov/mads/rdf/v1#Topic") || type.includes("http://id.loc.gov/ontologies/bibframe/Topic") ){
            this.typeLookup[0] = 'madsrdf:Topic'
        }
        if (type.includes("http://www.loc.gov/mads/rdf/v1#GenreForm")){
            this.typeLookup[0] = 'madsrdf:GenreForm'
        }
        if (type.includes("http://www.loc.gov/mads/rdf/v1#Geographic" || type.includes("http://www.loc.gov/mads/rdf/v1#HierarchicalGeographic"))){
          this.typeLookup[0] = 'madsrdf:Geographic'
        }
        if (type.includes("http://www.loc.gov/mads/rdf/v1#Temporal")){
            this.typeLookup[0] = 'madsrdf:Temporal'
        }
        if (type.includes("Hub") || type.includes("Work")){
          this.typeLookup[0] = type
        }

        if (Object.keys(incomingSubjects).includes("http://www.loc.gov/mads/rdf/v1#authoritativeLabel")){
            lookUp = "http://www.loc.gov/mads/rdf/v1#authoritativeLabel"
        } else {
            lookUp = "http://www.w3.org/2000/01/rdf-schema#label"
        }
        try {
            let label = incomingSubjects[lookUp][0][lookUp].replaceAll("--", "‑‑")
            //Set up componentLookup, so the component builder can give them URIs
            this.componetLookup[0][label] = {
                label: incomingSubjects[lookUp][0][lookUp],
                literal: incomingSubjects["@id"] ? false : true,
                uri: incomingSubjects["@id"] ? incomingSubjects["@id"] : null,
                type: this.typeLookup[0],
                marcKey: incomingSubjects["http://id.loc.gov/ontologies/bflc/marcKey"] ? incomingSubjects["http://id.loc.gov/ontologies/bflc/marcKey"][0]["http://id.loc.gov/ontologies/bflc/marcKey"] : ""
            }
        } catch(err){
            console.error(err)
        }
    }

  },

  /**
   * Creates components from the search string
   *
   * If the subject is loaded from an existing record, there will be a search string
   * but there won't be components.
   */
  buildComponents: function(searchString){
    // searchString = searchString.replace("—", "--") // when copying a heading from class web

    // Guard: if empty or whitespace, clear and exit
    if (!searchString || searchString.trim() === '') {
      this.components = []
      this.subjectString = ''
      return
    }

    let subjectStringSplit = searchString.split('--')
    // Remove any empty segments that can occur during editing
    subjectStringSplit = subjectStringSplit.filter(s => s !== '')

    let targetIndex = []
    let componentLookUpCount = Object.keys(this.componetLookup).length

    if (componentLookUpCount > 0){ //We might be dealing with something that needs to stitch some terms together
      if (componentLookUpCount < subjectStringSplit.length){
        let target = false
        let targetType = null
        let splitTarget = false
        for (let i in this.componetLookup){
          for (let j in this.componetLookup[i]) {
            targetType = this.componetLookup[i][j].type

            if (this.componetLookup[i][j].label.includes("--")){
              target = this.componetLookup[i][j].label.replaceAll("--", "‑‑")
              targetIndex = i  // needs this to ensure the target will go into the search string in the right place
              splitTarget = target.split('‑‑')
            }

            let matchIndx = []
            if (target){  // && targetType == 'madsrdf:Geographic'
                for (let i in subjectStringSplit){
                  if (target == subjectStringSplit[i]){ matchIndx.push(i); break } // if there is an exact match, keep it and move on
                  if (target.includes(subjectStringSplit[i])){  //&& subjectStringSplit[i].length > 3
                    matchIndx.push(i)
                  }
              }

              //remove them
              for (let i = matchIndx.length-1; i >=0; i--){
                subjectStringSplit.splice(matchIndx[i], 1)
              }
              // add the combined terms
              // subjectStringSplit.push(target)
              subjectStringSplit.splice(targetIndex, 0, target)
            }
          }
        }
      }
    }

    // clear the current
    this.components = []
    let id = 0

    let activePosStart = 0

    /**
     * When a string in the middle of a heading changes, the typeLookup will get thrown off.
     * Need a way to track this.
     */
    let diff = []
    // if (subjectStringSplit.length < Object.keys(this.componetLookup).length){
    //   diff = Object.keys(this.componetLookup).filter(x => !subjectStringSplit.includes( Object.keys(this.componetLookup[x])[0]))
    // }

    let offset = 0
    for (let ss of subjectStringSplit){
      if (subjectStringSplit.length < Object.keys(this.componetLookup).length){
        diff = Object.keys(this.componetLookup).filter(x => !subjectStringSplit.includes( Object.keys(this.componetLookup[x])[0]))
      }

      if(diff.length > 0){
        if ( diff.includes(id.toString()) && id.toString() == diff.at(-1)){
          offset = Object.keys(this.componetLookup).length - subjectStringSplit.length
        }
      }

      // check the lookup to see if we have the data for this label
      let uri = null
      let type = null
      let literal = null
	    let marcKey = null
      let nonLatinLabel = null
      let nonLatinMarcKey = null

      if (this.componetLookup[id+offset] && this.componetLookup[id+offset][ss]){
        literal = this.componetLookup[id+offset][ss].literal
        uri = this.componetLookup[id+offset][ss].uri
        marcKey = this.componetLookup[id+offset][ss].marcKey
        nonLatinLabel = this.componetLookup[id+offset][ss].nonLatinTitle
        nonLatinMarcKey = this.componetLookup[id+offset][ss].nonLatinMarcKey
      }

      if (this.typeLookup[id+offset]){
        type = this.typeLookup[id+offset]
      }

      this.components.push({
        label: ss,
        uri: uri,
        id: id,
        // Guard missing componetLookup entries before accessing .extra
        type: (this.componetLookup && this.componetLookup[id+offset] && this.componetLookup[id+offset][ss] && this.componetLookup[id+offset][ss].extra)
          ? this.componetLookup[id+offset][ss].extra.type
          : type,
        complex: ss.includes('‑‑'),
        literal:literal,
        posStart: activePosStart,
        posEnd: activePosStart + ss.length,
		    marcKey: marcKey,
        nonLatinLabel:nonLatinLabel,
        nonLatinMarcKey:nonLatinMarcKey,
      })

      // increase the start length by the length of the string and also add 2 for the "--"
      activePosStart = activePosStart + ss.length + 2

      id++
    }

    //make sure the searchString matches the components
    this.subjectString = this.components.map((component) => component.label).join("--")
  },

  /**
  * Kicks off search when the link mode string is changed
  * @return {void}
  */
  linkModeTextChange: async function(event){

    try{
      this.$refs.subjectInput.focus()
    } catch(err) {
      console.log("Loading from existing data")
    }

    if (event.key==='Enter' && event.shiftKey===false){
      this.linkModeResults=false
      this.linkModeSearching=true
      const q = (this.linkModeString || '').trim()
      // Only attempt link resolution if the string appears MARC-encoded
      if (!q || !/[\$‡|]/.test(q)){
        this.linkModeSearching=false
        console.warn('Link Mode expects a MARC-encoded string with subfield markers like $a')
        return false
      }
      const res = await utilsNetwork.subjectLinkModeResolveLCSH(q)
      this.linkModeResults = res
      if (this.linkModeDebug) {
        this.debugLogLinkMode('ENTER', q, res)
      }
      this.linkModeSearching=false

    }else if (event.key==='Enter' && event.shiftKey===true){
      this.addLinkMode()
    }

    if (event.preventDefault) {event.preventDefault()}
    return false
  },
  debugLogLinkMode(origin, raw, result){
    try {
      const tag = raw.slice(0,3)
      const tagOk = /^\d{3}$/.test(tag)
      const spaceBlock = raw.slice(3,5)
      const spacesOk = spaceBlock === '  '
      // extract subfields after initial pattern
      const body = raw.slice(5)
      const subfields = body.match(/\$[a-z0-9](?=[^$]*)/gi) || []
      const uniqueCodes = [...new Set(subfields.map(s=>s[1]))]
      const hasA = subfields.some(s=>s.startsWith('$a'))
      const problems = []
      if (!tagOk) problems.push('TAG')
      if (!spacesOk) problems.push('SPACES')
      if (!hasA) problems.push('NO_$a')
      if (result === false) problems.push('NO_RESULT')
      if (result && result.resultType==='ERROR') problems.push('RES_ERROR')
      if (result && result.resultType==='SIMPLE' && Array.isArray(result.hit)) {
        // check literals presence
        if (result.hit.some(h=>h.literal)) problems.push('LITERAL_PART')
      }
      if (result && result.resultType==='COMPLEX' && result.hit && result.hit.literal) {
        problems.push('COMPLEX_LITERAL')
      }
      console.groupCollapsed(`LinkModeDebug ${origin} => tag:${tag} subfields:${subfields.length} issues:${problems.join(',')||'NONE'}`)
      console.log('Raw Input:', raw)
      console.log('Tag OK:', tagOk, 'Spaces OK:', spacesOk, 'First $a present:', hasA)
      console.log('Subfields parsed:', subfields)
      console.log('Unique codes:', uniqueCodes)
      console.log('Result object:', result)
      console.log('Problem flags:', problems)
      console.groupEnd()
    } catch(err){
      console.warn('debugLogLinkMode failed', err)
    }
  },

  focusInput: function(){
    this.$nextTick(() => {

      let timeoutFocus = window.setTimeout(()=>{
        if (this.$refs.subjectInput){
          this.$refs.subjectInput.focus()
          window.clearTimeout(timeoutFocus)
        }
      },10)
    })
  },

  /**
  * Change state to display different interface
  * @param {string} mode - which mode to use "build" "link"
  * @return {array} - An array of the pts, but only occuring once
  */
  editorModeSwitch: function(mode){
    this.subjectEditorMode = mode
    // this.$store.dispatch("subjectEditorMode", { self: this, mode: mode})

    if (mode == 'build'){
      this.subjectString = this.linkModeString
      this.subjectStringChanged()
    }else{
      this.linkModeString = this.subjectString
  // Clear any stale link-mode results so nothing autopopulates
  this.linkModeResults = false
  this.linkModeSearching = false
  this.linkModeRequestSeq++
    }

    this.$nextTick(() => {
      this.$refs.subjectInput.focus()
    })

  },

  adjustStartEndPos: function(obj){
    //need to make sure postStart and posEnd are correct, and the id
    for (let x in obj){
        let prev = null
        let current = obj[x]

        if (x > 0){
          prev = obj[x] - 1
        } else if (x == 0) {
          current.posStart = 0
        } else {
          current.posStart = prev.posEnd + 2
        }
        current.posEnd = current.posStart + current.label.length

        current.id = x
      }

      return obj
  },

  searchModeSwitch: function(mode){
    this.searchMode = mode

    /**
     * If it's in GEO mode look at all the components and build the
     * subject string based on the ones with out URIs.
     * How does this affect literals
     *
     * (c.uri !== null || c.literal)
     */

    if (mode == "GEO"){
      /**
       * When dealing with a switch to GEO, we need to combine the "loose" components
       * into 1 so the search will work.
       */
      //get the loose components
      let looseComponents = []
      let indx = []
      let componentMap = []
      for (let c in this.components){
        if (this.components[c].uri == null && this.components[c].literal != true){
          looseComponents.push(this.components[c])
          indx.push(c)
          componentMap.push("-")
        } else {
          componentMap.push(c)
        }
      }

      //only stitch the loose components togethere if there are 2 next to each other
      if (indx.length == 2 && indx[1]-1 == indx[0]){
        /** !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
         *  !! the `not` hyphens are very important !!
         *  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
         */
        // Update the id of the active component to indx[0] so we're working with the first component of the looseComponents
        this.activeComponentIndex = Number(indx[0])

        //this.activeComponent = looseComponents.map((comp) => {return comp.id == this.activeComponentIndex})
        this.activeComponent = looseComponents.filter((comp) => comp.id == this.activeComponentIndex)[0]
        //this.activeComponent = looseComponents[this.activeComponentIndex]

        this.activeComponent.id = this.activeComponentIndex

        //update the active component with the loose components
        for (let c in looseComponents){
          if (c != 0){
            let part1 = ""
            if (c == 1){
              part1 = looseComponents[0].label
            } else {
              part1 = this.activeComponent.label
            }
            const part2 = looseComponents[c].label
            this.activeComponent.label = part1 + "‑‑" + part2
            this.activeComponent.posEnd = looseComponents[c].posEnd
          }
        }
        this.activeComponent.posStart = looseComponents[0].posStart

        // we need to make sure the order is maintained
        // use the component map to determine maintain order
        let final = []
        for (let el in componentMap){
          let good = componentMap[el] != '-'
          if (good){
            final.push(this.components[el].label)
          } else {
            final.push(this.activeComponent.label)
          }
        }

        final = new Set(final)
        final = Array.from(final)

        this.subjectString =  final.join("--")

        //Splice the components from the first looseComponet to the end and add the new activeComponent to the end
        this.components.splice(indx[0], indx.length, this.activeComponent)

        // need to make sure postStart and posEnd are correct, and the id
        this.adjustStartEndPos(this.components)
        for (let x in this.components){
          let prev = null
          let current = this.components[x]

          if (x > 0){
            prev = this.components[x] - 1
          } else if (x == 0) {
            current.posStart = 0
          } else {
            current.posStart = prev.posEnd + 2
          }
          current.posEnd = current.posStart + current.label.length

          current.id = x
        }

        // get the boxes lined up correctly
        try{
          this.renderHintBoxes()
        } catch(err) {}

        // hacky, but without this `this.componentLooks` won't match in `subjectStringChanged`
        for (let i in this.components){
          for (let j in this.componetLookup){
            const key = Object.keys(this.componetLookup[j])[0]
            if (this.components[i].label == key){
            this.componetLookup[i] = this.componetLookup[j]
            }
          }
        }
      }
    } else {
      // Above we took loose components and combined them,
      // here we undo that incase someone made a mistake and the geo
      // term has a subject in it that needs to be split out.
      let unApproved = []
      let unApprovedIdx = []
      let approved = []
      for (let c in this.components){
        if (this.components[c].uri == null && this.components[c].literal != true){
          unApproved.push(this.components[c])
          unApprovedIdx.push(c)
        } else {
          approved.push(this.components[c])
        }
      }

      //remove the terms that have been exploded
      for (let i in unApprovedIdx){
        if (this.components[unApprovedIdx[i]].label.includes("‑‑")){
          this.components.splice(unApprovedIdx[i], 1)
        }
      }

      for (let c in unApproved){
        let target = unApproved[c]
        let id = target.id

        if (target.label.includes("‑‑")){
          let needComponents = target.label.split("‑‑")
          //build and add the exploded components
          for (let idx in needComponents){
            let start = 0
            let end = 0

            let previous = null
            if (idx == 0){
              start = 0
            } else {
              previous = this.components.at(-1)
              start = previous.posEnd + 2 //for the hyphens
            }
            end = start + needComponents[idx].length
            this.components.splice(id, 0, {
              label: needComponents[idx],
              uri: null,
              id: idx,
              type: mode == "GEO" ? 'madsrdf:Geographic': 'madsrdf:Topic',
              complex: false,
              literal: null,
              posStart: start,
              posEnd: end,
            })

            id++
          }


        }

        let final = this.components.map((component) => component.label)

        this.adjustStartEndPos(this.components)
        this.subjectString = final.join("--")
      }

      // get the boxes lined up correctly
      this.renderHintBoxes()
    }

    if (this.activeComponent && this.activeComponent.label){
      this.searchApis(this.activeComponent.label || '', this.subjectString || '', this)
    }
    this.$refs.subjectInput.focus()
  },


  // some context messing here, pass the debounce func a ref to the vue "this" as that to ref in the function callback
  searchApis: debounce(async (searchString, searchStringFull, that) => {
    that.pickCurrent = null //reset the current selection when the search changes

    that.searchResults = null
    that.x = 'Seaching...'
    that.pickPostion = 0

  searchString = (searchString || '').trim().normalize()
  searchStringFull = (searchStringFull || '').trim().normalize()

    // make the "searching..." text grow
    let ti = window.setInterval(()=>{ that.activeSearch = ((!that.activeSearch) ? '' : that.activeSearch) + '.'},100)

    // a backup here just in case the search times out or takes forever
    let tiBackup = window.setTimeout(()=>{
      window.clearInterval(ti)
      that.activeSearch = false
    }, 10000)

  searchString=searchString.replaceAll('‑','-')
  searchStringFull=searchStringFull.replaceAll('‑','-')

  that.searchResults = await utilsNetwork.subjectSearch(searchString,searchStringFull,that.searchMode)

    console.log("🔍 searchApis: got searchResults from utilsNetwork.subjectSearch:", that.searchResults)

    // Add null checks before processing arrays
    if (that.searchResults) {
      // replace the true keyboard hypen with the werid hypen to prevent spliting on open lifedates
      console.log("🔍 searchApis: processing names, searchResults.names.length:", that.searchResults.names?.length || 0)
      if (that.searchResults.names && that.searchResults.names.length > 0) {
        for (let s of that.searchResults.names){
          const baseLabel = s.label ?? s.suggestLabel ?? ''
          s.labelOrginal = baseLabel
          s.label = baseLabel.replaceAll('-','‑')
        }
      }

      console.log("🔍 searchApis: processing subjectsComplex, length:", that.searchResults.subjectsComplex?.length || 0)
      if (that.searchResults.subjectsComplex && that.searchResults.subjectsComplex.length > 0) {
        for (let s of that.searchResults.subjectsComplex){
          const baseLabel = s.label ?? s.suggestLabel ?? ''
          s.labelOrginal = baseLabel
          s.complex=true
          s.label = baseLabel.replaceAll('-','‑')
        }
      }

      console.log("🔍 searchApis: processing subjectsSimple, length:", that.searchResults.subjectsSimple?.length || 0)
      if (that.searchResults.subjectsSimple && that.searchResults.subjectsSimple.length > 0) {
        for (let s of that.searchResults.subjectsSimple){
          if (s.suggestLabel && s.suggestLabel.includes('(DEPRECATED')){
            s.suggestLabel = s.suggestLabel.split('(DEPRECATED')[0] + "(DEPRECATED)"
          }
          // Ensure a stable label field exists for downstream code
          if (s.label == null) { s.label = s.suggestLabel ?? '' }
        }
      }

      if (that.searchResults.hierarchicalGeographic && that.searchResults.hierarchicalGeographic.length > 0) {
        for (let s of that.searchResults.hierarchicalGeographic){
          if ((s.suggestLabel || '').includes(' (USE ')){
            s.suggestLabel = s.label || s.suggestLabel
          }
          if (s.label == null) { s.label = s.suggestLabel ?? '' }
        }
      }
      
      if (that.searchMode == 'WORKS' || that.searchMode == 'HUBS'){
        if (that.searchResults.subjectsSimple && that.searchResults.subjectsSimple.length > 0) {
          for (let s of that.searchResults.subjectsSimple){
            if (s.suggestLabel && s.suggestLabel.includes(' (USE ')){
              s.suggestLabel = s.label
            }
          }
        }
        if (that.searchResults.subjectsComplex && that.searchResults.subjectsComplex.length > 0) {
          for (let s of that.searchResults.subjectsComplex){
            if (s.suggestLabel && s.suggestLabel.includes(' (USE ')){
              s.suggestLabel = s.label
            }
          }
        }
      }

      if (that.searchResults.hierarchicalGeographic && that.searchResults.hierarchicalGeographic.length > 0) {
        for (let s of that.searchResults.hierarchicalGeographic){
          s.labelOrginal = s.label
          s.hierarchicalGeographic=true
          s.label = s.label.replaceAll('-','‑')
        }

        if (that.searchResults.hierarchicalGeographic.length>0 && (!that.searchResults.subjectsComplex || that.searchResults.subjectsComplex.length==0)){
          that.searchResults.subjectsComplex = that.searchResults.hierarchicalGeographic
        }
      }

      // Clear pickLookup before rebuilding
      that.pickLookup = {}

      if (that.searchResults && Array.isArray(that.searchResults.subjectsSimple) && Array.isArray(that.searchResults.subjectsComplex)) {
        const tot = that.searchResults.subjectsSimple.length + that.searchResults.subjectsComplex.length
        that.pickPostion = tot > 0 ? tot - 1 : 0
      }

  // Build the pick lookup for hover functionality (explicit call instead of watcher)
  console.log("🚀 About to call buildPickLookup from searchApis")
  console.log("🚀 that.searchResults before buildPickLookup:", that.searchResults)
  that.buildPickLookup()
      console.log("🚀 buildPickLookup call completed")
      console.log("🚀 that.pickLookup after buildPickLookup:", that.pickLookup)

      // Check if we have any matches to auto-select
      for (let k in that.pickLookup){
        if (searchString.toLowerCase() == that.pickLookup[k].label.toLowerCase() && !that.pickLookup[k].literal ){
          // if the labels are the same for the current one selected don't overide it
          if (that.activeComponent && that.pickLookup[k].label.replaceAll('‑','-') == that.activeComponent.label.replaceAll('‑','-') && that.activeComponent.uri){
            if (that.activeComponent.uri == that.pickLookup[k].uri){
              that.pickPostion=k
              that.pickLookup[k].picked=true
              that.selectContext()
            }
          }else{
            // if they started typing the next word already then stop this
            if (that.subjectString.replaceAll('‑','-')!=searchStringFull.replaceAll('‑','-')){
              break
            }
            // do they even have the same label currently, they might be clicking around in the interface
            // so at this point with the async lookup this is not even the right component
            if (that.pickLookup[k].label !=  that.activeComponent.label){
              break
            }
          }
        }
      }

      // close if (that.searchResults) block
    }

  console.log("🔍 searchApis: checking if pickLookup[pickPosition] exists, pickPostion:", that.pickPostion)
    console.log("🔍 searchApis: pickLookup[pickPostion]:", that.pickLookup[that.pickPostion])
    if (that.pickLookup[that.pickPostion] && !that.pickLookup[that.pickPostion].literal){
      console.log("🔍 searchApis: calling getContext for initial context load")
      that.contextRequestInProgress = true
      that.getContext()

      // keep a local copy of it for looking up subject type
      if (that.contextData){
        that.localContextCache[that.contextData.uri] = JSON.parse(JSON.stringify(that.contextData))
      }
    }

    console.log("🔍 searchApis: cleaning up timers and finishing")
    window.clearInterval(ti)
    window.clearTimeout(tiBackup)
    that.activeSearch = false

    console.log("🔍 searchApis: calling nextTick for toolbar height check")

    // microtask to ensure pickLookup is built before user hovers
    setTimeout(() => {
      if (!that.pickLookup || Object.keys(that.pickLookup).length === 0) {
        console.log("⏱️ Prebuilding pickLookup after search ready")
        that.buildPickLookup()
      }
    }, 0)

    that.$nextTick(() => {
      that.checkToolBarHeight()

      // find out how small the smallest one is and then loop through and try to make all of them
      // that size so they fit on one line of the display
      let smallest_size = 1000;
      for (let el of document.getElementsByClassName("fake-option")){
        if (el.offsetHeight < smallest_size && el.offsetHeight!=0){
          smallest_size=el.offsetHeight
        }
      }
      
      for (let el of document.getElementsByClassName("fake-option")){
        if (el.offsetHeight > smallest_size){
          let startFontSize = 1.25
          while (el.offsetHeight >smallest_size){
            startFontSize=startFontSize-0.01
            el.style.fontSize = startFontSize + 'em';
            if (startFontSize<=0.01){
              el.style.fontSize = "1.25em"
              break
            }
          }
        }
      }
    })
  }, 500),

  navStringClick: function(event){
    // when clicked send it over to the navString func with fake key property to trigger if statement
    event.key='ArrowLeft'
    this.navString(event)
  },

  navString: function(event){
    if (event.key == 'ArrowLeft' || event.key == 'ArrowRight' ){
      // don't let them leave a trailing -- when they are clicking around like wild
      // if (this.subjectString.endsWith('--')){
      //   this.subjectString = this.subjectString.slice(0,this.subjectString.length-2)
      // }
      if (!event.target){
        event = {target:this.$refs.subjectInput}
      }

      for (let c of this.components){
        if (event.target.selectionStart >= c.posStart && event.target.selectionStart <= c.posEnd+1){
          this.activeComponent = c
          this.activeComponentIndex = c.id
          break
        }
      }

      // keep track of where we were so that we don't do unessary refreshes
      if (this.oldActiveComponentIndex != this.activeComponentIndex){
        this.updateAvctiveTypeSelected()
        this.subjectStringChanged(event)
        this.oldActiveComponentIndex = this.activeComponentIndex
      }else if (this.activeComponent.uri === null){
        this.updateAvctiveTypeSelected()
        this.subjectStringChanged(event)
      }
    }
    // text macros
    let useTextMacros=this.preferenceStore.returnValue('--o-diacritics-text-macros')
    if (useTextMacros && useTextMacros.length>0){
      for (let m of useTextMacros){
        if (event.target.value.indexOf(m.lookFor) > -1){
          event.target.value = event.target.value.replace(m.lookFor,m.replaceWith)
          // manually change the v-model var and force a update
          this.$nextTick(() => {
              this.subjectString = event.target.value
              this.subjectStringChanged()
              this.navString({key:'ArrowRight'})
          })




        }
      }
    }


  },

  /**
   * Build the pick lookup which is an object that maps the position in the results to the actual data object
   * Based on the main repository structure for hover functionality
   */
  buildPickLookup: function() {
    console.log("🔧 buildPickLookup called")
    console.log("🔧 searchResults:", this.searchResults)
    
    if (!this.searchResults) {
      console.log("❌ No search results, clearing pickLookup")
      this.pickLookup = {}
      return
    }

    console.log("🔧 searchResults structure:")
  console.log("  - subjectsComplex:", (this.searchResults.subjectsComplex && this.searchResults.subjectsComplex.length) ? this.searchResults.subjectsComplex.length : 0)
  console.log("  - subjectsSimple:", (this.searchResults.subjectsSimple && this.searchResults.subjectsSimple.length) ? this.searchResults.subjectsSimple.length : 0)
  console.log("  - subjectsChildrenComplex:", (this.searchResults.subjectsChildrenComplex && this.searchResults.subjectsChildrenComplex.length) ? this.searchResults.subjectsChildrenComplex.length : 0)
  console.log("  - subjectsChildren:", (this.searchResults.subjectsChildren && this.searchResults.subjectsChildren.length) ? this.searchResults.subjectsChildren.length : 0)
  console.log("  - names:", (this.searchResults.names && this.searchResults.names.length) ? this.searchResults.names.length : 0)
  console.log("  - exact:", (this.searchResults.exact && this.searchResults.exact.length) ? this.searchResults.exact.length : 0)

    this.pickLookup = {}

    const normalizeItem = (item) => {
      if (!item) return item
      if (!item.label) {
        // prefer suggestLabel, fallback to aLabel or other common fields
        const display = Array.isArray(item.displayLabel) ? item.displayLabel[0] : item.displayLabel
        item.label = item.suggestLabel || item.aLabel || item.authLabel || display || item.title || ''
      }
      if (!item.uri && item['@id']) item.uri = item['@id']
      // normalize marcKey from possible locations
      const mk = this.normalizeMarcKey(item.marcKey || (item.extra && item.extra.marcKey))
      if (mk) item.marcKey = mk
      return item
    }

    const haveMain = ((this.searchResults.subjectsComplex?.length || 0) + (this.searchResults.subjectsSimple?.length || 0)) > 0
    const haveChildren = ((this.searchResults.subjectsChildrenComplex?.length || 0) + (this.searchResults.subjectsChildren?.length || 0)) > 0

    // Prefer main arrays; use children arrays when main are absent (mirrors how the template renders per mode)
    if (haveMain) {
      // Complex subjects start at 0
      if (this.searchResults.subjectsComplex && this.searchResults.subjectsComplex.length > 0) {
        for (let i = 0; i < this.searchResults.subjectsComplex.length; i++) {
          const item = normalizeItem(this.searchResults.subjectsComplex[i])
          this.pickLookup[i] = JSON.parse(JSON.stringify(item))
        }
      }

      // Simple subjects continue from complex subjects
      if (this.searchResults.subjectsSimple && this.searchResults.subjectsSimple.length > 0) {
        const offset = this.searchResults.subjectsComplex?.length || 0
        for (let i = 0; i < this.searchResults.subjectsSimple.length; i++) {
          const pos = offset + i
          const item = normalizeItem(this.searchResults.subjectsSimple[i])
          this.pickLookup[pos] = JSON.parse(JSON.stringify(item))
        }
      }
    } else if (haveChildren) {
      // Children complex
      if (this.searchResults.subjectsChildrenComplex && this.searchResults.subjectsChildrenComplex.length > 0) {
        for (let i = 0; i < this.searchResults.subjectsChildrenComplex.length; i++) {
          const item = normalizeItem(this.searchResults.subjectsChildrenComplex[i])
          this.pickLookup[i] = JSON.parse(JSON.stringify(item))
        }
      }
      // Children simple continue from children complex
      if (this.searchResults.subjectsChildren && this.searchResults.subjectsChildren.length > 0) {
        const offset = this.searchResults.subjectsChildrenComplex?.length || 0
        for (let i = 0; i < this.searchResults.subjectsChildren.length; i++) {
          const pos = offset + i
          const item = normalizeItem(this.searchResults.subjectsChildren[i])
          this.pickLookup[pos] = JSON.parse(JSON.stringify(item))
        }
      }
    }

    // Names get negative indices as (len - idx) * -1, so last entry is -1
    if (this.searchResults.names && this.searchResults.names.length > 0) {
      const n = this.searchResults.names.length
      for (let i = 0; i < n; i++) {
        const pos = (n - i) * -1
  const item = normalizeItem(this.searchResults.names[i])
  this.pickLookup[pos] = JSON.parse(JSON.stringify(item))
      }
    }

    // Exact matches get negative indices offset by -2 from the names positions
    if (this.searchResults.exact && this.searchResults.exact.length > 0) {
      const n = this.searchResults.names?.length || 0
      for (let i = 0; i < this.searchResults.exact.length; i++) {
        const pos = (n - i) * -1 - 2
  const item = normalizeItem(this.searchResults.exact[i])
  this.pickLookup[pos] = JSON.parse(JSON.stringify(item))
      }
    }

    // Initialize picked status
    for (let k in this.pickLookup) {
      this.pickLookup[k].picked = false
    }

    console.log("✅ buildPickLookup completed")
    console.log("🔧 Final pickLookup keys:", Object.keys(this.pickLookup))
    console.log("🔧 Final pickLookup:", this.pickLookup)
  },

  getContext: async function(){
    console.log("getContext called, pickPosition:", this.pickPostion)
    console.log("pickLookup:", this.pickLookup)
    console.log("pickLookup[pickPostion]:", this.pickLookup[this.pickPostion])
    
    if (!this.pickLookup[this.pickPostion]) {
      // If we're in Link Mode (no pick list active), skip context fetch entirely
      if (this.subjectEditorMode === 'link') {
        return false
      }
      // Try to derive the entry directly from searchResults using the same index mapping
      const deriveFromResults = (pos) => {
        if (!this.searchResults) return null
        const normalize = (item) => {
          if (!item) return item
          if (!item.label) {
            const display = Array.isArray(item.displayLabel) ? item.displayLabel[0] : item.displayLabel
            item.label = item.suggestLabel || item.aLabel || item.authLabel || display || item.title || ''
          }
          if (!item.uri && item['@id']) item.uri = item['@id']
          return item
        }
        // Positive indices cover subjectsComplex then subjectsSimple
        if (pos >= 0) {
          const cx = this.searchResults.subjectsComplex || []
          const sm = this.searchResults.subjectsSimple || []
          if (pos < cx.length) return normalize(cx[pos])
          const offset = pos - cx.length
          if (offset >= 0 && offset < sm.length) return normalize(sm[offset])
          // children fallback
          const ccx = this.searchResults.subjectsChildrenComplex || []
          const csm = this.searchResults.subjectsChildren || []
          if (pos < ccx.length) return normalize(ccx[pos])
          const coff = pos - ccx.length
          if (coff >= 0 && coff < csm.length) return normalize(csm[coff])
          return null
        } else {
          // Negative indices map names: (n - i) * -1, and exact offset -2
          const names = this.searchResults.names || []
          const exact = this.searchResults.exact || []
          const n = names.length
          // If pos in [-n..-1]
          if (pos <= -1 && pos >= -n) {
            const i = n - Math.abs(pos)
            return normalize(names[i])
          }
          // exact: positions shift further negative by 2
          const eIndex = n - Math.abs(pos + 2)
          if (eIndex >= 0 && eIndex < exact.length) return normalize(exact[eIndex])
          return null
        }
      }
      const derived = deriveFromResults(this.pickPostion)
      if (derived) {
        this.pickLookup[this.pickPostion] = JSON.parse(JSON.stringify(derived))
      } else {
        console.log("No entry in pickLookup for position:", this.pickPostion)
        return false
      }
    }

    // If we have cached context for this URI, use it immediately
    const current = this.pickLookup[this.pickPostion]
    if (current && current.uri && this.localContextCache[current.uri]) {
      this.contextData = JSON.parse(JSON.stringify(this.localContextCache[current.uri]))
      this.contextRequestInProgress = false
      console.log("Using cached contextData for", current.uri)
      return true
    }
    
    if (this.pickLookup[this.pickPostion].literal) {
      console.log("Entry is literal, setting contextData directly")
      this.contextData = this.pickLookup[this.pickPostion]
      return false
    }
    
    // Set contextData from the extra field if available
    if (this.pickLookup[this.pickPostion].extra) {
      console.log("Using extra data for context")
      this.contextData = this.pickLookup[this.pickPostion].extra
      
      if (this.pickLookup[this.pickPostion].uri) {
        this.contextData.literal = false
        this.contextData.title = this.pickLookup[this.pickPostion].label
        this.contextData.uri = this.pickLookup[this.pickPostion].uri
        
        if (Object.keys(this.contextData).includes("marcKey")) {
          this.pickLookup[this.pickPostion].marcKey = this.contextData.marcKey
        }
        
        let types = this.pickLookup[this.pickPostion].extra['rdftypes'] || []
        if (types.includes("Hub")) {
          this.contextData.type = "bf:Hub"
        } else if (types.includes("Work")) {
          this.contextData.type = "bf:Work"
        } else if (types.length > 0) {
          this.contextData.type = "madsrdf:" + types[0]
        }
        
        this.contextData.typeFull = this.contextData.type ? this.contextData.type.replace('madsrdf:', 'http://www.loc.gov/mads/rdf/v1#') : ""
        this.contextData.gacs = this.pickLookup[this.pickPostion].extra.gacs
      } else {
        this.contextData.literal = true
      }
      // Normalize into panel-friendly shape
      this._normalizeContextForPanel(this.contextData, this.pickLookup[this.pickPostion])
    } else {
  console.log("No extra data available, fetching full context via _getContext()")
      // Delegate to network-backed context loader for full details
      await this._getContext()
      // Normalize into panel-friendly shape
      this._normalizeContextForPanel(this.contextData, this.pickLookup[this.pickPostion])
      console.log("getContext completed (via _getContext), contextData:", this.contextData)
      return
    }

    this.contextRequestInProgress = false
    console.log("getContext completed, contextData:", this.contextData)
  },

  /**
   * Normalize contextData to the UI schema expected by the right pane
   * - Ensures title is a string
   * - Populates rdftypes (array) from type/typeFull if missing
   * - Maps nodeMap keys to panelDetailOrder keys (birthdates, broaders, etc.)
   * - Ensures marcKey is a string
   */
  _normalizeContextForPanel: function(ctx, fallbackItem){
    if (!ctx || typeof ctx !== 'object') return

    // Title: prefer explicit, else fallback to hovered label
    if (Array.isArray(ctx.title)) {
      // If array of objects with @value, pick first @value
      const t = ctx.title.find(v => v && (v['@value'] || typeof v === 'string'))
      ctx.title = t ? (t['@value'] || t) : (fallbackItem && (fallbackItem.label || fallbackItem.suggestLabel || fallbackItem.aLabel) || '')
    } else if (!ctx.title || ctx.title === '') {
      ctx.title = (fallbackItem && (fallbackItem.label || fallbackItem.suggestLabel || fallbackItem.aLabel)) || ''
    }

    // rdftypes: keep existing, otherwise derive from type/typeFull
    if (!ctx.rdftypes || !Array.isArray(ctx.rdftypes) || ctx.rdftypes.length === 0) {
      const typeFull = ctx.typeFull || ctx.type || ''
      if (typeof typeFull === 'string' && typeFull.includes('#')) {
        ctx.rdftypes = [ typeFull.split('#').pop() ]
      } else if (typeof typeFull === 'string' && typeFull.includes('/bibframe/')) {
        ctx.rdftypes = [ typeFull.split('/').pop() ]
      } else if (typeof ctx.type === 'string' && ctx.type) {
        ctx.rdftypes = [ ctx.type.replace('madsrdf:', '') ]
      }
    }

    // marcKey: if it's an array or object, normalize to string
    if (Array.isArray(ctx.marcKey)) {
      const m = ctx.marcKey.find(v => v && (v['@value'] || typeof v === 'string'))
      ctx.marcKey = m ? (m['@value'] || m) : ctx.marcKey[0]
    }

    // Map nodeMap keys (if present) into panel keys
    const nm = ctx.nodeMap || {}
    const mapKey = (srcKey) => Array.isArray(nm[srcKey]) ? nm[srcKey].filter(Boolean) : []
    // Expected panel keys
    ctx.birthdates   = ctx.birthdates   || mapKey('Birth Date')
    ctx.birthplaces  = ctx.birthplaces  || mapKey('Birth Place')
    ctx.locales      = ctx.locales      || mapKey('Associated Locale')
    ctx.activityfields = ctx.activityfields || mapKey('Field of Activity')
    ctx.occupations  = ctx.occupations  || mapKey('Occupation')
    ctx.languages    = ctx.languages    || mapKey('Associated Language')
    ctx.lcclasss     = ctx.lcclasss     || mapKey('LC Classification')
    ctx.broaders     = ctx.broaders     || mapKey('Has Broader Authority')
    ctx.collections  = ctx.collections  || mapKey('MADS Collection')
    ctx.gacs         = ctx.gacs         || mapKey('GAC(s)')
    ctx.subjects     = ctx.subjects     || mapKey('Subjects')

    // nonlatinLabels and variantLabels
    if (!ctx.nonlatinLabels && ctx.nonLatinTitle) {
      // array of label objects -> values
      try {
        ctx.nonlatinLabels = (Array.isArray(ctx.nonLatinTitle) ? ctx.nonLatinTitle : []).map(v => v && (v['@value'] || v)).filter(Boolean)
      } catch {}
    }
    if (!ctx.variantLabels && ctx.variant) {
      if (Array.isArray(ctx.variant)) ctx.variantLabels = ctx.variant
      else if (typeof ctx.variant === 'string' && ctx.variant.trim() !== '') ctx.variantLabels = [ctx.variant]
    }

    // sources: normalize to array of strings if provided
    if (ctx.source && !ctx.sources) {
      if (Array.isArray(ctx.source)) ctx.sources = ctx.source
      else if (typeof ctx.source === 'string') ctx.sources = [ctx.source]
    }

    // Ensure uri
    if (!ctx.uri && fallbackItem && fallbackItem.uri) ctx.uri = fallbackItem.uri
  },

  _getContext: async function(){
    if (this.pickLookup[this.pickPostion].literal){
      this.contextData = this.pickLookup[this.pickPostion]
      return false
    }

    this.contextRequestInProgress = true
    this.contextData = await utilsNetwork.returnContext(this.pickLookup[this.pickPostion].uri)

    // for backwards compability
    if (this.contextData.nodeMap.marcKey && this.contextData.nodeMap.marcKey[0]){
      this.pickLookup[this.pickPostion].marcKey = this.contextData.nodeMap.marcKey[0]
    }

    // we will modify our local context data here to make things easier
    if (Array.isArray(this.contextData.title)){
      // first grab the non-latin auth labels
      this.contextData.nonLatinTitle = JSON.parse(JSON.stringify(this.contextData.title.filter((v)=>{ return (v['@language'] != "en" ? v['@language'] : "") })))
      this.pickLookup[this.pickPostion].nonLatinTitle = this.contextData.nonLatinTitle

      // return the first label with no language tag
      this.contextData.title = this.contextData.title.filter((v)=>{ return (v['@language'] == "en" || !v['@language']) })[0]
      if (this.contextData.title && this.contextData.title['@value']){
        this.contextData.title = this.contextData.title['@value']
      }
    }

        if (Array.isArray(this.contextData.marcKey)){
      // first grab the non-latin auth labels - use explicit undefined check for browser compatibility
      this.contextData.nonLatinMarcKey = JSON.parse(JSON.stringify(this.contextData.marcKey.filter((v)=>{ 
        return (v && v['@language'] !== undefined && v['@language'] !== null && v['@language'] !== '') 
      })))
      this.pickLookup[this.pickPostion].nonLatinMarcKey = this.contextData.nonLatinMarcKey
      // return the first label with no language tag - use explicit undefined check for browser compatibility
      this.contextData.marcKey = this.contextData.marcKey.filter((v)=>{ 
        return (v && (v['@language'] === undefined || v['@language'] === null || v['@language'] === '')) 
      })[0]
      if (this.contextData.marcKey && this.contextData.marcKey['@value']){
        this.contextData.marcKey = this.contextData.marcKey['@value']
        this.pickLookup[this.pickPostion].marcKey = this.contextData.marcKey
      }
    }

      this.contextRequestInProgress = false
    },

  /** Clear the current selection so that hovering will update the preview again */
  clearSelected: function(){
    this.pickLookup[this.pickCurrent].picked = false
    this.pickCurrent = null
  },

  buildAddtionalInfo: function(collections){
    if (collections){
      let out = []
      if (collections.includes("http://id.loc.gov/authorities/subjects/collection_LCSHAuthorizedHeadings") || collections.includes("http://id.loc.gov/authorities/subjects/collection_NamesAuthorizedHeadings")){
        out.push("(Auth Hd)")
      } else if (collections.includes("http://id.loc.gov/authorities/subjects/collection_GenreFormSubdivisions")){
        out.push("(GnFrm)")
      } else if (collections.includes("http://id.loc.gov/authorities/subjects/collection_GeographicSubdivisions")){
        out.push("(GeoSubDiv)")
      } else if (collections.includes("http://id.loc.gov/authorities/subjects/collection_LCSH_Childrens")){
          out.push("(ChldSubj)")
      } else if (collections.includes("http://id.loc.gov/authorities/subjects/collection_Subdivisions")){
        out.push("(SubDiv)")
      }

      // favor SubDiv over GnFrm
      if (out.includes("(GnFrm)") && collections.includes("http://id.loc.gov/authorities/subjects/collection_Subdivisions")){
        out = ["(SubDiv)"]
      }

      // if (collections.includes("LCNAF")){
      //     out.push("[LCNAF]")
      // }

      return out.join(" ")
    } else {
      return ""
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
                  // this.searchValueLocal = inputV.value

                  // this.subjectString = inputV.value
                  // this.doSearch()

                }
              }
              // same for euqal key
              if (event.code == 'Equal'){
                if (inputV.value.charAt(inputV.value.length-1) == '='){
                  // remove the last char
                  // inputV.value = inputV.value.slice(0, -1);
                  inputV.value = inputV.value.slice(0,insertAt) + inputV.value.slice(insertAt)
                  // this.searchValueLocal = inputV.value

                  // this.subjectString = inputV.value
                  // this.doSearch()
                }
              }
              // same for Backquote key

              if (event.code == 'Backquote'){
                if (inputV.value.charAt(inputV.value.length-1) == '`'){
                  // remove the last char
                  // inputV.value = inputV.value.slice(0, -1);
                  inputV.value = inputV.value.slice(0,insertAt) + inputV.value.slice(insertAt)
                  // this.searchValueLocal = inputV.value

                  // this.subjectString = inputV.value
                  // this.doSearch()
                }
              }
              // it is not a combining unicode char so just insert it into the value
              if (inputV.value){
                // inputV.value=inputV.value+macro.codeEscape
                inputV.value = inputV.value.substring(0, insertAt) + macro.codeEscape + inputV.value.substring(insertAt);
                // this.searchValueLocal = inputV.value

                // this.subjectString = inputV.value
                if (insertAt){
                  this.$nextTick(()=>{
                    inputV.setSelectionRange(insertAt+1,insertAt+1)
                    this.$nextTick(()=>{
                      inputV.focus()
                      // this.doSearch()
                    })
                  })
                }else{
                    this.$nextTick(()=>{
                      inputV.focus()
                    })
                }
              }else{
                inputV.value = macro.codeEscape
                // this.searchValueLocal = inputV.value

                // this.subjectString = inputV.value
              }


            }else{


              // same for Backquote key

              if (event.code == 'Backquote'){

                if (inputV.value.charAt(inputV.value.length-1) == '`'){
                  // remove the last char
                  inputV.value = inputV.value.slice(0, -1);
                  // this.searchValueLocal = inputV.value
                  // this.subjectString = inputV.value
                  // this.doSearch()
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
                  // this.searchValueLocal = inputV.value
                  // this.subjectString = inputV.value
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



  loadContext: async function(pickPosition){
    console.log("loadContext called with position:", pickPosition)
    console.log("Current pickLookup:", this.pickLookup)
    
    // Don't proceed if pickLookup is empty or not ready
    if (!this.pickLookup || Object.keys(this.pickLookup).length === 0) {
      // Attempt to build from existing searchResults to support early hover
      if (this.searchResults) {
        console.log("ℹ️ pickLookup empty on hover; building from searchResults now")
        this.buildPickLookup()
      }
      if (!this.pickLookup || Object.keys(this.pickLookup).length === 0) {
        console.log("❌ pickLookup is empty, skipping loadContext")
        return false
      }
    }
    
  // Always allow hover to preview context; do not change pickCurrent here
  this.pickPostion = pickPosition

    if (!this.pickLookup[this.pickPostion]) {
      console.log("No entry in pickLookup for position:", this.pickPostion)
      return false
    }

    if (this.pickLookup[this.pickPostion].literal) {
      console.log("Entry is literal, skipping context load")
      return false
    }

  // Load the context data and avoid pickLookup rebuild while we fetch
  this.skipPickBuild = true
  this.contextRequestInProgress = true
  await this.getContext()
  this.contextRequestInProgress = false
  this.skipPickBuild = false

    // Cache the normalized context data if available
    if (this.contextData && this.contextData.uri) {
      this.localContextCache[this.contextData.uri] = JSON.parse(JSON.stringify(this.contextData))
    }

    console.log("loadContext completed")
  },

  selectContext: async function(pickPostion, update=true){
    console.log("🔍 selectContext called with pickPostion:", pickPostion, "current this.pickPostion:", this.pickPostion);
    
    if (pickPostion != null){
      this.pickPostion=pickPostion
      this.pickCurrent=pickPostion
      console.log("🔍 Updated pickPostion to:", pickPostion);
      console.log("🔍 pickLookup item:", this.pickLookup[pickPostion]);
      console.log("🔍 pickLookup keys:", Object.keys(this.pickLookup));
      console.log("🔍 Full pickLookup:", this.pickLookup);
      this.getContext()
      //Science—Experiments
    }

    // Add safety check for pickLookup item
    if (!this.pickLookup[this.pickPostion]) {
      console.error("🚨 No pickLookup item found for position:", this.pickPostion);
      console.log("🔍 Available pickLookup positions:", Object.keys(this.pickLookup));
      return;
    }

  // Treat all negative indices (names/exact) as full heading replacements (complex) regardless of current typed string
  const isNameResult = parseInt(this.pickPostion) < 0
  if (isNameResult){
      // DIRECT COMPONENT PATH FOR LCNAF NAME SELECTIONS (single heading behavior)
      const selLabel = this.pickLookup[this.pickPostion].label || this.pickLookup[this.pickPostion].suggestLabel || this.pickLookup[this.pickPostion].aLabel || ''
      // Normalize and persist a canonical label on the pickLookup item so downstream code sees the same string
      if (!this.pickLookup[this.pickPostion].label) {
        this.pickLookup[this.pickPostion].label = selLabel
      }
      this.subjectString = selLabel
      // Ensure context first (rdftypes/marcKey)
      if (!this.contextData || !this.contextData.rdftypes || !this.safeGetMarcKeyFrom(this.pickLookup[this.pickPostion])) {
        try { await this.getContext() } catch(e){ console.warn('Name getContext failed (pre)', e) }
      }
      // Fallback: deeper fetch if still no marcKey
      if (!this.safeGetMarcKeyFrom(this.pickLookup[this.pickPostion])) {
        try { await this._getContext() } catch(e){ console.warn('Name _getContext fallback failed', e) }
      }
      // Derive name type
      let nameType = 'madsrdf:PersonalName'
      try {
        const rts = (this.contextData && this.contextData.rdftypes) ? this.contextData.rdftypes : (this.pickLookup[this.pickPostion].extra && this.pickLookup[this.pickPostion].extra.rdftypes) || []
        if (rts.includes('CorporateName')) nameType = 'madsrdf:CorporateName'
        else if (rts.includes('ConferenceName')) nameType = 'madsrdf:ConferenceName'
        else if (rts.includes('FamilyName')) nameType = 'madsrdf:FamilyName'
        else if (rts.includes('Geographic')) nameType = 'madsrdf:Geographic'
      } catch {}
      this.activeComponentIndex = 0
      if (!this.typeLookup) this.typeLookup = {}
      this.typeLookup[0] = nameType
      // Extract marcKey from multiple possible locations
      let mk = this.safeGetMarcKeyFrom(this.pickLookup[this.pickPostion]) || this.safeGetMarcKeyFrom(this.contextData) || null
      // Additional fallback: contextData.marcKeys array
      if (!mk && this.contextData && Array.isArray(this.contextData.marcKeys)) {
        try { mk = this.normalizeMarcKey(this.contextData.marcKeys[0]) } catch{}
      }
      if (mk) this.pickLookup[this.pickPostion].marcKey = mk
      // Build single component
      const uri = this.pickLookup[this.pickPostion].uri || (this.contextData && this.contextData.uri) || null
      this.components = [{
        id: 0,
        label: selLabel,
        posStart: 0,
        posEnd: selLabel.length,
        uri: uri,
        type: nameType,
        literal: false,
        complex: false,
        marcKey: mk
      }]
      // Sync lookup structures
      this.componetLookup = { 0: {} }
      this.componetLookup[0][selLabel] = Object.assign({}, this.pickLookup[this.pickPostion], { type: nameType, marcKey: mk })
      // Mark selection
      for (let k in this.pickLookup){ this.pickLookup[k].picked = false }
      this.pickLookup[this.pickPostion].picked = true
      this.activeComponent = this.components[0]
      // Render UI overlays safely
      if (typeof this.renderHintBoxes === 'function') {
        try { this.renderHintBoxes() } catch {}
      }
      // Validate
      if (typeof this.validateOkayToAdd === 'function') {
        this.validateOkayToAdd()
        if (!this.okayToAdd) console.log('⚠️ validateOkayToAdd (name) failed', JSON.parse(JSON.stringify(this.components)))
      }
      try { this.$refs.subjectInput.focus() } catch {}
      return
  }
  const treatAsComplex = this.pickLookup[this.pickPostion].complex
  if (treatAsComplex){
      // if it is a complex authorized heading then just replace the whole things with it
  const selLabel = this.pickLookup[this.pickPostion].label || this.pickLookup[this.pickPostion].suggestLabel || this.pickLookup[this.pickPostion].aLabel || ''
  console.log("🔍 Complex heading selected. Label:", selLabel);
  console.log("🔍 Full pickLookup item:", this.pickLookup[this.pickPostion]);
  this.subjectString = selLabel
      this.activeComponentIndex = 0

      this.componetLookup = {}
      this.componetLookup[this.activeComponentIndex] = {}

    this.componetLookup[this.activeComponentIndex][selLabel] = this.pickLookup[this.pickPostion]
    for (let k in this.pickLookup){
      this.pickLookup[k].picked=false
    }
    // For names, set type based on the result type
  if (isNameResult) {
      // Names from LCNAF should be PersonalName by default, but check contextData
      let nameType = 'madsrdf:PersonalName';
      if (this.contextData && this.contextData.rdftypes) {
        if (this.contextData.rdftypes.includes('CorporateName')) {
          nameType = 'madsrdf:CorporateName';
        } else if (this.contextData.rdftypes.includes('ConferenceName')) {
          nameType = 'madsrdf:ConferenceName';
        } else if (this.contextData.rdftypes.includes('FamilyName')) {
          nameType = 'madsrdf:FamilyName';
        }
      }
      this.typeLookup[this.activeComponentIndex] = nameType;
    } else {
      // complex headings are all topics (...probably)
      this.typeLookup[this.activeComponentIndex] = 'madsrdf:Topic'
    }
    this.pickLookup[this.pickPostion].picked=true

    // For name results ensure we have a marcKey; if missing force a full context fetch
    if (isNameResult && !this.safeGetMarcKeyFrom(this.pickLookup[this.pickPostion])) {
      try {
        console.log("🔄 Forcing full context fetch for name result lacking marcKey")
        await this._getContext()
        const mk = this.safeGetMarcKeyFrom(this.contextData)
        if (mk) {
          this.pickLookup[this.pickPostion].marcKey = mk
          this.componetLookup[this.activeComponentIndex][selLabel].marcKey = mk
        }
        
        // Update the type based on fetched context
        if (this.contextData && this.contextData.rdftypes) {
          let nameType = 'madsrdf:PersonalName';
          if (this.contextData.rdftypes.includes('CorporateName')) {
            nameType = 'madsrdf:CorporateName';
          } else if (this.contextData.rdftypes.includes('ConferenceName')) {
            nameType = 'madsrdf:ConferenceName';
          } else if (this.contextData.rdftypes.includes('FamilyName')) {
            nameType = 'madsrdf:FamilyName';
          } else if (this.contextData.rdftypes.includes('Geographic')) {
            nameType = 'madsrdf:Geographic';
          }
          this.typeLookup[this.activeComponentIndex] = nameType;
          this.componetLookup[this.activeComponentIndex][selLabel].type = nameType;
        }
      } catch(fetchErr){
        console.warn("Failed to enrich name result with full context", fetchErr)
      }
    }

    //This check is needed to prevent falling into recursive loop when loading existing data.
    if (update == true) {
      // Let normal pipeline rebuild components (ensures positions & UI consistency)
      if (typeof this.subjectStringChanged === 'function') this.subjectStringChanged()
      // After rebuild, ensure first component enriched
      if (Array.isArray(this.components) && this.components.length > 0) {
        const first = this.components[0]
        if (!first.uri) first.uri = this.pickLookup[this.pickPostion].uri
        if (!first.type) first.type = this.typeLookup[this.activeComponentIndex]
        first.literal = false
        if (this.pickLookup[this.pickPostion].marcKey && !first.marcKey) {
          first.marcKey = this.pickLookup[this.pickPostion].marcKey
        }
        first.complex = !!treatAsComplex
      } else if (isNameResult) {
        // Fallback: manual insertion if components not built (edge case)
        this.components = [{
          id: 0,
          label: this.subjectString,
          posStart: 0,
          posEnd: this.subjectString.length-1,
          uri: this.pickLookup[this.pickPostion].uri,
          type: this.typeLookup[this.activeComponentIndex],
          literal: false,
          complex: true,
          marcKey: this.pickLookup[this.pickPostion].marcKey || null
        }]
        this.activeComponentIndex = 0
        this.activeComponent = this.components[0]
      }
      if (typeof this.validateOkayToAdd === 'function') {
        this.validateOkayToAdd()
        if (!this.okayToAdd) {
          console.log('⚠️ validateOkayToAdd failed after name/complex selection', JSON.parse(JSON.stringify(this.components)))
        }
      }
    }

    try { this.$refs.subjectInput.focus() } catch(err) { console.log("working with existing data: $refs") }  }else{
      // console.log('1',JSON.parse(JSON.stringify(this.componetLookup)))
      // take the subject string and split
      let splitString = this.subjectString.split('--')

      // replace the string with what we selected
  const baseLabel = this.pickLookup[this.pickPostion].label || this.pickLookup[this.pickPostion].suggestLabel || this.pickLookup[this.pickPostion].aLabel || ''
  console.log("🔍 Simple heading selected. Base label:", baseLabel);
  console.log("🔍 Before replacement, subjectString:", this.subjectString);
  console.log("🔍 Active component index:", this.activeComponentIndex);
  console.log("🔍 Full pickLookup item:", this.pickLookup[this.pickPostion]);
  splitString[this.activeComponentIndex] = baseLabel.replaceAll('-','‑')

  this.subjectString = splitString.join('--')
      console.log("🔍 After replacement, subjectString:", this.subjectString);


      if (!this.componetLookup[this.activeComponentIndex]){
        this.componetLookup[this.activeComponentIndex]= {}
      }

  let _ = await this.getContext() //ensure the pickLookup has the marcKey
  this.componetLookup[this.activeComponentIndex][baseLabel.replaceAll('-','‑')] = this.pickLookup[this.pickPostion]

      for (let k in this.pickLookup){
        this.pickLookup[k].picked=false
      }

      this.pickLookup[this.pickPostion].picked=true

      try {
        let marcKey = this.safeGetMarcKeyFrom(this.pickLookup[this.pickPostion])
        // persist normalized value if available
        if (marcKey) this.pickLookup[this.pickPostion].marcKey = marcKey
        if (marcKey && typeof marcKey === 'string') {
          let type = marcKey.match(/\$[axyzv]{1}/g)
          if (type && type.length > 0) {
            type = this.getTypeFromSubfield(type[0])
            this.setTypeClick(null, type)
          } else {
            console.warn("No valid subfield found in marcKey:", marcKey)
          }
        } else {
          console.warn("marcKey is undefined or invalid for pickLookup item:", this.pickLookup[this.pickPostion])
        }
      } catch(err) {
        console.error("Error getting the type. ", err)
      }

      // console.log('2',JSON.parse(JSON.stringify(this.componetLookup)))
      //Need something to prevent recursion
      if (update == true){
        this.subjectStringChanged()
      }
    }



  },


  navInput: function(event){
    if (event.key == 'ArrowUp'){
      if (parseInt(this.pickPostion) <= this.searchResults.names.length*-1){
        return false
      }

      this.pickCurrent = null //allows keyboard selection
      this.loadContext(parseInt(this.pickPostion) - 1 )
      this.pickCurrent = parseInt(this.pickPostion)
      event.preventDefault()
      return false
    }else if (event.key == 'ArrowDown'){

      if (parseInt(this.pickPostion) >= this.searchResults.subjectsSimple.length - 1 + this.searchResults.subjectsComplex.length){
        return false
      }

      this.pickCurrent = null //allows keyboard selection
      this.loadContext(parseInt(this.pickPostion) + 1 )
      this.pickCurrent = parseInt(this.pickPostion)
      event.preventDefault()
      return false
    }else if (event.key == 'Enter'){



      if (event.shiftKey){
        this.add()
        return
      }

      this.selectContext()

    }else if (event.ctrlKey && event.key == "1"){

      this.searchModeSwitch("LCSHNAF")

    }else if (event.ctrlKey && event.key == "2"){

      this.searchModeSwitch("GEO")

    }else if (event.ctrlKey && event.key == "3"){

      this.searchModeSwitch("WORKS")

    }else if (this.searchMode == 'GEO' && event.key == "-"){
      if (this.components.length>0){
        let lastC = this.components[this.components.length-1]

        // if the last component has a URI then it was just selected
        // so we are not in the middle of a indirect heading, we are about to type it
        // so let them put in normal --
        if (lastC.uri && this.activeComponentIndex == this.components.length-1){
          return true
        }

        // if the last string is a normal "-" then make this one normal too
        if (this.subjectString.slice(-1) == '-'){
          return true
        }

      }

      let start = event.target.selectionStart
      let end = event.target.selectionEnd
      // console.log(this.subjectString.substring(0,start),'|',this.subjectString.substring(end,this.subjectString.length))

      this.subjectString = this.subjectString.substring(0,start) + '‑' + this.subjectString.substring(end,this.subjectString.length)
      this.subjectString=this.subjectString.trim()

      this.$nextTick(() => {
          // console.log(start,end)
          if (end-start > 0){
            event.target.setSelectionRange(start+1,start+1)
          } else {
            event.target.setSelectionRange(start+1,end+1)
          }

      })

      this.subjectStringChanged(event)

      event.preventDefault()
      return false

    }else{
      // they might be trying to insert a diacritic here

        // This mode is they press Crtl+e to enter diacritic macro mode, so they did that on the last kedown and now we need to act on the next keystroke and interpret it as a macro code
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
                // this.searchValueLocal = inputV.value

              }else{
                    // inputV.value=inputV.value+useMacro.codeEscape
                    inputV.value = inputV.value.substring(0, insertAt) + useMacro.codeEscape + inputV.value.substring(insertAt);
                    // this.searchValueLocal = inputV.value

              }

              if (insertAt){
                this.$nextTick(()=>{
                  inputV.setSelectionRange(insertAt+1,insertAt+1)
                  // this.searchValueLocal = inputV.value

                  this.$nextTick(()=>{
                    inputV.focus()
                  })

                })
              }else{
                this.$nextTick(()=>{
                  inputV.focus()
                })
              }

              // manually change the v-model var and force a update
              this.$nextTick(() => {
                  this.subjectString = inputV.value
                  this.subjectStringChanged()
                  this.navString({key:'ArrowRight'})
              })


            }
            // turn off mode
            this.nextInputIsVoyagerModeDiacritics  =false
            event.target.style.removeProperty('background-color')
            event.preventDefault()
            return false
        }
        // all macros use the ctrl key
        if (event.ctrlKey == true){
          if (this.diacriticUse.length>0){
            for (let macro of this.diacriticUseValues){
              if (event.code == macro.code && event.ctrlKey == macro.ctrlKey && event.altKey == macro.altKey && event.shiftKey == macro.shiftKey){
                // console.log("run this macro", macro)
                event.preventDefault()
                this.runMacroExpressMacro(event)

                // manually change the v-model var and force a update
                this.$nextTick(() => {
                  this.subjectString = event.target.value
                  this.subjectStringChanged()
                  this.navString({key:'ArrowRight'})
                })
                //

                return false

              }
            }
          }

         // they are entering into voyager diacritic mode
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
    }



  },

  updateAvctiveTypeSelected: function(){
    //set them all false
    for (let k in this.activeTypes){
      this.activeTypes[k].selected=false
    }

    if (this.activeComponent && this.activeComponent.type){
      if (this.activeTypes[this.activeComponent.type]){
        this.activeTypes[this.activeComponent.type].selected=true
      }
    } else if (this.activeComponent.type == null && this.activeComponent.marcKey != null){ //fall back on the marcKey, this can be null if the selection is too fast?
        let subfield = this.activeComponent.marcKey.slice(5, 7)
        switch(subfield){
            case("$v"):
              subfield = "madsrdf:GenreForm"
              break
            case("$y"):
              subfield = "madsrdf:Temporal"
              break
            case("$z"):
              subfield = "madsrdf:Geographic"
              break
            default:
              subfield = "madsrdf:Topic"
        }

        this.activeTypes[subfield].selected=true
        this.activeComponent.type = subfield
    }

  },



  setTypeClick: function(event,type){
    this.typeLookup[this.activeComponentIndex] =type
    this.subjectStringChanged()
    this.$refs.subjectInput.focus()

  },

  renderHintBoxes: function(){
      // wait for the UI to render
      this.$nextTick(() => {
        // loop through the current components
        let activeLeft=0
        for (let com of this.components){
          // set the left
          this.$nextTick(() => {
            if (this.$refs['cBackground'+com.id] && this.$refs['cBackground'+com.id][0]){
              this.$refs['cBackground'+com.id][0].style.left = `${activeLeft}px`
              // add the width of all the existing components to the var
              // add 12 to accomodate the "--" seperator
              activeLeft = activeLeft + this.$refs['cBackground'+com.id][0].offsetWidth + 11
            }
          })
        }
      })

  },

  validateOkayToAdd: function(){
    this.okayToAdd = false
    let allHaveURI = true
    let allHaveType = true

    for (let c of this.components){
      if (!c.uri && !c.literal){
        allHaveURI = false
      }
      if (!c.type){
        allHaveType = false
      }

    }

    if (allHaveURI && allHaveType){
      this.okayToAdd = true
    }
    if (allHaveURI && !allHaveType && this.components.length==1){
      this.okayToAdd = true
    }



  },

  subjectStringChanged: async function(event){
    this.subjectString=this.subjectString.replace("—", "--")
    this.validateOkayToAdd()

    //fake the "click" so the results panel populates
    if (this.initialLoad == true) {
      let pieces = this.$refs.subjectInput.value.replace("—", "--").split("--")
      let lastPiece = pieces.at(-1)
      this.searchApis(lastPiece, this.$refs.subjectInput.value.replace("—", "--"), this)
      this.initialLoad = false
    }

    // they are setting the type, next key inputed is important
    if (event && event.data === '$'){
      this.nextInputIsTypeSelection=true
      return false
    }

    // if the event coming in is the keystroke after a '$' then check to change the type
    if (event && this.nextInputIsTypeSelection){
      if (event.data.toLowerCase()==='a' || event.data.toLowerCase()==='x'){
        this.typeLookup[this.activeComponentIndex] = 'madsrdf:Topic'
        this.subjectString=this.subjectString.replace('$' + event.data,'')
      }
      if (event.data.toLowerCase()==='v'){
        this.typeLookup[this.activeComponentIndex] = 'madsrdf:GenreForm'
        this.subjectString=this.subjectString.replace('$' + event.data,'')
      }
      if (event.data.toLowerCase()==='z'){
        this.typeLookup[this.activeComponentIndex] = 'madsrdf:Geographic'
        this.subjectString=this.subjectString.replace('$' + event.data,'')
      }
      if (event.data.toLowerCase()==='y'){
        this.typeLookup[this.activeComponentIndex] = 'madsrdf:Temporal'
        this.subjectString=this.subjectString.replace('$' + event.data,'')
      }

      this.nextInputIsTypeSelection = false
      this.subjectStringChanged()

    } else {
      // its a normal keystroke not after '$' but check to see if it was a keyboard event
      // if not then event will be null and was just evoked from code, if its a event then they are typeing in a search value, clear out the old
      if (event){
        this.searchResults=null
      }
    }

    this.showTypes=true

    // if they erase everything remove the components
    if (this.subjectString.length==0){
      this.activeComponent = null
      this.activeComponentIndex=0
      this.componetLookup = {}
      this.typeLookup={}
      this.components=[]

      //search for nothing. Otherwise, if the user deletes their search
      // quickly, it will end up searcing on the last letter to be deleted
      this.searchApis("", "", this)
  // Nothing to build/render beyond this point
  this.renderHintBoxes()
  return
    }
    if (!this.subjectString.endsWith("-")){
      this.buildComponents(this.subjectString)
    }

    this.renderHintBoxes()


    // if they are typing in the heading select it as we go
    if (event){

      for (let c of this.components){
        if (event.target.selectionStart >= c.posStart && event.target.selectionStart <= c.posEnd+1){
          this.activeComponent = c
          this.activeComponentIndex = c.id

          // it is not empty
          // it dose not end with "-" so it the '--' typing doesn't trigger
          if (c.label.trim() != '' && !c.label.endsWith('-')){
            this.searchApis(c.label,event.target.value,this)

          // BUT if it ends with a number and - then it is a name with open life dates
          // so do look that one up
          }else if (/[0-9]{4}\??-/.test(c.label)){
            this.searchApis(c.label,event.target.value,this)
          }else if (/,\s[0-9]{4}-/.test(c.label)){
            this.searchApis(c.label,event.target.value,this)
          }
          //            // BUT if it starts with

          break
        }
      }
    }else{

      // if there is no event this was triggered from code
      // so the current active component is the one we need to update with anything changed
      // which would likely be the type if not a keyboard event

      this.activeComponent = this.components[this.activeComponentIndex]


    }

    this.updateAvctiveTypeSelected()

    if (this.components.length==1 && this.components[0].complex){
      this.showTypes=false

    }

    this.validateOkayToAdd()

    this.$nextTick(() => {
      this.checkToolBarHeight()


      // there are some senarios where we can safly assume the type, this is invoked when
      // we want to try that, often delayed after something has been selected

      window.setTimeout(()=>{
        for (let x of this.components){
          if (this.localContextCache[x.uri]){
            if (this.activeComponent.type){
              // don't do anything
            } else {
              if (this.localContextCache[x.uri].nodeMap && this.localContextCache[x.uri].nodeMap['MADS Collection'] && this.localContextCache[x.uri].nodeMap['MADS Collection'].includes('GeographicSubdivisions')){
                x.type = 'madsrdf:Geographic'
              }

              if (this.localContextCache[x.uri].type === 'GenreForm'){
                x.type = 'madsrdf:GenreForm'
              } else if (this.localContextCache[x.uri].type === 'Temporal'){
                x.type = 'madsrdf:Temporal'
              } else if (this.localContextCache[x.uri].type === 'Geographic'){
                x.type = 'madsrdf:Geographic'
              } else if (this.localContextCache[x.uri].type === 'Topic'){
                x.type = 'madsrdf:Topic'
              } else {
                x.type = 'madsrdf:Topic'
              }
            }
          }

        }

        this.updateAvctiveTypeSelected()
        this.validateOkayToAdd()
      },400)
    })

    // if (event === null){
    //   console.log(event)
    // }

  },

  /**
  * Emits the components back to the complex component to add to the system
  * uses this.linkModeResults
  * @return {void}
  */

  addLinkMode: function(){


    let sendResults = []

    // console.log(this.linkModeResults)


    if (this.linkModeResults && this.linkModeResults.resultType && this.linkModeResults.resultType!=='ERROR'){


      if (this.linkModeResults.resultType==='COMPLEX' && this.linkModeResults.hit){
        const mk = this.linkModeResults.hit.extra && this.linkModeResults.hit.extra.marcKeys ? this.linkModeResults.hit.extra.marcKeys[0] : null
        sendResults.push({
          complex: true,
          id: 0,
          label: this.linkModeResults.hit.label,
          literal: false,
          posEnd: 0,
          posStart: 0,
          type:  this.linkModeResults.hit.heading && this.linkModeResults.hit.heading.rdfType ? ('madsrdf:' + this.linkModeResults.hit.heading.rdfType.split('#').pop()) : 'madsrdf:Topic',
          uri: this.linkModeResults.hit.uri,
          marcKey: mk,
          authorized: true
        })

      } else if (this.linkModeResults.resultType==='SIMPLE' && Array.isArray(this.linkModeResults.hit)){
        this.linkModeResults.hit.forEach((v, i) => {
          const rdf = v && v.heading ? v.heading.rdfType : 'http://www.loc.gov/mads/rdf/v1#Topic'
          const type = typeof rdf === 'string' ? rdf.replace('http://www.loc.gov/mads/rdf/v1#','madsrdf:') : 'madsrdf:Topic'
          sendResults.push({
            complex: false,
            id: i,
            label: v.label || '',
            literal: !!v.literal,
            posEnd: 0,
            posStart: 0,
            type,
            uri: v.uri || null,
            marcKey: v.extra && v.extra.marcKeys ? v.extra.marcKeys[0] : null,
            authorized: !!(v.uri && !v.literal)
          })
        })
      } else {
        // Unexpected shape; bail out gracefully
        this.linkModeResults = false
        return
      }




    }

    // console.log("sendResults",sendResults)

    this.$emit('subjectAdded', sendResults)

// depreciated: false
// extra: ""
// heading: Object
//   label: "Woolf, Virginia, 1882-1941"
//   primary: true
//   rdfType: "http://www.loc.gov/mads/rdf/v1#PersonalName"
//   subdivision: false
//   type: "a"
// label: "Woolf, Virginia, 1882-1941"
// literal: false
// suggestLabel: "Woolf, Virginia, 1882-1941"
// uri: "http://id.loc.gov/authorities/names/n79041870"
// vlabel: ""


// -----------

    // console.log("ADDDD")
// complex: false
// id: 2
// label: "20th century"
// literal: false
// posEnd: 47
// posStart: 36
// type: "madsrdf:Temporal"
// uri: "http://id.loc.gov/authorities/subjects/sh2002012476"


// complex: false
// id: 1
// label: "19999"
// literal: true
// posEnd: 29
// posStart: 25
// type: "madsrdf:Temporal"
// uri: null

// complex: true
// id: 0
// label: "Archaeology and history--United States"
// literal: false
// posEnd: 37
// posStart: 0
// type: "madsrdf:Topic"
// uri: "http://id.loc.gov/authorities/subjects/sh2009115324"


  },

  getTypeFromSubfield: function(subfield){
    switch(subfield){
    case("$a"):
      subfield = "madsrdf:Topic"
      break
    case("$x"):
      subfield = "madsrdf:Topic"
      break
    case("$v"):
      subfield = "madsrdf:GenreForm"
      break
    case("$y"):
      subfield = "madsrdf:Temporal"
      break
    case("$z"):
      subfield = "madsrdf:Geographic"
      break
    default:
      subfield = false
    }

    return subfield
  },

  add: async function(){
    console.log('🟢 add() invoked. okayToAdd (initial):', this.okayToAdd, 'components(current):', JSON.parse(JSON.stringify(this.components)))
    // If not okay, try to validate again (reactivity timing safeguard)
    if (!this.okayToAdd && typeof this.validateOkayToAdd === 'function') {
      this.validateOkayToAdd()
      console.log('🔄 Revalidated okayToAdd:', this.okayToAdd)
    }
    // Self-heal: single authoritative component with uri & type should be addable even if flag not yet set
    if (!this.okayToAdd && this.components.length===1) {
      const c0 = this.components[0]
      if (c0 && c0.uri && c0.type) {
        console.log('🩹 Forcing okayToAdd true (single component has uri & type).')
        this.okayToAdd = true
      }
    }
    if (!this.okayToAdd){
      console.warn('⛔ add() aborted after self-heal attempt because okayToAdd is still false.', JSON.parse(JSON.stringify(this.components)))
      return
    }
    // Fallback enrichment for single-component name selections missing uri/type/marcKey
    if (this.components.length===1){
      const c0 = this.components[0]
      // Try to recover a uri from pickLookup/contextData if missing
      if (!c0.uri && this.contextData && this.contextData.uri){
        c0.uri = this.contextData.uri
        console.log('🔄 Filled missing uri from contextData:', c0.uri)
      }
      // Try to recover a marcKey if missing
      if (!c0.marcKey){
        let mk = this.safeGetMarcKeyFrom ? this.safeGetMarcKeyFrom(this.contextData||{}) : null
        if (!mk && this.contextData && Array.isArray(this.contextData.marcKeys)){
          try { mk = this.normalizeMarcKey(this.contextData.marcKeys[0]) } catch {}
        }
        if (mk){
          c0.marcKey = mk
          console.log('🔄 Filled missing marcKey from contextData:', mk)
        }
      }
        // Compare selected pick label (if available) to component label for mismatch diagnostics
        try {
          if (this.pickLookup && this.pickLookup[this.pickPostion] && this.components.length===1) {
            const pickedLabel = this.pickLookup[this.pickPostion].label || this.pickLookup[this.pickPostion].suggestLabel || this.pickLookup[this.pickPostion].aLabel
            const compLabel = this.components[0].label
            if (pickedLabel && compLabel && pickedLabel !== compLabel) {
              console.warn('⚠️ Label mismatch at add(). pickedLabel != compLabel', { pickedLabel, compLabel })
            } else {
              console.log('✅ Label parity at add()', { pickedLabel, compLabel })
            }
          }
        } catch(e){ console.warn('Label parity check failed', e) }
        this.$emit('subjectAdded', this.components)
      if (!c0.type && this.contextData){
        if (this.contextData.rdftypes && this.contextData.rdftypes.length>0){
          c0.type = 'madsrdf:' + this.contextData.rdftypes[0]
          console.log('🔄 Filled missing type from rdftypes:', c0.type)
        } else if (this.contextData.type){
          c0.type = this.contextData.type.startsWith('madsrdf:')? this.contextData.type : this.contextData.type.replace('http://www.loc.gov/mads/rdf/v1#','madsrdf:')
          console.log('🔄 Filled missing type from contextData.type:', c0.type)
        }
      }
    }
    // If we have no components but we have context data (user selected something but didn't build it yet)
    // Build the component first
    if (this.components.length === 0 && this.subjectString && this.subjectString.length > 0) {
      console.log("🔧 Building components from subjectString before adding:", this.subjectString);
      this.buildComponents(this.subjectString);
    }
    
    // If we still have no components, check if we have context data to work with
    if (this.components.length === 0 && Object.keys(this.contextData).length > 0 && this.contextData.title) {
      console.log("🔧 Creating component from contextData:", this.contextData);
      
      // Create a component from the context data
      // Robust title extraction: try multiple fields, fall back to subjectString
      let titleRaw = this.contextData.title || this.contextData.label || this.contextData.authoritativeLabel || this.subjectString || ''
      if (Array.isArray(titleRaw)) {
        // Prefer first @value if object array, else first primitive
        if (titleRaw.length > 0) {
          if (typeof titleRaw[0] === 'object' && titleRaw[0] && '@value' in titleRaw[0]) {
            titleRaw = titleRaw[0]['@value']
          } else {
            titleRaw = titleRaw[0]
          }
        } else {
          titleRaw = ''
        }
      }
      const title = typeof titleRaw === 'string' ? titleRaw : ''
      
      // Ensure we have a proper marcKey - create a default one if missing
      let marcKey = this.contextData.marcKey || '';
      if (!marcKey && this.contextData.rdftypes) {
        // Create a basic marcKey based on the type
        if (this.contextData.rdftypes.includes('Topic')) {
          marcKey = '150  $a' + title;
        } else if (this.contextData.rdftypes.includes('Geographic')) {
          marcKey = '151  $a' + title;
        } else if (this.contextData.rdftypes.includes('PersonalName')) {
          marcKey = '100  $a' + title;
        } else if (this.contextData.rdftypes.includes('GenreForm')) {
          marcKey = '155  $a' + title;
        } else if (this.contextData.rdftypes.includes('Temporal')) {
          marcKey = '148  $a' + title;
        } else {
          marcKey = '150  $a' + title; // Default to Topic
        }
      } else if (!marcKey) {
        // Last resort: create a basic Topic marcKey
        marcKey = '150  $a' + title;
      }
      
      const component = {
        label: title,
        uri: this.contextData.uri || null,
        id: 0,
        type: this.contextData.rdftypes ? (this.contextData.rdftypes.includes('Hub') ? 'madsrdf:Topic' : `madsrdf:${this.contextData.rdftypes[0]}`) : 'madsrdf:Topic',
        complex: false,
        literal: this.contextData.literal || false,
        posStart: 0,
        posEnd: title.length,
        marcKey: marcKey,
      };
      
      this.components.push(component);
      console.log("🔧 Added component:", component);
    }

    //remove any existing thesaurus label, so it has the most current
    //this.profileStore.removeValueSimple(componentGuid, fieldGuid)

    // console.log('this.components',JSON.parse(JSON.stringify(this.components)))
    // remove our werid hyphens before we send it back
    for (let c of this.components){
      if (!c || typeof c !== 'object') { continue }
      if (!c.label || typeof c.label !== 'string') {
        console.warn('⚠️ Component missing valid label; skipping normalization', c)
      } else {
        c.label = c.label.replaceAll('‑','-')
      }
      // we have the full mads type from the build process, check if the component is a id name authortiy
      // if so over write the user defined type with the full type from the authority file so that
      // something like a name becomes a madsrdf:PersonalName instead of madsrdf:Topic
      if (c.uri && c.uri.includes('id.loc.gov/authorities/names/') && this.localContextCache && this.localContextCache[c.uri]){
        const cacheEntry = this.localContextCache[c.uri]
        const rawType = cacheEntry.typeFull ?? cacheEntry.type ?? null
        if (rawType) {
          const normalized = rawType.startsWith('madsrdf:') ? rawType : rawType.replace('http://www.loc.gov/mads/rdf/v1#','madsrdf:')
          if (normalized) {
            if (!Object.keys(this.activeTypes).includes(normalized)){
              c.type = normalized
            }
            if (c.type === 'madsrdf:Topic'){
              c.type = normalized
            }
          }
        } else {
          console.warn('⚠️ Missing typeFull/type in localContextCache for', c.uri, cacheEntry)
        }
      }
    }

    // If the individual components together, match a complex subject, switch'em so the user ends up with a controlled term
    let match = false
    const componentCount = this.components.length
    const componentCheck = this.components.length > 0 ? this.components.map((component) => component.label).join("--") : false
    let componentTypes
    try {
      componentTypes = this.components.length > 0 ? this.components.map((component) => {
        if (component.marcKey && component.marcKey.length > 5) {
          return component.marcKey.slice(5);
        } else {
          console.warn("Component missing or invalid marcKey:", component);
          return "$a" + component.label; // Default fallback
        }
      }).join("") : false
    } catch (err) {
      console.warn("Error building componentTypes:", err);
      componentTypes = false
    }


    for (let el in this.searchResults["subjectsComplex"]){
      let target = this.searchResults["subjectsComplex"][el]
      if (target.label.replaceAll("‑", "-") == componentCheck && target.depreciated == false){
        // we need to check the types of each element to make sure they really are the same terms
        // let targetContext = await utilsNetwork.returnContext(target.uri)
        let targetContext = target.extra

        let marcKey = ""
        if (Array.isArray(targetContext.marcKey) && typeof targetContext.marcKey[0] == 'string'){
          marcKey = targetContext.marcKey[0]
        } else if (targetContext.marcKey){
          marcKey = targetContext.marcKey //[0]["@value"]
        }

        if (marcKey.length > 5 && marcKey.slice(5) == componentTypes){
          //the entire built subject can be replaced by 1 term
          match = true
          this.components.push({
            "complex": target.complex,
            "id": 0,
            "label": target.label,
            "literal": false,
            "posEnd": target.label.length,
            "posStart": 0,
            "type": "madsrdf:Topic",
            "uri": target.uri,
            "marcKey": marcKey
          })
        }
      }
    }

    let newComponents = []

    const frozenComponents = JSON.parse(JSON.stringify(this.components))

    //remove unused components
    if (match){
      Array(componentCount).fill(0).map((i) => this.components.shift())
    }
    else {
		// need to break up the complex heading into it's pieces so their URIs are availble
        let prevItems = 0
        for (let component in frozenComponents){
          // if (this.components[component].complex && !['madsrdf:Geographic', 'madsrdf:HierarchicalGeographic'].includes(this.components[component].type)){
			const target = frozenComponents[component]
      if (!(['madsrdf:Geographic', 'madsrdf:HierarchicalGeographic'].includes(target.type) || (target.uri && target.uri.includes("childrensSubjects/sj"))) && target.complex){
        let uri = target.uri
        let data = false //await this.parseComplexSubject(uri)  //This can take a while, and is only need for the URI, but lots of things don't have URIs
        if (uri){
          data = await this.parseComplexSubject(uri)
        } else {
          data = target
        }
				let subs
        // Add error handling for marcKey
        if (!target.marcKey) {
          console.warn("target.marcKey is undefined for:", target);
          continue; // Skip this component if no marcKey
        }
				subs = target.marcKey.slice(5)
			    // subfields = subfields.match(/\$./g)
			    subs = subs.match(/\$[axyzv]{1}/g)
				const complexLabel = target.label
				// build the new components
				let id = prevItems
				let labels = complexLabel.split("--")
				for (let idx in labels){
				  let subfield
				  if (data){
				    subfield = data["subfields"][idx]
				  } else if (target.marcKey){
            // Add error handling for marcKey
            if (target.marcKey.length > 5) {
					    let marcKey = target.marcKey.slice(5)
					    subfield = marcKey.match(/\$[axyzv]{1}/g)
					    subfield = subfield[idx]
            } else {
              console.warn("target.marcKey too short:", target.marcKey);
              subfield = "$a"; // Default subfield
            }
				  }

				subfield = this.getTypeFromSubfield(subfield)

				  // Override the subfield of the first element based on the marc tag
          let tag = ""
          if (target.marcKey && target.marcKey.length >= 3) {
            tag = target.marcKey.slice(0,3)
          } else {
            tag = "150" // Default to Topic tag
          }
				  if (idx == 0){
					  switch(tag){
						  case "151":
							subfield = "madsrdf:Geographic"
							break
						  case "100":
							subfield = "madsrdf:PersonalName"
							break
						  default:
							subfield = "madsrdf:Topic"
					  }
				  }

				  // make a marcKey for the component
				  // We've got the label, subfield and the tag for the first element
				  let sub
				  if (data) {
					sub = data["subfields"][idx]
				  } else {
					  sub = subs[idx]
				  }
				  if (idx == 0){
					  tag = tag
				  } else {
					  // build the tag from the subfield
					  switch(sub){
						case("$v"):
						  tag = "185"
						  break
						case("$y"):
						  tag = "182"
						  break
						case("$z"):
						  tag = "181"
						  break
						default:
						  tag = "180"
					  }
				  }
				  let marcKey = tag + "  " + sub + labels[idx]

				  newComponents.splice(id, 0, ({
					"complex": false,
					"id": id,
					"label": labels[idx],
					"literal": false,
					"posEnd": labels[idx].length,
					"posStart": 0,
					"type": subfield,
					"uri": data && data["components"] && data["components"][0]["@list"][id]["@id"].startsWith("http") ? data["components"][0]["@list"][id]["@id"] : "",
					"marcKey": marcKey,
          "fromComplex": true,
          "complexMarcKey": target.marcKey
				  }))
				  id++
				  prevItems++
				}

			} else {
				newComponents.push(target)
				prevItems++
			}
		}
	}


    if (newComponents.length > 0){
      this.components = newComponents
    }
  console.log('📤 Emitting subjectAdded with components:', JSON.parse(JSON.stringify(this.components)))
  this.$emit('subjectAdded', this.components)
  console.log('✅ add() complete / event emitted')
  },


  closeEditor: function(){
    //after closing always open in `build` mode
    this.subjectEditorMode = "build"

	//clear out the components and related field so things will start clean if it reopened
	this.cleanState()

    this.$emit('hideSubjectModal', true)
  },

  checkToolBarHeight: function(){
    // also check to see if the toolbar is off the screen,
    // in very very low res setups sometimes this area gets clipped
    if (this.$refs.toolbar && this.$refs.toolbar.getBoundingClientRect().bottom > window.innerHeight){
      this.lowResMode=true
      this.$emit('lowResModeActivate', true)
    }
  },

  cleanState: function(){
    this.searchMode = "LCSHNAF"
    this.components= []
    this.lookup= {}
    this.searchResults= null
    this.activeSearch= false
    this.pickPostion= 0
    this.pickLookup= {}
    this.activeComponent= null
    this.oldActiveComponent= null
    this.activeComponentIndex=0
    this.oldActiveComponentIndex= 99
    this.contextRequestInProgress= false
    this.componetLookup= {}
    this.nextInputIsTypeSelection=false
    this.typeLookup={}
    this.okayToAdd= false
    this.showTypes= false

	this.contextData = {nodeMap:{}}
	this.authorityLookupLocal = null,
    this.subjectString = ''

  },


  loadUserValue: function(userValue){
    // reset things if they might be opening this again for some reason
    this.cleanState()


    if (!userValue){
      return
    }


    if (typeof userValue == "string"){


      // they sometimes come in with '.' at the end of the authorized form.
      if (userValue.slice(-1)=='.'){
        userValue=userValue.slice(0,-1)
      }
      this.subjectString=userValue
      this.linkModeString=userValue
      this.$nextTick(() => {
        this.navString({key:'ArrowRight'})
      })


      return
    }

    // if they just passed a string they are typing a new one not editing
    // if (typeof userValue == "string"){
    //   this.subjectString=userValue
    //   return
    // }


    if (userValue['http://id.loc.gov/ontologies/bibframe/subject'] && userValue['http://id.loc.gov/ontologies/bibframe/subject'][0]){
      userValue = userValue['http://id.loc.gov/ontologies/bibframe/subject'][0]
    }


    let completeLabel = null

      // does it have a component list?
      let linkModeValue = ""

      if (userValue['http://www.loc.gov/mads/rdf/v1#componentList']){

        let authLabels = []

        let componentLabelParts = []

        // if there is a complex heading string use that as a backup for labels if needed
        if (userValue['http://www.w3.org/2000/01/rdf-schema#label']){
          if (userValue['http://www.w3.org/2000/01/rdf-schema#label'].length>0){
            authLabels = userValue['http://www.w3.org/2000/01/rdf-schema#label'][0]['http://www.w3.org/2000/01/rdf-schema#label'].split('--')
            completeLabel = userValue['http://www.w3.org/2000/01/rdf-schema#label'][0]['http://www.w3.org/2000/01/rdf-schema#label']
          }
        }else if (userValue['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']){
          if (userValue['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'].length>0){
            authLabels = userValue['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'].split('--')
            completeLabel = userValue['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']
          }
        }



        let id = 0
        let activePosStart = 0


        for (let component of userValue['http://www.loc.gov/mads/rdf/v1#componentList']){

          let label = ''
          let uri = null
          let type = null
          let marcType = ''
          let literal = false




          // does it have a URI
          if (component['@id']){
            uri = component['@id']
          }else{

            // we can't assume it is a literal, it might just be a label without no uri
            // they need to check it
            // literal = true
          }

          if (component['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'] && component['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'].length>0){
            if (component['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']){
              label = component['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']
            }
          }else if (component['http://www.w3.org/2000/01/rdf-schema#label'] && component['http://www.w3.org/2000/01/rdf-schema#label'].length>0){
            if (component['http://www.w3.org/2000/01/rdf-schema#label'][0]['http://www.w3.org/2000/01/rdf-schema#label']){
              label = component['http://www.w3.org/2000/01/rdf-schema#label'][0]['http://www.w3.org/2000/01/rdf-schema#label']
            }
          }


          if (component['@type']){

            if (component['@type']=='http://www.loc.gov/mads/rdf/v1#Geographic'){
              type = 'madsrdf:Geographic'
              marcType = 'z'
            }
            if (component['@type']=='http://www.loc.gov/mads/rdf/v1#Topic'){
              type = 'madsrdf:Topic'
              // main topical or subivision if not the first one
              marcType = 'a'
              if (id>0){
                marcType = 'x'
              }
            }
            if (component['@type']=='http://www.loc.gov/mads/rdf/v1#GenreForm'){
              type = 'madsrdf:GenreForm'
              marcType = 'v'
            }
            if (component['@type']=='http://www.loc.gov/mads/rdf/v1#Temporal'){
              type = 'madsrdf:Temporal'
              marcType = 'y'
            }

          }


          if (label == '' && authLabels[id]){

            label = authLabels[id]
          }


          linkModeValue = linkModeValue + '$' + marcType + label
          let toAdd = {
            label: label,
            uri: uri,
            id: id,
            type:type,
            complex: label.includes('‑‑'),
            literal:literal,
            posStart: activePosStart,
            posEnd: activePosStart + label.length - 1,
          }

          componentLabelParts.push(label)

          this.components.push(toAdd)

          if (!this.componetLookup[id]){
            this.componetLookup[id]={}
          }

          if (type){
            this.typeLookup[id]=type
          }

          this.componetLookup[id][label] = toAdd

          activePosStart = activePosStart + label.length + 2

          id++

        }




        completeLabel = componentLabelParts.join('--')





      }else{

        if (userValue['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']){
          completeLabel = userValue['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']
        }else if(userValue['http://www.w3.org/2000/01/rdf-schema#label']){
          completeLabel = userValue['http://www.w3.org/2000/01/rdf-schema#label'][0]['http://www.w3.org/2000/01/rdf-schema#label']
        }


        // if it has a trailing '.' in the auth heading drop that for search
        if (completeLabel.slice(-1)=='.'){
          completeLabel=completeLabel.slice(0,-1)
        }

        linkModeValue = '$a' + completeLabel



      }



      // console.log("linkModeValue",linkModeValue)


      this.linkModeString=linkModeValue

      this.subjectString=completeLabel

      this.subjectStringChanged()
      this.updateAvctiveTypeSelected()

      // wait for the ui to render and then pretend keydonw to trigger update of things
      this.$nextTick(() => {
        this.navString({key:'ArrowRight'})

      })

  }




},

created: function () {
  this.loadUserValue()
},

before: function () {},
mounted: function(){},


updated: function() {
  // preselect the search type, if a children's subject
  if (this.searchType.includes("Childrens")){
    this.searchMode = "CHILD"
  } else {
    this.searchMode = "LCSHNAF"
  }
  // this was opened from an existing subject
  let profileData = this.profileData

  let incomingSubjects

  if (profileData && profileData.propertyLabel != "Subjects"){
    incomingSubjects = false
  } else if (profileData) {
    try {
      if (
            profileData["userValue"]["http://id.loc.gov/ontologies/bibframe/subject"][0]["http://www.loc.gov/mads/rdf/v1#componentList"]
            && !profileData["userValue"]["http://id.loc.gov/ontologies/bflc/marcKey"]
      ){
        incomingSubjects = profileData["userValue"]["http://id.loc.gov/ontologies/bibframe/subject"][0]["http://www.loc.gov/mads/rdf/v1#componentList"]
      } else {
          incomingSubjects = profileData["userValue"]["http://id.loc.gov/ontologies/bibframe/subject"][0]
      }
    } catch(err){
      incomingSubjects = false
    }
  }

  let searchValue = this.searchValue
  if (!searchValue){ return }
  searchValue = (searchValue || '').replace("—", "--")

  //When there is existing data, we need to make sure that the number of components matches
  // the number subjects in the searchValue
  if (searchValue && this.components.length != searchValue.split("--").length && !searchValue.endsWith('-')){
    this.buildLookupComponents(incomingSubjects)
    this.buildComponents(searchValue)

    this.initialLoad = false
    this.subjectStringChanged()
    this.activeComponentIndex = 0
    this.activeComponent = this.components[this.activeComponentIndex]
  }

  // this supports loading existing information into the forms
  if (this.authorityLookup != null) {
    this.authorityLookupLocal = this.authorityLookup.replace("—", "--")
    this.subjectInput = this.authorityLookupLocal
    this.linkModeString = this.authorityLookupLocal
    try {
      //Performs the search for linkmode
      this.linkModeTextChange({key:'Enter',shiftKey:false})

  //Do the search for build mode (do not assign; debounced async updates searchResults internally)
  this.searchApis(this.components[0].label, this.authorityLookupLocal, this)

      //Wait for the search results
      this.searching = true
      setTimeout(() => {
            //Make sure the search result that matche
            let list = null
            if (this.searchResults != null){
              if (this.isLiteral) {
                list = this.searchResults.subjectsSimple
              } else {
                list = this.searchResults.subjectsComplex
              }
            }

            //Select the context that matches the incoming value
            for (const pos in list){
              let label = list[pos].label ?? list[pos].suggestLabel ?? ''
              if (this.authorityLookupLocal && label.replace(/\W/g, ' ') == this.authorityLookupLocal.replace(/\W/g, ' ')){
                try{
                  let idx = 0
                  if (this.isLiteral == true) {
                    idx = this.searchResults.subjectsComplex.length + Number(pos)
                  } else {
                    idx = pos
                  }
                  if (!this.fromPaste){
                    this.selectContext(idx, false)
                    this.validateOkayToAdd()
                  }
                } catch(err) {
                  console.error(err)
                }
                break
              }
            }

          }, (2 * 1000)
      )
    this.searching = false
    } catch(err) {
      console.log("Error: ", err)
    }

    this.renderHintBoxes()
    //this.subjectStringChanged()
    //this.validateOkayToAdd()
  }
}
};
</script>
