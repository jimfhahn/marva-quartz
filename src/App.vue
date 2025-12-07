<script>
import { RouterLink, RouterView } from "vue-router";

import LoadingModal from "@/components/general/LoadingModal.vue";
import PreferenceModal from "@/components/general/PreferenceModal.vue";
import LoginModal from "@/components/panels/nav/LoginModal.vue";
import ScriptshifterConfigModal from "@/components/panels/edit/modals/ScriptshifterConfigModal.vue";
import DiacriticsConfigModal from "@/components/panels/edit/modals/DiacriticsConfigModal.vue";
import TextMacroModal from "@/components/panels/edit/modals/TextMacroModal.vue";
import NonLatinBulkModal from "@/components/panels/edit/modals/NonLatinBulkModal.vue";
import NonLatinAgentModal from "@/components/panels/edit/modals/NonLatinAgentModal.vue";
import FieldColorsModal from "@/components/panels/edit/modals/FieldColorsModal.vue";
import HubStubCreateModal from "@/components/panels/edit/modals/HubStubCreateModal.vue";
import NacoStubCreateModal from "@/components/panels/edit/modals/NacoStubCreateModal.vue";

import ShelfListingModal from "@/components/panels/edit/modals/ShelfListing.vue";
import AutoDeweyModal from "./components/panels/edit/modals/AutoDeweyModal.vue";
import UpdateAvailableModal from "@/components/general/UpdateAvailableModal.vue";

import { useConfigStore } from '@/stores/config'
import { useProfileStore } from '@/stores/profile'
import { usePreferenceStore } from '@/stores/preference'

import { mapStores, mapState, mapWritableState } from 'pinia'

import utilsParse from '@/lib/utils_parse';

export default {
  components: {
    LoadingModal,
    PreferenceModal,
    LoginModal,
    ScriptshifterConfigModal,
    ShelfListingModal,
    DiacriticsConfigModal,
    UpdateAvailableModal,
    AutoDeweyModal,
    TextMacroModal,
    NonLatinBulkModal,
    NonLatinAgentModal,
    FieldColorsModal,
    HubStubCreateModal,
    NacoStubCreateModal
  },
  data() {
    return {
      count: 0,
      isEmbeddedInVSCode: false,
    }
  },
  computed: {
    // other computed properties
    // ...
    // gives access to this.counterStore and this.userStore
    ...mapStores(useConfigStore, useProfileStore, usePreferenceStore),
    // // gives read access to this.count and this.double
    ...mapState(useProfileStore, ['profilesLoaded', 'showValidateModal','profilesLoaded', 'showPostModal', 'showItemInstanceSelection']),
    ...mapWritableState(useProfileStore, ['showShelfListingModal','showHubStubCreateModal', 'showAutoDeweyModal', 'showNacoStubCreateModal']),

    ...mapState(usePreferenceStore, ['showPrefModal','catCode']),
    ...mapWritableState(usePreferenceStore, ['showLoginModal','showScriptshifterConfigModal','showDiacriticConfigModal','showTextMacroModal','showFieldColorsModal']),
    ...mapWritableState(useConfigStore, ['showUpdateAvailableModal','showNonLatinBulkModal','showNonLatinAgentModal']),

    showLocalPreferenceModal: {
      get() {
        return this.showPrefModal
      },
      set() {
        this.preferenceStore.togglePrefModal()
      }
    }
  },

  methods: {
    increment() {
      this.count++
    },
    
    /**
     * Handle messages from VS Code extension (when embedded in iframe)
     */
    handleVSCodeMessage(event) {
      // Only accept messages with a type property
      if (!event.data || !event.data.type) return;
      
      const { type, ...payload } = event.data;
      console.log('[Quartz Bridge] Received message:', type, payload);
      
      switch (type) {
        case 'ping':
          // VS Code is checking if we're ready
          this.sendToVSCode('pong', { ready: this.profilesLoaded });
          break;
          
        case 'loadXml':
          // Load BIBFRAME XML into the editor
          this.handleLoadXml(payload.xml, payload.profile);
          break;
          
        case 'getFormData':
          // Return current form data
          this.handleGetFormData();
          break;
          
        case 'navigate':
          // Navigate to a route
          if (payload.route) {
            this.$router.push(payload.route);
          }
          break;
      }
    },
    
    /**
     * Send a message back to VS Code extension
     */
    sendToVSCode(type, payload = {}) {
      if (window.parent !== window) {
        window.parent.postMessage({ type, ...payload }, '*');
        console.log('[Quartz Bridge] Sent message:', type, payload);
      }
    },
    
    /**
     * Load BIBFRAME XML into the editor
     */
    async handleLoadXml(xml, profileName) {
      if (!xml) {
        this.sendToVSCode('error', { message: 'No XML provided' });
        return;
      }
      
      try {
        console.log('[Quartz Bridge] Loading XML, length:', xml.length);
        
        // Use the standard parseXml function
        await utilsParse.parseXml(xml);
        
        // Find and set the appropriate profile
        const profileStore = useProfileStore();
        const defaultProfile = profileName || 'lc:RT:bf2:Monograph:Instance';
        
        for (let key in profileStore.profiles) {
          if (profileStore.profiles[key].rtOrder.indexOf(defaultProfile) > -1) {
            profileStore.activeProfile = JSON.parse(JSON.stringify(profileStore.profiles[key]));
            break;
          }
        }
        
        // Navigate to edit view
        this.$router.push({ name: 'Edit' });
        
        this.sendToVSCode('loadXmlComplete', { success: true });
      } catch (error) {
        console.error('[Quartz Bridge] Error loading XML:', error);
        this.sendToVSCode('error', { message: `Failed to load XML: ${error.message}` });
      }
    },
    
    /**
     * Get current form data and send back to VS Code
     */
    handleGetFormData() {
      const profileStore = useProfileStore();
      
      // Extract basic form data from the active profile
      const formData = {
        hasActiveProfile: !!profileStore.activeProfile?.id,
        profileId: profileStore.activeProfile?.id,
        isSaved: profileStore.activeProfileSaved,
        isPosted: profileStore.activeProfilePosted,
        // Add more fields as needed
      };
      
      this.sendToVSCode('formData', formData);
    }
  },

  async mounted() {
    console.log("App.vue mounted");
    
    // Set up VS Code message bridge if embedded in iframe
    if (window.parent !== window) {
      this.isEmbeddedInVSCode = true;
      window.addEventListener('message', this.handleVSCodeMessage);
      console.log('[Quartz Bridge] Message listener registered (embedded mode)');
    }
    
    try {
      const profileStoreInstance = useProfileStore();
      console.log("Profile store instance:", profileStoreInstance);
      
      // Initialize stores
      this.preferenceStore.initalize();
      
      // Initialize profiles using a more robust approach
      this.$nextTick(async () => {
        try {
          // If buildProfiles exists, use it
          if (typeof profileStoreInstance.buildProfiles === 'function') {
            console.log("Using buildProfiles method");
            await profileStoreInstance.buildProfiles(); // Changed from loadProfiles
          } else {
            // Otherwise, manually trigger the initialization that would normally 
            // happen in loadProfiles by using other available methods
            console.log("buildProfiles method not found, using alternative initialization"); // Changed log message
            
            // Set the profilesLoaded flag to prevent errors elsewhere
            profileStoreInstance.profilesLoaded = true;
          }
          console.log("Profile initialization complete");
          
          // Notify VS Code that Quartz is ready
          if (this.isEmbeddedInVSCode) {
            this.sendToVSCode('ready', { profilesLoaded: true });
          }
        } catch (loadError) {
          console.error("Error during profile initialization:", loadError);
        }
      });

      if (!this.catCode){
        this.showLoginModal = true
      }
      this.configStore.checkVersionOutOfDate();

    } catch (error) {
      console.error("Error in App.vue mounted:", error);
    }
  },
  
  beforeUnmount() {
    // Clean up message listener
    if (this.isEmbeddedInVSCode) {
      window.removeEventListener('message', this.handleVSCodeMessage);
      console.log('[Quartz Bridge] Message listener removed');
    }
  }
}
</script>

<template>
  <!-- START EDIT -->
  <template v-if="profilesLoaded">
    <RouterView />
  </template>
  <template v-else>
    <!-- Show a global loading indicator while profiles load -->
    <LoadingModal :show="true" message="Loading application data..." />
  </template>
  <!-- END EDIT -->

  <LoadingModal/>

  <!-- Prevents it from complaining when loading and not displaying -->
  <template v-if="showLocalPreferenceModal==true">
    <PreferenceModal v-model="showLocalPreferenceModal" />
  </template>
  <template v-if="showLoginModal==true">
    <LoginModal v-model="showLoginModal" />
  </template>
  <template v-if="showScriptshifterConfigModal==true">
    <ScriptshifterConfigModal v-model="showScriptshifterConfigModal" />
  </template>
  <template v-if="showDiacriticConfigModal==true">
    <DiacriticsConfigModal v-model="showDiacriticConfigModal"  />
  </template>

  <template v-if="showShelfListingModal==true">
    <ShelfListingModal v-model="showShelfListingModal"  />
  </template>
  <template v-if="showUpdateAvailableModal==true">
    <UpdateAvailableModal v-model="showUpdateAvailableModal"  />
  </template>
  <template v-if="showTextMacroModal==true">
    <TextMacroModal v-model="showTextMacroModal"  />
  </template>

  <template v-if="showNonLatinBulkModal==true">
    <NonLatinBulkModal v-model="showNonLatinBulkModal"  />
  </template>

  <template v-if="showNonLatinAgentModal==true">
    <NonLatinAgentModal v-model="showNonLatinAgentModal"  />
  </template>

  <template v-if="showFieldColorsModal==true">
    <FieldColorsModal v-model="showFieldColorsModal"  />
  </template>
  <template v-if="showHubStubCreateModal==true">
    <HubStubCreateModal v-model="showHubStubCreateModal"  />
  </template>

  <template v-if="showNacoStubCreateModal==true">
    <NacoStubCreateModal v-model="showNacoStubCreateModal"  />
  </template>
  
  <template v-if="showAutoDeweyModal==true">
    <AutoDeweyModal v-model="showAutoDeweyModal"  />
  </template>

</template>

<style scoped>
header {
  line-height: 1.5;
  max-height: 100vh;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}

nav {
  width: 100%;
  font-size: 12px;
  text-align: center;
  margin-top: 2rem;
}

nav a.router-link-exact-active {
  color: var(--color-text);
}

nav a.router-link-exact-active:hover {
  background-color: transparent;
}

nav a {
  display: inline-block;
  padding: 0 1rem;
  border-left: 1px solid var(--color-border);
}

nav a:first-of-type {
  border: 0;
}

@media (min-width: 1024px) {
  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  .logo {
    margin: 0 2rem 0 0;
  }

  header .wrapper {
    display: flex;
    place-items: flex-start;
    flex-wrap: wrap;
  }

  nav {
    text-align: left;
    margin-left: -1rem;
    font-size: 1rem;

    padding: 1rem 0;
    margin-top: 1rem;
  }
}
</style>
<!-- <style>
  @import './assets/main.css';
</style> -->