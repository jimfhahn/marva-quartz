<template>
  <div class="search-results" v-if="searchResults">
    <!-- Debug info - only show counts, not raw data -->
    <div v-if="showDebugInfo" class="debug-info">
      🔍 Debug: searchResults exists - Simple: {{subjectsSimple.length}}, Complex: {{subjectsComplex.length}}, Names: {{names.length}}
    </div>

    <!-- Subject Simple Results -->
    <div v-if="subjectsSimple && subjectsSimple.length > 0" class="subject-section">
      <h3>Subject Headings</h3>
      <div class="scrollable-subjects" :class="containerClass">
        <SearchResultOption
          v-for="(result, index) in subjectsSimple"
          :key="'simple-' + index"
          :result="result"
          :searchType="'subjectsSimple'"
          @selectContext="selectContext"
          @selectSubject="selectSubject"
          @emitLoadContext="emitLoadContext"
        />
      </div>
    </div>

    <!-- Subject Complex Results -->
    <div v-if="subjectsComplex && subjectsComplex.length > 0" class="subject-section">
      <h3>Subject Headings (Complex)</h3>
      <div class="scrollable-subjects" :class="containerClass">
        <SearchResultOption
          v-for="(result, index) in subjectsComplex"
          :key="'complex-' + index"
          :result="result"
          :searchType="'subjectsComplex'"
          @selectContext="selectContext"
          @selectSubject="selectSubject"
          @emitLoadContext="emitLoadContext"
        />
      </div>
    </div>

    <!-- Names Results -->
    <div v-if="names && names.length > 0" class="subject-section">
      <h3>Name Headings</h3>
      <div class="scrollable-subjects" :class="containerClass">
        <SearchResultOption
          v-for="(result, index) in names"
          :key="'names-' + index"
          :result="result"
          :searchType="'names'"
          @selectContext="selectContext"
          @selectSubject="selectSubject"
          @emitLoadContext="emitLoadContext"
        />
      </div>
    </div>

    <!-- Subject Children Results -->
    <div v-if="subjectsChildren && subjectsChildren.length > 0" class="subject-section">
      <h3>Children's Subject Headings</h3>
      <div class="scrollable-subjects" :class="containerClass">
        <SearchResultOption
          v-for="(result, index) in subjectsChildren"
          :key="'children-' + index"
          :result="result"
          :searchType="'subjectsChildren'"
          @selectContext="selectContext"
          @selectSubject="selectSubject"
          @emitLoadContext="emitLoadContext"
        />
      </div>
    </div>

    <!-- No Results Message -->
    <div v-if="!hasAnyResults" class="no-results">
      No results found
    </div>
  </div>
</template>

<script>
import { usePreferenceStore } from '@/stores/preference'
import { useProfileStore } from '@/stores/profile'
import { useConfigStore } from '@/stores/config'
import { mapStores, mapState, mapWritableState } from 'pinia'
import { VueFinalModal } from 'vue-final-modal'
import short from 'short-uuid'

import AuthTypeIcon from "@/components/panels/edit/fields/helpers/AuthTypeIcon.vue";

import utilsNetwork from '@/lib/utils_network';

import { AccordionList, AccordionItem } from "vue3-rich-accordion";
import SearchResultOption from './SearchResultOption.vue'

const debounce = (callback, wait) => {
    let timeoutId = null;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        callback.apply(null, args);
      }, wait);
    };
}

export default {
    name: "ComplexSearchResultsDisplay",
    components: {
        SearchResultOption
    },
    props: {
        searchMode: String,
        searchResults: Object
    },

    computed: {
        ...mapStores(useConfigStore, usePreferenceStore, useProfileStore),
        
        showDebugInfo() {
            return false; // Turn off debug info that was showing raw JSON
        },
        
        subjectsSimple() {
            // Access the actual array from the searchResults object
            return this.searchResults?.subjectsSimple || [];
        },
        
        subjectsComplex() {
            // Access the actual array from the searchResults object
            return this.searchResults?.subjectsComplex || [];
        },
        
        names() {
            // Access the actual array from the searchResults object
            return this.searchResults?.names || [];
        },
        
        subjectsChildren() {
            // Access the actual array from the searchResults object
            return this.searchResults?.subjectsChildren || [];
        },
        
        hasAnyResults() {
            return (this.subjectsSimple.length > 0) ||
                   (this.subjectsComplex.length > 0) ||
                   (this.names.length > 0) ||
                   (this.subjectsChildren.length > 0);
        },
        
        containerClass() {
            const totalResults = (this.subjectsSimple?.length || 0) + 
                               (this.subjectsComplex?.length || 0) + 
                               (this.names?.length || 0) +
                               (this.subjectsChildren?.length || 0);
                               
            if (totalResults <= 5) return 'small-container';
            if (totalResults <= 10) return 'medium-container';
            return 'large-container';
        }
    },

    watch: {
        searchResults: {
            handler(newVal) {
                console.log('ComplexSearchResultsDisplay received new results:', newVal);
                if (newVal) {
                    console.log('- subjectsSimple:', newVal.subjectsSimple?.length || 0);
                    console.log('- subjectsComplex:', newVal.subjectsComplex?.length || 0);
                    console.log('- names:', newVal.names?.length || 0);
                }
            },
            deep: true
        }
    },

    methods: {
        selectContext: function(data) {
            console.log('ComplexSearchResultsDisplay - selectContext:', data);
            this.$emit('selectContext', data);
        },
        
        selectSubject: function(data) {
            console.log('ComplexSearchResultsDisplay - selectSubject:', data);
            this.$emit('selectSubject', data);
        },
        
        emitLoadContext: function(result) {
            console.log('🔍 ComplexSearchResultsDisplay - emitLoadContext received:', result);
            console.log('🔍 Result details - URI:', result.uri, 'Label:', result.label);
            console.log('🔍 Result properties:', Object.keys(result));
            console.log('🔍 Full result object:', JSON.stringify(result, null, 2));
            
            // Debug: Log what's in each array
            console.log('🔍 subjectsComplex length:', this.subjectsComplex.length);
            console.log('🔍 subjectsChildrenComplex length:', this.searchResults?.subjectsChildrenComplex?.length || 0);
            console.log('🔍 subjectsSimple length:', this.subjectsSimple.length);
            console.log('🔍 subjectsChildren length:', this.searchResults?.subjectsChildren?.length || 0);
            
            // Log a few sample items from each array
            if (this.subjectsComplex.length > 0) {
                console.log('🔍 Sample subjectsComplex[0]:', this.subjectsComplex[0]);
                console.log('🔍 Sample subjectsComplex[0] properties:', Object.keys(this.subjectsComplex[0]));
            }
            if (this.subjectsSimple.length > 0) {
                console.log('🔍 Sample subjectsSimple[0]:', this.subjectsSimple[0]);
                console.log('🔍 Sample subjectsSimple[0] properties:', Object.keys(this.subjectsSimple[0]));
            }
            
            // Find the position of this result by searching through all result arrays
            let position = null;
            
            // Create a flat array of all results to search through - INCLUDING names and exact arrays
            const allResults = [
                ...this.subjectsComplex,
                ...(this.searchResults?.subjectsChildrenComplex || []),
                ...this.subjectsSimple,
                ...(this.searchResults?.subjectsChildren || [])
            ];
            
            // Also need to check names and exact arrays which have negative positions
            const namesResults = this.searchResults?.names || [];
            const exactResults = this.searchResults?.exact || [];
            
            console.log('🔍 Total allResults length:', allResults.length);
            console.log('🔍 Names results length:', namesResults.length);
            console.log('🔍 Exact results length:', exactResults.length);
            
            // First try to find in the positive-position arrays
            position = allResults.findIndex((item, index) => {
                console.log(`🔍 Comparing result URI: "${result.uri}" with item[${index}] URI: "${item.uri}"`);
                if (item.uri === result.uri) {
                    console.log('🔍 Found URI match at position', index, 'with item:', item);
                    return true;
                }
                return false;
            });
            
            // If not found in positive arrays, check names array (negative positions)
            if (position === -1) {
                const namesIndex = namesResults.findIndex((item, index) => {
                    console.log(`🔍 Comparing result URI: "${result.uri}" with names[${index}] URI: "${item.uri}"`);
                    if (item.uri === result.uri) {
                        console.log('🔍 Found URI match in names at index', index, 'with item:', item);
                        return true;
                    }
                    return false;
                });
                
                if (namesIndex !== -1) {
                    // Names use negative positions: (names.length - index) * -1
                    position = (namesResults.length - namesIndex) * -1;
                    console.log('🔍 Calculated negative position for names:', position);
                }
            }
            
            // If still not found, check exact array (even more negative positions)
            if (position === -1) {
                const exactIndex = exactResults.findIndex((item, index) => {
                    console.log(`🔍 Comparing result URI: "${result.uri}" with exact[${index}] URI: "${item.uri}"`);
                    if (item.uri === result.uri) {
                        console.log('🔍 Found URI match in exact at index', index, 'with item:', item);
                        return true;
                    }
                    return false;
                });
                
                if (exactIndex !== -1) {
                    // Exact uses even more negative positions: (names.length - index) * -1 - 2
                    position = (namesResults.length - exactIndex) * -1 - 2;
                    console.log('🔍 Calculated negative position for exact:', position);
                }
            }
            
            console.log('🔍 Found position for hover:', position);
            if (position !== -1) {
                this.$emit('loadContext', position);
            } else {
                console.warn('🔍 Could not find result in allResults array');
            }
        }
    },

    data: function () {
        return {
            
        }
    },

}
</script>

<style scoped>
.subject-section {
    margin-bottom: 1em;
}

.subject-section h3 {
    margin: 0.5em 0;
    font-size: 1.1em;
    color: #333;
}

.scrollable-subjects {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 0.5em;
    background: #fafafa;
}

.small-container {
    max-height: 150px;
}

.medium-container {
    max-height: 250px;
}

.large-container {
    max-height: 400px;
}

/* document.documentElement.clientHeight */
.scroll-all {
    max-height: 85vh;
    overflow-y: auto;
}

.subject-container-outer {
    padding: 1em;
}

.subject-variant {
    font-style: italic;
    color: #666;
}

.from-rda,
.from-auth {
    color: #666;
    font-size: 0.9em;
}

.unusable {
    opacity: 0.5;
    cursor: not-allowed;
}

.fake-option {
    padding: 0.5em;
    cursor: pointer;
    border-bottom: 1px solid #eee;
}

.fake-option:hover {
    background-color: #e8f4f8;
}

.literal-option {
    font-style: italic;
    color: #666;
}

.unselected::before {
    content: "○ ";
}

.selected {
    background-color: #e8f4f8;
}

.selected::before {
    content: "● ";
    color: #007bff;
}

.picked {
    background-color: #d4edda;
}

.picked::before {
    content: "✓ ";
    color: #28a745;
}

.search-results {
    padding: 1em;
}

.no-results {
    text-align: center;
    padding: 2em;
    color: #666;
}

.debug-info {
    background: #f0f0f0;
    padding: 0.5em;
    margin-bottom: 1em;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.9em;
}
</style>