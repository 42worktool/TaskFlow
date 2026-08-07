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
    class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-65"
    required
  />
</template>
