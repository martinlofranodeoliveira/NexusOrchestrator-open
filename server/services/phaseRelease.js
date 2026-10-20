function normalizePhaseValue(value) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractPhaseNumber(phase) {
  const normalized = normalizePhaseValue(phase);
  if (!normalized) return null;

  const explicitMatch = /(?:fase|etapa|stage|phase)\s*[-:]?\s*(\d{1,2})/i.exec(normalized);
  if (explicitMatch) {
    return Number.parseInt(explicitMatch[1], 10) || null;
  }

  const looseMatch = /\b(\d{1,2})\b/.exec(normalized);
  if (!looseMatch) return null;

  return Number.parseInt(looseMatch[1], 10) || null;
}

function buildPhaseLookupKeys(phase) {
  const keys = [];
  const normalized = normalizePhaseValue(phase);
  const phaseNumber = extractPhaseNumber(normalized);

  if (phaseNumber) {
    keys.push(String(phaseNumber));
    keys.push(`etapa-${phaseNumber}`);
    keys.push(`fase-${phaseNumber}`);
    keys.push(`stage-${phaseNumber}`);
    keys.push(`phase-${phaseNumber}`);
  }

  const normalizedSlug = slugify(normalized);
  if (normalizedSlug && !keys.includes(normalizedSlug)) {
    keys.push(normalizedSlug);
  }

  return keys;
}

function parsePhaseMappedBranchMap(rawValue) {
  const raw = String(rawValue || '').trim();
  const map = new Map();

  if (!raw) {
    return map;
  }

  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      Object.entries(parsed || {}).forEach(([key, value]) => {
        const branchName = String(value || '').trim();
        if (!branchName) return;
        buildPhaseLookupKeys(key).forEach((lookupKey) => {
          if (!map.has(lookupKey)) {
            map.set(lookupKey, branchName);
          }
        });
      });
      return map;
    } catch (error) {
      return map;
    }
  }

  raw
    .split(/[\n;,]+/)
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .forEach((entry) => {
      const separatorIndex = entry.includes('=')
        ? entry.indexOf('=')
        : entry.indexOf(':');
      if (separatorIndex <= 0) return;

      const key = entry.slice(0, separatorIndex).trim();
      const branchName = entry.slice(separatorIndex + 1).trim();
      if (!key || !branchName) return;

      buildPhaseLookupKeys(key).forEach((lookupKey) => {
        if (!map.has(lookupKey)) {
          map.set(lookupKey, branchName);
        }
      });
    });

  return map;
}

function parsePhaseBranchMap(env = process.env) {
  return parsePhaseMappedBranchMap(env.NEXUS_PHASE_BRANCH_MAP);
}

function parsePhaseTaskBaseBranchMap(env = process.env) {
  return parsePhaseMappedBranchMap(env.NEXUS_PHASE_TASK_BASE_BRANCH_MAP);
}

function resolvePhaseBranchName(phase, env = process.env) {
  const lookupKeys = buildPhaseLookupKeys(phase);
  if (lookupKeys.length === 0) return null;

  const configuredMap = parsePhaseBranchMap(env);
  for (const lookupKey of lookupKeys) {
    if (configuredMap.has(lookupKey)) {
      return configuredMap.get(lookupKey);
    }
  }

  const phaseNumber = extractPhaseNumber(phase);
  if (phaseNumber) {
    return `etapa-${phaseNumber}`;
  }

  return null;
}

function resolvePhaseTaskBaseBranchName(phase, env = process.env) {
  const lookupKeys = buildPhaseLookupKeys(phase);
  if (lookupKeys.length === 0) return null;

  const configuredMap = parsePhaseTaskBaseBranchMap(env);
  for (const lookupKey of lookupKeys) {
    if (configuredMap.has(lookupKey)) {
      return configuredMap.get(lookupKey);
    }
  }

  return null;
}

function buildPhaseKey(phase, env = process.env) {
  return resolvePhaseBranchName(phase, env) || slugify(normalizePhaseValue(phase));
}

function sanitizeTagSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildPhaseReleaseTag(branchName, targetSha) {
  const normalizedBranchName = sanitizeTagSegment(String(branchName || '').replace(/\//g, '-')) || 'phase';
  const shaSegment = String(targetSha || '').trim().toLowerCase().slice(0, 12) || 'unknown';
  return `release-${normalizedBranchName}-${shaSegment}`;
}

function buildPhaseReleaseName({ phase, branchName }) {
  const normalizedPhase = normalizePhaseValue(phase);
  const normalizedBranch = String(branchName || '').trim() || null;
  if (normalizedPhase && normalizedBranch) {
    return `${normalizedPhase} (${normalizedBranch})`;
  }
  if (normalizedPhase) {
    return normalizedPhase;
  }
  return `Release ${normalizedBranch || 'phase'}`;
}

function compareTaskIds(left, right) {
  const leftNumber = Number.parseInt(String(left?.id || '').replace(/\D+/g, ''), 10);
  const rightNumber = Number.parseInt(String(right?.id || '').replace(/\D+/g, ''), 10);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return String(left?.id || '').localeCompare(String(right?.id || ''));
}

function buildPhaseReleaseBody({ phase, branchName, tasks = [] } = {}) {
  const normalizedPhase = normalizePhaseValue(phase);
  const normalizedBranch = String(branchName || '').trim() || null;
  const lines = [
    'Release gerada automaticamente pelo NexusOrchestrator.',
    '',
  ];

  if (normalizedPhase) {
    lines.push(`Etapa: ${normalizedPhase}`);
  }
  if (normalizedBranch) {
    lines.push(`Branch de release: ${normalizedBranch}`);
  }
  if (normalizedPhase || normalizedBranch) {
    lines.push('');
  }

  lines.push('Cards incluidos:');
  tasks
    .slice()
    .sort(compareTaskIds)
    .forEach((task) => {
      const taskId = String(task?.id || '').trim() || 'task';
      const title = String(task?.title || '').trim() || taskId;
      lines.push(`- [x] ${taskId} ${title}`);
    });

  return `${lines.join('\n').trim()}\n`;
}

module.exports = {
  buildPhaseKey,
  buildPhaseLookupKeys,
  buildPhaseReleaseBody,
  buildPhaseReleaseName,
  buildPhaseReleaseTag,
  extractPhaseNumber,
  normalizePhaseValue,
  parsePhaseBranchMap,
  parsePhaseTaskBaseBranchMap,
  resolvePhaseBranchName,
  resolvePhaseTaskBaseBranchName,
};
