<script>
  import { useProfileStore } from '@/stores/profile'
  import { mapStores, mapState } from 'pinia'

  export default {
    // Add props definition here
    props: {
      show: {
        type: Boolean,
        required: true,
        default: false // Provide a default value
      },
      message: {
        type: String,
        required: true,
        default: "Loading..." // Provide a default value
      }
    },
    data() {
      return {

      }
    },
    computed: {
      // other computed properties
      // ...
      // gives access to this.counterStore and this.userStore
      ...mapStores(useProfileStore),
      // // gives read access to this.count and this.double
      ...mapState(useProfileStore, ['profilesLoaded']),
    },

    // watch: {
    //   // whenever question changes, this function will run
    //   question(newVal, oldVal) {
    //     if(newVal===true){

    //     }
    //   }
    // },

    methods: {


    },

    mounted() {

    //  console.log(this.$t("--c-edit-main-splitpane-properties-background-color--desc"),'<------')

    }
  }



</script>

<template>
  <Teleport to="body">
    <!-- Use the 'show' prop here instead of 'profilesLoaded' -->
    <Transition appear>
      <!-- Conditionally render based on the 'show' prop -->
      <div v-if="show" class="modal">
        <div class="modal-text">
          <!-- Use the 'message' prop here -->
          <h1>{{ message }}</h1>
          <!-- Or use the translation if the message prop is meant to be a key -->
          <!-- <h1>{{ $t(message) }}</h1> -->
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>

.modal {
  color: var(--c-black);
  position: fixed;
  z-index: 999;
  top: 20%;
  left: 0%;
  width: 100%;
  height: 24vmin;
  background-color: whitesmoke;
  border: solid 1px var(--c-gray-soft);
  box-shadow: 0px 6px 7px 0px var(--c-black-mute);

}
.modal-text{
  text-align: center;
}
.modal-text h1{

  font-size: 20vmin;
}

.v-enter-active,
.v-leave-active {
  transition: opacity 0.5s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}

</style>
