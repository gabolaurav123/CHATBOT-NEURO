const fs = require('fs-extra');
const path = require('path');
const { getLatestAuthState, saveAuthState, clearAuthState } = require('./session');

const AUTH_BACKUP_VERSION = 1;
const MAX_AUTH_BACKUP_BYTES = 10 * 1024 * 1024;

function safeAuthFileName(fileName) {
  const normalized = path.posix.normalize(String(fileName || '').replace(/\\/g, '/'));
  if (!normalized || normalized === '.' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error('Invalid WhatsApp auth backup file name');
  }
  return normalized;
}

async function readAuthDirectory(sessionPath) {
  if (!(await fs.pathExists(sessionPath))) return null;

  const fileNames = await fs.readdir(sessionPath);
  const files = {};
  let totalBytes = 0;

  for (const fileName of fileNames.sort()) {
    const fullPath = path.join(sessionPath, fileName);
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) continue;

    const content = await fs.readFile(fullPath);
    totalBytes += content.length;
    if (totalBytes > MAX_AUTH_BACKUP_BYTES) {
      throw new Error('WhatsApp auth backup exceeds the 10 MB safety limit');
    }
    files[safeAuthFileName(fileName)] = content.toString('base64');
  }

  if (!files['creds.json']) return null;

  return {
    version: AUTH_BACKUP_VERSION,
    updatedAt: new Date().toISOString(),
    files
  };
}

async function writeAuthDirectory(sessionPath, backup) {
  if (!backup || backup.version !== AUTH_BACKUP_VERSION || !backup.files || typeof backup.files !== 'object') {
    return false;
  }

  let totalBytes = 0;
  const decodedFiles = [];

  for (const [fileName, encodedContent] of Object.entries(backup.files)) {
    const safeName = safeAuthFileName(fileName);
    const content = Buffer.from(String(encodedContent || ''), 'base64');
    totalBytes += content.length;
    if (totalBytes > MAX_AUTH_BACKUP_BYTES) {
      throw new Error('WhatsApp auth backup exceeds the 10 MB safety limit');
    }
    decodedFiles.push([safeName, content]);
  }

  if (!decodedFiles.some(([fileName]) => fileName === 'creds.json')) return false;

  await fs.ensureDir(sessionPath);
  for (const [fileName, content] of decodedFiles) {
    const fullPath = path.resolve(sessionPath, fileName);
    const rootPath = `${path.resolve(sessionPath)}${path.sep}`;
    if (!fullPath.startsWith(rootPath)) {
      throw new Error('Invalid WhatsApp auth backup path');
    }
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content);
  }

  return true;
}

async function restoreAuthDirectory(sessionPath) {
  if (await fs.pathExists(path.join(sessionPath, 'creds.json'))) return false;

  const backup = await getLatestAuthState();
  if (!backup) return false;
  return writeAuthDirectory(sessionPath, backup);
}

async function backupAuthDirectory(sessionPath) {
  const backup = await readAuthDirectory(sessionPath);
  if (!backup) return false;
  await saveAuthState(backup);
  return true;
}

module.exports = {
  backupAuthDirectory,
  restoreAuthDirectory,
  clearPersistedAuth: clearAuthState,
  readAuthDirectory,
  writeAuthDirectory,
  safeAuthFileName
};
