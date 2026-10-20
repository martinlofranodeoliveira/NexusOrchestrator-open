const path = require('path');
const dotenv = require('dotenv');
const { runDoctor } = require('../services/doctorService');

const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');
dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });

function formatLine(prefix, summary, detail) {
  return detail ? `${prefix} ${summary}\n    ${detail}` : `${prefix} ${summary}`;
}

function main() {
  const result = runDoctor({
    env: process.env,
    projectDir: process.env.NEXUS_PROJECT_DIR || repoRoot,
    workspaceRoot: process.env.WORKSPACE_ROOT || path.join(repoRoot, 'workspace'),
  });

  console.log(`Nexus doctor :: provider ${result.provider} :: ${result.projectDir}`);
  result.checks.forEach((check) => {
    const icon = check.ok ? '[ok]' : check.severity === 'error' ? '[err]' : '[warn]';
    console.log(formatLine(icon, check.summary, check.detail));
  });

  console.log(
    `Resumo: ${result.summary.errors} erro(s), ${result.summary.warnings} warning(s), ${result.summary.info} check(s) informativo(s).`,
  );

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main();
