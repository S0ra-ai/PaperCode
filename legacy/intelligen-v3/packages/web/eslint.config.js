import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'

const browserGlobals = {
  Blob: 'readonly',
  Event: 'readonly',
  EventSource: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  FormData: 'readonly',
  MouseEvent: 'readonly',
  URL: 'readonly',
  console: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  window: 'readonly'
}

const testGlobals = {
  afterEach: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly',
  vi: 'readonly'
}

const nodeGlobals = {
  URL: 'readonly'
}

export default [
  {
    ignores: ['dist/**']
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      globals: browserGlobals
    }
  },
  {
    files: ['vite.config.js', 'vitest.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: nodeGlobals
    }
  },
  {
    files: ['**/*.js', '**/*.vue'],
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off'
    }
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: {
        ...browserGlobals,
        ...testGlobals
      }
    }
  }
]
