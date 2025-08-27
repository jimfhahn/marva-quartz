<template>
    <div 
        @click="handleClick"
        @mouseover="setPickPosition"
        @mouseleave="clearPickPosition"
        :class="['fake-option', {
            'not-usable': !isUsable, 
            'literal-option': result.literal,
            'selected': isSelected,
            'picked': isPicked
        }]"
    >
        <!-- Main label -->
        <span class='label' v-if="displayLabel && displayLabel.length > 100">
            {{ displayLabel.substring(0, 100) }}...
        </span>
        <span class='label' v-else-if="result.literal">
            {{ displayLabel }} [Literal]
        </span>
        <span v-else class="label">{{ displayLabel }}</span>
        
        <!-- Additional type indicators -->
        <span v-if="searchType === 'names'"> [LCNAF]</span>
        
        <!-- Collections info -->
        <span v-if="result.collections || result.more?.collections">
            {{ buildAddtionalInfo(result.collections || result.more?.collections) }}
            <span class="from-auth" v-if="checkFromAuth(result)"> (Auth)</span>
            <span class="from-rda" v-if="checkFromRda(result)"> [RDA]</span>
            <span v-if="result.count && result.count > 0" class="usage-count">
                [{{ result.count }}]
            </span>
        </span>
        
        <!-- May subdivide geographically icon -->
        <div class="may-sub-container" style="display: inline;">
            <AuthTypeIcon
                v-if="(result.collections || result.more?.collections || []).includes('http://id.loc.gov/authorities/subjects/collection_SubdivideGeographically')"
                :type="'may subd geog'"
            />
        </div>
    </div>
</template>

<script>

import { usePreferenceStore } from '@/stores/preference'
import { mapStores } from 'pinia'
import AuthTypeIcon from "@/components/panels/edit/fields/helpers/AuthTypeIcon.vue";

export default {
    name: "SearchResultOption",
    components: {
        AuthTypeIcon,
    },
    props: {
        result: {
            type: Object,
            required: true
        },
        searchType: {
            type: String,
            default: ''
        }
    },

    data: function () {
        return {
            isSelected: false,
            isPicked: false
        }
    },

    computed: {
        ...mapStores(usePreferenceStore),
        
        displayLabel() {
            // Handle different label properties that might exist
            return this.result.suggestLabel || 
                   this.result.aLabel || 
                   this.result.label || 
                   this.result.authLabel || 
                   '[No label]';
        },
        
        isUsable() {
            return this.checkIsUsable(this.result);
        }
    },

    methods: {
        handleClick: function() {
            if (!this.isUsable) return;
            
            console.log('🎯 SearchResultOption clicked:', this.displayLabel, 'Type:', this.searchType);
            
            // Check if this is a subject type search
            if (this.searchType.includes('subjects') || this.searchType.includes('Children')) {
                console.log('📤 Emitting selectSubject event');
                this.$emit('selectSubject', {
                    label: this.displayLabel,
                    uri: this.result.uri,
                    type: this.result.type || this.result.more?.rdftypes?.[0] || 'Topic',
                    literal: this.result.literal || false,
                    aLabel: this.result.aLabel,
                    vLabel: this.result.vLabel,
                    suggestLabel: this.result.suggestLabel,
                    marcKeys: this.result.marcKeys || this.result.more?.marcKeys || [],
                    result: this.result
                });
            } else {
                // For non-subject types (names, etc.)
                console.log('📤 Emitting selectContext event');
                this.$emit('selectContext', this.result);
            }
        },
        
        setPickPosition: function () {
            this.isSelected = true;
            this.$emit('emitLoadContext', this.result);
        },
        
        clearPickPosition: function () {
            this.isSelected = false;
        },
        
        checkFromRda: function (data) {
            let notes = data.more?.notes || data.extra?.notes || [];
            for (let note of notes) {
                if (note.includes("$erda")) {
                    return this.isUsable;
                }
            }
            return false;
        },
        
        checkFromAuth: function (data) {
            let identifiers = data.more?.identifiers || data.extra?.identifiers || [];
            let looksLikeLccn = identifiers.some(i => i.startsWith("n"));
            return looksLikeLccn && this.isUsable;
        },
        
        checkIsUsable: function(data) {
            let notes = data.more?.notes || data.extra?.notes || [];
            let needsUpdate = notes.some(note => note.includes("CANNOT BE USED"));
            return !needsUpdate;
        },
        
        buildAddtionalInfo: function (collections) {
            if (!collections) return " ";
            
            let out = [];
            if (collections.includes("http://id.loc.gov/authorities/subjects/collection_LCSHAuthorizedHeadings") || 
                collections.includes("http://id.loc.gov/authorities/names/collection_NamesAuthorizedHeadings")) {
                out.push(" (Auth Hd)");
            } else if (collections.includes("http://id.loc.gov/authorities/subjects/collection_GenreFormSubdivisions")) {
                out.push(" (GnFrm)");
            } else if (collections.includes("http://id.loc.gov/authorities/subjects/collection_GeographicSubdivisions")) {
                out.push(" (GeoSubDiv)");
            } else if (collections.includes("http://id.loc.gov/authorities/subjects/collection_LCSH_Childrens")) {
                out.push(" (ChldSubj)");
            } else if (collections.includes("http://id.loc.gov/authorities/subjects/collection_Subdivisions")) {
                out.push(" (SubDiv)");
            }

            // favor SubDiv over GnFrm
            if (out.includes("(GnFrm)") && collections.includes("http://id.loc.gov/authorities/subjects/collection_Subdivisions")) {
                out = [" (SubDiv)"];
            }

            return out.join(" ");
        }
    }
}
</script>

<style scoped>
.fake-option {
    padding: 0.5em 1em;
    cursor: pointer;
    border-bottom: 1px solid #eee;
    transition: background-color 0.2s;
    position: relative;
}

.fake-option:hover {
    background-color: #e8f4f8;
}

.fake-option.not-usable {
    opacity: 0.5;
    cursor: not-allowed;
    color: #999;
}

.fake-option.not-usable .label {
    text-decoration: line-through;
}

.label {
    font-weight: normal;
}

.literal-option .label {
    font-style: italic;
    color: #666;
}

.picked .label {
    font-weight: bold;
}

.fake-option:not(.selected):not(.picked)::before {
    content: "○ ";
    color: #ccc;
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

.usage-count {
    color: #666;
    font-size: 0.9em;
}

.from-auth,
.from-rda {
    color: #666;
    font-size: 0.9em;
}

.may-sub-container {
    display: inline-block;
    vertical-align: middle;
    margin-left: 0.5em;
}

.subject-results-heading {
    font-weight: bold;
    display: block;
    margin-bottom: 0.5em;
}

.small-container {
    height: 33%;
}

.medium-container {
    height: 50%;
}

.large-container {
    height: 90%;
}
</style>