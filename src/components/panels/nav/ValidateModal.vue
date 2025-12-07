<script>
  import { useProfileStore } from '@/stores/profile'
  import { useConfigStore } from '@/stores/config'
  import { useWebLLM } from '@/lib/useWebLLM'
  import utilsExport from '@/lib/utils_export'

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
        validationResults: {},
        validating: false,
        initalHeight: 400,
        initalLeft: (window.innerWidth / 2) - 450,
        validationMessage: [],
        status: "",
        // WebLLM AI Correction state
        aiCorrecting: false,
        aiProgress: '',
        aiExplanation: '',
        fixedRdf: null,
        showAiSection: false,
        webllm: null
      }
    },
    computed: {
      ...mapStores(useProfileStore, useConfigStore),
      ...mapState(useProfileStore, ['activeProfile', 'activeComponent']),
      ...mapWritableState(useProfileStore, ['showValidateModal', 'activeComponent']),
      
      // Check if WebGPU/AI is available
      canUseAI() {
        return this.webllm?.isWebGPUAvailable?.value || false
      },
      
      // Show AI button only when validation failed
      showAiButton() {
        return !this.validating && 
               !this.aiCorrecting && 
               this.validationResults && 
               !this.validationResults.conforms &&
               this.validationResults.results_text
      }
    },

    methods: {
      done: function () {
        this.showValidateModal = false
        // Reset AI state
        this.aiCorrecting = false
        this.aiProgress = ''
        this.aiExplanation = ''
        this.fixedRdf = null
        this.showAiSection = false
      },

      post: async function () {
        const config = useConfigStore()

        this.validating = true
        this.validationResults = {}
        this.validationMessage = []
        this.aiExplanation = ''
        this.fixedRdf = null
        this.showAiSection = false
        
        try {
          this.validationResults = await this.profileStore.validateRecord()
        } catch (err) {
          this.validationResults = { "error": err }
        }

        this.validating = false

        if (this.validationResults.error) {
          this.status = "Error"
        } else if (this.validationResults.results_text) {
          this.status = this.validationResults.conforms ? "Validated ✓" : "Validation Failed"
        } else {
          this.status = Object.values(this.validationResults.status)[0]
          this.results = Object.values(this.validationResults.validation)
          for (let r of this.results) {
            this.validationMessage.push({
              level: r.level,
              message: this.processMessage(r.message)
            })
          }
        }
      },

      // AI Correction using WebLLM (browser-based)
      async aiCorrect() {
        if (!this.canUseAI) {
          alert('WebGPU is not available in this browser. Try Chrome 113+ or Edge.')
          return
        }
        
        this.aiCorrecting = true
        this.aiProgress = 'Initializing AI model...'
        this.showAiSection = true
        this.aiExplanation = ''
        this.fixedRdf = null
        
        try {
          // Get current RDF
          const xml = await utilsExport.buildXML(this.activeProfile)
          const currentRdf = xml.xlmStringBasic
          
          if (!currentRdf) {
            this.aiProgress = 'Error: Could not get current RDF'
            this.aiCorrecting = false
            return
          }
          
          // Initialize WebLLM if needed
          if (!this.webllm.isReady.value) {
            this.aiProgress = 'Loading AI model (first time may take 1-2 min)...'
            await this.webllm.initialize()
          }
          
          // Run AI correction
          const result = await this.webllm.correctRDF(
            currentRdf,
            this.validationResults,
            (status) => { this.aiProgress = status },
            null, // No re-validation callback for now
            'Monograph_Work_Text' // Default template
          )
          
          this.fixedRdf = result.fixed_rdf
          this.aiExplanation = result.explanation
          this.aiProgress = '✓ AI correction complete'
          
        } catch (error) {
          console.error('[ValidateModal] AI correction failed:', error)
          this.aiProgress = `Error: ${error.message}`
          this.aiExplanation = ''
        }
        
        this.aiCorrecting = false
      },
      
      // Copy the AI-corrected RDF to clipboard
      copyCorrection() {
        if (!this.fixedRdf) return
        navigator.clipboard.writeText(this.fixedRdf).then(() => {
          alert('Corrected RDF copied to clipboard!')
        }).catch(err => {
          console.error('Failed to copy:', err)
        })
      },

      processMessage: function (msg) {
        if (msg.includes("**")) {
          let matchComponent = msg.match(/(\*\*(.*)\*\*)/)
          let matchRt = msg.match(/@(.*)@/)
          if (matchComponent.length > 0) {
            msg = msg.replace(matchComponent[0], matchComponent.at(-1))
            if (matchRt) {
              msg = msg.replace(matchRt[0], matchRt.at(-1))
              return [msg, matchComponent.at(-1), matchRt.at(-1)]
            }
            return [msg, matchComponent.at(-1), null]
          }
        } else {
          return [msg, null, null]
        }
      },

      jumpToComponent: function (processedMessage) {
        const jumpTarget = this.profileStore.returnComponentByPropertyLabel(processedMessage[1], processedMessage[2])
        if (jumpTarget) {
          this.done()
          this.activeComponent = jumpTarget
        } else {
          console.warn("Couldn't jump to component: ", processedMessage[1])
        }
      },
    },

    mounted() {
      // Initialize WebLLM composable
      this.webllm = useWebLLM()
    }
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
    <div class="validate-modal">
      <div id="error-holder" ref="errorHolder">
        <h1 v-if="validating == true">Validating please wait...</h1>

        <div v-if="validating == false">
          <!-- Validation Results -->
          <div v-if="validationResults.results_text">
            <p class="status-text" :class="{ 'status-success': validationResults.conforms, 'status-error': !validationResults.conforms }">
              {{ status }}
            </p>
            <textarea readonly class="copyable-textarea">{{ validationResults.results_text }}</textarea>
          </div>
          <div v-else>
            <span v-if="!Object.keys(validationResults).includes('error')" >
              <span v-if="status === 'validated'">Validation found the following:</span>
              <ul v-for="({ level, message }) in validationMessage">
                <li :class="['level-' + level, { 'action-jump': message[1] }]" @click="jumpToComponent(message)">
                  <span v-if="message[1]" :class="['material-icons']">move_down</span>
                  {{ level }}: {{ message[0] }}
                </li>
              </ul>
            </span>
            <span v-else>
              The validation failed.
              "{{ this.validationResults.error.message }}"
            </span>
          </div>
          
          <!-- AI Correction Section -->
          <div v-if="showAiButton || showAiSection" class="ai-section">
            <hr/>
            <h3>🤖 AI Correction (Browser-Based)</h3>
            
            <div v-if="!canUseAI" class="ai-warning">
              ⚠️ WebGPU not available. Use Chrome 113+ or Edge for AI features.
            </div>
            
            <button v-if="showAiButton && canUseAI" @click="aiCorrect" class="ai-button">
              ✨ AI Fix Issues
            </button>
            
            <div v-if="aiCorrecting || aiProgress" class="ai-progress">
              <span class="spinner" v-if="aiCorrecting">⏳</span>
              {{ aiProgress }}
              <div v-if="webllm && webllm.loadProgress.value > 0 && webllm.loadProgress.value < 1" class="progress-bar">
                <div class="progress-fill" :style="{ width: (webllm.loadProgress.value * 100) + '%' }"></div>
              </div>
            </div>
            
            <div v-if="aiExplanation" class="ai-explanation">
              <strong>What was fixed:</strong>
              <p>{{ aiExplanation }}</p>
            </div>
            
            <div v-if="fixedRdf" class="ai-result">
              <button @click="copyCorrection" class="apply-button">
                📋 Copy Corrected RDF
              </button>
              <details>
                <summary>View Corrected RDF</summary>
                <textarea readonly class="copyable-textarea corrected-rdf">{{ fixedRdf }}</textarea>
              </details>
            </div>
          </div>
        </div>

        <div class="button-row">
          <button @click="done">Close</button>
          <button v-if="!validating" @click="post">Re-validate</button>
        </div>
      </div>
    </div>
  </VueFinalModal>
</template>

<style scoped>
  #error-holder {
    overflow-y: scroll;
    max-height: 80vh;
    user-select: text;
  }

  .validate-modal {
    background-color: white;
    box-shadow: 0px 10px 13px -7px #000000, 5px 5px 15px 5px rgba(0, 0, 0, 0.27);
    border-radius: 1em;
    padding: 1.5em;
    border: solid 1px black;
    max-width: 700px;
    margin: 0 auto;
  }
  
  .status-text {
    font-size: 1.2em;
    font-weight: bold;
    margin-bottom: 0.5em;
  }
  
  .status-success { color: #155724; }
  .status-error { color: #721c24; }
  
  .button-row {
    display: flex;
    gap: 1em;
    margin-top: 1em;
  }
  
  button {
    font-size: 1.2em;
    padding: 0.5em 1em;
    cursor: pointer;
  }
  
  /* AI Section Styles */
  .ai-section {
    margin-top: 1em;
    padding-top: 1em;
  }
  
  .ai-section h3 {
    margin-bottom: 0.5em;
    color: #333;
  }
  
  .ai-warning {
    background: #fff3cd;
    border: 1px solid #ffc107;
    padding: 0.5em;
    border-radius: 4px;
    color: #856404;
  }
  
  .ai-button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 0.75em 1.5em;
    font-size: 1.1em;
    cursor: pointer;
    transition: transform 0.2s;
  }
  
  .ai-button:hover {
    transform: scale(1.02);
  }
  
  .ai-progress {
    margin-top: 0.5em;
    padding: 0.5em;
    background: #f0f4f8;
    border-radius: 4px;
  }
  
  .spinner {
    display: inline-block;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  .progress-bar {
    height: 6px;
    background: #ddd;
    border-radius: 3px;
    margin-top: 0.5em;
    overflow: hidden;
  }
  
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea, #764ba2);
    transition: width 0.3s;
  }
  
  .ai-explanation {
    margin-top: 1em;
    padding: 1em;
    background: #d4edda;
    border: 1px solid #c3e6cb;
    border-radius: 4px;
  }
  
  .ai-explanation p {
    margin: 0.5em 0 0 0;
  }
  
  .ai-result {
    margin-top: 1em;
  }
  
  .apply-button {
    background: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    margin-bottom: 0.5em;
  }
  
  .apply-button:hover {
    background: #218838;
  }
  
  details {
    margin-top: 0.5em;
  }
  
  summary {
    cursor: pointer;
    color: #007bff;
  }
  
  .corrected-rdf {
    height: 300px;
    margin-top: 0.5em;
  }

  /* Existing styles */
  .level-INFO,
  .level-SUCCESS,
  .level-WARNING,
  .level-ERROR {
    list-style: none;
    width: fit-content;
    margin-bottom: 5px;
    padding: .75rem 1.25rem;
  }
  .level-WARNING {
    color: #856404;
    background-color: #fff3cd;
    border-color: #ffeeba;
  }
  .level-ERROR {
    color: #721c24;
    background-color: #f8d7da;
    border-color: #f5c6cb;
  }
  .level-SUCCESS {
    color: #155724;
    background-color: #d4edda;
    border-color: #c3e6cb;
  }
  .level-INFO {
    color: #0c5460;
    background-color: #d1ecf1;
    border-color: #bee5eb;
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