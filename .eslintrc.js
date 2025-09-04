module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },
  rules: {
    // Error prevention
    'no-console': 'warn',
    'no-debugger': 'error',
    'no-unused-vars': 'error',
    'no-undef': 'error',
    
    // Code style
    'indent': ['error', 2],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'never'],
    
    // Best practices
    'eqeqeq': 'error',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    
    // Security
    'no-new-require': 'error',
    'no-path-concat': 'error'
  },
  overrides: [
    {
      files: ['tests/**/*.js', '**/*.test.js'],
      rules: {
        'no-console': 'off'
      }
    }
  ]
};
