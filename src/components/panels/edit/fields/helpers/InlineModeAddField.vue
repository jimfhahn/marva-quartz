<template>
  
  <template v-if="possibleFields.length>1">
    <input ref="input" @input="codeInput" v-model="filter" @focus="codeInput" @blur="blur">
    <div ref="dropdown" class="dropdown">    
      <template v-for="pf in possibleFields">
        <div @click="addToDisplay(pf)" v-if="(filter != '' && pf.code.toLowerCase().startsWith(filter.toLowerCase())) || (filter.trim() == '')" class="dropdown-item">
          {{pf.code}} - {{pf.label}}
        </div>
      </template>
    </div>
  </template>
</template>

<script>

import { useProfileStore } from '@/stores/profile'
import { mapStores, mapState, mapWritableState } from 'pinia'




export default {
  name: "InlineModeAddField",
  components: {



  },

  props: {
    guid: String,
    structure: Object
  },

  data:function() {
    return {

      aaaaa: '',
      filter:''

    }
  },

  created: function(){


  },

  computed: {

    ...mapStores(useProfileStore),


    possibleFields(){

      return this.profileStore.returnPossibleFieldsInComponent(this.guid)

    }


  },



  methods:{

    codeInput(){


      // console.log(this.$refs.dropdown.style.left)
      // console.log(this.$refs.input.getBoundingClientRect())

      const rect = this.$refs.input.getBoundingClientRect();

      this.$refs.dropdown.style.left = rect.left +'px'
      this.$refs.dropdown.style.display = 'block'


    },

    blur(){

      window.setTimeout(()=>{
        this.$refs.dropdown.style.display = 'none'  
      },250)
      


    },


    addToDisplay(p){
      this.profileStore.setInlineDisplay(this.guid, p.uri)

    }


  }

};

</script>

<style scoped>
  input{
    width: 50px;
    background-color: transparent;
    border: none;
    font-family: monospace;
  }
  input:hover{
    background-color: whitesmoke;
  }
input:focus {
  outline: none;
}
.dropdown{
    position: fixed;
    background-color: white;
    z-index: 1000;
    display: none;
    border: solid 1px black;
    padding: 0.2em;
    font-family: monospace;


}
.dropdown-item:hover{
  background-color: cornflowerblue;
  cursor: pointer;
}
</style>