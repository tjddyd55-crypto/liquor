module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    // ❌ window.confirm 금지
    'no-restricted-globals': [
      'error',
      {
        name: 'confirm',
        message: 'window.confirm 대신 ConfirmDialog를 사용하세요.',
      },
    ],

    // ❌ raw button 금지
    'no-restricted-syntax': [
      'error',
      {
        selector: 'JSXOpeningElement[name.name="button"]',
        message: 'button 대신 FormButton을 사용하세요.',
      },
      {
        selector: 'JSXOpeningElement[name.name="input"]',
        message: 'input 대신 FormInput을 사용하세요.',
      },
      {
        selector: 'JSXOpeningElement[name.name="select"]',
        message: 'select 대신 FormSelect를 사용하세요.',
      },
      {
        selector: 'JSXOpeningElement[name.name="textarea"]',
        message: 'textarea 대신 FormTextarea를 사용하세요.',
      },
    ],
  },
}
