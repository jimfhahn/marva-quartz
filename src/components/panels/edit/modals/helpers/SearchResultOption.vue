<template>
    <div v-if="hasResults" class="subject-section"
        :class="{ 'scrollable-subjects': preferenceStore.returnValue('--b-edit-complex-scroll-independently'), 'small-container': this.numPopulatedResults() == 3 && preferenceStore.returnValue('--b-edit-complex-scroll-independently'), 'medium-container': this.numPopulatedResults() == 2 && preferenceStore.returnValue('--b-edit-complex-scroll-independently'), 'large-container': this.numPopulatedResults() == 1 && preferenceStore.returnValue('--b-edit-complex-scroll-independently') }">
        <span class="subject-results-heading">{{ label }}</span>
        <div v-for="(value, ix) in safeResults" @click="$emit('selectContext', calculateIndex(ix))"
            @mouseover="setPickPosition(calculateIndex(ix))" :data-id="calculateIndex(ix)" :key="value.uri || ix"
            :class="['fake-option', {'not-usable': !checkIsUsable(value), 'unselected': (pickPostion != calculateIndex(ix)), 'selected': (pickPostion == calculateIndex(ix)), 'picked': (pickLookup[calculateIndex(ix)] && pickLookup[calculateIndex(ix)].picked) }]">
            <span class='label' v-if="displayLabel(value).length > 100">{{ displayLabel(value).substring(0, 100)
            }}...</span>
            <span class='label' v-else>{{ displayLabel(value) }}</span>
            <span v-if="searchType == 'names'"> [LCNAF]</span>
            <span v-if="Array.isArray(value.collections) && value.collections.length">
                {{ buildAddtionalInfo(value.collections) }}
                <span class="from-auth" v-if="checkFromAuth(value)"> (Auth)</span>
                <span class="from-rda" v-if="checkFromRda(value)"> [RDA]</span>
                <span v-if="typeof value.count === 'number' && value.count > 0" class="usage-count">
                    {{ buildCount(value) }}
                </span>
            </span>
            <div class="may-sub-container" style="display: inline;">
                <AuthTypeIcon
                    v-if="value.collections && value.collections.includes('http://id.loc.gov/authorities/subjects/collection_SubdivideGeographically')"
                    :type="'may subd geog'"></AuthTypeIcon>
            </div>
        </div>
    </div>
</template>

<script>

import { usePreferenceStore } from '@/stores/preference'
import { useProfileStore } from '@/stores/profile'
import { mapStores, mapState, mapWritableState } from 'pinia'

import AuthTypeIcon from "@/components/panels/edit/fields/helpers/AuthTypeIcon.vue";


export default {
    name: "SubjectEditor2",
    components: {
        AuthTypeIcon,
    },
    props: {
        searchType: String,
        label: String,
        index: String,
        searchResults: Object,
        pickLookup: Object

    },

    watch: {},

    data: function () {
        return {
            pickPostion: 0,
        }
    },

    computed: {
        ...mapStores(usePreferenceStore),
        ...mapState(usePreferenceStore, ['diacriticUseValues', 'diacriticUse', 'diacriticPacks']),
        ...mapState(useProfileStore, ['returnComponentByPropertyLabel']),
        ...mapWritableState(useProfileStore, ['activeProfile', 'setValueLiteral', 'subjectEditor2']),
        hasResults () {
            return Array.isArray(this.searchResults?.[this.searchType]) && this.searchResults[this.searchType].length > 0
        },
        safeResults () {
            return Array.isArray(this.searchResults?.[this.searchType]) ? this.searchResults[this.searchType] : []
        }
    },

    methods: {
        checkFromRda: function (data) {
            if (!data || typeof data !== 'object') return false
            const extra = data.extra || {}
            const notes = Array.isArray(extra.notes) ? extra.notes : []
            let isRda = false

            for (let note of notes) {
                if (note.includes("$erda")) {
                    isRda = true
                }
            }

            return isRda && this.checkIsUsable(data)
        },
        checkFromAuth: function (data) {
            if (!data || typeof data !== 'object') return false
            const extra = data.extra || {}
            const identifiers = Array.isArray(extra.identifiers) ? extra.identifiers : []
            let looksLikeLccn = identifiers.some((i) => typeof i === 'string' && i.startsWith("n"))
            return looksLikeLccn && this.checkIsUsable(data)
        },
        checkIsUsable: function(data) {
            if (!data || typeof data !== 'object') return false
            const extra = data.extra || {}
            const notes = Array.isArray(extra.notes) ? extra.notes : []
            
            // Check for forbidden usage notes
            const hasForbiddenNotes = notes.some((note) => {
                if (typeof note !== 'string') return false
                const lowerNote = note.toLowerCase()
                return lowerNote.includes("cannot be used") || 
                       lowerNote.includes("record generated for validation purposes") ||
                       lowerNote.includes("deprecated")
            })
            
            console.log('🔍 checkIsUsable for', data.suggestLabel || data.label, ':', !hasForbiddenNotes, 'notes:', notes)
            return !hasForbiddenNotes
        },
        displayLabel(value) {
            if (!value || typeof value !== 'object') return ''
            if (value.literal && typeof value.label === 'string' && value.label.trim().length) {
                return `${value.label} [Literal]`
            }
            const label = value.suggestLabel ?? value.label ?? value.vlabel ?? value.aLabel ?? ''
            return typeof label === 'string' ? label : ''
        },
        calculateIndex: function (i) {
            if (!this.index || typeof this.index !== 'string') {
                return i
            }
            const expression = this.index.replace('ix', i)
            try {
                // eslint-disable-next-line no-new-func
                const evaluator = new Function('searchResults', `return ${expression}`)
                return evaluator(this.searchResults)
            } catch (err) {
                console.warn('calculateIndex fallback for expression', expression, err)
                return i
            }
        },
        numPopulatedResults: function () {
            let count = 0
            if (!this.searchResults || typeof this.searchResults !== 'object') {
                return count
            }
            for (let key of Object.keys(this.searchResults)) {
                if (Array.isArray(this.searchResults[key]) && this.searchResults[key].length >= 1) {
                    count++
                }
            }
            return count
        },
        setPickPosition: function (pickPosition) {
            this.pickPostion = pickPosition
            this.$emit('emitLoadContext', pickPosition)
        },
        buildCount: function (subject) {
            if (subject.count) {
                return "[" + subject.count + "]"
            }
            return ""

        },
        buildAddtionalInfo: function (collections) {
            if (Array.isArray(collections) && collections.length > 0) {
                let out = []
                if (collections.includes("http://id.loc.gov/authorities/subjects/collection_LCSHAuthorizedHeadings") || collections.includes("http://id.loc.gov/authorities/subjects/collection_NamesAuthorizedHeadings")) {
                    out.push(" (Auth Hd)")
                } else if (collections.includes("http://id.loc.gov/authorities/subjects/collection_GenreFormSubdivisions")) {
                    out.push(" (GnFrm)")
                } else if (collections.includes("http://id.loc.gov/authorities/subjects/collection_GeographicSubdivisions")) {
                    out.push(" (GeoSubDiv)")
                } else if (collections.includes("http://id.loc.gov/authorities/subjects/collection_LCSH_Childrens")) {
                    out.push(" (ChldSubj)")
                } else if (collections.includes("http://id.loc.gov/authorities/subjects/collection_Subdivisions")) {
                    out.push(" (SubDiv)")
                }

                // favor SubDiv over GnFrm
                if (out.includes("(GnFrm)") && collections.includes("http://id.loc.gov/authorities/subjects/collection_Subdivisions")) {
                    out = [" (SubDiv)"]
                }

                return out.join(" ")
            }
            return " "
        },
    },

    created: function () { },
    before: function () { },
    mounted: function () { },
    updated: function () { }
}
</script>


<style>
.picked .label{
    font-weight: bold;
}

.not-usable{
    color: red;
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