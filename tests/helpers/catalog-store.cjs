const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
module.exports = function memoryStore() {
  const state = { active: { id: null, generation: 'legacy' }, artifacts: new Map(), raw: new Map(), jobs: new Map(), versions: new Map(), audits: [], failPut: null, pointerError: null };
  const store = {
    state,
    async pointer() { if (state.pointerError) throw state.pointerError; return clone(state.active); },
    async version(id) { return state.versions.has(id) ? clone(state.versions.get(id)) : null; },
    async rememberVersion(id, manifest) { state.versions.set(id, clone(manifest)); },
    async activate(expected, pointer, audit) { if (state.active.generation !== expected) throw Error('CATALOG_CONFLICT'); state.active = clone(pointer); state.audits.push(clone(audit)); if (pointer.id) state.versions.set(pointer.id, clone(pointer.manifest)); },
    async put(path, value) {
      if (state.failPut?.(path)) throw Error('Storage offline');
      const json = JSON.stringify(value), reference = { path, sha256: hash(json), bytes: Buffer.byteLength(json) };
      if (state.artifacts.has(path) && hash(JSON.stringify(state.artifacts.get(path))) !== reference.sha256) throw Error('Immutable artifact conflict');
      state.artifacts.set(path, clone(value)); return reference;
    },
    async get(reference) { if (!state.artifacts.has(reference.path)) throw Error('Missing artifact'); const value = state.artifacts.get(reference.path); if (hash(JSON.stringify(value)) !== reference.sha256) throw Error('Artifact integrity failure'); return clone(value); },
    async raw(path, bytes) { if (!bytes) return Buffer.from(state.raw.get(path)); state.raw.set(path, Buffer.from(bytes)); return { path, bytes: bytes.length, sha256: hash(bytes) }; },
    async job(id) { return state.jobs.has(id) ? clone(state.jobs.get(id)) : null; },
    async saveJob(job) { if (state.jobs.has(job.id)) throw Error('Duplicate job'); state.jobs.set(job.id, clone(job)); },
    async changeJob(id, update) { if (!state.jobs.has(id)) throw Error('Missing job'); const next = update(clone(state.jobs.get(id))); state.jobs.set(id, clone(next)); return clone(next); },
    async jobs() { return [...state.jobs.values()].map(clone); },
  };
  return store;
};
