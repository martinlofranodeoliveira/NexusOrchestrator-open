const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const GEMINI_PRO_MODEL = 'gemini-3.1-pro-preview';
const GEMINI_FLASH_LITE_MODEL = 'gemini-3.1-flash-lite-preview';
const DEFAULT_GEMINI_MODEL = GEMINI_FLASH_LITE_MODEL;
const GEMINI_EXECUTABLE = process.platform === 'win32' ? 'gemini.cmd' : 'gemini';

let cachedGeminiCliHome;

function collectAncestorRepoCandidates(startDir) {
  const candidates = [];
  let currentDir = path.resolve(startDir);

  while (true) {
    candidates.push(path.join(currentDir, 'repos', 'ralph'));
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return candidates;
}

function getWindowsGeminiCliHomes() {
  const windowsUsersDir = '/mnt/c/Users';
  if (!fs.existsSync(windowsUsersDir)) return [];

  return fs
    .readdirSync(windowsUsersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(windowsUsersDir, entry.name))
    .filter((homeDir) => fs.existsSync(path.join(homeDir, '.gemini')));
}

function detectGeminiCliHome() {
  if (cachedGeminiCliHome) {
    return cachedGeminiCliHome;
  }

  const configuredHome = (process.env.GEMINI_CLI_HOME || '').trim();
  const linuxHome = os.homedir();
  const linuxGeminiDir = path.join(linuxHome, '.gemini');
  const windowsHomes = getWindowsGeminiCliHomes();
  const candidates = [];

  if (configuredHome) {
    candidates.push(configuredHome);
  }

  // Em WSL, preferir a home Linux evita falhas de I/O e falta de espaço em /mnt/c.
  candidates.push(linuxHome);
  candidates.push(...windowsHomes);

  cachedGeminiCliHome =
    candidates.find((homeDir) => {
      const geminiDir = path.join(homeDir, '.gemini');
      if (homeDir === linuxHome && fs.existsSync(geminiDir)) {
        return true;
      }

      return (
        fs.existsSync(path.join(geminiDir, 'settings.json')) ||
        fs.existsSync(path.join(geminiDir, 'extensions'))
      );
    }) || (fs.existsSync(linuxGeminiDir) ? linuxHome : os.homedir());

  return cachedGeminiCliHome;
}

function createGeminiEnv(extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  if (!env.GEMINI_CLI_HOME) {
    env.GEMINI_CLI_HOME = detectGeminiCliHome();
  }
  return env;
}

function cleanGeminiOutput(output = '') {
  return output
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (trimmed.startsWith('Keychain initialization encountered an error')) return false;
      if (trimmed.startsWith('Using FileKeychain fallback for secure storage')) return false;
      if (trimmed.startsWith('MCP issues detected')) return false;
      if (trimmed.startsWith('Loading extension:')) return false;
      if (trimmed.startsWith('Scheduling MCP context refresh')) return false;
      if (trimmed.startsWith('Executing MCP context refresh')) return false;
      if (trimmed.startsWith('MCP context refresh')) return false;
      if (trimmed.startsWith('[WARN] Skipping unreadable directory:')) return false;
      if (trimmed.startsWith('Warning: Could not read directory ')) return false;
      if (trimmed.startsWith('YOLO mode is enabled.')) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function getRalphIncludeDirectories() {
  const candidates = [
    path.join(detectGeminiCliHome(), '.gemini', 'extensions', 'ralph'),
    path.join(os.homedir(), '.gemini', 'extensions', 'ralph'),
    ...getWindowsGeminiCliHomes().map((homeDir) => path.join(homeDir, '.gemini', 'extensions', 'ralph')),
    ...collectAncestorRepoCandidates(process.cwd()),
    ...collectAncestorRepoCandidates(__dirname),
  ];

  return candidates.filter((dir, index) => candidates.indexOf(dir) === index && fs.existsSync(dir));
}

function runGeminiPrompt(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const args = [];
    const extensions = Array.isArray(options.extensions) && options.extensions.length > 0
      ? options.extensions
      : ['none'];
    const includeDirectories = Array.isArray(options.includeDirectories)
      ? options.includeDirectories.filter(Boolean)
      : [];

    extensions.forEach((extensionName) => {
      args.push('--extensions', extensionName);
    });

    includeDirectories.forEach((directory) => {
      args.push('--include-directories', directory);
    });

    args.push('--model', options.model || DEFAULT_GEMINI_MODEL, '-p', prompt);
    const geminiProcess = spawn(GEMINI_EXECUTABLE, args, {
      cwd: options.cwd || process.cwd(),
      env: createGeminiEnv(options.env || {}),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    geminiProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    geminiProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    geminiProcess.on('error', reject);

    geminiProcess.on('close', (code) => {
      const cleanStdout = cleanGeminiOutput(stdout);
      if (code === 0) {
        resolve({
          stdout: cleanStdout,
          rawStdout: stdout,
          stderr,
        });
        return;
      }

      const error = new Error(cleanGeminiOutput(stderr) || cleanStdout || `Gemini exited with code ${code}`);
      error.code = code;
      error.stdout = cleanStdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

module.exports = {
  cleanGeminiOutput,
  createGeminiEnv,
  DEFAULT_GEMINI_MODEL,
  detectGeminiCliHome,
  GEMINI_EXECUTABLE,
  GEMINI_FLASH_LITE_MODEL,
  GEMINI_PRO_MODEL,
  getRalphIncludeDirectories,
  runGeminiPrompt,
};
