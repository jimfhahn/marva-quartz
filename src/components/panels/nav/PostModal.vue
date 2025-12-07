<script>
  import { useProfileStore } from '@/stores/profile'
  import { useConfigStore } from '@/stores/config'
  import utilsNetwork from '@/lib/utils_network'
  import short from 'short-uuid' // Add this import
  import { publishToWikibase, configureWikibase, isWikibaseConfigured } from '@/lib/wikibase-publish'

  import {  mapStores, mapState, mapWritableState } from 'pinia'
  import { VueFinalModal } from 'vue-final-modal'
  import utilsExport from '@/lib/utils_export'

  // Create a translator instance to use for UUID generation
  const translator = short();

  export default {
    components: {
      VueFinalModal
    },

    data() {
      return {
        width: 0,
        height: 0,
        top: 100,
        left: 0,
        postResults: {},
        posting: false,
        postType: 'default', // Default is both work and instance
        postOptions: [
          { value: 'default', label: 'Work + Instance' },
          { value: 'work', label: 'Work Only' },
          { value: 'instance', label: 'Instance Only' }
        ],
        // Destination will be set from config in created()
        destination: 'wikibase',
        showDropdown: false,
        showDestinationDropdown: false,
        // Wikibase-specific state
        wikibaseResults: null,
        wikibaseUrl: '',  // User can input their Wikibase URL
        wikibaseBotUsername: '',  // Bot username (e.g., 'Username@BotName')
        wikibaseBotPassword: '',  // Bot password from Special:BotPasswords

        initalHeight: 400,
        initalLeft: (window.innerWidth / 2) - 450,
        holdingInfo: null
      }
    },
    computed: {
      ...mapStores(useProfileStore, useConfigStore),
      ...mapWritableState(useProfileStore, ['showPostModal']),
      activeProfile() {
        return this.profileStore.activeProfile
      },
      selectedOptionLabel() {
        const option = this.postOptions.find(opt => opt.value === this.postType);
        return option ? option.label : 'Work + Instance';
      },
      selectedDestinationLabel() {
        const option = this.destinationOptions.find(opt => opt.value === this.destination);
        return option ? option.label : '🌐 Wikibase';
      },
      // Build destination options based on what's configured
      destinationOptions() {
        const config = useConfigStore();
        const urls = config.returnUrls || {};
        const options = [];
        
        // Add Alma option only if publish endpoint is configured
        if (urls.publish) {
          options.push({ value: 'alma', label: '📚 Alma/Default' });
        }
        
        // Add Wikibase option if enabled
        if (urls.wikibase?.enabled !== false) {
          options.push({ value: 'wikibase', label: '🌐 Wikibase' });
        }
        
        // Fallback if nothing configured
        if (options.length === 0) {
          options.push({ value: 'wikibase', label: '🌐 Wikibase' });
        }
        
        return options;
      },
      // Check if only one destination is available (hide selector)
      singleDestination() {
        return this.destinationOptions.length === 1;
      },
      isWikibaseEnabled() {
        const config = useConfigStore();
        return config.returnUrls?.wikibase?.enabled || false;
      },
      wikibaseConfig() {
        const config = useConfigStore();
        return config.returnUrls?.wikibase || {};
      },
      normalizedInstanceIds() {
        // Simplified to only handle nested format under name.instance
        if (this.postResults.name?.instance?.mms_id) {
          return [this.postResults.name.instance.mms_id];
        }
        // Backward compatibility for instance_mms_id array
        else if (this.postResults.name?.instance_mms_id?.length) {
          return this.postResults.name.instance_mms_id;
        }
        return [];
      },
      
      normalizedWorkIds() {
        // Simplified to only handle nested format under name.work
        if (this.postResults.name?.work?.mms_id) {
          return [this.postResults.name.work.mms_id];
        }
        // Backward compatibility for work_mms_id array
        else if (this.postResults.name?.work_mms_id?.length) {
          return this.postResults.name.work_mms_id;
        }
        return [];
      },
      
      hasMMSIDs() {
        return this.normalizedInstanceIds.length > 0 || this.normalizedWorkIds.length > 0;
      }
    },

    created() {
      this.initializeWikibaseSettings();
    },

    watch: {
      // Re-initialize when modal is shown
      showPostModal(newVal) {
        if (newVal) {
          this.initializeWikibaseSettings();
        }
      }
    },

    methods: {
      initializeWikibaseSettings() {
        // Initialize wikibase settings from config if set
        const config = useConfigStore();
        const wikibaseConfig = config.returnUrls?.wikibase;
        console.log('[PostModal] Initializing Wikibase settings:', wikibaseConfig);
        
        if (wikibaseConfig?.url) {
          this.wikibaseUrl = wikibaseConfig.url;
        }
        // Load bot credentials from config (for dev) or localStorage
        if (wikibaseConfig?.botUsername) {
          this.wikibaseBotUsername = wikibaseConfig.botUsername;
        }
        if (wikibaseConfig?.botPassword) {
          this.wikibaseBotPassword = wikibaseConfig.botPassword;
        }
        // Try to load from localStorage for convenience (optional)
        const savedUsername = localStorage.getItem('wikibase_bot_username');
        if (savedUsername && !this.wikibaseBotUsername) {
          this.wikibaseBotUsername = savedUsername;
        }
        
        console.log('[PostModal] Wikibase URL:', this.wikibaseUrl);
        console.log('[PostModal] Bot Username:', this.wikibaseBotUsername);
        console.log('[PostModal] Bot Password set:', !!this.wikibaseBotPassword);
      },

      done: function() {
        this.showPostModal = false;
        this.showDropdown = false;
        this.showDestinationDropdown = false;
        this.wikibaseResults = null;
      },

      toggleDropdown: function() {
        this.showDropdown = !this.showDropdown;
        this.showDestinationDropdown = false;
        console.log("Dropdown toggled:", this.showDropdown);
      },

      toggleDestinationDropdown: function() {
        this.showDestinationDropdown = !this.showDestinationDropdown;
        this.showDropdown = false;
        console.log("Destination dropdown toggled:", this.showDestinationDropdown);
      },

      selectOption: function(option) {
        this.postType = option.value;
        console.log("Option selected:", option.label);
        this.showDropdown = false;
      },

      selectDestination: function(option) {
        this.destination = option.value;
        console.log("Destination selected:", option.label);
        this.showDestinationDropdown = false;
      },

      async post() {
        this.$refs.errorHolder.style.height = this.initalHeight + 'px';
        this.posting = true;
        this.showDropdown = false;
        this.showDestinationDropdown = false;
        this.postResults = {};
        this.wikibaseResults = null;
        this.holdingInfo = null;
        
        try {
          // Generate the XML
          const xmlString = await this.generateXML(this.activeProfile);
          
          // Route based on destination
          if (this.destination === 'wikibase') {
            await this.postToWikibase(xmlString);
            return;
          }
          
          // Default: Post to Alma
          
          let response;
          // Create request payload with the right data
          const requestData = {
            name: this.activeProfile.uuid || translator.toUUID(translator.new()),
            rdfxml: xmlString,
            eid: this.activeProfile.eId
          };
          
          if (this.postType === 'instance') {
            // Post to the instance-only endpoint
            response = await utilsNetwork.postInstanceToServer(requestData);
          } else {
            // For work-only or work+instance, use the standard publish method
            response = await this.profileStore.publishRecord(xmlString, this.activeProfile, this.postType);
          }
          
          // Log the raw server response to diagnose structure issues
          console.log("Raw server response:", response);
          
          // Handle holding information extraction
          this.handleResponse(response);
          
          // IMPORTANT: Store the ORIGINAL response structure without modification
          // This will preserve the nested work and instance data for normalizedWorkIds
          this.postResults = response;
          
          // Log the data that will be used for displaying IDs
          console.log("Work ID debug - response structure:", JSON.stringify(this.postResults, null, 2));
          if (this.postResults.work) {
            console.log("Work data directly in response:", this.postResults.work);
          } else if (this.postResults.name?.work) {
            console.log("Work data in name.work:", this.postResults.name.work);
          } else if (this.postResults.name?.work_mms_id) {
            console.log("Work MMS ID in legacy format:", this.postResults.name.work_mms_id);
          } else {
            console.log("No work information found - full response:", this.postResults);
          }
          
        } catch (error) {
          console.error("Error during post:", error);
          this.postResults = {
            publish: { status: 'error', message: error.message || 'An unknown error occurred' }
          };
        } finally {
          this.posting = false;
        }
      },

      /**
       * Post to Wikibase instance
       */
      async postToWikibase(xmlString) {
        try {
          console.log('[PostModal] Publishing to Wikibase...');
          console.log('[PostModal] Current values - URL:', this.wikibaseUrl, 'Username:', this.wikibaseBotUsername, 'Password set:', !!this.wikibaseBotPassword);
          
          // Get Wikibase URL from config or user input
          const wikibaseUrl = this.wikibaseUrl || this.wikibaseConfig?.url;
          
          if (!wikibaseUrl) {
            throw new Error('Please enter your Wikibase URL');
          }
          
          // Check for bot credentials
          if (!this.wikibaseBotUsername || !this.wikibaseBotPassword) {
            console.log('[PostModal] Missing credentials - Username:', this.wikibaseBotUsername, 'Password empty:', !this.wikibaseBotPassword);
            throw new Error('Please enter your bot username and password. Create them at Special:BotPasswords on your Wikibase.');
          }
          
          // Save username to localStorage for convenience (never save password)
          localStorage.setItem('wikibase_bot_username', this.wikibaseBotUsername);
          
          // Configure the Wikibase publisher with bot credentials
          configureWikibase({
            wikibaseUrl: wikibaseUrl,
            apiPath: this.wikibaseConfig?.apiPath || '/w/api.php',
            propertyMappings: this.wikibaseConfig?.propertyMappings || {},
            typeItems: this.wikibaseConfig?.typeItems || {},
            credentials: {
              username: this.wikibaseBotUsername,
              password: this.wikibaseBotPassword
            },
            useSession: false,  // Use bot credentials instead of session
            dryRun: false
          });
          
          // Publish to Wikibase
          const results = await publishToWikibase(xmlString, {
            propertyMappings: this.wikibaseConfig?.propertyMappings,
            typeItems: this.wikibaseConfig?.typeItems
          });
          
          console.log('[PostModal] Wikibase publish results:', results);
          
          this.wikibaseResults = results;
          
          if (results.success) {
            this.postResults = {
              publish: { status: 'published' },
              wikibase: {
                works: results.works,
                instances: results.instances,
                items: results.items,
                url: wikibaseUrl
              }
            };
          } else {
            this.postResults = {
              publish: { 
                status: 'error', 
                message: results.errors.map(e => e.error).join('; ') || 'Wikibase publishing failed'
              },
              wikibase: results
            };
          }
          
        } catch (error) {
          console.error('[PostModal] Wikibase error:', error);
          this.postResults = {
            publish: { status: 'error', message: error.message || 'Wikibase publishing failed' }
          };
        } finally {
          this.posting = false;
        }
      },

      postwork: async function() {
        await this.publishRecord('work');
      },

      postinstance: async function() {
        await this.publishRecord('instance');
      },

      async publishRecord(type) {
        const config = useConfigStore();
        
        this.$refs.errorHolder.style.height = this.initalHeight + 'px'
        this.posting = true
        const profile = this.activeProfile

        if (!profile) {
          console.error('Profile is not defined')
          this.postResults = {
            publish: {
              status: 'error',
              message: 'Profile is not defined'
            }
          }
          this.posting = false
          return
        }

        if (!profile.eId) {
          console.error('EID is not defined', profile)
          this.postResults = {
            publish: {
              status: 'error',
              message: 'EID is not defined'
            }
          }
          this.posting = false
          return
        }

        // Generate or retrieve xmlString here
        const xmlString = await this.generateXML(profile) // Implement generateXML accordingly
        console.log('Generated XML:', xmlString);

        if (!xmlString || xmlString === '<rdf:RDF></rdf:RDF>') {
          console.error('Generated XML is empty')
          this.postResults = {
            publish: {
              status: 'error',
              message: 'Generated XML is empty'
            }
          }
          this.posting = false
          return
        }

        try {
          const response = await this.profileStore.publishRecord(xmlString, profile, type);
          this.postResults = response; // Store the entire response

          // Check the status from the publish property
          if (response.publish && response.publish.status === 'published') {
            // Handle success
          } else {
            // Handle error
            console.error('Error response:', response);
          }
          
          this.handleResponse(response);
        } catch (error) {
          console.error('Error during post:', error)
          this.postResults = {
            publish: {
              status: 'error',
              message: error.message || 'An unknown error occurred'
            }
          }
        } finally {
          this.posting = false
        }
      },

      // Add this method to reliably get EID from the active profile
      getEID: function() {
        return this.activeProfile?.eId || '';
      },

      async handlePublish() {
        const profile = this.profileStore.activeProfile;

        if (!profile?.eId) {
          this.showError('EID is not available.');
          return;
      }

      const result = await this.profileStore.publishRecord(profile);

      // Add null check
      if (result && result.publish && result.publish.status === 'published') {
        this.showSuccess(result.name.instance_mms_id, result.name.work_mms_id);
      } else {
        // Also add a null check here
        const errorMessage = result && result.publish ? result.publish.message : 'Unknown error occurred';
        this.showError(errorMessage);
      }
    },

      cleanUpErrorResponse: function(msg) {
        if (!msg) return '';
        let cleaned = JSON.stringify(msg, null, 2);
        cleaned = cleaned
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
        return cleaned;
      },

      // Implement a method to generate XML from the profile
      async generateXML(profile) {
        // Use the buildXML method from utilsExport to generate the XML
        const xmlObj = await utilsExport.buildXML(profile);
        let xmlString = xmlObj && xmlObj.xmlStringFormatted ? xmlObj.xmlStringFormatted : '<rdf:RDF></rdf:RDF>';
        // Remove any extraneous encoded quotes in namespace declarations (e.g. &quot;)
        xmlString = xmlString.replace(/&quot;/g, '');
        return xmlString;
      },

      handleOutsideClick(e) {
        if (this.showDropdown && !e.target.closest('.dropdown-wrapper') && !e.target.closest('.bar-menu')) {
          this.showDropdown = false;
        }
      },

      // Display success message with MMS IDs
      showSuccess: function(instanceMmsId, workMmsId) {
        this.postResults = {
          publish: { 
            status: 'published' 
          },
          name: {
            instance_mms_id: instanceMmsId ? [instanceMmsId] : [],
            work_mms_id: workMmsId ? [workMmsId] : []
          }
        };
        this.posting = false;
      },

      // Display error message
      showError: function(message) {
        this.postResults = {
          publish: {
            status: 'error',
            message: message || 'An unknown error occurred'
          }
        };
        this.posting = false
      },

      // Update handleResponse method to handle the new API response formats
      handleResponse(response) {
        console.log('Processing server response in handleResponse:', response);
        
        // Reset holding information
        this.holdingInfo = null;
        
        if (!response) {
          console.log('Response is empty or invalid');
          return;
        }

        // First check for name.work.mms_id and ensure it's copied to work_mms_id
        if (response.name?.work?.mms_id) {
          if (!response.name.work_mms_id) {
            response.name.work_mms_id = [response.name.work.mms_id];
          } else if (Array.isArray(response.name.work_mms_id) && response.name.work_mms_id.length === 0) {
            response.name.work_mms_id.push(response.name.work.mms_id);
          }
          console.log("Added work mms_id to work_mms_id array:", response.name.work_mms_id);
        }
        
        // Check for holding information in nested format
        if (response.name?.instance?.holding) {
          this.holdingInfo = {
            mms_id: response.name.instance.mms_id || 'Not provided',
            holding_id: response.name.instance.holding.holding_id || 'Not provided',
            item_id: response.name.instance.holding.item_id || 'Not available'
          };
          console.log('Extracted holding info from name.instance.holding:', this.holdingInfo);
        }
        // Instance exists but no holding information
        else if (response.name?.instance) {
          console.log('Instance found but no holding information');
        }
        else {
          console.log('No instance information found in the response');
        }
      },

      async sendDataToServer() {
        try {
          const response = await utilsNetwork.postInstanceToServer(instanceData);
          
          // Show the modal with the response
          this.showPostModal = true;
          this.$nextTick(() => {
            // Make sure to pass the complete response object
            this.$refs.postModal.handleResponse(response);
          });
        } catch (error) {
          console.error('Error posting data:', error);
          // Handle error
        }
      }
    },

    mounted() {
      // Add a click event listener to close dropdown when clicking outside
      document.addEventListener('click', this.handleOutsideClick);
    },
    beforeUnmount() {
      // Clean up the event listener when component is unmounted
      document.removeEventListener('click', this.handleOutsideClick);
    }
  }
</script>

<template>
  <VueFinalModal
    display-directive="show"
    :hide-overlay="false"
    :overlay-transition="'vfm-fade'"
    :click-to-close="false"
    :esc-to-close="false"
  >
    <div class="login-modal" id="error-holder" ref="errorHolder">
      <h1 v-if="posting">Posting please wait...</h1>

      <div v-if="!posting && Object.keys(postResults).length === 0">
        <h2>Post Options</h2>
        
        <!-- Destination Selector (hidden if only one destination) -->
        <div v-if="!singleDestination" class="option-row">
          <label class="option-label">Destination:</label>
          <div class="post-type-selector">
            <div class="dropdown-wrapper" @click.stop="toggleDestinationDropdown">
              <div class="selected-option">{{ selectedDestinationLabel }}</div>
              <div class="dropdown-arrow">▼</div>
              
              <div v-if="showDestinationDropdown" class="bar-menu menu">
                <div class="extended-hover-zone"></div>
                <div class="bar-menu-items">
                  <div 
                    v-for="option in destinationOptions" 
                    :key="option.value" 
                    class="bar-menu-item"
                    @click.stop="selectDestination(option)"
                  >
                    <span class="label">{{ option.label }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Single destination indicator (when only one option) -->
        <div v-else class="option-row">
          <label class="option-label">Destination:</label>
          <div class="single-destination-label">{{ selectedDestinationLabel }}</div>
        </div>
        
        <!-- Wikibase credentials - always show since Wikibase is the only destination -->
        <div class="wikibase-config">
          <div class="option-row">
            <label class="option-label">Wikibase URL:</label>
            <input 
              v-model="wikibaseUrl" 
              type="url" 
              placeholder="https://your-wikibase.example.com"
              class="wikibase-url-input"
            />
          </div>
          
          <!-- Bot credentials section -->
          <div class="credentials-section">
            <div class="option-row">
              <label class="option-label">Bot Username:</label>
              <input 
                v-model="wikibaseBotUsername" 
                type="text" 
                placeholder="Username@BotName"
                class="wikibase-url-input"
              />
            </div>
            <div class="option-row">
              <label class="option-label">Bot Password:</label>
              <input 
                v-model="wikibaseBotPassword" 
                type="password" 
                placeholder="Bot password from Special:BotPasswords"
                class="wikibase-url-input"
              />
            </div>
            <p class="wikibase-hint">
              🔐 Create bot credentials at <a :href="wikibaseUrl + '/wiki/Special:BotPasswords'" target="_blank">Special:BotPasswords</a>
            </p>
          </div>
        </div>
        
        <!-- Post Type Selector (Work/Instance) -->
        <div class="option-row">
          <label class="option-label">Content:</label>
          <div class="post-type-selector">
            <div class="dropdown-wrapper" @click.stop="toggleDropdown">
              <div class="selected-option">{{ selectedOptionLabel }}</div>
              <div class="dropdown-arrow">▼</div>
              
              <div v-if="showDropdown" class="bar-menu menu">
                <div class="extended-hover-zone"></div>
                <div class="bar-menu-items">
                  <div 
                    v-for="option in postOptions" 
                    :key="option.value" 
                    class="bar-menu-item"
                    @click.stop="selectOption(option)"
                  >
                    <span class="label">{{ option.label }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="button-container">
          <button @click="post" class="post-button">
            {{ destination === 'wikibase' ? '🌐 Post to Wikibase' : '📚 Post' }}
          </button>
          <button @click="done" class="cancel-button">Cancel</button>
        </div>
      </div>

      <div v-if="!posting && Object.keys(postResults).length !== 0">
        <!-- Wikibase Success -->
        <div v-if="postResults.wikibase && postResults.publish?.status === 'published'" style="margin: 0.5em 0; background-color: #90ee9052; padding: 0.5em; border-radius: 0.25em;">
          <h3>🌐 Published to Wikibase!</h3>
          <p>Records created at {{ postResults.wikibase.url }}</p>
          
          <div v-if="postResults.wikibase.works?.length">
            <strong>Works:</strong>
            <ul>
              <li v-for="work in postResults.wikibase.works" :key="work.id">
                <a :href="postResults.wikibase.url + '/wiki/' + work.id" target="_blank">
                  {{ work.id }}
                </a>
                - {{ work.label }}
              </li>
            </ul>
          </div>
          
          <div v-if="postResults.wikibase.instances?.length">
            <strong>Instances:</strong>
            <ul>
              <li v-for="instance in postResults.wikibase.instances" :key="instance.id">
                <a :href="postResults.wikibase.url + '/wiki/' + instance.id" target="_blank">
                  {{ instance.id }}
                </a>
                - {{ instance.label }}
              </li>
            </ul>
          </div>
        </div>
        
        <!-- Alma/Default Success -->
        <div v-else-if="postResults.publish && postResults.publish.status === 'published'" style="margin: 0.5em 0; background-color: #90ee9052; padding: 0.5em; border-radius: 0.25em;">
          The record was accepted by the system.
          <div v-if="hasMMSIDs">
            MMS IDs:
            <ul>
              <li v-if="normalizedInstanceIds.length">Instance:
                <ul>
                  <li v-for="id in normalizedInstanceIds" :key="id">{{ id }}</li>
                </ul>
              </li>
              <li v-if="normalizedWorkIds.length">Work:
                <ul>
                  <li v-for="id in normalizedWorkIds" :key="id">{{ id }}</li>
                </ul>
              </li>
            </ul>
          </div>
          <div v-else>
            MMS IDs are not available.
          </div>
        </div>
        <div v-else-if="postResults.publish && postResults.publish.status !== 'published' && postResults.publish.status" style="margin: 0.5em 0; background-color: #ffcccb; padding: 0.5em; border-radius: 0.25em;">
          <h2>There was an error posting: {{ postResults.publish.message }}</h2>
          <pre>{{ cleanUpErrorResponse(postResults.publish.message) }}</pre>
          <button @click="done">Close</button>
        </div>
        <div v-else style="margin: 0.5em 0; background-color: #ffcccb; padding: 0.5em; border-radius: 0.25em;">
          <h2>An unknown error occurred.</h2>
          <pre>{{ JSON.stringify(postResults, null, 2) }}</pre>
          <button @click="done">Close</button>
        </div>
      </div>

      <button v-if="!posting && Object.keys(postResults).length !== 0" @click="done">Close</button>
      
      <!-- Add this section to display holding information -->
      <div v-if="holdingInfo" class="holding-info-container">
        <h3>Created Holding Information</h3>
        <div class="holding-details">
          <div class="detail-row">
            <span class="detail-label">Instance:</span>
            <span class="detail-value">{{ holdingInfo.mms_id }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Holding:</span>
            <span class="detail-value">{{ holdingInfo.holding_id }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Item:</span>
            <span class="detail-value">{{ holdingInfo.item_id }}</span>
          </div>
        </div>
      </div>
    </div>
  </VueFinalModal>
</template>

<style scoped>
  #error-holder {
    overflow-y: scroll;
  }

  .checkbox-option {
    width: 20px;
    height: 20px;
  }

  .option {
    display: flex;
  }
  .option-title {
    flex: 2;
  }
  .option-title-header {
    font-weight: bold;
  }
  .option-title-desc {
    font-size: 0.8em;
    color: gray;
  }
  #debug-content {
    overflow: hidden;
    overflow-y: auto;
  }
  .menu-buttons {
    margin-bottom: 2em;
    position: relative;
  }
  .close-button {
    position: absolute;
    right: 5px;
    top: 5px;
    background-color: white;
    border-radius: 5px;
    border: solid 1px black;
    cursor: pointer;
  }
  .login-modal {
    background-color: white;
    -webkit-box-shadow: 0px 10px 13px -7px #000000, 5px 5px 15px 5px rgba(0,0,0,0.27);
    box-shadow: 0px 10px 13px -7px #000000, 5px 5px 15px 5px rgba(0,0,0,0.27);
    border-radius: 1em;
    padding: 1em;
    border: solid 1px black;
  }
  div {
    /* margin-top: 2em; */
  }

  input {
    font-size: 1.5em;
    margin-top: 0.5em;
  }
  strong {
    font-weight: bold;
  }
  button {
    font-size: 1.5em;
  }

  /* Dropdown styles */
  .post-type-selector {
    margin: 1.5em 0;
    position: relative;
  }
  
  .dropdown-wrapper {
    position: relative;
    width: 250px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background-color: white;
    cursor: pointer;
    padding: 0.5em 1em;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .selected-option {
    font-size: 1.2em;
  }
  
  .dropdown-arrow {
    font-size: 0.8em;
  }
  
  .bar-menu {
    position: absolute;
    width: 100%;
    z-index: 1000;
    margin-top: 2px;
    left: 0;
    top: 100%;
  }
  
  .bar-menu-items {
    background-color: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    overflow: visible;
  }
  
  .bar-menu-item {
    padding: 0.5em 1em;
    cursor: pointer;
    font-size: 1.2em;
  }
  
  .bar-menu-item:hover {
    background-color: #f0f0f0;
  }
  
  .extended-hover-zone {
    position: absolute;
    top: -10px;
    left: 0;
    right: 0;
    height: 10px;
  }
  
  .button-container {
    display: flex;
    justify-content: flex-start;
    gap: 1em;
    margin-top: 1em;
  }
  
  .post-button {
    background-color: #4CAF50;
    color: white;
    border: none;
    border-radius: 5px;
    padding: 0.5em 1em;
    cursor: pointer;
  }
  
  .cancel-button {
    background-color: #f44336;
    color: white;
    border: none;
    border-radius: 5px;
    padding: 0.5em 1em;
    cursor: pointer;
  }
  
  /* Add these styles for the holding info section */
  .holding-info-container {
    margin-top: 20px;
    padding: 15px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    background-color: #f9f9f9;
  }

  h3 {
    margin-top: 0;
    margin-bottom: 15px;
    color: #333;
    font-size: 1.1rem;
  }

  .holding-details {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .detail-row {
    display: flex;
  }

  .detail-label {
    min-width: 100px;
    font-weight: bold;
    color: #555;
  }

  .detail-value {
    color: #333;
  }
  
  /* Wikibase specific styles */
  .option-row {
    display: flex;
    align-items: center;
    gap: 1em;
    margin: 1em 0;
  }
  
  .option-label {
    min-width: 100px;
    font-weight: bold;
  }
  
  .wikibase-config {
    background-color: #f0f7ff;
    border: 1px solid #b3d4fc;
    border-radius: 6px;
    padding: 1em;
    margin: 1em 0;
  }
  
  .wikibase-url-input {
    flex: 1;
    padding: 0.5em;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1em !important;
    min-width: 300px;
  }
  
  .wikibase-hint {
    font-size: 0.85em;
    color: #666;
    margin-top: 0.5em;
    margin-bottom: 0;
  }
  
  .wikibase-results a {
    color: #0366d6;
    text-decoration: none;
  }
  
  .wikibase-results a:hover {
    text-decoration: underline;
  }
  
  .single-destination-label {
    font-weight: 500;
    color: #333;
    padding: 0.5em 0;
  }
  
  .credentials-section {
    margin-top: 1em;
    padding-top: 1em;
    border-top: 1px solid #e0e0e0;
  }
  
  .credentials-section .option-row {
    margin-bottom: 0.75em;
  }
  
  .credentials-section a {
    color: #0366d6;
    text-decoration: none;
  }
  
  .credentials-section a:hover {
    text-decoration: underline;
  }
</style>