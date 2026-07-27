<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: string
    name: string
    autocomplete: string
    placeholder: string
    disabled?: boolean
    minlength?: number
    maxlength?: number
  }>(),
  {
    type: 'text',
    disabled: false,
    minlength: undefined,
    maxlength: undefined,
  },
)

const model = defineModel<string>({ required: true })
</script>

<template>
  <input
    v-model="model"
    :type="type"
    :name="name"
    :autocomplete="autocomplete"
    :placeholder="placeholder"
    :disabled="disabled"
    :minlength="minlength"
    :maxlength="maxlength"
    class="form-input"
    required
  />
</template>

<style scoped src="../styles/auth-input.css"></style>
