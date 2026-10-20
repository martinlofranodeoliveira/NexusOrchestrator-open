require('dotenv').config({ quiet: true });
const { Octokit } = require('@octokit/rest');
const {
  normalizeInstanceValue,
} = require('./instanceIdentity');
const {
  extractPrimaryTaskReference,
  parseGitHubCollaborationIssueMetadata,
  normalizeTaskReference,
} = require('./githubTaskTopology');
const {
  buildPhaseReleaseBody,
  buildPhaseReleaseName,
  buildPhaseReleaseTag,
} = require('./phaseRelease');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const DEFAULT_PROJECT_STATUS_FIELD_NAMES = Object.freeze(['Nexus Status', 'Status']);
const MANAGED_LABEL_PREFIXES = Object.freeze(['status:', 'priority:', 'agent:', 'owner:', 'instance:']);
const ISSUE_BODY_SECTION_KEYS = Object.freeze({
  'backlog id': 'backlogRef',
  objective: 'objective',
  'initial nexus status': 'initialStatus',
  priority: 'priority',
  phase: 'phase',
  'suggested squad': 'suggestedSquad',
  'approved scope': 'approvedScope',
  'acceptance criteria': 'acceptanceCriteria',
  dependencies: 'dependencies',
  'known external access gaps': 'externalAccessGaps',
  'explicitly out of scope for this issue': 'outOfScope',
  'agent execution rules': 'executionRules',
});

function resolveGitHubProjectOwner(env = process.env) {
  const explicitProjectOwner = String(env.GITHUB_PROJECT_OWNER || '').trim();
  if (explicitProjectOwner) return explicitProjectOwner;
  return String(env.GITHUB_OWNER || '').trim();
}

function resolveGitHubProjectStatusFieldNames(env = process.env) {
  const raw = String(env.NEXUS_GITHUB_PROJECT_STATUS_FIELDS || '').trim();
  if (!raw) {
    return [...DEFAULT_PROJECT_STATUS_FIELD_NAMES];
  }

  const seen = new Set();
  const names = raw
    .split(',')
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .filter((entry) => {
      const normalized = entry.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

  return names.length > 0 ? names : [...DEFAULT_PROJECT_STATUS_FIELD_NAMES];
}

const PROJECT_OWNER = resolveGitHubProjectOwner();
const PROJECT_STATUS_FIELD_NAMES = resolveGitHubProjectStatusFieldNames();
const GITHUB_PROJECT_NUMBER = Number.parseInt(process.env.GITHUB_PROJECT_NUMBER || '', 10);
const PROJECT_SYNC_MAX_ATTEMPTS = Math.max(
  1,
  Number.parseInt(process.env.NEXUS_GITHUB_PROJECT_SYNC_ATTEMPTS || '', 10) || 4,
);
const PROJECT_SYNC_RETRY_BASE_MS = Math.max(
  250,
  Number.parseInt(process.env.NEXUS_GITHUB_PROJECT_SYNC_RETRY_MS || '', 10) || 1200,
);
const PROJECT_SYNC_ENABLED =
  Number.isInteger(GITHUB_PROJECT_NUMBER) && GITHUB_PROJECT_NUMBER > 0;
const ISSUE_ASSIGNEE_FALLBACK_ENABLED =
  String(process.env.NEXUS_GITHUB_ASSIGNEE_FALLBACK || 'false')
    .trim()
    .toLowerCase() === 'true';

let octokit;
if (GITHUB_TOKEN) {
  octokit = new Octokit({ auth: GITHUB_TOKEN });
}

let cachedProjectContextPromise = null;
let githubMutationQueue = Promise.resolve();
const cachedProjectItemIdsByIssueNodeId = new Map();
let warnedMissingGitHubCredentials = false;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

function enqueueGitHubMutation(work) {
  const scheduledWork = githubMutationQueue.then(() => work());
  githubMutationQueue = scheduledWork.catch(() => {});
  return scheduledWork;
}

function shouldInvalidateProjectItemCache(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('could not resolve to a projectv2item') ||
    message.includes('could not resolve to a node') ||
    message.includes('could not resolve id') ||
    message.includes('not found')
  );
}

function normalizeStatusValue(status) {
  return String(status || '').trim().toLowerCase();
}

function normalizeTaskPriority(priority) {
  const normalized = String(priority || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

  if (!normalized) return null;
  if (normalized === '0' || normalized === 'p0') return 'p0';
  if (normalized === '1' || normalized === 'p1') return 'p1';
  if (normalized === '2' || normalized === 'p2') return 'p2';
  if (normalized === '3' || normalized === 'p3') return 'p3';
  return null;
}

function formatTaskPriority(priority) {
  const normalized = normalizeTaskPriority(priority);
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeIssueSectionName(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueNormalizedValues(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((entry) => String(entry || '').trim())
      .filter(Boolean),
  )];
}

function normalizeSectionLine(line) {
  return String(line || '')
    .trim()
    .replace(/^[-*+]\s+/, '')
    .trim();
}

function parseMarkdownIssueSections(body) {
  const sections = new Map();
  const lines = String(body || '').split(/\r?\n/);
  let currentSectionKey = null;

  lines.forEach((line) => {
    const headingMatch = /^##\s+(.+?)\s*$/.exec(String(line || '').trim());
    if (headingMatch) {
      const normalizedHeading = normalizeIssueSectionName(headingMatch[1]);
      currentSectionKey = ISSUE_BODY_SECTION_KEYS[normalizedHeading] || null;
      if (currentSectionKey && !sections.has(currentSectionKey)) {
        sections.set(currentSectionKey, []);
      }
      return;
    }

    if (!currentSectionKey || !sections.has(currentSectionKey)) {
      return;
    }

    sections.get(currentSectionKey).push(line);
  });

  return sections;
}

function readSingleValueSection(sections, sectionKey) {
  const lines = sections.get(sectionKey) || [];
  const values = uniqueNormalizedValues(lines.map(normalizeSectionLine));
  if (values.length === 0) return null;
  return values.join(' ');
}

function readListSection(sections, sectionKey) {
  const lines = sections.get(sectionKey) || [];
  return uniqueNormalizedValues(lines.map(normalizeSectionLine));
}

function parseIssueExecutionContext(body) {
  const sections = parseMarkdownIssueSections(body);
  if (sections.size === 0) {
    return {
      backlogRef: null,
      objective: null,
      initialStatus: null,
      priority: null,
      phase: null,
      suggestedSquad: null,
      approvedScope: [],
      acceptanceCriteria: [],
      dependencies: [],
      externalAccessGaps: [],
      outOfScope: [],
      executionRules: [],
    };
  }

  const rawBacklogRef = readSingleValueSection(sections, 'backlogRef');

  return {
    backlogRef: normalizeTaskReference(rawBacklogRef),
    objective: readSingleValueSection(sections, 'objective'),
    initialStatus: readSingleValueSection(sections, 'initialStatus'),
    priority: normalizeTaskPriority(readSingleValueSection(sections, 'priority')),
    phase: readSingleValueSection(sections, 'phase'),
    suggestedSquad: readSingleValueSection(sections, 'suggestedSquad'),
    approvedScope: readListSection(sections, 'approvedScope'),
    acceptanceCriteria: readListSection(sections, 'acceptanceCriteria'),
    dependencies: readListSection(sections, 'dependencies').filter((entry) => entry !== 'none'),
    externalAccessGaps: readListSection(sections, 'externalAccessGaps').filter(
      (entry) => entry !== 'none at this stage',
    ),
    outOfScope: readListSection(sections, 'outOfScope'),
    executionRules: readListSection(sections, 'executionRules'),
  };
}

function resolveProjectStatusOptionName(statusField, status) {
  if (!statusField || !Array.isArray(statusField.options)) return null;

  const normalizedStatus = normalizeStatusValue(status);
  const optionNames = new Set(statusField.options.map((option) => option.name));
  const hasInProgress =
    optionNames.has('In progress') || optionNames.has('In Progress');
  const hasInReview =
    optionNames.has('In review') || optionNames.has('In Review');

  if (statusField.name === 'Nexus Status') {
    if (normalizedStatus === 'backlog' && optionNames.has('Backlog')) return 'Backlog';
    if (normalizedStatus === 'ready' && optionNames.has('Ready')) return 'Ready';
    if (normalizedStatus === 'in_progress') {
      if (optionNames.has('In progress')) return 'In progress';
      if (optionNames.has('In Progress')) return 'In Progress';
    }
    if (normalizedStatus === 'in_review') {
      if (optionNames.has('In review')) return 'In review';
      if (optionNames.has('In Review')) return 'In Review';
    }
    if (normalizedStatus === 'done' && optionNames.has('Done')) return 'Done';
    if (
      normalizedStatus === 'pendente_admin' &&
      optionNames.has('Pendente ADMIN')
    ) {
      return 'Pendente ADMIN';
    }
    if (
      normalizedStatus === 'pendente_admin' &&
      optionNames.has('Pendente Admin')
    ) {
      return 'Pendente Admin';
    }
    if (
      normalizedStatus === 'pendente_admin' &&
      optionNames.has('Pendente Super Admin')
    ) {
      return 'Pendente Super Admin';
    }
    return null;
  }

  if (normalizedStatus === 'done' && optionNames.has('Done')) return 'Done';

  if ((normalizedStatus === 'in_progress' || normalizedStatus === 'in_review') && hasInProgress) {
    return optionNames.has('In Progress') ? 'In Progress' : 'In progress';
  }

  if (normalizedStatus === 'pendente_admin') {
    if (optionNames.has('Pendente ADMIN')) return 'Pendente ADMIN';
    if (optionNames.has('Pendente Admin')) return 'Pendente Admin';
    if (optionNames.has('Pendente Super Admin')) return 'Pendente Super Admin';
    return null;
  }

  if (
    (normalizedStatus === 'backlog' ||
      normalizedStatus === 'ready') &&
    optionNames.has('Todo')
  ) {
    return 'Todo';
  }

  if (normalizedStatus === 'in_review' && hasInReview) {
    return optionNames.has('In Review') ? 'In Review' : 'In review';
  }

  return null;
}

async function getProjectContext() {
  if (!octokit || !PROJECT_OWNER || !PROJECT_SYNC_ENABLED) {
    return null;
  }

  if (!cachedProjectContextPromise) {
    cachedProjectContextPromise = octokit.graphql(
      `
        query NexusProjectContext($owner: String!, $number: Int!) {
          repositoryOwner(login: $owner) {
            __typename
            login
            ... on User {
              projectV2(number: $number) {
                id
                fields(first: 50) {
                  nodes {
                    ... on ProjectV2FieldCommon {
                      id
                      name
                    }
                    ... on ProjectV2SingleSelectField {
                      id
                      name
                      options {
                        id
                        name
                      }
                    }
                  }
                }
              }
            }
            ... on Organization {
              projectV2(number: $number) {
                id
                fields(first: 50) {
                  nodes {
                    ... on ProjectV2FieldCommon {
                      id
                      name
                    }
                    ... on ProjectV2SingleSelectField {
                      id
                      name
                      options {
                        id
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { owner: PROJECT_OWNER, number: GITHUB_PROJECT_NUMBER }
    )
      .then((payload) => {
        const project = payload?.repositoryOwner?.projectV2 || null;
        if (!project) return null;

        const selectableFields = (project.fields?.nodes || []).filter((field) => {
          return field && Array.isArray(field.options);
        });

        const statusFields = PROJECT_STATUS_FIELD_NAMES
          .map((name) => selectableFields.find((field) => field.name === name))
          .filter(Boolean);

        if (statusFields.length === 0) return null;

        return {
          projectId: project.id,
          statusFields,
        };
      })
      .catch((error) => {
        cachedProjectContextPromise = null;
        console.error('[GitHub] Erro ao carregar contexto do Project:', error.message);
        return null;
      });
  }

  return cachedProjectContextPromise;
}

async function findProjectItemIdByIssueNodeId(issueNodeId, options = {}) {
  if (!issueNodeId || !octokit || !PROJECT_OWNER || !PROJECT_SYNC_ENABLED) return null;
  if (!options.forceRefresh && cachedProjectItemIdsByIssueNodeId.has(issueNodeId)) {
    return cachedProjectItemIdsByIssueNodeId.get(issueNodeId);
  }

  let after = null;

  while (true) {
    const payload = await octokit.graphql(
      `
        query NexusProjectItems($owner: String!, $number: Int!, $after: String) {
          repositoryOwner(login: $owner) {
            __typename
            login
            ... on User {
              projectV2(number: $number) {
                items(first: 100, after: $after) {
                  nodes {
                    id
                    content {
                      __typename
                      ... on Issue {
                        id
                      }
                    }
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
            }
            ... on Organization {
              projectV2(number: $number) {
                items(first: 100, after: $after) {
                  nodes {
                    id
                    content {
                      __typename
                      ... on Issue {
                        id
                      }
                    }
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
            }
          }
        }
      `,
      { owner: PROJECT_OWNER, number: GITHUB_PROJECT_NUMBER, after }
    );

    const project = payload?.repositoryOwner?.projectV2 || null;
    const items = project?.items;
    if (!items) return null;

    const match = items.nodes.find((node) => {
      return node?.content?.__typename === 'Issue' && node.content.id === issueNodeId;
    });
    if (match) {
      cachedProjectItemIdsByIssueNodeId.set(issueNodeId, match.id);
      return match.id;
    }

    if (!items.pageInfo?.hasNextPage) return null;
    after = items.pageInfo.endCursor;
  }
}

async function addIssueToProject(projectId, issueNodeId) {
  if (!projectId || !issueNodeId || !octokit) return null;

  const payload = await octokit.graphql(
    `
      mutation NexusAddIssueToProject($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item {
            id
          }
        }
      }
    `,
    { projectId, contentId: issueNodeId }
  );

  const itemId = payload?.addProjectV2ItemById?.item?.id || null;
  if (itemId) {
    cachedProjectItemIdsByIssueNodeId.set(issueNodeId, itemId);
  }

  return itemId;
}

async function syncProjectStatusOnce(issueNodeId, status, options = {}) {
  const context = await getProjectContext();
  if (!context) return false;

  let itemId = await findProjectItemIdByIssueNodeId(issueNodeId, {
    forceRefresh: options.forceRefresh === true,
  });
  if (!itemId) {
    itemId = await addIssueToProject(context.projectId, issueNodeId);
  }
  if (!itemId) return false;

  let updatedAnyField = false;
  for (const statusField of context.statusFields) {
    const optionName = resolveProjectStatusOptionName(statusField, status);
    if (!optionName) {
      continue;
    }

    const option = statusField.options.find((entry) => entry.name === optionName);
    if (!option) {
      continue;
    }

    await octokit.graphql(
      `
        mutation NexusUpdateProjectItemStatus(
          $projectId: ID!
          $itemId: ID!
          $fieldId: ID!
          $optionId: String!
        ) {
          updateProjectV2ItemFieldValue(
            input: {
              projectId: $projectId
              itemId: $itemId
              fieldId: $fieldId
              value: { singleSelectOptionId: $optionId }
            }
          ) {
            projectV2Item {
              id
            }
          }
        }
      `,
      {
        projectId: context.projectId,
        itemId,
        fieldId: statusField.id,
        optionId: option.id,
      }
    );

    updatedAnyField = true;
  }

  return updatedAnyField;
}

async function syncProjectStatus(issueNodeId, status) {
  if (!octokit || !issueNodeId || !PROJECT_SYNC_ENABLED) return false;

  let forceRefresh = false;
  let lastError = null;

  for (let attempt = 1; attempt <= PROJECT_SYNC_MAX_ATTEMPTS; attempt += 1) {
    try {
      const synced = await syncProjectStatusOnce(issueNodeId, status, { forceRefresh });
      if (synced) {
        return true;
      }
      lastError = null;
    } catch (error) {
      lastError = error;
      if (shouldInvalidateProjectItemCache(error)) {
        cachedProjectItemIdsByIssueNodeId.delete(issueNodeId);
        forceRefresh = true;
      }
    }

    if (attempt < PROJECT_SYNC_MAX_ATTEMPTS) {
      await delay(PROJECT_SYNC_RETRY_BASE_MS * attempt);
    }
  }

  if (lastError) {
    console.error('[GitHub] Erro ao sincronizar Project:', lastError.message);
  } else {
    console.warn(`[GitHub] Sync do Project nao confirmou ${issueNodeId} -> ${status}`);
  }

  return false;
}

function resolveProjectItemStatusFromFieldValues(fieldValues = [], preferredFieldNames = PROJECT_STATUS_FIELD_NAMES) {
  const normalizedPreferredFieldNames = (Array.isArray(preferredFieldNames) ? preferredFieldNames : [])
    .map((fieldName) => String(fieldName || '').trim())
    .filter(Boolean);
  if (normalizedPreferredFieldNames.length === 0) {
    return null;
  }

  const statusesByFieldName = new Map();
  (Array.isArray(fieldValues) ? fieldValues : []).forEach((fieldValue) => {
    const fieldName = String(fieldValue?.field?.name || '').trim();
    const normalizedStatus = normalizeGitHubTaskStatus(fieldValue?.name);
    if (!fieldName || !normalizedStatus || statusesByFieldName.has(fieldName)) {
      return;
    }
    statusesByFieldName.set(fieldName, normalizedStatus);
  });

  for (const fieldName of normalizedPreferredFieldNames) {
    const normalizedStatus = statusesByFieldName.get(fieldName);
    if (normalizedStatus) {
      return normalizedStatus;
    }
  }

  return null;
}

async function fetchProjectItemStatusesByIssueNodeId() {
  if (!octokit || !PROJECT_OWNER || !PROJECT_SYNC_ENABLED) {
    return null;
  }

  const context = await getProjectContext();
  const preferredFieldNames = (context?.statusFields || [])
    .map((field) => String(field?.name || '').trim())
    .filter(Boolean);
  if (preferredFieldNames.length === 0) {
    return null;
  }

  const statusesByIssueNodeId = new Map();
  let after = null;

  while (true) {
    const payload = await octokit.graphql(
      `
        query NexusProjectItemStatuses($owner: String!, $number: Int!, $after: String) {
          repositoryOwner(login: $owner) {
            __typename
            login
            ... on User {
              projectV2(number: $number) {
                items(first: 100, after: $after) {
                  nodes {
                    content {
                      __typename
                      ... on Issue {
                        id
                      }
                    }
                    fieldValues(first: 20) {
                      nodes {
                        ... on ProjectV2ItemFieldSingleSelectValue {
                          name
                          field {
                            ... on ProjectV2FieldCommon {
                              name
                            }
                          }
                        }
                      }
                    }
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
            }
            ... on Organization {
              projectV2(number: $number) {
                items(first: 100, after: $after) {
                  nodes {
                    content {
                      __typename
                      ... on Issue {
                        id
                      }
                    }
                    fieldValues(first: 20) {
                      nodes {
                        ... on ProjectV2ItemFieldSingleSelectValue {
                          name
                          field {
                            ... on ProjectV2FieldCommon {
                              name
                            }
                          }
                        }
                      }
                    }
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
            }
          }
        }
      `,
      { owner: PROJECT_OWNER, number: GITHUB_PROJECT_NUMBER, after }
    );

    const project = payload?.repositoryOwner?.projectV2 || null;
    const items = project?.items;
    if (!items) {
      return statusesByIssueNodeId;
    }

    items.nodes.forEach((item) => {
      if (item?.content?.__typename !== 'Issue' || !item.content.id) {
        return;
      }
      const normalizedStatus = resolveProjectItemStatusFromFieldValues(
        item?.fieldValues?.nodes || [],
        preferredFieldNames,
      );
      if (normalizedStatus) {
        statusesByIssueNodeId.set(item.content.id, normalizedStatus);
      }
    });

    if (!items.pageInfo?.hasNextPage) {
      break;
    }
    after = items.pageInfo.endCursor;
  }

  return statusesByIssueNodeId;
}

function getIssueLabelNames(issue) {
  return Array.isArray(issue?.labels)
    ? issue.labels
        .map((label) => (typeof label === 'string' ? label : label?.name))
        .map((label) => String(label || '').trim())
        .filter(Boolean)
    : [];
}

function normalizeManagedLabelValue(value) {
  return String(value || '').trim() || null;
}

function startsWithManagedPrefix(label, prefix) {
  return String(label || '').trim().toLowerCase().startsWith(prefix);
}

function parseManagedIssueLabels(issue) {
  const labels = getIssueLabelNames(issue);
  const readLabel = (prefix) => {
    const match = labels.find((label) => startsWithManagedPrefix(label, prefix));
    if (!match) return null;
    return normalizeManagedLabelValue(match.slice(prefix.length).trim());
  };

  return {
    labels,
    status: readLabel('status:'),
    priority: normalizeTaskPriority(readLabel('priority:')),
    assignee: readLabel('agent:'),
    ownerId: normalizeInstanceValue(readLabel('owner:')),
    ownerInstanceId: normalizeInstanceValue(readLabel('instance:') || readLabel('owner:')),
  };
}

function normalizeGitHubTaskStatus(status) {
  const normalized = String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (!normalized) return null;
  if (['done', 'closed'].includes(normalized)) return 'done';
  if (['in_progress', 'progress'].includes(normalized)) return 'in_progress';
  if (['in_review', 'review'].includes(normalized)) return 'in_review';
  if (['ready'].includes(normalized)) return 'ready';
  if (['backlog', 'todo'].includes(normalized)) return 'backlog';
  if ([
    'pendente_admin',
    'pending_admin',
    'pendente_super_admin',
    'pendente',
    'super_admin',
    'admin_pending',
  ].includes(normalized)) {
    return 'pendente_admin';
  }
  return null;
}

function resolveTaskStatusFromIssue(issue, explicitStatus = null) {
  const normalizedExplicitStatus = normalizeGitHubTaskStatus(explicitStatus);
  if (normalizedExplicitStatus) {
    return normalizedExplicitStatus;
  }

  const labels = getIssueLabelNames(issue).filter(
    (label) => !MANAGED_LABEL_PREFIXES.some((prefix) => startsWithManagedPrefix(label, prefix)),
  );
  const normalizedLabels = labels.map((label) =>
    String(label || '')
      .toLowerCase()
      .replace(/[_-]+/g, ' '),
  );

  if (issue.state === 'closed' || normalizedLabels.some((label) => label.includes('done'))) {
    return 'done';
  }
  if (normalizedLabels.some((label) => label.includes('in progress') || label.includes('inprogress'))) {
    return 'in_progress';
  }
  if (normalizedLabels.some((label) => label.includes('ready'))) {
    return 'ready';
  }
  if (normalizedLabels.some((label) => label.includes('in review') || label.includes('inreview') || label.includes('review'))) {
    return 'in_review';
  }
  if (
    normalizedLabels.some((label) =>
      label.includes('pendente') ||
      label.includes('super admin') ||
      label.includes('pending admin') ||
      label.includes('admin pending'),
    )
  ) {
    return 'pendente_admin';
  }
  if (normalizedLabels.some((label) => label.includes('backlog') || label.includes('todo'))) {
    return 'backlog';
  }

  return 'backlog';
}

function mergeManagedLabels(existingLabels = [], metadata = {}) {
  const preservedLabels = existingLabels.filter(
    (label) => !MANAGED_LABEL_PREFIXES.some((prefix) => startsWithManagedPrefix(label, prefix)),
  );

  const normalizedStatus = normalizeGitHubTaskStatus(metadata.status);
  if (normalizedStatus) {
    preservedLabels.push(`status: ${normalizedStatus}`);
  }

  const normalizedPriority = normalizeTaskPriority(metadata.priority);
  if (normalizedPriority) {
    preservedLabels.push(`priority: ${normalizedPriority}`);
  }

  const normalizedAssignee = normalizeManagedLabelValue(metadata.assigneeId);
  if (normalizedAssignee) {
    preservedLabels.push(`agent: ${normalizedAssignee}`);
  }

  const normalizedOwnerId = normalizeInstanceValue(metadata.ownerId);
  if (normalizedOwnerId) {
    preservedLabels.push(`owner: ${normalizedOwnerId}`);
  }

  const normalizedOwnerInstanceId = normalizeInstanceValue(
    metadata.ownerInstanceId || normalizedOwnerId,
  );
  if (normalizedOwnerInstanceId) {
    preservedLabels.push(`instance: ${normalizedOwnerInstanceId}`);
  }

  return preservedLabels;
}

function appendGitHubIssueBodySection(sections, heading, values, options = {}) {
  const listMode = options.list !== false;
  const normalizedValues = listMode
    ? uniqueNormalizedValues(Array.isArray(values) ? values : [values]).map(normalizeSectionLine).filter(Boolean)
    : uniqueNormalizedValues([normalizeSectionLine(values)]).filter(Boolean);

  if (normalizedValues.length === 0) {
    return;
  }

  const content = listMode
    ? normalizedValues.map((value) => `- ${value}`).join('\n')
    : normalizedValues[0];
  sections.push(`## ${heading}\n${content}`);
}

function buildGitHubTaskBody(metadata = {}) {
  const explicitBody = String(metadata.body || '').trim();
  if (explicitBody) {
    return explicitBody;
  }

  const normalizedStatus = normalizeGitHubTaskStatus(metadata.status || metadata.initialStatus || 'backlog') || 'backlog';
  const sections = [];

  appendGitHubIssueBodySection(sections, 'Backlog ID', metadata.backlogRef, { list: false });
  appendGitHubIssueBodySection(sections, 'Objective', metadata.objective, { list: false });
  appendGitHubIssueBodySection(sections, 'Initial Nexus Status', normalizedStatus, { list: false });
  appendGitHubIssueBodySection(
    sections,
    'Priority',
    formatTaskPriority(metadata.priority),
    { list: false },
  );
  appendGitHubIssueBodySection(sections, 'Phase', metadata.phase, { list: false });
  appendGitHubIssueBodySection(sections, 'Suggested Squad', metadata.suggestedSquad, { list: false });
  appendGitHubIssueBodySection(sections, 'Approved Scope', metadata.approvedScope);
  appendGitHubIssueBodySection(sections, 'Acceptance Criteria', metadata.acceptanceCriteria);
  appendGitHubIssueBodySection(
    sections,
    'Dependencies',
    Array.isArray(metadata.dependencies) && metadata.dependencies.length > 0
      ? metadata.dependencies
      : metadata.dependencies !== undefined
        ? ['none']
        : [],
  );
  appendGitHubIssueBodySection(
    sections,
    'Known External Access Gaps',
    Array.isArray(metadata.externalAccessGaps) && metadata.externalAccessGaps.length > 0
      ? metadata.externalAccessGaps
      : metadata.externalAccessGaps !== undefined
        ? ['none at this stage']
        : [],
  );
  appendGitHubIssueBodySection(sections, 'Explicitly Out of Scope For This Issue', metadata.outOfScope);
  appendGitHubIssueBodySection(sections, 'Agent Execution Rules', metadata.executionRules);

  const normalized = sections.join('\n\n').trim();
  return normalized || null;
}

// Mapeamento interno: Issue -> Task
const mapIssueToTask = (issue, explicitStatus = null) => {
  const managedLabels = parseManagedIssueLabels(issue);
  const normalizedManagedStatus = normalizeGitHubTaskStatus(managedLabels.status);
  const normalizedProjectStatus = normalizeGitHubTaskStatus(explicitStatus);
  const preferredExplicitStatus =
    normalizedProjectStatus === 'pendente_admin' && normalizedManagedStatus !== 'done'
      ? normalizedProjectStatus
      : normalizedManagedStatus || normalizedProjectStatus;
  const status = resolveTaskStatusFromIssue(issue, preferredExplicitStatus);
  const collaborationMetadata = parseGitHubCollaborationIssueMetadata(issue);
  const issueExecutionContext = parseIssueExecutionContext(issue.body || '');
  let assignee = null;
  if (managedLabels.assignee) {
    assignee = managedLabels.assignee;
  } else if (
    ISSUE_ASSIGNEE_FALLBACK_ENABLED &&
    issue.assignees &&
    issue.assignees.length > 0
  ) {
    // Caso tenham sido assignados pelo nome real no Github (se bater com ID da squad)
    assignee = issue.assignees[0].login;
  }
  const preservesExecutionOwnership = ['in_progress', 'in_review'].includes(status);
  const ownerId = preservesExecutionOwnership ? managedLabels.ownerId : null;
  const ownerInstanceId = preservesExecutionOwnership ? managedLabels.ownerInstanceId : null;
  if (!preservesExecutionOwnership) {
    assignee = null;
  }

  return {
    id: `GH-${issue.number}`,
    title: issue.title,
    status,
    assignee,
    ownerId,
    ownerInstanceId,
    githubNodeId: issue.node_id || null,
    githubUrl: issue.html_url,
    createdAt: issue.created_at || null,
    updatedAt: issue.updated_at || null,
    kind: collaborationMetadata.kind,
    collaborationKey: collaborationMetadata.collaborationKey,
    parentTaskRef: collaborationMetadata.parentTaskRef,
    summary: collaborationMetadata.summary,
    backlogRef:
      issueExecutionContext.backlogRef ||
      (collaborationMetadata.kind === 'github_collaboration'
        ? collaborationMetadata.parentTaskRef
        : extractPrimaryTaskReference({ title: issue.title })),
    priority: issueExecutionContext.priority || managedLabels.priority,
    objective: issueExecutionContext.objective,
    phase: issueExecutionContext.phase,
    suggestedSquad: issueExecutionContext.suggestedSquad,
    approvedScope: issueExecutionContext.approvedScope,
    acceptanceCriteria: issueExecutionContext.acceptanceCriteria,
    dependencies: issueExecutionContext.dependencies,
    externalAccessGaps: issueExecutionContext.externalAccessGaps,
    outOfScope: issueExecutionContext.outOfScope,
    executionRules: issueExecutionContext.executionRules,
  };
};

async function fetchGitHubTasks() {
  if (!octokit || !OWNER || !REPO) {
    if (!warnedMissingGitHubCredentials) {
      warnedMissingGitHubCredentials = true;
      console.log('[GitHub] Credenciais não encontradas. Operando em modo local.');
    }
    return null;
  }

  try {
    const [issues, projectStatusesByIssueNodeId] = await Promise.all([
      octokit.paginate(octokit.issues.listForRepo, {
        owner: OWNER,
        repo: REPO,
        state: 'all',
        per_page: 100,
      }),
      fetchProjectItemStatusesByIssueNodeId(),
    ]);

    // Ignora pull requests (que também vêm na API de issues)
    const pureIssues = issues.filter((issue) => !issue.pull_request);

    return pureIssues.map((issue) =>
      mapIssueToTask(
        issue,
        projectStatusesByIssueNodeId?.get(issue.node_id) || null,
      ),
    );
  } catch (error) {
    console.error('[GitHub] Erro ao buscar issues:', error.message);
    return null;
  }
}

async function moveGitHubTask(taskId, newStatus, assigneeId, metadata = {}) {
  if (!octokit || !OWNER || !REPO) return false;

  return enqueueGitHubMutation(async () => {
    const issueNumber = parseInt(taskId.replace('GH-', ''));

    try {
      // Obter labels atuais
      const { data: issue } = await octokit.issues.get({
        owner: OWNER,
        repo: REPO,
        issue_number: issueNumber,
      });
      const managedLabels = parseManagedIssueLabels(issue);
      const labels = mergeManagedLabels(
        getIssueLabelNames(issue),
        {
          status: newStatus,
          priority: managedLabels.priority,
          assigneeId,
          ownerId: metadata.ownerId,
          ownerInstanceId: metadata.ownerInstanceId,
        },
      );

      await octokit.issues.update({
        owner: OWNER,
        repo: REPO,
        issue_number: issueNumber,
        labels,
        state: newStatus === 'done' ? 'closed' : 'open',
      });

      const projectSynced = PROJECT_SYNC_ENABLED
        ? await syncProjectStatus(issue.node_id, newStatus)
        : true;

      if (!projectSynced) {
        console.warn(
          `[GitHub] Issue #${issueNumber} atualizada, mas o GitHub Project nao confirmou ${newStatus}.`,
        );
      }

      console.log(`[GitHub] Issue #${issueNumber} atualizada para ${newStatus} pelo agente ${assigneeId}`);
      return projectSynced;
    } catch (error) {
      console.error('[GitHub] Erro ao atualizar issue:', error.message);
      return false;
    }
  });
}

async function createGitHubTask(title, assigneeId, metadata = {}) {
  if (!octokit || !OWNER || !REPO) return null;

  return enqueueGitHubMutation(async () => {
    try {
      const requestedStatus = normalizeGitHubTaskStatus(metadata.status) || 'backlog';
      const baseLabels = uniqueNormalizedValues([
        ...(Array.isArray(metadata.labels) ? metadata.labels : []),
        ...(Array.isArray(metadata.extraLabels) ? metadata.extraLabels : []),
      ]);
      const labels = mergeManagedLabels(
        baseLabels,
        {
          status: requestedStatus,
          priority: metadata.priority,
          assigneeId,
          ownerId: metadata.ownerId,
          ownerInstanceId: metadata.ownerInstanceId,
        },
      );
      const body = buildGitHubTaskBody({
        ...metadata,
        status: requestedStatus,
      });

      const payload = {
        owner: OWNER,
        repo: REPO,
        title,
        labels,
      };
      if (body) {
        payload.body = body;
      }

      const { data: issue } = await octokit.issues.create(payload);

      const projectSynced = PROJECT_SYNC_ENABLED
        ? await syncProjectStatus(issue.node_id, requestedStatus)
        : true;

      if (!projectSynced) {
        console.warn(
          `[GitHub] Issue #${issue.number} criada, mas o GitHub Project nao confirmou ${requestedStatus}.`,
        );
      }

      console.log(`[GitHub] Nova Issue criada #${issue.number} para o agente ${assigneeId || 'unassigned'}`);
      return mapIssueToTask(issue);
    } catch (error) {
      console.error('[GitHub] Erro ao criar issue:', error.message);
      return null;
    }
  });
}

async function syncGitHubTaskDefinition(taskId, title, metadata = {}) {
  if (!octokit || !OWNER || !REPO) return null;

  return enqueueGitHubMutation(async () => {
    const issueNumber = Number.parseInt(String(taskId || '').replace(/^GH-/, ''), 10);
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      return null;
    }

    try {
      const { data: issue } = await octokit.issues.get({
        owner: OWNER,
        repo: REPO,
        issue_number: issueNumber,
      });
      const managedLabels = parseManagedIssueLabels(issue);
      const requestedStatus =
        normalizeGitHubTaskStatus(managedLabels.status)
        || normalizeGitHubTaskStatus(metadata.status)
        || normalizeGitHubTaskStatus(metadata.initialStatus)
        || 'backlog';
      const requestedPriority = normalizeTaskPriority(metadata.priority) || managedLabels.priority;
      const baseLabels = uniqueNormalizedValues([
        ...getIssueLabelNames(issue),
        ...(Array.isArray(metadata.labels) ? metadata.labels : []),
        ...(Array.isArray(metadata.extraLabels) ? metadata.extraLabels : []),
      ]);
      const labels = mergeManagedLabels(
        baseLabels,
        {
          status: requestedStatus,
          priority: requestedPriority,
          assigneeId: managedLabels.assignee,
          ownerId: managedLabels.ownerId,
          ownerInstanceId: managedLabels.ownerInstanceId,
        },
      );
      const body = buildGitHubTaskBody({
        ...metadata,
        status: requestedStatus,
        priority: requestedPriority,
      });

      const payload = {
        owner: OWNER,
        repo: REPO,
        issue_number: issueNumber,
        title,
        labels,
        state: issue.state,
      };
      if (body) {
        payload.body = body;
      }

      const { data: updatedIssue } = await octokit.issues.update(payload);
      if (PROJECT_SYNC_ENABLED) {
        await syncProjectStatus(updatedIssue.node_id, requestedStatus);
      }

      return mapIssueToTask(updatedIssue);
    } catch (error) {
      console.error('[GitHub] Erro ao sincronizar definicao da issue:', error.message);
      return null;
    }
  });
}

async function createGitHubPhaseRelease({ phase, branchName, tasks = [] } = {}) {
  if (!octokit || !OWNER || !REPO) return null;

  const normalizedBranchName = String(branchName || '').trim();
  if (!normalizedBranchName) return null;

  return enqueueGitHubMutation(async () => {
    try {
      const { data: branch } = await octokit.repos.getBranch({
        owner: OWNER,
        repo: REPO,
        branch: normalizedBranchName,
      });
      const targetSha = String(branch?.commit?.sha || '').trim();
      if (!targetSha) {
        return null;
      }

      const tagName = buildPhaseReleaseTag(normalizedBranchName, targetSha);

      try {
        const { data: existingRelease } = await octokit.repos.getReleaseByTag({
          owner: OWNER,
          repo: REPO,
          tag: tagName,
        });
        return {
          created: false,
          releaseId: existingRelease.id,
          htmlUrl: existingRelease.html_url,
          tagName,
          targetSha,
          branchName: normalizedBranchName,
        };
      } catch (error) {
        if (Number(error?.status) !== 404) {
          throw error;
        }
      }

      const { data: release } = await octokit.repos.createRelease({
        owner: OWNER,
        repo: REPO,
        tag_name: tagName,
        target_commitish: normalizedBranchName,
        name: buildPhaseReleaseName({ phase, branchName: normalizedBranchName }),
        body: buildPhaseReleaseBody({ phase, branchName: normalizedBranchName, tasks }),
        draft: false,
        prerelease: true,
        generate_release_notes: false,
      });

      return {
        created: true,
        releaseId: release.id,
        htmlUrl: release.html_url,
        tagName,
        targetSha,
        branchName: normalizedBranchName,
      };
    } catch (error) {
      console.error('[GitHub] Erro ao criar release de etapa:', error.message);
      return null;
    }
  });
}

module.exports = {
  buildGitHubTaskBody,
  createGitHubPhaseRelease,
  fetchGitHubTasks,
  moveGitHubTask,
  createGitHubTask,
  mapIssueToTask,
  mergeManagedLabels,
  parseIssueExecutionContext,
  parseManagedIssueLabels,
  resolveProjectStatusOptionName,
  resolveGitHubProjectOwner,
  resolveGitHubProjectStatusFieldNames,
  syncGitHubTaskDefinition,
  syncGitHubProjectStatusByNodeId: syncProjectStatus,
};
