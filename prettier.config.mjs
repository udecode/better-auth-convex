/** @type {import('prettier').Config} */
export default {
  endOfLine: 'lf',
  plugins: ['prettier-plugin-packagejson', 'prettier-plugin-jsdoc'],
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'es5',
};
