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

<style scoped>
.form-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  color: #111827;
  background: #f9fafb;
}

.form-input::placeholder {
  color: #9ca3af;
}

.form-input:focus {
  border-color: #2563eb;
  background: #fff;
  outline: none;
}

.form-input:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
</style>
