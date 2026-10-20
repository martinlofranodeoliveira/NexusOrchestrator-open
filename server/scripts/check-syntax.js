const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const serverRoot = path.resolve(__dirname, '..');
const ignoredDirectories = new Set(['node_modules', '.runtime']);
const filesToCheck = [];

function collectJavaScriptFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectJavaScriptFiles(entryPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      filesToCheck.push(entryPath);
    }
  }
}

collectJavaScriptFiles(serverRoot);

const failures = [];
for (const filePath of filesToCheck.sort()) {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    failures.push({
      filePath,
      stderr: String(result.stderr || result.stdout || 'Erro de sintaxe sem detalhes.').trim(),
    });
  }
}

if (failures.length > 0) {
  console.error('Falha na validacao de sintaxe do backend:');
  for (const failure of failures) {
    console.error(`- ${path.relative(serverRoot, failure.filePath)}`);
    console.error(failure.stderr);
  }
  process.exit(1);
}

console.log(`Sintaxe do backend validada com sucesso em ${filesToCheck.length} arquivo(s).`);
