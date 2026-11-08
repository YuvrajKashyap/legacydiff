import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
 {ignores:['**/node_modules/**','**/dist/**','.local/**','packages/client/generated/**','playwright-report/**','test-results/**']},
 js.configs.recommended,
 ...tseslint.configs.recommended,
 {files:['**/*.ts','**/*.tsx'],rules:{'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]}},
 {files:['eslint.config.js'],languageOptions:{sourceType:'module'}},
);
