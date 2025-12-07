/**
 * Vue Composable for WebLLM Integration
 * 
 * Provides reactive state and methods for browser-based AI correction
 * using WebGPU and WebLLM.
 */

import { ref, computed, shallowRef } from 'vue'
import { WebLLMEngine } from '@/lib/webllm-engine.js'

// Singleton engine instance (shared across all component instances)
let engineInstance = null

// Reactive state
const isWebGPUAvailable = ref(false)
const isInitializing = ref(false)
const isReady = ref(false)
const loadProgress = ref(0)
const loadMessage = ref('')
const error = ref(null)

/**
 * Initialize WebGPU detection on module load
 */
function checkWebGPU() {
  isWebGPUAvailable.value = typeof navigator !== 'undefined' && !!navigator.gpu
}
checkWebGPU()

/**
 * Vue composable for WebLLM AI correction
 */
export function useWebLLM() {
  
  /**
   * Initialize the WebLLM engine (loads ~1.5GB model on first use)
   */
  async function initialize() {
    if (isReady.value || isInitializing.value) {
      return engineInstance
    }
    
    if (!isWebGPUAvailable.value) {
      error.value = 'WebGPU is not available in this browser. Try Chrome 113+ or Edge 113+.'
      throw new Error(error.value)
    }
    
    isInitializing.value = true
    error.value = null
    loadProgress.value = 0
    loadMessage.value = 'Initializing AI model...'
    
    try {
      engineInstance = new WebLLMEngine()
      
      await engineInstance.initialize((status) => {
        if (status.type === 'progress') {
          loadProgress.value = status.progress
          loadMessage.value = status.message
        } else if (status.type === 'ready') {
          loadProgress.value = 1
          loadMessage.value = 'Model ready'
        } else if (status.type === 'error') {
          error.value = status.message
        }
      })
      
      isReady.value = true
      isInitializing.value = false
      
      return engineInstance
    } catch (err) {
      error.value = err.message
      isInitializing.value = false
      throw err
    }
  }
  
  /**
   * Correct RDF using AI
   * @param {string} rdf - RDF/XML to correct
   * @param {object} validationResults - SHACL validation results
   * @param {function} statusCallback - Optional callback for progress updates
   * @param {function} validatorFn - Optional re-validation function
   * @param {string} template - BIBFRAME template name
   */
  async function correctRDF(rdf, validationResults, statusCallback = null, validatorFn = null, template = null) {
    if (!isReady.value) {
      await initialize()
    }
    
    return await engineInstance.correctRDF(rdf, validationResults, statusCallback, validatorFn, template)
  }
  
  /**
   * Check if engine is ready to use
   */
  function checkReady() {
    return isReady.value && engineInstance && engineInstance.isReady()
  }
  
  return {
    // State
    isWebGPUAvailable: computed(() => isWebGPUAvailable.value),
    isInitializing: computed(() => isInitializing.value),
    isReady: computed(() => isReady.value),
    loadProgress: computed(() => loadProgress.value),
    loadMessage: computed(() => loadMessage.value),
    error: computed(() => error.value),
    
    // Methods
    initialize,
    correctRDF,
    checkReady
  }
}
