module.exports = {
  extends: 'erb',
  plugins: ['@typescript-eslint'],
  rules: {
    // A temporary hack related to IDE not resolving correct package.json
    'import/no-extraneous-dependencies': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': 'off',
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
    'import/no-import-module-exports': 'off',
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    'no-unused-vars': 'off',
    // A leading underscore marks a binding that is deliberately unused, which
    // is the convention already used across this codebase.
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'import/prefer-default-export': 'off',

    // Airbnb defaults that conflict with patterns used deliberately throughout
    // this codebase. Disabled rather than churned through 100+ call sites.
    'no-plusplus': 'off',
    'no-continue': 'off',
    'no-nested-ternary': 'off',
    'no-underscore-dangle': 'off',
    // Bans for..of, which is used intentionally when walking LMU API payloads.
    'no-restricted-syntax': 'off',
    // Replay and log reads are sequenced on purpose to avoid flooding LMU.
    'no-await-in-loop': 'off',
    // `void somePromise()` marks intentional fire-and-forget work in main.
    'no-void': 'off',
    // Native modules are required lazily so a load failure can fall back.
    'global-require': 'off',
    'max-classes-per-file': 'off',
    'class-methods-use-this': 'off',

    // Diagnostics are expected; plain logging is not.
    'no-console': ['error', { allow: ['warn', 'error'] }],

    // Advisory rather than blocking: satisfying it blindly can introduce
    // render loops, so each case needs individual review.
    'react-hooks/exhaustive-deps': 'warn',

    'react/function-component-definition': [
      'error',
      {
        namedComponents: 'arrow-function',
        unnamedComponents: 'arrow-function',
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        // TypeScript resolves these itself, and the rule cannot see type-only
        // globals such as the React and Electron namespaces.
        'no-undef': 'off',
        // Props are validated by TypeScript types; PropTypes are not used.
        'react/prop-types': 'off',
        // Optional props are expressed with `?` rather than defaultProps.
        'react/require-default-props': 'off',
        // The base rule does not understand type declarations or hoisted
        // functions; only genuine use-before-initialization is an error.
        'no-use-before-define': 'off',
        '@typescript-eslint/no-use-before-define': [
          'error',
          {
            functions: false,
            classes: false,
            typedefs: false,
            variables: true,
          },
        ],
        // Both fire on TypeScript parameter properties.
        'no-useless-constructor': 'off',
        'no-empty-function': 'off',
      },
    },
    {
      files: ['scripts/**', 'tools/**', '.erb/**'],
      rules: {
        // Build and diagnostic scripts report progress on stdout.
        'no-console': 'off',
      },
    },
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  settings: {
    'import/resolver': {
      // See https://github.com/benmosher/eslint-plugin-import/issues/1396#issuecomment-575727774 for line below
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        moduleDirectory: ['node_modules', 'src/'],
      },
      webpack: {
        config: require.resolve('./.erb/configs/webpack.config.eslint.ts'),
      },
      typescript: {},
    },
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
  },
};
