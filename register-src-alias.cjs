/**
 * Nest compiles to dist/ but source imports `src/...`.
 * Production: node -r ./register-src-alias.cjs dist/main.js
 */
const path = require('path');
const Module = require('module');

const distRoot = path.join(__dirname, 'dist');
const original = Module._resolveFilename;

Module._resolveFilename = function resolveWithSrcAlias(
  request,
  parent,
  isMain,
  options,
) {
  if (typeof request === 'string' && request.startsWith('src/')) {
    request = path.join(distRoot, request.slice('src/'.length));
  }
  return original.call(this, request, parent, isMain, options);
};
