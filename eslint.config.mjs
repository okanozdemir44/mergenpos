/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "desktop/**",
      "out/**",
      "dist/**",
    ],
  },
];

export default eslintConfig;
