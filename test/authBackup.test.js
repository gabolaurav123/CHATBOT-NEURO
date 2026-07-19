const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const {
  readAuthDirectory,
  writeAuthDirectory,
  safeAuthFileName
} = require('../src/whatsapp/authBackup');

test('serializa y restaura los archivos de autenticacion de WhatsApp', async (t) => {
  const source = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-auth-source-'));
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-auth-target-'));
  t.after(async () => {
    await fs.remove(source);
    await fs.remove(target);
  });

  await fs.writeFile(path.join(source, 'creds.json'), '{"registered":true}');
  await fs.writeFile(path.join(source, 'session-key.json'), Buffer.from([0, 1, 2, 255]));

  const backup = await readAuthDirectory(source);
  assert.equal(backup.version, 1);
  assert.ok(backup.updatedAt);
  assert.ok(backup.files['creds.json']);

  assert.equal(await writeAuthDirectory(target, backup), true);
  assert.equal(await fs.readFile(path.join(target, 'creds.json'), 'utf8'), '{"registered":true}');
  assert.deepEqual(
    await fs.readFile(path.join(target, 'session-key.json')),
    Buffer.from([0, 1, 2, 255])
  );
});

test('rechaza rutas que intenten salir del directorio de sesion', () => {
  assert.throws(() => safeAuthFileName('../creds.json'));
  assert.throws(() => safeAuthFileName('/creds.json'));
  assert.equal(safeAuthFileName('creds.json'), 'creds.json');
});

test('no restaura respaldos sin creds.json', async (t) => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-auth-empty-'));
  t.after(() => fs.remove(target));

  assert.equal(await writeAuthDirectory(target, {
    version: 1,
    files: { 'session-key.json': Buffer.from('key').toString('base64') }
  }), false);
});
