<script>
  import { useProfileStore } from '@/stores/profile'

  import { mapStores, mapWritableState, mapState } from 'pinia'
  import { VueFinalModal } from 'vue-final-modal'

  export default {
    components: {
      VueFinalModal,
    },

    data() {
      return {
        width: 0,
        height: 0,
        top: 100,
        left: 0,
        validationResults: null,
        validationIssues: [],
        validationError: null,
        validating: false,
        initialHeight: 400,
        initialLeft: (window.innerWidth / 2) - 450,
        status: '',
        showCorrectionPreview: false
      }
    },
    computed: {
      ...mapStores(useProfileStore),
      ...mapState(useProfileStore, ['activeProfile', 'activeComponent']),
      ...mapWritableState(useProfileStore, ['showValidateModal', 'activeComponent']),

      hasValidationResults() {
        return !!this.validationResults && !this.validationError
      },
      processingTimeSeconds() {
        const ms = this.validationResults?.processingTimeMs
        return typeof ms === 'number' ? (ms / 1000).toFixed(1) : null
      },
      aiExplanation() {
        return this.validationResults?.metadata?.ai_explanation || null
      },
      hasCorrection() {
        return !!(this.validationResults?.correction?.rdf)
      },
      correctionStatusLabel() {
        if (!this.hasCorrection) {
          return null
        }
        return this.validationResults?.correction?.applied
          ? 'The AI applied fixes to create a corrected graph.'
          : 'Suggested corrections are available for review.'
      },
      statusClass() {
        const value = (this.status || '').toLowerCase()
        if (['valid', 'validated'].includes(value)) return 'status-success'
        if (['fixed', 'partially_fixed'].includes(value)) return 'status-fixed'
        if (value === 'warning') return 'status-warning'
        if (value) return 'status-error'
        return ''
      },
      statusLabel() {
        const value = (this.status || '').toLowerCase()
        const map = {
          valid: 'Valid',
          validated: 'Validated',
          invalid: 'Invalid',
          fixed: 'Fixed',
          'partially_fixed': 'Partially Fixed',
          warning: 'Warnings Only',
          error: 'Error'
        }
        return map[value] || (this.status || '')
      },
      providerLabel() {
        const provider = this.validationResults?.provider
        if (provider === 'interactive') return 'Interactive Validator'
        if (provider === 'legacy') return 'Legacy SHACL Validator'
        return null
      }
    },

    methods: {
      done() {
        this.showValidateModal = false
      },

      async post() {
        this.validating = true
        this.validationResults = null
        this.validationIssues = []
        this.validationError = null
        this.status = ''
        this.showCorrectionPreview = false

        try {
          const result = await this.profileStore.validateRecord({ autoFix: true })
          this.validationResults = result

          if (result?.error) {
            const errorMessage = result.error.message || result.details || 'Validation failed.'
            this.validationError = errorMessage
            this.status = 'Error'
            return
          }

          this.status = result?.status || (result?.conforms ? 'validated' : 'invalid')

          const defaultSeverity = result?.conforms ? 'INFO' : 'ERROR'
          const rawIssues = Array.isArray(result?.validation?.results) ? result.validation.results : []

          this.validationIssues = rawIssues.map((item, index) => {
            const severity = this.normalizeSeverity(
              item?.severity || item?.resultSeverity || item?.level || item?.['sh:resultSeverity'],
              defaultSeverity
            )

            const messageText = this.extractMessageText(item)
            const processed = this.processMessage(messageText)

            return {
              id: item?.id || index,
              severity,
              message: processed,
              raw: item,
              canJump: !!processed.component
            }
          })
        } catch (error) {
          console.error('[ValidateModal] Validation error:', error)
          this.validationError = error?.message || 'Validation request failed.'
          this.status = 'Error'
        } finally {
          this.validating = false
        }
      },

      normalizeSeverity(raw, fallback) {
        if (!raw || typeof raw !== 'string') {
          return fallback || 'INFO'
        }
        const upper = raw.toUpperCase()
        if (upper.includes('ERROR')) return 'ERROR'
        if (upper.includes('WARN')) return 'WARNING'
        if (upper.includes('INFO')) return 'INFO'
        if (upper.includes('SUCCESS')) return 'SUCCESS'
        return fallback || 'INFO'
      },

      extractMessageText(item) {
        if (!item) return ''
        if (typeof item.message === 'string') return item.message
        if (item.message?.value) return item.message.value
        if (item.detail) return item.detail
        if (item.explanation) return item.explanation
        try {
          return JSON.stringify(item)
        } catch (_) {
          return ''
        }
      },

      processMessage(msg) {
        const base = {
          text: typeof msg === 'string' ? msg : (msg ? String(msg) : ''),
          component: null,
          profile: null
        }

        if (!base.text || !base.text.includes('**')) {
          return base
        }

        const matchComponent = base.text.match(/(\*\*(.*)\*\*)/)
        const matchRt = base.text.match(/@(.*)@/)

        if (matchComponent && matchComponent.length > 0) {
          const componentLabel = matchComponent.at(-1)
          base.text = base.text.replace(matchComponent[0], componentLabel)
          base.component = componentLabel

          if (matchRt && matchRt.length > 0) {
            const profileLabel = matchRt.at(-1)
            base.text = base.text.replace(matchRt[0], profileLabel)
            base.profile = profileLabel
          }
        }

        return base
      },

      jumpToComponent(processedMessage) {
        if (!processedMessage || !processedMessage.component) {
          console.warn("Couldn't jump to component: no component label provided", processedMessage)
          return
        }

        const jumpTarget = this.profileStore.returnComponentByPropertyLabel(
          processedMessage.component,
          processedMessage.profile
        )

        if (jumpTarget) {
          this.done()
          this.activeComponent = jumpTarget
        } else {
          console.warn("Couldn't jump to component: ", processedMessage.component)
        }
      },

      toggleCorrectionPreview() {
        this.showCorrectionPreview = !this.showCorrectionPreview
      },

      severityClass(severity) {
        const normalized = (severity || 'INFO').toUpperCase()
        if (['ERROR', 'WARNING', 'SUCCESS', 'INFO'].includes(normalized)) {
          return `level-${normalized}`
        }
        return 'level-INFO'
      },

      formatValidationProof(proof) {
        if (!proof) return ''
        try {
          return JSON.stringify(proof, null, 2)
        } catch (_) {
          return String(proof)
        }
      }
    },

    mounted() { }
  }
</script>

<template>
  <VueFinalModal
    display-directive="show"
    :hide-overlay="false"
    :overlay-transition="'vfm-fade'"
    :click-to-close="true"
    :esc-to-close="true"
  >
  <div class="validation-container">
      <header class="validation-header">
        <h1>Validate Record</h1>
        <button type="button" class="close-button" @click="done">Close</button>
      </header>

      <section v-if="validating" class="validation-loading" aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>
        <p>Validating, please wait…</p>
      </section>

      <section v-else class="validation-results">
        <div v-if="validationError" class="alert level-ERROR">
          <strong>Validation failed.</strong>
          <p>{{ validationError }}</p>
          <p v-if="validationResults?.details">{{ validationResults.details }}</p>
        </div>

        <div v-else-if="hasValidationResults">
          <div class="status-banner" :class="statusClass">
            <span class="status-label">{{ statusLabel }}</span>
            <span v-if="processingTimeSeconds" class="status-meta">Processed in {{ processingTimeSeconds }}s</span>
            <span v-if="providerLabel" class="status-provider">{{ providerLabel }}</span>
          </div>

          <div v-if="aiExplanation" class="ai-explanation">
            <h2>AI Explanation</h2>
            <p>{{ aiExplanation }}</p>
          </div>

          <div v-if="validationIssues.length" class="validation-issues">
            <h2>Findings</h2>
            <ul>
              <li
                v-for="issue in validationIssues"
                :key="issue.id"
                :class="[severityClass(issue.severity), { 'action-jump': issue.canJump }]"
                @click="issue.canJump ? jumpToComponent(issue.message) : null"
              >
                <span class="issue-severity">{{ issue.severity }}</span>
                <span class="issue-text">{{ issue.message.text }}</span>
              </li>
            </ul>
          </div>

          <div v-else class="validation-success">
            <p>🎉 No issues detected. The record conforms to the selected template.</p>
          </div>

          <div v-if="hasCorrection" class="validation-correction">
            <h2>Suggested Corrections</h2>
            <p>
              {{ correctionStatusLabel }}
              <span v-if="validationResults.correction.qualityScore !== null">
                • Quality score: {{ validationResults.correction.qualityScore }}
              </span>
            </p>
            <div class="correction-actions">
              <button type="button" @click="toggleCorrectionPreview">
                {{ showCorrectionPreview ? 'Hide' : 'Show' }} corrected RDF/XML
              </button>
            </div>
            <textarea
              v-if="showCorrectionPreview"
              readonly
              class="copyable-textarea"
            >{{ validationResults.correction.rdf }}</textarea>
          </div>

          <div v-if="validationResults.validationProof" class="validation-proof">
            <details>
              <summary>View validation proof</summary>
              <pre>{{ formatValidationProof(validationResults.validationProof) }}</pre>
            </details>
          </div>
        </div>

        <div v-else class="validation-empty">
          <p>Click validate to analyze the current record.</p>
        </div>
      </section>

      <footer class="validation-footer">
        <button type="button" @click="done">Close</button>
      </footer>
    </div>
  </VueFinalModal>
</template>

<style scoped>
  .validation-container {
    background-color: white;
    -webkit-box-shadow: 0px 10px 13px -7px #000000, 5px 5px 15px 5px rgba(0, 0, 0, 0.27);
    box-shadow: 0px 10px 13px -7px #000000, 5px 5px 15px 5px rgba(0, 0, 0, 0.27);
    border-radius: 1em;
    padding: 1.5em;
    border: solid 1px black;
    max-width: 720px;
  }

  .validation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.25rem;
  }

  .close-button {
    background-color: white;
    border-radius: 5px;
    border: solid 1px black;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.25rem 0.75rem;
  }

  .validation-loading {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem 0;
  }

  .spinner {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 3px solid #e2e3e5;
    border-top-color: #0078d4;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .status-banner {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .status-success {
    background-color: #d4edda;
    color: #155724;
  }

  .status-fixed {
    background-color: #d1ecf1;
    color: #0c5460;
  }

  .status-warning {
    background-color: #fff3cd;
    color: #856404;
  }

  .status-error {
    background-color: #f8d7da;
    color: #721c24;
  }

  .status-label {
    font-weight: 600;
    font-size: 1.05rem;
  }

  .status-meta,
  .status-provider {
    font-size: 0.9rem;
  }

  .status-provider {
    font-weight: 600;
  }

  .ai-explanation {
    margin-bottom: 1.5rem;
  }

  .validation-issues ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.75rem;
  }

  .validation-issues li {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    border-radius: 6px;
    padding: 0.75rem 1rem;
    cursor: default;
  }

  .issue-severity {
    font-weight: 600;
    min-width: 4.5rem;
    text-transform: capitalize;
  }

  .issue-text {
    flex: 1;
  }

  .validation-success {
    margin: 1rem 0;
  }

  .validation-correction {
    margin-top: 1.5rem;
  }

  .correction-actions {
    margin: 0.75rem 0;
  }

  .validation-proof {
    margin-top: 1rem;
  }

  .validation-empty {
    padding: 1rem 0;
  }

  .validation-footer {
    margin-top: 1.5rem;
    display: flex;
    justify-content: flex-end;
  }

  .alert {
    padding: 0.75rem 1rem;
    border-radius: 6px;
    margin-bottom: 1rem;
  }

  .level-INFO,
  .level-SUCCESS,
  .level-WARNING,
  .level-ERROR {
    list-style: none;
    margin: 0;
    padding: .75rem 1.25rem;
  }
  .level-WARNING {
    color: #856404;
    background-color: #fff3cd;
    border: 1px solid #ffeeba;
  }
  .level-ERROR {
    color: #721c24;
    background-color: #f8d7da;
    border: 1px solid #f5c6cb;
  }
  .level-SUCCESS {
    color: #155724;
    background-color: #d4edda;
    border: 1px solid #c3e6cb;
  }
  .level-INFO {
    color: #0c5460;
    background-color: #d1ecf1;
    border: 1px solid #bee5eb;
  }

  .action-jump:hover {
    color: #004085;
    background-color: #cce5ff;
    border-color: #b8daff;
  }
  .action-jump {
    cursor: pointer;
  }

  .copyable-textarea {
    width: 100%;
    height: 200px;
    resize: vertical;
    user-select: text;
    font-family: monospace;
    border: 1px solid #ccc;
    padding: 0.5rem;
  }
</style>