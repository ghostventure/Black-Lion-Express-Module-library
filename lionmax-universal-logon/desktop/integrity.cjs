const { createReadStream, promises: fs } = require('node:fs');
const { createHash } = require('node:crypto');
const { join, relative, resolve, sep } = require('node:path');
async function filesIn(root) {
  const files = [];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Application files contain an unexpected link. Reinstall LionMax.');
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'));
    }
  }
  await walk(root);
  return files.sort();
}
async function digest(path) {
  const hash = createHash('sha256');
  for await (const block of createReadStream(path)) hash.update(block);
  return hash.digest('hex');
}
async function verifyFiles(root, manifest) {
  const actual = await filesIn(root), expected = Object.keys(manifest).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Application files are missing or have been added. Reinstall LionMax; your accounts are stored separately.');
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < expected.length) {
      const file = expected[cursor++], path = resolve(root, file);
      if (!path.startsWith(resolve(root) + sep) || await digest(path) !== manifest[file]) throw new Error('Application file verification failed. Reinstall LionMax; your accounts are stored separately.');
    }
  }));
}
module.exports = { filesIn, digest, verifyFiles };
