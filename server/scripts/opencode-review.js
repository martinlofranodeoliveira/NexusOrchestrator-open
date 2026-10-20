const path = require('path');
const { parseArgs } = require('node:util');
const dotenv = require('dotenv');

const {
  buildOpencodeReviewCommand,
  getOpencodeRuntimeStatus,
  spawnOpencodeReview,
} = require('../services/opencodeRuntime');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });

function fail(message) {
  console.error(`[opencode-review] ${message}`);
  process.exit(1);
}

function buildPrompt(values, positionals) {
  const explicitPrompt = String(values.prompt || '').trim();
  if (explicitPrompt) return explicitPrompt;
  return positionals.map((entry) => String(entry || '').trim()).filter(Boolean).join(' ').trim();
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      dir: { type: 'string' },
      prompt: { type: 'string' },
      model: { type: 'string' },
      agent: { type: 'string' },
      variant: { type: 'string' },
      format: { type: 'string' },
      title: { type: 'string' },
      file: { type: 'string', multiple: true },
      pure: { type: 'boolean' },
      skipPermissions: { type: 'boolean' },
      printLogs: { type: 'boolean' },
      dryRun: { type: 'boolean' },
    },
  });

  const projectDir = path.resolve(String(values.dir || process.cwd()));
  const prompt = buildPrompt(values, positionals);
  if (!prompt) {
    fail('informe um prompt via `--prompt` ou argumento posicional.');
  }

  const status = getOpencodeRuntimeStatus({
    env: process.env,
    projectDir,
  });
  if (!status.available) {
    fail(
      `binario \`${status.command}\` indisponivel. Ajuste NEXUS_OPENCODE_COMMAND ou instale o CLI antes de rodar a validacao.`,
    );
  }

  const commandSpec = buildOpencodeReviewCommand({
    env: process.env,
    workspaceDir: projectDir,
    prompt,
    model: values.model,
    agent: values.agent,
    variant: values.variant,
    format: values.format,
    title: values.title,
    files: values.file,
    pure: values.pure,
    skipPermissions: values.skipPermissions,
    printLogs: values.printLogs,
  });

  if (values.dryRun) {
    console.log(JSON.stringify(commandSpec, null, 2));
    return;
  }

  const child = spawnOpencodeReview({
    env: process.env,
    workspaceDir: commandSpec.cwd,
    prompt: commandSpec.prompt,
    model: commandSpec.model,
    agent: commandSpec.agent,
    variant: commandSpec.variant,
    format: commandSpec.format,
    title: commandSpec.title,
    files: commandSpec.files,
    pure: commandSpec.pure,
    skipPermissions: commandSpec.skipPermissions,
    printLogs: commandSpec.printLogs,
  });

  child.on('error', (error) => {
    fail(error.message);
  });
  child.on('exit', (code) => {
    process.exit(code == null ? 1 : code);
  });
}

main();
