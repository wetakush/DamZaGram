const { eq, assert } = sandbox;
dzg.storage.set('value', { text: 'saved' });
eq(dzg.storage.get('value'), { text: 'saved' });
for (const method of ['storageSet', 'storageRemove']) {
  const original = sandbox.native[method];
  sandbox.native[method] = () => false;
  let caught = false;
  try {
    if (method === 'storageSet') dzg.storage.set('value', 'lost');
    else dzg.storage.remove('value');
  } catch (error) {
    caught = String(error).includes('Could not save plugin storage');
  }
  assert(caught, method + ' surfaces persistence failure');
  eq(dzg.storage.get('value'), { text: 'saved' });
  sandbox.native[method] = original;
}
dzg.storage.remove('value');
eq(dzg.storage.get('value', 'missing'), 'missing');
