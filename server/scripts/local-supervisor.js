const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');
const { analyzeLocalSupervisorSnapshot } = require('../services/localSupervisor');

const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');
const defaultEnvFile = process.env.NEXUS_ENV_FILE
  ? path.resolve(repoRoot, process.env.NEXUS_ENV_FILE)
  : path.join(repoRoot, '.env');

dotenv.config({
  path: defaultEnvFile,
  override: false,
  quiet: true,
});

const intervalMs = normalizePositiveInteger(
  process.env.NEXUS_LOCAL_SUPERVISOR_INTERVAL_MS,
  10 * 60 * 1000,
);
const healthTimeoutMs = normalizePositiveInteger(
  process.env.NEXUS_LOCAL_SUPERVISOR_HEALTH_TIMEOUT_MS,
  60000,
);
const stableCycles = normalizePositiveInteger(
  process.env.NEXUS_LOCAL_SUPERVISOR_STABLE_CYCLES,
  2,
);
const restartCooldownMs = normalizePositiveInteger(
  process.env.NEXUS_LOCAL_SUPERVISOR_RESTART_COOLDOWN_MS,
  5 * 60 * 1000,
);
const progressStallMs = normalizePositiveInteger(
  process.env.NEXUS_LOCAL_SUPERVISOR_PROGRESS_STALL_MS,
  0,
);
const runtimeDir = path.resolve(
  process.env.NEXUS_LOCAL_SUPERVISOR_RUNTIME_DIR || path.join(repoRoot, '.runtime', 'local-project'),
);
const reportFile = path.resolve(
  process.env.NEXUS_LOCAL_SUPERVISOR_REPORT_FILE ||
    path.join(runtimeDir, 'nexus-supervisor-report.json'),
);
const projectDir = path.resolve(process.env.PROJECT_DIR || process.env.NEXUS_PROJECT_DIR || repoRoot);
const launcherPath = path.resolve(repoRoot, 'run-project-local.sh');
const healthUrl =
  process.env.NEXUS_LOCAL_SUPERVISOR_HEALTH_URL ||
  `http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || '4000'}/health`;

let stopping = false;

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function log(message) {
  console.log(`[SUPERVISOR ${new Date().toISOString()}] ${message}`);
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadPreviousReport() {
  try {
    return JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  } catch (error) {
    return {};
  }
}

function saveReport(report) {
  ensureParentDir(reportFile);
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function trimOutput(output, maxLength = 4000) {
  const normalized = String(output || '').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

async function fetchHealthSnapshot() {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), healthTimeoutMs);
  try {
    const response = await fetch(healthUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function restartNexus() {
  log(`reinicio automatico solicitado: ${launcherPath} restart ${projectDir}`);
  const result = spawnSync('bash', [launcherPath, 'restart', projectDir], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NEXUS_SUPERVISOR_SELF_RESTART: 'true',
    },
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
  });

  return {
    type: 'restart',
    at: new Date().toISOString(),
    ok: result.status === 0,
    exitCode: result.status,
    signal: result.signal || null,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr),
  };
}

async function verifyHealthAfterRestart() {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  try {
    const snapshot = await fetchHealthSnapshot();
    return {
      ok: snapshot.ok === true,
      snapshot: {
        timestamp: snapshot.timestamp || null,
        instanceId: snapshot.instanceId || null,
        tasks: snapshot.status?.tasks || null,
        runs: snapshot.status?.runs || null,
        lanes: snapshot.status?.lanes || null,
        attention: snapshot.status?.attention || null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}

async function runCycle(trigger) {
  const previousReport = loadPreviousReport();
  const checkedAt = new Date().toISOString();
  let snapshot = null;
  let fetchError = null;

  try {
    snapshot = await fetchHealthSnapshot();
  } catch (error) {
    fetchError = error;
  }

  const report = analyzeLocalSupervisorSnapshot(snapshot, previousReport, {
    checkedAt,
    minStableCyclesBeforeRestart: stableCycles,
    restartCooldownMs,
    progressStallMs,
    unreachableDetail: fetchError ? fetchError.message : null,
  });

  report.trigger = trigger;
  report.healthUrl = healthUrl;
  report.projectDir = projectDir;
  report.runtimeDir = runtimeDir;
  report.reportFile = reportFile;
  report.instanceId = snapshot?.instanceId || previousReport.instanceId || process.env.NEXUS_INSTANCE_ID || null;

  if (report.shouldRestart) {
    report.lastAction = restartNexus();
    if (report.lastAction.ok) {
      report.lastRestartAt = checkedAt;
      report.postRestart = await verifyHealthAfterRestart();
    }
  }

  saveReport(report);
  log(`${report.severity.toUpperCase()} ${report.summary}`);
  if (report.lastAction) {
    log(`acao=${report.lastAction.type} ok=${report.lastAction.ok}`);
  }
}

async function main() {
  ensureParentDir(reportFile);
  log(
    `supervisor local iniciado; intervalo=${intervalMs}ms health=${healthUrl} report=${reportFile}`,
  );
  await runCycle('startup');

  while (!stopping) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (stopping) {
      break;
    }
    await runCycle('interval');
  }
}

function stopSupervisor(signal) {
  if (stopping) {
    return;
  }
  stopping = true;
  log(`encerrando supervisor local (${signal})`);
}

process.on('SIGINT', () => stopSupervisor('SIGINT'));
process.on('SIGTERM', () => stopSupervisor('SIGTERM'));

main().catch((error) => {
  console.error(`[SUPERVISOR ${new Date().toISOString()}] falha fatal: ${error.stack || error.message}`);
  process.exitCode = 1;
});
