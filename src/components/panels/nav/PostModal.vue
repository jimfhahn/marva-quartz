<script>
  import { useProfileStore } from '@/stores/profile'
  import { useConfigStore } from '@/stores/config'
  import utilsNetwork from '@/lib/utils_network'
  import short from 'short-uuid' // Add this import

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
        showDropdown: false,

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
      normalizedInstanceIds() {
        // New response format direct at root
        if (this.postResults.instance?.mms_id) {
          return [this.postResults.instance.mms_id];
        }
        // Legacy nested format
        else if (this.postResults.name?.instance_mms_id?.length) {
          return this.postResults.name.instance_mms_id;
        }
        // Legacy nested object format
        else if (this.postResults.name?.instance?.mms_id) {
          return [this.postResults.name.instance.mms_id];
        }
        return [];
      },
      
      normalizedWorkIds() {
        // New response format direct at root
        if (this.postResults.work?.mms_id) {
        return [this.postResults.work.mms_id];
        } 
        // Legacy nested format
        else if (this.postResults.name?.work_mms_id?.length) {
          return this.postResults.name.work_mms_id;
        }
        // Legacy nested object format
        else if (this.postResults.name?.work?.mms_id) {
          return [this.postResults.name.work.mms_id];
        }
        return [];
      },
      
      hasMMSIDs() {
        return this.normalizedInstanceIds.length > 0 || this.normalizedWorkIds.length > 0;
      }
    },

    methods: {
      done: function() {
        this.showPostModal = false;
        this.showDropdown = false;
      },

      toggleDropdown: function() {
        this.showDropdown = !this.showDropdown;
        console.log("Dropdown toggled:", this.showDropdown); // Add logging
      },

      selectOption: function(option) {
        this.postType = option.value;
        console.log("Option selected:", option.label); // Add logging
        this.showDropdown = false;
      },

      async post() {
        this.$refs.errorHolder.style.height = this.initalHeight + 'px';
        this.posting = true;
        this.showDropdown = false;
        this.postResults = {};
        this.holdingInfo = null; // Reset holding info
        
        try {
          // Generate the XML
          const xmlString = await this.generateXML(this.activeProfile);
          
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
          
          console.log("Post response:", response);
          
          // Handle holding information extraction
          this.handleResponse(response);
          
          // Normalize the response for display
          if (response.instance || response.work) {
            // Format using the new response structure
            this.postResults = {
              publish: { status: 'published' },
              ...response // Include the full response with instance and/or work objects
            };
          } else {
            // Keep original response structure for legacy formats
            this.postResults = response;
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
        
        // Case 1: New response format - direct instance object with holding
        if (response && response.instance && response.instance.holding) {
          this.holdingInfo = {
            mms_id: response.instance.mms_id || 'Not provided',
            holding_id: response.instance.holding.holding_id || 'Not provided',
            item_id: response.instance.holding.item_id || 'Not provided'
          };
          console.log('Extracted holding info from new response format:', this.holdingInfo);
        }
        // Case 2: Legacy format - name.instance with holding
        else if (response && response.name && response.name.instance && response.name.instance.holding) {
          this.holdingInfo = {
            mms_id: response.name.instance.mms_id || 'Not provided',
            holding_id: response.name.instance.holding.holding_id || 'Not provided',
            item_id: response.name.instance.holding.item_id || 'Not provided'
          };
          console.log('Extracted holding info from legacy name.instance format:', this.holdingInfo);
        }
        // Case 3: Legacy format with separate holding object
        else if (response && response.holding) {
          // Try to find the associated instance ID from any available source
          let instanceId = null;
          if (response.instance && response.instance.mms_id) {
            instanceId = response.instance.mms_id;
          } else if (response.name && response.name.instance_mms_id && response.name.instance_mms_id.length > 0) {
            instanceId = response.name.instance_mms_id[0];
          }
          
          this.holdingInfo = {
            mms_id: instanceId || 'Not provided',
            holding_id: response.holding.holding_id || 'Not provided',
            item_id: response.holding.item_id || 'Not provided'
          };
          console.log('Extracted holding info from separate holding object:', this.holdingInfo);
        }
        else {
          console.log('No holding information found in the response');
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
        
        <div class="button-container">
          <button @click="post" class="post-button">Post</button>
          <button @click="done" class="cancel-button">Cancel</button>
        </div>
      </div>

      <div v-if="!posting && Object.keys(postResults).length !== 0">
        <div v-if="postResults.publish && postResults.publish.status === 'published'" style="margin: 0.5em 0; background-color: #90ee9052; padding: 0.5em; border-radius: 0.25em;">
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
            <span class="detail-label">MMS ID:</span>
            <span class="detail-value">{{ holdingInfo.mms_id }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Holding ID:</span>
            <span class="detail-value">{{ holdingInfo.holding_id }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Item ID:</span>
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
</style>