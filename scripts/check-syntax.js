const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ignored = new Set(['node_modules', '.git', '.baileys_auth']);
const files = [];
const blockedPromptFragments = [
  ['Eres el motor conversacional', 'de Neurotraumas para WhatsApp'].join(' '),
  ['Debes responder a absolutamente todo', 'lo que la persona escriba'].join(' ')
];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
}

walk(root);

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const blocked = blockedPromptFragments.find((fragment) => source.includes(fragment));
  if (blocked) {
    console.error(`Blocked legacy prompt fragment found in ${path.relative(root, file)}: ${blocked}`);
    process.exit(1);
  }

  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status);
  }
}

console.log(`Syntax OK (${files.length} files checked)`);
