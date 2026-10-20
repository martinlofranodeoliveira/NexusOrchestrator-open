function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTaskReference(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/^[^\w-]+|[^\w-]+$/g, '')
    .toUpperCase();

  if (!normalized) return null;
  if (/^GH-\d+$/.test(normalized)) return normalized;
  if (/^[A-Z][A-Z0-9]+-\d+[A-Z]?$/.test(normalized)) return normalized;
  return null;
}

function extractTaskReferences(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return [];

  const matches = normalized.match(/\b(?:GH-\d+|[A-Z][A-Z0-9]+-\d+[A-Z]?)\b/gi) || [];
  const unique = [];
  const seen = new Set();

  for (const match of matches) {
    const reference = normalizeTaskReference(match);
    if (!reference || seen.has(reference)) continue;
    seen.add(reference);
    unique.push(reference);
  }

  return unique;
}

function extractPrimaryTaskReference(task) {
  const title = String(task?.title || '').trim();
  if (!title) return null;

  const [firstToken] = title.split(/\s+/);
  return normalizeTaskReference(firstToken);
}

function findParentTaskReference(text) {
  const references = extractTaskReferences(text);
  return references.find((reference) => !reference.startsWith('NX-HELP-')) || null;
}

function buildCollaborationSummary(text, references = []) {
  let summary = String(text || '').trim();
  if (!summary) return null;

  for (const reference of references) {
    const normalizedReference = normalizeTaskReference(reference);
    if (!normalizedReference) continue;
    summary = summary.replace(new RegExp(`\\b${escapeRegExp(normalizedReference)}\\b`, 'gi'), ' ');
  }

  summary = summary.replace(/^[\s:;-]+|[\s:;-]+$/g, '');
  summary = summary.replace(/\s+/g, ' ').trim();
  return summary || null;
}

function parseGitHubCollaborationIssueMetadata(issue = {}) {
  const title = String(issue.title || '').trim();
  if (!/^NX-HELP-/i.test(title)) {
    return {
      kind: 'primary',
      collaborationKey: null,
      parentTaskRef: null,
      summary: null,
    };
  }

  const [firstToken, ...restTokens] = title.split(/\s+/);
  const collaborationKey = String(firstToken || '').trim().toUpperCase() || null;
  const titleRemainder = restTokens.join(' ').trim();
  const titleReferences = extractTaskReferences(titleRemainder);
  const parentTaskRef = findParentTaskReference(titleRemainder) || findParentTaskReference(issue.body || '');
  const summary = buildCollaborationSummary(
    titleRemainder,
    parentTaskRef ? [...titleReferences, parentTaskRef] : titleReferences,
  );

  return {
    kind: 'github_collaboration',
    collaborationKey,
    parentTaskRef,
    summary,
  };
}

function resolveGitHubCollaborationParentTaskId(task, primaryTasks = []) {
  const parentTaskRef = normalizeTaskReference(task?.parentTaskRef);
  if (!parentTaskRef) return null;

  if (/^GH-\d+$/.test(parentTaskRef)) {
    return parentTaskRef;
  }

  for (const primaryTask of primaryTasks) {
    const directReference = extractPrimaryTaskReference(primaryTask);
    if (directReference === parentTaskRef) {
      return primaryTask.id || null;
    }

    const references = extractTaskReferences(primaryTask?.title || '');
    if (references.includes(parentTaskRef)) {
      return primaryTask.id || null;
    }
  }

  return null;
}

function buildGitHubCollaborationMirrorId(sourceTaskId) {
  const normalizedSourceTaskId = String(sourceTaskId || '').trim().toUpperCase();
  if (!normalizedSourceTaskId) return null;
  return `NX-HELP-${normalizedSourceTaskId}`;
}

module.exports = {
  buildCollaborationSummary,
  buildGitHubCollaborationMirrorId,
  extractPrimaryTaskReference,
  extractTaskReferences,
  normalizeTaskReference,
  parseGitHubCollaborationIssueMetadata,
  resolveGitHubCollaborationParentTaskId,
};
