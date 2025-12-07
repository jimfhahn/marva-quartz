/**
 * WebLLM Engine for Browser-Based AI Correction
 * 
 * Uses WebGPU for local AI inference - no server required for AI.
 * Ported from mcp4rdf-core for integration with Marva Quartz.
 * 
 * NOTE: WebLLM is loaded lazily to avoid CORS errors in some browsers.
 * The actual import happens in initialize() when the user requests AI features.
 */

// WebLLM will be loaded dynamically to avoid CORS issues
let webllm = null;

// Template-specific mandatory properties (from SHACL TSV files)
const TEMPLATE_MANDATORY_PROPERTIES = {
    'Monograph_Work_Text': {
        violations: ['bf:title', 'bf:language', 'bf:content', 'bf:adminMetadata'],
        warnings: ['bf:contribution', 'bf:genreForm', 'bf:originDate', 'bf:originPlace', 'bf:subject', 'bf:classification']
    },
    'Monograph_AdminMetadata': {
        violations: ['bflc:encodingLevel', 'bf:descriptionConventions', 'bf:generationProcess'],
        warnings: ['bf:source', 'bf:changeDate', 'bf:creationDate']
    },
    'Monograph_Instance_Print': {
        violations: ['bf:instanceOf', 'bf:title', 'bf:provisionActivity', 'bf:identifiedBy', 'bf:carrier', 'bf:media'],
        warnings: ['bf:extent', 'bf:dimensions', 'bf:note']
    },
    'Monograph_Instance_Electronic': {
        violations: ['bf:instanceOf', 'bf:title', 'bf:electronicLocator', 'bf:identifiedBy', 'bf:carrier', 'bf:media'],
        warnings: ['bf:digitalCharacteristic']
    }
};

// Common BIBFRAME namespaces
const COMMON_NAMESPACES = {
    'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
    'bf': 'http://id.loc.gov/ontologies/bibframe/',
    'bflc': 'http://id.loc.gov/ontologies/bflc/',
    'madsrdf': 'http://www.loc.gov/mads/rdf/v1#',
    'dcterms': 'http://purl.org/dc/terms/',
    'xsd': 'http://www.w3.org/2001/XMLSchema#',
    'lclocal': 'http://id.loc.gov/ontologies/lclocal/'
};

export class WebLLMEngine {
    constructor() {
        this.engine = null;
        this.ready = false;
        // Use Qwen2.5-Coder - optimized for code/structured output generation
        this.modelId = "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC";
    }
    
    /**
     * Check if WebGPU is available in this browser
     */
    static isWebGPUAvailable() {
        return typeof navigator !== 'undefined' && !!navigator.gpu;
    }
    
    /**
     * Initialize the WebLLM engine
     * @param {Function} progressCallback - Called with progress updates
     */
    async initialize(progressCallback) {
        console.log('[WebLLM] Initializing engine...');
        
        if (!WebLLMEngine.isWebGPUAvailable()) {
            throw new Error('WebGPU is not available in this browser');
        }
        
        try {
            // Lazy load WebLLM to avoid CORS errors on page load
            if (!webllm) {
                console.log('[WebLLM] Loading WebLLM module...');
                if (progressCallback) {
                    progressCallback({ type: 'progress', progress: 0, message: 'Loading WebLLM module...' });
                }
                try {
                    webllm = await import("https://esm.run/@mlc-ai/web-llm");
                } catch (importError) {
                    console.error('[WebLLM] Failed to load WebLLM module:', importError);
                    throw new Error('Failed to load WebLLM. This feature requires a browser that supports ES modules from CDN. Try using the VS Code webview instead.');
                }
            }
            
            this.engine = await webllm.CreateMLCEngine(this.modelId, {
                initProgressCallback: (progress) => {
                    console.log('[WebLLM] Loading:', progress);
                    if (progressCallback) {
                        progressCallback({
                            type: 'progress',
                            progress: progress.progress || 0,
                            message: progress.text || 'Loading model...'
                        });
                    }
                }
            });
            
            this.ready = true;
            console.log('[WebLLM] Engine ready');
            
            if (progressCallback) {
                progressCallback({ type: 'ready', message: 'Model loaded successfully' });
            }
            
            return this.engine;
        } catch (error) {
            console.error('[WebLLM] Init failed:', error);
            if (progressCallback) {
                progressCallback({ type: 'error', message: error.message });
            }
            throw error;
        }
    }
    
    isReady() {
        return this.ready && this.engine !== null;
    }
    
    /**
     * Correct RDF using AI with iterative self-correction
     * @param {string} rdf - The RDF/XML to correct
     * @param {object} validationResults - Validation results from SHACL validator
     * @param {function} statusCallback - Optional callback for status updates
     * @param {function} validatorFn - Optional async function(rdf, template) to verify corrections
     * @param {string} template - Template name for validation
     * @returns {Promise<{fixed_rdf: string, explanation: string}>}
     */
    async correctRDF(rdf, validationResults, statusCallback = null, validatorFn = null, template = null) {
        if (!this.isReady()) {
            throw new Error('WebLLM engine is not initialized');
        }
        
        const MAX_RETRIES = 5;
        let currentRDF = rdf;
        let currentValidation = validationResults;
        const originalTripleCount = this.estimateTripleCount(rdf);
        let previousErrorCount = this.countValidationErrors(validationResults);
        
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const isRetry = attempt > 1;
            
            if (statusCallback) {
                if (isRetry) statusCallback(`🔄 Attempt ${attempt}/${MAX_RETRIES}: Refining corrections...`);
                else statusCallback('🚀 Starting AI correction...');
            }

            // Normalize namespaces first
            const normalizedRDF = this.normalizeNamespaces(currentRDF);
            
            if (statusCallback) statusCallback('🤖 AI analyzing RDF...');
            
            // Build prompt with template context
            let prompt = this.buildCorrectionPrompt(normalizedRDF, currentValidation, null, null, template);
            
            // If retry, inject feedback
            if (isRetry) {
                const missingProps = this.extractMissingProperties(currentValidation);
                const missingList = missingProps.length > 0 
                    ? `\nSTILL MISSING: ${missingProps.join(', ')}` 
                    : '';
                prompt = `⚠️ PREVIOUS ATTEMPT FAILED (Attempt ${attempt}/${MAX_RETRIES}).
Your correction was re-validated and still has errors.${missingList}

You MUST:
1. Keep all existing valid content
2. ADD the missing properties listed above
3. Use correct BIBFRAME structure patterns

` + prompt;
            }
        
            try {
                const response = await this.engine.chat.completions.create({
                    messages: [
                        {
                            role: "system",
                            content: "You are an expert in BIBFRAME RDF validation and correction. Your task is to FIX the provided RDF. You MUST modify the RDF to resolve validation errors. Do NOT return the original RDF unchanged. Return ONLY the corrected RDF/XML."
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 2500,
                    stop: ['</rdf:RDF>'],
                });
                
                const completion = response.choices[0].message.content;
                console.log(`[WebLLM] Response received (attempt ${attempt})`);
                
                // Ensure closing tag
                let completedResponse = completion;
                if (!completion.includes('</rdf:RDF>')) {
                    completedResponse = completion + '\n</rdf:RDF>';
                }
                
                // Extract and clean RDF
                let fixedRDF = this.extractRDFFromResponse(completedResponse);
                fixedRDF = this.applyPostProcessingFixes(fixedRDF);
                fixedRDF = this.ensureNamespaces(fixedRDF);
                
                // Triple count regression check
                const newTripleCount = this.estimateTripleCount(fixedRDF);
                if (originalTripleCount > 0 && newTripleCount < originalTripleCount * 0.7) {
                    console.warn(`[WebLLM] Triple count regression: ${originalTripleCount} -> ${newTripleCount}`);
                    if (attempt < MAX_RETRIES) {
                        if (statusCallback) statusCallback(`⚠️ AI removed too much content, retrying...`);
                        continue;
                    }
                }
                
                // Validate XML
                if (!this.isValidXML(fixedRDF)) {
                    console.error('[WebLLM] Generated invalid XML');
                    if (attempt === MAX_RETRIES) {
                        return {
                            fixed_rdf: normalizedRDF,
                            explanation: 'The AI model generated invalid output. Applied namespace corrections only.',
                            processing_strategy: 'webgpu-browser-fallback',
                            metadata: { ai_failed: true }
                        };
                    }
                    continue;
                }
                
                const normalizedFixedRDF = this.normalizeNamespaces(fixedRDF);
                
                // If no validator, return immediately
                if (!validatorFn || !template) {
                    const explanation = await this.generateExplanation(rdf, normalizedFixedRDF, validationResults);
                    return {
                        fixed_rdf: normalizedFixedRDF,
                        explanation: explanation,
                        processing_strategy: 'webgpu-browser',
                        metadata: { attempts: attempt }
                    };
                }
                
                // Verify with backend validator
                if (statusCallback) statusCallback('🔍 Verifying correction...');
                const verificationResult = await validatorFn(normalizedFixedRDF, template);
                
                if (verificationResult.validation && verificationResult.validation.conforms) {
                    if (statusCallback) statusCallback('✓ Correction verified!');
                    const explanation = await this.generateExplanation(rdf, normalizedFixedRDF, validationResults);
                    return {
                        fixed_rdf: normalizedFixedRDF,
                        explanation: explanation,
                        processing_strategy: 'webgpu-browser-verified',
                        metadata: { attempts: attempt }
                    };
                } else {
                    const currentErrorCount = this.countValidationErrors(verificationResult.validation);
                    console.warn(`[WebLLM] Attempt ${attempt} failed. Errors: ${previousErrorCount} -> ${currentErrorCount}`);
                    
                    if (currentErrorCount > previousErrorCount && attempt < MAX_RETRIES) {
                        if (statusCallback) statusCallback(`⚠️ Correction made things worse, retrying...`);
                        currentRDF = rdf;
                        currentValidation = validationResults;
                        continue;
                    }
                    
                    currentRDF = normalizedFixedRDF; 
                    currentValidation = verificationResult.validation;
                    previousErrorCount = currentErrorCount;
                    
                    if (attempt === MAX_RETRIES) {
                        const explanation = await this.generateExplanation(rdf, normalizedFixedRDF, validationResults);
                        return {
                            fixed_rdf: normalizedFixedRDF,
                            explanation: explanation + ` (Note: ${verificationResult.validation.results_count} issues remain after ${attempt} attempts)`,
                            processing_strategy: 'webgpu-browser-partial',
                            metadata: { attempts: attempt, final_validation: currentValidation }
                        };
                    }
                }
            } catch (error) {
                console.error(`[WebLLM] Error (attempt ${attempt}):`, error);
                if (attempt === MAX_RETRIES) {
                    throw new Error(`AI correction failed: ${error.message}`);
                }
            }
        }
    }
    
    // === Helper Methods ===
    
    isValidXML(xmlString) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlString, 'application/xml');
            const parserError = doc.querySelector('parsererror');
            if (parserError) return false;
            if (!xmlString.includes('<rdf:RDF') && !xmlString.includes('<RDF')) return false;
            return true;
        } catch (error) {
            return false;
        }
    }
    
    estimateTripleCount(rdf) {
        if (!rdf) return 0;
        const propertyMatches = rdf.match(/<(bf|bflc|rdf|rdfs|madsrdf):[a-zA-Z]+/g);
        return propertyMatches ? propertyMatches.length : 0;
    }
    
    countValidationErrors(validation) {
        if (!validation) return 0;
        if (validation.results_count !== undefined) return validation.results_count;
        if (validation.results && Array.isArray(validation.results)) return validation.results.length;
        return 0;
    }
    
    extractMissingProperties(validation) {
        const missing = [];
        if (!validation || !validation.results) return missing;
        
        const results = Array.isArray(validation.results) ? validation.results : [];
        for (const result of results) {
            const path = result.resultPath || result.sourceConstraint || '';
            const match = path.match(/(bf|bflc):[a-zA-Z]+/);
            if (match && !missing.includes(match[0])) {
                missing.push(match[0]);
            }
        }
        return missing.slice(0, 10);
    }
    
    applyPostProcessingFixes(rdf) {
        let fixed = rdf;
        
        // Fix bf:type -> rdf:type
        if (fixed.includes('bf:type')) {
            fixed = fixed.replace(/<bf:type/g, '<rdf:type');
            fixed = fixed.replace(/<\/bf:type>/g, '</rdf:type>');
        }
        
        // Fix bibframe: -> bf:
        if (fixed.includes('bibframe:')) {
            fixed = fixed.replace(/xmlns:bibframe=/g, 'xmlns:bf=');
            fixed = fixed.replace(/<bibframe:/g, '<bf:');
            fixed = fixed.replace(/<\/bibframe:/g, '</bf:');
        }
        
        // Fix bf:assigner with direct URI
        const assignerUriPattern = /<bf:assigner\s+rdf:resource="([^"]+)"\s*\/>/g;
        fixed = fixed.replace(assignerUriPattern, (match, uri) => {
            return `<bf:assigner><bf:Agent rdf:about="${uri}"/></bf:assigner>`;
        });
        
        return fixed;
    }
    
    ensureNamespaces(rdf) {
        if (!rdf.includes('<rdf:RDF') && !rdf.includes('<RDF')) return rdf;
        
        const rdfTagMatch = rdf.match(/<rdf:RDF[^>]*>/);
        if (!rdfTagMatch) return rdf;
        
        const openingTag = rdfTagMatch[0];
        const declaredPrefixes = new Set();
        const declaredMatch = openingTag.match(/xmlns:([a-zA-Z0-9_-]+)=/g);
        if (declaredMatch) {
            declaredMatch.forEach(m => {
                declaredPrefixes.add(m.replace('xmlns:', '').replace('=', ''));
            });
        }
        
        const usedPrefixes = new Set();
        const usedMatches = rdf.match(/<\/?([a-zA-Z0-9_-]+):[a-zA-Z0-9_-]+/g);
        if (usedMatches) {
            usedMatches.forEach(m => {
                usedPrefixes.add(m.replace(/<\/?/, '').split(':')[0]);
            });
        }
        
        let newAttrs = '';
        for (const prefix of usedPrefixes) {
            if (!declaredPrefixes.has(prefix) && COMMON_NAMESPACES[prefix]) {
                newAttrs += ` xmlns:${prefix}="${COMMON_NAMESPACES[prefix]}"`;
            }
        }
        
        if (newAttrs) {
            const newOpeningTag = openingTag.slice(0, -1) + newAttrs + '>';
            return rdf.replace(openingTag, newOpeningTag);
        }
        
        return rdf;
    }
    
    normalizeNamespaces(rdf) {
        const wrongNamespaces = {
            'http://id.loc.gov/vocabulary/bibliography#': 'http://id.loc.gov/ontologies/bibframe/',
        };
        
        let normalized = rdf;
        for (const [wrong, correct] of Object.entries(wrongNamespaces)) {
            normalized = normalized.replace(new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), correct);
        }
        
        normalized = normalized.replace(/xmlns:bibframe=/g, 'xmlns:bf=');
        normalized = normalized.replace(/<bibframe:/g, '<bf:');
        normalized = normalized.replace(/<\/bibframe:/g, '</bf:');
        
        return normalized;
    }
    
    buildCorrectionPrompt(rdf, validationResults, bibframeContext = null, locExamples = null, template = null) {
        const resultsText = validationResults.results_text || JSON.stringify(validationResults);
        
        let prompt = `Fix this RDF based on validation errors using BIBFRAME best practices.

## Validation Errors:
${resultsText.substring(0, 1500)}

## RDF to Correct:
${rdf}

## Correction Instructions:
1. Address every validation error listed above
2. ALWAYS use rdf:type for types, NEVER use bf:type
3. ADD missing required properties (bf:title, bf:language, bf:content, etc.)
4. For bf:contribution use pattern: bf:contribution -> bf:Contribution -> bf:agent -> bf:Agent
5. Ensure all XML namespaces are declared
6. Do NOT remove existing valid content

## Corrected RDF (return ONLY valid RDF/XML):`;
        
        return prompt;
    }
    
    extractRDFFromResponse(responseText) {
        if (!responseText) throw new Error('Empty response from AI');
        
        // Look for code blocks
        const codeBlockRegex = /```(?:xml|rdf)?\s*\n([\s\S]*?)\n```/g;
        const codeBlocks = [...responseText.matchAll(codeBlockRegex)];
        if (codeBlocks.length > 0) {
            return codeBlocks[codeBlocks.length - 1][1].trim();
        }
        
        // Look for XML
        const xmlRegex = /(<\?xml[\s\S]*?<\/rdf:RDF>|<rdf:RDF[\s\S]*?<\/rdf:RDF>)/g;
        const xmlMatches = [...responseText.matchAll(xmlRegex)];
        if (xmlMatches.length > 0) {
            return xmlMatches[xmlMatches.length - 1][0].trim();
        }
        
        const stripped = responseText.trim();
        if (stripped.startsWith('<?xml') || stripped.startsWith('<rdf:RDF')) {
            return stripped;
        }
        
        return responseText.trim();
    }
    
    async generateExplanation(originalRDF, fixedRDF, validationResults) {
        try {
            const response = await this.engine.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant explaining metadata corrections to librarians. Be brief and avoid technical jargon."
                    },
                    {
                        role: "user",
                        content: `Summarize the RDF corrections in 2-3 SHORT sentences for a librarian. What fields were missing and what did you add? Avoid technical terms like 'namespace' or 'RDF'.`
                    }
                ],
                temperature: 0.3,
                max_tokens: 150,
            });
            
            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error('[WebLLM] Failed to generate explanation:', error);
            return 'Added missing required fields to make the record valid.';
        }
    }
}
