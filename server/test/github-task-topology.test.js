const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildGitHubCollaborationMirrorId,
  parseGitHubCollaborationIssueMetadata,
  resolveGitHubCollaborationParentTaskId,
} = require('../services/githubTaskTopology');

test('parseGitHubCollaborationIssueMetadata extracts parent backlog ref and clean summary from title', () => {
  assert.deepEqual(
    parseGitHubCollaborationIssueMetadata({
      title: 'NX-HELP-001A GTMNY-001 Documentar convencoes e validar bootstrap do workspace',
    }),
    {
      kind: 'github_collaboration',
      collaborationKey: 'NX-HELP-001A',
      parentTaskRef: 'GTMNY-001',
      summary: 'Documentar convencoes e validar bootstrap do workspace',
    },
  );
});

test('parseGitHubCollaborationIssueMetadata falls back to issue body when title omits parent ref', () => {
  assert.deepEqual(
    parseGitHubCollaborationIssueMetadata({
      title: 'NX-HELP-DOCS Revisar convencoes finais',
      body: 'Relacionado a GTMNY-001.',
    }),
    {
      kind: 'github_collaboration',
      collaborationKey: 'NX-HELP-DOCS',
      parentTaskRef: 'GTMNY-001',
      summary: 'Revisar convencoes finais',
    },
  );
});

test('resolveGitHubCollaborationParentTaskId resolves parent card by external backlog ref', () => {
  const primaryTasks = [
    { id: 'GH-1', title: 'GTMNY-001 Bootstrap do monorepo e convencoes do workspace' },
    { id: 'GH-2', title: 'GTMNY-002 Estrutura inicial do aplicativo Flutter' },
  ];

  assert.equal(
    resolveGitHubCollaborationParentTaskId(
      {
        id: 'GH-27',
        title: 'NX-HELP-001A GTMNY-001 Documentar convencoes e validar bootstrap do workspace',
        parentTaskRef: 'GTMNY-001',
      },
      primaryTasks,
    ),
    'GH-1',
  );
});

test('buildGitHubCollaborationMirrorId produces stable internal ids for GitHub-backed helper issues', () => {
  assert.equal(buildGitHubCollaborationMirrorId('gh-27'), 'NX-HELP-GH-27');
});
