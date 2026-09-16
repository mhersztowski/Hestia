/**
 * Linting for the monorepo.
 *
 * Grown from MyCastle's `.eslintrc.json`, with three differences that matter:
 *
 *  - **The flat config.** ESLint 9 reads only this file; the old `.eslintrc`
 *    format it no longer looks at, which is why the rules over there never ran
 *    against anything but an editor.
 *  - **`react-hooks`.** The code disables `exhaustive-deps` 44 times and
 *    MyCastle's configuration never had the plugin — so those comments pointed
 *    at a rule nobody was running.
 *  - **File names.** The one thing here that can genuinely break a build: macOS
 *    does not distinguish `Toolbar.ts` from `toolbar.ts` and Linux does, so a
 *    pair that is one file locally becomes two in CI.
 *  - **Names.** `naming-convention`, tuned until it reported nothing on the
 *    code as it stands, so that what it reports from now on is a change.
 *
 * Type-aware rules are deliberately **not** enabled: they need a TypeScript
 * program per package and turn a lint run of seconds into one of minutes.
 * `pnpm typecheck` already compiles everything.
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import checkFile from 'eslint-plugin-check-file';
import globals from 'globals';

/**
 * The naming rules, shared by the two blocks below.
 *
 * `PascalCase` is allowed for a parameter because in this code a capitalised
 * parameter is a React component (`{ icon: Icon }`, `[panel, Icon, title]`) —
 * JSX reads a lowercase tag as an HTML element, so the capital is required,
 * not a slip. Underscores are allowed at both ends: a leading one marks
 * "deliberately unused" and a trailing one avoids shadowing.
 */
const NAMING = [
  'error',
  {
    selector: 'default',
    format: ['camelCase'],
    leadingUnderscore: 'allow',
    trailingUnderscore: 'allow',
  },
  // A destructured name is the source object's, not ours.
  { selector: 'variable', modifiers: ['destructured'], format: null },
  { selector: 'parameter', modifiers: ['destructured'], format: null },
  {
    selector: 'variable',
    format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
    leadingUnderscore: 'allow',
    trailingUnderscore: 'allow',
  },
  {
    selector: 'function',
    format: ['camelCase', 'PascalCase'],
    leadingUnderscore: 'allow',
    trailingUnderscore: 'allow',
  },
  {
    selector: 'parameter',
    format: ['camelCase', 'PascalCase'],
    leadingUnderscore: 'allow',
    trailingUnderscore: 'allow',
  },
  {
    selector: 'classProperty',
    format: ['camelCase', 'UPPER_CASE'],
    leadingUnderscore: 'allow',
    trailingUnderscore: 'allow',
  },
  { selector: 'typeLike', format: ['PascalCase'], leadingUnderscore: 'allow' },
  { selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
  { selector: 'import', format: null },
  {
    selector: ['objectLiteralProperty', 'typeProperty', 'objectLiteralMethod', 'typeMethod'],
    format: null,
  },
];

/** The same, with the mathematical notation allowed for locals. */
const MATH = [
  'error',
  // Keeps the destructured exemption; replaces only the plain locals.
  ...NAMING.slice(1).filter(
    (e) => e.modifiers || !['variable', 'parameter', 'function'].includes(e.selector)
  ),
  ...['variable', 'parameter', 'function'].map((selector) => ({
    selector,
    format: ['camelCase', 'snake_case', 'UPPER_CASE', 'PascalCase'],
    leadingUnderscore: 'allow',
    trailingUnderscore: 'allow',
  })),
];

export default tseslint.config(
  {
    // Built output, dependencies, and the things that are not ours to lint.
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/public/**',
      '**/coverage/**',
      'docs-site/**',
      'packages/finances/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.es2022 },
    },
    plugins: { 'check-file': checkFile },
    rules: {
      // An argument named `_` is deliberately unused — a signature that has
      // to match, with a parameter this implementation does not need.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      /*
       * Every finding of `no-this-alias` here is one of two shapes, and
       * neither is what the rule guards against:
       *
       *  - `node` / `current` walking up a tree in a `while` loop — a loop
       *    variable that happens to start at `this`;
       *  - `self` standing in for `this` inside the object of callbacks
       *    Monaco is handed, where an arrow function would change which
       *    object `this` refers to in the *other* providers of the same
       *    object (tried; it broke the signature-help provider).
       */
      '@typescript-eslint/no-this-alias': [
        'error',
        {
          allowedNames: ['self', 'node', 'current'],
        },
      ],
      // A warning, not an error: `any` is sometimes the honest answer at a
      // boundary with an untyped library, and there are 144 of them here.
      '@typescript-eslint/no-explicit-any': 'warn',

      /*
       * Two shapes, because the repository uses both on purpose: a module
       * that exports a class or a component is named after it
       * (`CoreObject.ts`, `DrivePage.tsx`), and one that exports functions
       * is not (`runScript.ts`, `npmProject.ts`).
       */
      'check-file/filename-naming-convention': [
        'error',
        {
          // A glob, not one of the plugin's named conventions: those allow
          // exactly one shape per path, and this repository uses two on
          // purpose. Letters and digits only, so what this catches is
          // `kebab-case` and `snake_case` — the shapes nothing here uses,
          // and the ones that make a file look like it came from elsewhere.
          '**/*.{ts,tsx}': '+([a-zA-Z0-9])',
        },
        { ignoreMiddleExtensions: true },
      ],
    },
  },

  {
    // `.ts` as well as `.tsx`: a custom hook without any JSX lives in a
    // plain module, and four files disable `exhaustive-deps` there — which
    // ESLint reports as "rule not found" when the plugin is absent.
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      /*
       * Two rules, not the plugin's whole `recommended`.
       *
       * Version 7 folded the React Compiler's analysis into that preset —
       * `refs`, `set-state-in-effect`, `immutability`, `purity` and the
       * rest — and they report 326 findings here. They are not wrong, but
       * they describe a different way of writing components than this code
       * was written in, and turning them on wholesale gives a lint nobody
       * can pass, which teaches people to ignore it.
       *
       * These two are the ones MyCastle's code was written against: the
       * hook rules proper, and the dependency check whose comments appear
       * 44 times in the sources.
       */
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    /*
     * Names.
     *
     * The shape of this rule was decided by running it: the first pass
     * reported 496 findings, of which **427 were properties** — and not one
     * of them was ours to rename. They are the shapes other people own:
     * `Authorization` and `Content-Type` on the wire, `HTMLAttributes` and
     * `__html` from TipTap and React, `TranslationPart` / `VectorialPart` /
     * `Add_1` from OpenCascade, `ScriptTarget` from the TypeScript API,
     * `tool_calls` from OpenAI, `itemCount_` and `RESERVED_WORDS_` from
     * Blockly's own fields, `QPushButton` from Qt. A rule that fires on those
     * teaches people to add a comment, not to pick a better name — so
     * properties and methods of object literals and types are not checked at
     * all.
     *
     * What is checked is what this repository actually chooses: variables,
     * functions, parameters, classes, types and enum members. After the
     * exceptions below it reports **nothing**, which is the point: a finding
     * now means a name that was just written, not a backlog to scroll past.
     * That is also why it is an error rather than a warning — there are 227
     * warnings here already, and one more voice in that crowd changes
     * nothing.
     */
    files: ['**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/naming-convention': NAMING },
  },

  {
    /*
     * Mathematics keeps its own notation.
     *
     * `A` is a matrix, `Omega` is Ω, `theta_0` is θ₀ and `v_0` is v₀ — the
     * names in the literature the code was written from. `thetaZero` would be
     * the same value under a name a reader of the derivation cannot find, so
     * here `snake_case` and single capitals are allowed for locals and
     * parameters. Everything else in these packages is checked as usual.
     */
    files: [
      'packages/core-sci/**/*.{ts,tsx}',
      'packages/ui-sci-blocks/**/*.{ts,tsx}',
      'packages/ui-scene3d/src/layout/**/*.{ts,tsx}',
      'packages/ui-cad/src/cad3d/**/*.{ts,tsx}',
    ],
    rules: { '@typescript-eslint/naming-convention': MATH },
  },

  {
    // Tests reach for globals the sources do not, and say `any` where a stub
    // is the point of the test.
    files: ['**/*.test.{ts,tsx}', '**/test/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  }
);
