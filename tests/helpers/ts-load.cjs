const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
module.exports = function createLoader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(__dirname, '../..', file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = { exports: {} }; cache.set(absolute, mod);
    const source = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function('require', 'module', 'exports', source)(name => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/') || name.startsWith('.')) {
        const candidate = name.startsWith('@/') ? path.resolve(__dirname, '../../src', name.slice(2)) : path.resolve(path.dirname(absolute), name);
        if (candidate.endsWith('.json')) return JSON.parse(fs.readFileSync(candidate, 'utf8'));
        return load(candidate + (path.extname(candidate) ? '' : fs.existsSync(candidate + '.ts') ? '.ts' : '.tsx'));
      }
      return require(name);
    }, mod, mod.exports);
    return mod.exports;
  }
  return load;
};
