// Import this before @forge/api. @forge/api binds the global fetch once, when it loads, so a test
// cannot replace it later. This sets a global fetch that calls globalThis.testFetch, which a test
// sets; with none set, a call fails instead of going to the network.
globalThis.testFetch = null;
globalThis.fetch = async (...args) => {
  if (!globalThis.testFetch) throw new Error('network call in a test with no testFetch set');
  return globalThis.testFetch(...args);
};
