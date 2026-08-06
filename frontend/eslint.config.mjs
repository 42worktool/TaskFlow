import skipFormattingConfig from '@vue/eslint-config-prettier/skip-formatting'
import { withVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'

export default withVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,tsx,vue}'],
  },
  {
    name: 'app/files-to-ignore',
    ignores: ['dist/**', 'coverage/**'],
  },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  {
    name: 'app/single-word-page-components',
    files: ['src/pages/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
  skipFormattingConfig,
)
