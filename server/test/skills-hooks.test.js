const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildSkillsPrompt,
  defaultSkillRoots,
  discoverSkills,
  resolveApplicableSkills,
} = require('../services/skillsRegistry');
const { runHookPipeline } = require('../services/hookRunner');

function createWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-skills-'));
}

test('discoverSkills and resolveApplicableSkills load local SKILL.md files with metadata', () => {
  const workspace = createWorkspace();

  try {
    const skillDir = path.join(workspace, '.nexus', 'skills', 'backend', 'api');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '# Backend API\nSempre valide contratos HTTP e testes de integração.',
      'utf8',
    );
    fs.writeFileSync(
      path.join(skillDir, 'skill.json'),
      JSON.stringify({
        id: 'backend/api',
        title: 'Backend API',
        description: 'Fortalece fluxos de API.',
        roles: ['dev'],
      }),
      'utf8',
    );

    const allSkills = discoverSkills(defaultSkillRoots(workspace));
    const selectedSkills = resolveApplicableSkills({
      projectDir: workspace,
      taskTitle: 'Implementar endpoint de cobrança',
      agent: {
        role: 'dev',
        team: 'primary',
      },
    });

    assert.equal(allSkills.length, 1);
    assert.equal(allSkills[0].id, 'backend/api');
    assert.equal(selectedSkills.length, 1);
    assert.match(buildSkillsPrompt(selectedSkills), /Backend API/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runHookPipeline applies project and skill hooks in a fail-open chain', async () => {
  const workspace = createWorkspace();

  try {
    const skillDir = path.join(workspace, '.nexus', 'skills', 'review', 'security');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Security review', 'utf8');
    fs.writeFileSync(
      path.join(skillDir, 'hooks.js'),
      `module.exports = {
  beforeToolCall({ payload }) {
    if (payload.toolName !== 'bash') return {};
    return {
      payload: {
        ...payload,
        blocked: true,
        reason: 'blocked by skill hook',
      },
      note: 'skill hook executed',
    };
  },
};`,
      'utf8',
    );
    fs.mkdirSync(path.join(workspace, '.nexus'), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, '.nexus', 'hooks.js'),
      `module.exports = {
  beforePromptBuild({ payload }) {
    return {
      prompt: payload.prompt + "\\n\\nProject hook suffix.",
      note: 'project hook executed',
    };
  },
};`,
      'utf8',
    );

    const selectedSkills = discoverSkills(defaultSkillRoots(workspace));
    const promptHookResult = await runHookPipeline(
      'beforePromptBuild',
      {
        prompt: 'Prompt base.',
      },
      {
        projectDir: workspace,
        skills: selectedSkills,
      },
    );
    assert.match(promptHookResult.payload.prompt, /Project hook suffix/);
    assert.ok(promptHookResult.notes.includes('project hook executed'));

    const toolHookResult = await runHookPipeline(
      'beforeToolCall',
      {
        toolName: 'bash',
        input: { command: 'echo ok' },
        workspaceDir: workspace,
      },
      {
        projectDir: workspace,
        skills: selectedSkills,
      },
    );
    assert.equal(toolHookResult.payload.blocked, true);
    assert.equal(toolHookResult.payload.reason, 'blocked by skill hook');
    assert.ok(toolHookResult.notes.includes('skill hook executed'));
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runHookPipeline loads CommonJS project hooks from hooks.js inside type module repositories', async () => {
  const workspace = createWorkspace();

  try {
    fs.writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({
        name: 'nexus-hook-esm-fixture',
        type: 'module',
      }),
      'utf8',
    );
    fs.mkdirSync(path.join(workspace, '.nexus'), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, '.nexus', 'hooks.js'),
      `const fs = require('node:fs');

module.exports = {
  beforePromptBuild({ payload }) {
    if (typeof fs.readFileSync !== 'function') {
      throw new Error('require fallback unavailable');
    }
    return {
      prompt: payload.prompt + "\\n\\nLoaded from CommonJS hook in ESM repo.",
      note: 'esm repo commonjs hook executed',
    };
  },
};`,
      'utf8',
    );

    const promptHookResult = await runHookPipeline(
      'beforePromptBuild',
      {
        prompt: 'Prompt base.',
      },
      {
        projectDir: workspace,
        skills: [],
      },
    );

    assert.match(promptHookResult.payload.prompt, /CommonJS hook in ESM repo/);
    assert.ok(promptHookResult.notes.includes('esm repo commonjs hook executed'));
    assert.equal(promptHookResult.errors.length, 0);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
