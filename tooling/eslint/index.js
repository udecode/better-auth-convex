import base from './configs/eslint-base.js';
import typescript from './configs/eslint-typescript.js';

export { defineConfig } from './utils.js';

/**
 * Note: You MUST import files using the .js extension in this entire package
 * (not only this file) otherwise ESLint will not be able to resolve the files.
 */
export const configs = {
  base,
  typescript,
};
