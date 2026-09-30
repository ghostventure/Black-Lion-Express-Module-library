import { test } from 'node:test';
import assert from 'node:assert/strict';
import compatibility from '../desktop/compatibility.cjs';
const healthy = { platform: 'win32', arch: 'x64', release: '10.0.26100', machine: 'x86_64', memory: 8 * 1024 ** 3, dataWritable: true, cacheWritable: true, installWritable: true, cacheFree: 10 * 1024 ** 3, installFree: 10 * 1024 ** 3, installed: true };
test('compatibility blocks unsupported Windows, wrong architecture, and unwritable account data', () => {
  assert.equal(compatibility.evaluate(healthy).canAutoInstall, true);
  for (const change of [{ platform: 'linux' }, { release: '10.0.17763' }, { arch: 'ia32' }, { dataWritable: false }]) assert.equal(compatibility.evaluate({ ...healthy, ...change }).canRun, false);
});
test('disk and update permission failures block installation without preventing local sign-in', () => {
  for (const change of [{ cacheFree: 1 }, { installFree: null }, { cacheWritable: false }, { installWritable: false }]) {
    const result = compatibility.evaluate({ ...healthy, ...change });
    assert.equal(result.canRun, true); assert.equal(result.canUpdate, false);
  }
});
test('portable, low-memory, and ARM emulation states are explicit; portable auto-install is disabled', () => {
  const result = compatibility.evaluate({ ...healthy, memory: 2 * 1024 ** 3, machine: 'arm64', installed: false });
  assert.equal(result.canRun, true); assert.equal(result.canUpdate, true); assert.equal(result.canAutoInstall, false);
  assert.deepEqual(result.checks.filter(c => c.state === 'warning').map(c => c.id), ['emulation', 'memory', 'portable']);
  assert.equal(compatibility.evaluate(healthy, { minWindowsBuild: 30000 }).canRun, false);
});
