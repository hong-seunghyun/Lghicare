const clone = value => JSON.parse(JSON.stringify(value));
function merge(before, after) {
  const result = { ...before };
  for (const [key, value] of Object.entries(after)) result[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(before?.[key] || {}, value) : value;
  return result;
}
module.exports = function firestore() {
  const docs = new Map(); let pending = Promise.resolve();
  const snap = path => ({ exists: docs.has(path), data: () => docs.has(path) ? clone(docs.get(path)) : undefined, id: path.split('/').at(-1) });
  const ref = path => ({ path, get: async () => snap(path), set: async (value, options) => docs.set(path, options?.merge ? merge(docs.get(path), value) : clone(value)), create: async value => { if (docs.has(path)) throw Error('Exists'); docs.set(path, clone(value)); }, update: async value => docs.set(path, { ...docs.get(path), ...clone(value) }) });
  const db = { docs, doc: ref, collection: path => ({ doc: id => ref(path + '/' + id), orderBy() { return this; }, limit() { return this; }, async get() { return { docs: [...docs.keys()].filter(key => key.startsWith(path + '/') && key.slice(path.length + 1).indexOf('/') === -1).map(key => ({ ...snap(key), ref: ref(key) })) }; } }),
    runTransaction(operation) {
      const next = pending.then(async () => {
        const writes = [];
        const result = await operation({ get: async reference => snap(reference.path), set: (reference, value, options) => writes.push(() => docs.set(reference.path, options?.merge ? merge(docs.get(reference.path), value) : clone(value))), create: (reference, value) => writes.push(() => { if (docs.has(reference.path)) throw Error('Exists'); docs.set(reference.path, clone(value)); }), update: (reference, value) => writes.push(() => docs.set(reference.path, { ...docs.get(reference.path), ...clone(value) })) });
        writes.forEach(write => write()); return result;
      });
      pending = next.catch(() => {}); return next;
    },
  };
  return db;
};
