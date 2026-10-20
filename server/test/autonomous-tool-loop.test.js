const test = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildCommandEnv,
  buildToolExecutor,
  createToolDefinitions,
  isReviewSafeBashCommand,
  resolveRequestTimeoutMsForRuntimeCandidate,
  runAutonomousToolLoop,
  sendConversationTurn,
} = require('../services/autonomousToolLoop');

function withFetch(mockFetch, fn) {
  const previous = global.fetch;
  global.fetch = mockFetch;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      global.fetch = previous;
    });
}

function createWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-autonomy-'));
}

function seedBootstrapFoundationWorkspace(workspace) {
  fs.mkdirSync(path.join(workspace, 'apps', 'mobile'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'services', 'api'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'packages', 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'packages', 'design-system'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'infra'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'ops'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.editorconfig'), 'root = true\n', 'utf8');
  fs.writeFileSync(path.join(workspace, '.env.example'), 'APP_ENV=development\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'Makefile'), 'bootstrap:\n\t@./scripts/bootstrap.sh\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'melos.yaml'), 'name: example_mny_workspace\n', 'utf8');
  fs.writeFileSync(
    path.join(workspace, 'docs', 'WORKSPACE_CONVENTIONS.md'),
    '# Workspace Conventions\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspace, 'README.md'),
    '# Example&Project\n\n- [WORKSPACE_CONVENTIONS.md](docs/WORKSPACE_CONVENTIONS.md)\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspace, 'scripts', 'bootstrap.sh'),
    '#!/bin/sh\nset -eu\nprintf \'Workspace scaffold is present.\\n\'\n',
    'utf8',
  );
  fs.chmodSync(path.join(workspace, 'scripts', 'bootstrap.sh'), 0o755);
  fs.writeFileSync(path.join(workspace, 'apps', 'mobile', 'pubspec.yaml'), 'name: gmny_mobile\n', 'utf8');
  fs.writeFileSync(
    path.join(workspace, 'services', 'api', 'pyproject.toml'),
    '[project]\nname = "gmny-api"\n',
    'utf8',
  );
}

function initGitWorkspace(workspace) {
  execSync('git init', { cwd: workspace, stdio: 'ignore' });
  execSync('git config user.name "Nexus Test"', { cwd: workspace, stdio: 'ignore' });
  execSync('git config user.email "nexus@test.local"', { cwd: workspace, stdio: 'ignore' });
  fs.mkdirSync(path.join(workspace, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'README.md'), '# Base\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'docs', 'PROJECT_SCOPE.md'), '# Scope\n', 'utf8');
  execSync('git add .', { cwd: workspace, stdio: 'ignore' });
  execSync('git commit -m "baseline"', { cwd: workspace, stdio: 'ignore' });
}

test('createToolDefinitions removes search tools when inspection guard is armed', () => {
  const normalTools = createToolDefinitions();
  const guardedTools = createToolDefinitions({ inspectionGuardArmed: true });

  assert.ok(normalTools.some((tool) => tool.name === 'glob_search'));
  assert.ok(normalTools.some((tool) => tool.name === 'grep_search'));
  assert.deepEqual(
    guardedTools.map((tool) => tool.name).sort(),
    ['bash', 'edit_file', 'write_file'],
  );
  assert.match(
    guardedTools.find((tool) => tool.name === 'write_file').description,
    /mudanca material agora/i,
  );
  assert.match(
    guardedTools.find((tool) => tool.name === 'bash').description,
    /npm test/i,
  );
});

test('createToolDefinitions removes mutation tools in review mode and narrows review guard to bash', () => {
  const reviewTools = createToolDefinitions({ reviewMode: true });
  const guardedReviewTools = createToolDefinitions({
    reviewMode: true,
    inspectionGuardArmed: true,
  });

  assert.ok(reviewTools.some((tool) => tool.name === 'bash'));
  assert.ok(!reviewTools.some((tool) => tool.name === 'write_file'));
  assert.ok(!reviewTools.some((tool) => tool.name === 'edit_file'));
  assert.deepEqual(guardedReviewTools.map((tool) => tool.name), ['bash']);
  assert.match(
    guardedReviewTools[0].description,
    /review com discovery bloqueado/i,
  );
});

test('createToolDefinitions hardens bash guidance during shell recovery', () => {
  const tools = createToolDefinitions({ shellRecoveryMode: true });
  const bashTool = tools.find((tool) => tool.name === 'bash');

  assert.ok(bashTool);
  assert.match(bashTool.description, /recuperacao de shell ativo/i);
  assert.match(bashTool.description, /pgrep/i);
  assert.match(bashTool.description, /write_file\/edit_file/i);
});

test('resolveRequestTimeoutMsForRuntimeCandidate shortens Azure timeout when a downstream fallback exists', () => {
  const timeoutMs = resolveRequestTimeoutMsForRuntimeCandidate(
    {
      provider: 'azure_openai',
      model: 'gpt-5.4',
      reasoningEffort: 'xhigh',
      source: 'primary',
    },
    {},
    300000,
    { hasDownstreamFallback: true },
  );

  assert.equal(timeoutMs, 90000);
});

test('resolveRequestTimeoutMsForRuntimeCandidate keeps the base timeout for the primary Azure runtime', () => {
  const timeoutMs = resolveRequestTimeoutMsForRuntimeCandidate(
    {
      provider: 'azure_openai',
      model: 'gpt-5.4',
      reasoningEffort: 'xhigh',
      source: 'primary',
    },
    {},
    300000,
    { hasDownstreamFallback: false },
  );

  assert.equal(timeoutMs, 300000);
});

test('isReviewSafeBashCommand accepts guarded venv bootstrap checks used during review', () => {
  assert.equal(
    isReviewSafeBashCommand(
      'cd services/api && if [ ! -d .venv ]; then python3 -m venv .venv; fi && . .venv/bin/activate && python -m pip install -e .[dev]',
    ),
    true,
  );
  assert.equal(
    isReviewSafeBashCommand(
      'cd services/api && DATABASE_URL=sqlite+pysqlite:////tmp/example_gh4_review.db alembic upgrade head && DATABASE_URL=sqlite+pysqlite:////tmp/example_gh4_review.db alembic downgrade base',
    ),
    true,
  );
  assert.equal(
    isReviewSafeBashCommand(
      'cd services/api && python3 -m py_compile src/app/main.py 2>/dev/null && alembic upgrade head --sql > /tmp/gh4_alembic.sql',
    ),
    true,
  );
  assert.equal(
    isReviewSafeBashCommand(
      'cd apps/mobile && /home/ubuntu/flutter-sdk/bin/flutter --version',
    ),
    true,
  );
  assert.equal(
    isReviewSafeBashCommand(
      'git diff --name-only -- services/api packages/contracts README.md docs 2>/dev/null || true',
    ),
    true,
  );
  assert.equal(
    isReviewSafeBashCommand(
      'find services/api/src/app/integrations/supabase -maxdepth 3 -type f 2>/dev/null | sort',
    ),
    true,
  );
  assert.equal(
    isReviewSafeBashCommand(
      'cd services/api && APP_ENV=test .venv/bin/python -c "from app.core.config import Settings; print(Settings().app_env)"',
    ),
    true,
  );
  assert.equal(
    isReviewSafeBashCommand(
      'services/api/.venv/bin/python -c "import os; os.environ[\'APP_ENV\']=\'test\'; from app.core.config import Settings; print(Settings().app_env)"',
    ),
    true,
  );
  assert.equal(
    isReviewSafeBashCommand(
      'services/api/.venv/bin/python -c "open(\'/tmp/x\', \'w\').write(\'boom\')"',
    ),
    false,
  );
});

test('buildCommandEnv prepends user bin directories and flutter sdk when present', () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-command-env-'));

  try {
    fs.mkdirSync(path.join(tempHome, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(tempHome, '.local', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(tempHome, 'flutter-sdk', 'bin'), { recursive: true });

    const env = buildCommandEnv({
      HOME: tempHome,
      PATH: '/usr/bin',
    });
    const pathEntries = env.PATH.split(path.delimiter);

    assert.deepEqual(
      pathEntries.slice(0, 4),
      [
        path.join(tempHome, 'bin'),
        path.join(tempHome, '.local', 'bin'),
        path.join(tempHome, 'flutter-sdk', 'bin'),
        '/usr/bin',
      ],
    );
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test('buildToolExecutor blocks unsafe bash during shell recovery', async () => {
  const workspace = createWorkspace();

  try {
    const events = [];
    const executeTool = buildToolExecutor(workspace, {
      hookContext: {
        taskId: 'GH-37',
        taskTitle: 'GTMNY-035 Fechar verificacao de email e social auth',
        taskStatus: 'in_progress',
        requestKind: 'primary',
        agent: { id: 'dev', role: 'dev' },
        commandRecoveryCount: 1,
        recoveryHint: 'Nao dependa de pgrep sem verificar se existe.',
      },
      onEvent(event) {
        events.push(event);
      },
    });

    await assert.rejects(
      () => executeTool('bash', { command: 'pgrep -fa node' }),
      /pgrep/i,
    );
    const safeOutput = await executeTool('bash', { command: 'command -v bash 2>/dev/null' });
    assert.match(String(safeOutput || ''), /bash/);
    assert.ok(
      events.some(
        (event) =>
          event.type === 'tool_policy' &&
          event.toolName === 'bash' &&
          /recuperacao de shell ativa/i.test(String(event.message || '')),
      ),
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop completes an openai tool loop with local file access', async () => {
  const workspace = createWorkspace();
  fs.writeFileSync(path.join(workspace, 'notes.txt'), 'linha um\nlinha dois\n', 'utf8');
  const captured = [];

  try {
    await withFetch(async (url, init) => {
      captured.push({ url, init });
      const body = JSON.parse(init.body);

      if (captured.length === 1) {
        assert.equal(url, 'https://openai.test/v1/chat/completions');
        assert.equal(body.model, 'gpt-5');
        assert.equal(body.reasoning_effort, 'high');
        assert.equal(body.messages[0].role, 'system');
        assert.equal(body.messages[1].role, 'user');
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou inspecionar o arquivo.',
                  tool_calls: [
                    {
                      id: 'call_read_1',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'notes.txt',
                          startLine: 1,
                          endLine: 2,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      if (captured.length === 2) {
        const toolMessage = body.messages.find((message) => message.role === 'tool');
        assert.ok(toolMessage);
        assert.match(toolMessage.content, /linha um/);
        assert.equal(Object.prototype.hasOwnProperty.call(toolMessage, 'is_error'), false);
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: 'NEXUS_TASK_COMPLETE',
                },
              },
            ],
          }),
        };
      }

      throw new Error(`Chamada inesperada ao fetch: ${captured.length}`);
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        reasoningEffort: 'high',
        cwd: workspace,
        prompt: 'Leia notes.txt e finalize quando terminar.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.provider, 'openai');
      assert.equal(result.model, 'gpt-5');
      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.equal(result.iterations, 2);
      assert.ok(events.some((event) => event.type === 'tool_call' && event.toolName === 'read_file'));
      assert.ok(events.some((event) => event.type === 'assistant_text' && /inspecionar/.test(event.text)));
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop uses azure deployment endpoints for autonomous turns', async () => {
  const workspace = createWorkspace();
  const captured = [];

  try {
    await withFetch(async (url, init) => {
      captured.push({ url, init });
      return {
        ok: true,
        text: async () => JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const result = await runAutonomousToolLoop({
        provider: 'azure_openai',
        model: 'azure-openai-deployment',
        reasoningEffort: 'xhigh',
        cwd: workspace,
        prompt: 'Finalize imediatamente.',
        env: {
          AZURE_OPENAI_ENDPOINT: 'https://azure.test/openai',
          AZURE_OPENAI_API_KEY: 'azure-test-key',
          AZURE_OPENAI_API_VERSION: '2025-04-01-preview',
          AZURE_OPENAI_DEPLOYMENT: 'gpt-5.4-codex',
        },
      });

      assert.equal(result.provider, 'azure_openai');
      assert.equal(result.model, 'gpt-5.4-codex');
      assert.equal(captured.length, 1);
      assert.equal(
        captured[0].url,
        'https://azure.test/openai/deployments/gpt-5.4-codex/chat/completions?api-version=2025-04-01-preview',
      );
      const body = JSON.parse(captured[0].init.body);
      assert.equal(body.reasoning_effort, 'xhigh');
      assert.equal(body.messages[0].role, 'system');
      assert.equal(body.messages[1].role, 'user');
      assert.equal(body.model, undefined);
      assert.equal(captured[0].init.headers['api-key'], 'azure-test-key');
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop aborts stalled provider calls after the configured timeout', async () => {
  const workspace = createWorkspace();
  let sawAbortSignal = false;

  try {
    await withFetch(async (_url, init = {}) => {
      sawAbortSignal = Boolean(init.signal);
      return new Promise((_resolve, reject) => {
        const abort = () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        };

        if (init.signal?.aborted) {
          abort();
          return;
        }

        init.signal?.addEventListener('abort', abort, { once: true });
      });
    }, async () => {
      await assert.rejects(
        () => runAutonomousToolLoop({
          provider: 'openai',
          model: 'gpt-5',
          cwd: workspace,
          prompt: 'Finalize imediatamente.',
          env: {
            OPENAI_API_KEY: 'openai-test-key',
            OPENAI_BASE_URL: 'https://openai.test/v1',
            NEXUS_AUTONOMOUS_PROVIDER_TIMEOUT_MS: '1000',
          },
        }),
        /Timeout ao aguardar resposta do provider após 1000ms\./,
      );
    });

    assert.equal(sawAbortSignal, true);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop supports local openai-compatible endpoints without auth', async () => {
  const workspace = createWorkspace();
  const captured = [];

  try {
    await withFetch(async (url, init) => {
      captured.push({ url, init });
      return {
        ok: true,
        text: async () => JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const result = await runAutonomousToolLoop({
        provider: 'openai_compat',
        model: 'qwen2.5-coder:14b',
        reasoningEffort: 'xhigh',
        cwd: workspace,
        prompt: 'Finalize imediatamente.',
        env: {
          OPENAI_COMPAT_BASE_URL: 'http://127.0.0.1:11434',
          OPENAI_COMPAT_API_KEY: '',
          OLLAMA_API_KEY: '',
          OPENAI_API_KEY: '',
        },
      });

      assert.equal(result.provider, 'openai_compat');
      assert.equal(result.model, 'qwen2.5-coder:14b');
      assert.equal(captured.length, 1);
      assert.equal(captured[0].url, 'http://127.0.0.1:11434/v1/chat/completions');
      const body = JSON.parse(captured[0].init.body);
      assert.equal(body.reasoning_effort, 'none');
      assert.equal(body.chat_template_kwargs.enable_thinking, false);
      assert.equal(captured[0].init.headers.authorization, undefined);
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('sendConversationTurn retries with max_completion_tokens when the model rejects max_tokens', async () => {
  const capturedBodies = [];

  await withFetch(async (_url, init) => {
    capturedBodies.push(JSON.parse(init.body));

    if (capturedBodies.length === 1) {
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          error: {
            message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
          },
        }),
      };
    }

    return {
      ok: true,
      text: async () => JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: 'NEXUS_TASK_COMPLETE',
            },
          },
        ],
      }),
    };
  }, async () => {
    const result = await sendConversationTurn(
      'openai',
      'gpt-4o',
      [
        {
          role: 'user',
          blocks: [{ type: 'text', text: 'Finalize.' }],
        },
      ],
      [],
      {
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
        },
      },
    );

    assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
    assert.equal(capturedBodies.length, 2);
    assert.equal(capturedBodies[0].max_tokens, 4096);
    assert.equal(capturedBodies[0].max_completion_tokens, undefined);
    assert.equal(capturedBodies[1].max_tokens, undefined);
    assert.equal(capturedBodies[1].max_completion_tokens, 4096);
  });
});

test('sendConversationTurn reduces max_tokens when the provider reports a context overflow', async () => {
  const capturedBodies = [];

  await withFetch(async (_url, init) => {
    capturedBodies.push(JSON.parse(init.body));

    if (capturedBodies.length === 1) {
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          error: {
            message: "This model's maximum context length is 8192 tokens. However, you requested 4096 output tokens and your prompt contains at least 4097 input tokens, for a total of at least 8193 tokens.",
          },
        }),
      };
    }

    return {
      ok: true,
      text: async () => JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: 'NEXUS_TASK_COMPLETE',
            },
          },
        ],
      }),
    };
  }, async () => {
    const result = await sendConversationTurn(
      'openai_compat',
      'qwen3.5-397b-a17b',
      [
        {
          role: 'user',
          blocks: [{ type: 'text', text: 'Finalize.' }],
        },
      ],
      [],
      {
        env: {
          OPENAI_COMPAT_BASE_URL: 'http://127.0.0.1:8001/v1',
          OPENAI_COMPAT_API_KEY: '',
        },
      },
    );

    assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
    assert.equal(capturedBodies.length, 2);
    assert.equal(capturedBodies[0].max_tokens, 4096);
    assert.equal(capturedBodies[1].max_tokens, 2048);
  });
});

test('runAutonomousToolLoop converts JSON command text into a synthetic bash tool call', async () => {
  const workspace = createWorkspace();

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      const toolMessage = body.messages.find((message) => message.role === 'tool');

      if (!toolMessage) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5-chat',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: '{"command":"printf \\"ok\\" > smoke.txt"}',
                },
              },
            ],
          }),
        };
      }

      assert.match(toolMessage.content, /exitCode: 0/);
      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5-chat',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5-chat',
        cwd: workspace,
        prompt: 'Crie smoke.txt com o texto ok e finalize.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.equal(fs.readFileSync(path.join(workspace, 'smoke.txt'), 'utf8'), 'ok');
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('buildToolExecutor blocks bash heredoc writes before they enter the runtime churn loop', async () => {
  const workspace = createWorkspace();
  const executeTool = buildToolExecutor(workspace);

  try {
    await assert.rejects(
      () =>
        executeTool('bash', {
          command: "cat <<'EOF' > smoke.txt\nok\nEOF",
        }),
      /heredoc e redirecionamento de escrita multilinha/i,
    );
    assert.equal(fs.existsSync(path.join(workspace, 'smoke.txt')), false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop converts JSON function tool text into a normalized synthetic tool call', async () => {
  const workspace = createWorkspace();

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      const toolMessage = body.messages.find((message) => message.role === 'tool');

      if (!toolMessage) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5-chat',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: '{"name":"functions.write_file","arguments":{"path":"note.txt","content":"ok"}}',
                },
              },
            ],
          }),
        };
      }

      assert.match(toolMessage.content, /Arquivo salvo/);
      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5-chat',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5-chat',
        cwd: workspace,
        prompt: 'Crie note.txt com ok e finalize.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.equal(fs.readFileSync(path.join(workspace, 'note.txt'), 'utf8'), 'ok');
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop converts newline-delimited JSON tool text into synthetic tool calls', async () => {
  const workspace = createWorkspace();

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      const toolMessages = body.messages.filter((message) => message.role === 'tool');

      if (toolMessages.length === 0) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5-chat',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: [
                    '{"command":"printf \\"alpha\\" > alpha.txt"}',
                    '{"name":"functions.write_file","arguments":{"path":"beta.txt","content":"beta"}}',
                  ].join('\n'),
                },
              },
            ],
          }),
        };
      }

      assert.equal(toolMessages.length, 2);
      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5-chat',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5-chat',
        cwd: workspace,
        prompt: 'Crie alpha.txt e beta.txt e finalize.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.equal(fs.readFileSync(path.join(workspace, 'alpha.txt'), 'utf8'), 'alpha');
      assert.equal(fs.readFileSync(path.join(workspace, 'beta.txt'), 'utf8'), 'beta');
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop fails over to the next runtime candidate when the primary provider fails', async () => {
  const workspace = createWorkspace();

  try {
    await withFetch(async (url, init) => {
      const body = JSON.parse(init.body);

      if (String(url) === 'https://openai.test/v1/chat/completions') {
        assert.equal(body.model, 'gpt-5');
        return {
          ok: false,
          status: 503,
          text: async () => 'provider temporarily unavailable',
        };
      }

      assert.equal(String(url), 'http://127.0.0.1:11434/v1/chat/completions');
      assert.equal(body.model, 'qwen2.5-coder:14b');
      return {
        ok: true,
        text: async () => JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        prompt: 'Finalize imediatamente.',
        fallbackChain: [
          {
            provider: 'openai_compat',
            model: 'qwen2.5-coder:14b',
          },
        ],
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
          OPENAI_COMPAT_BASE_URL: 'http://127.0.0.1:11434',
          OPENAI_COMPAT_API_KEY: '',
          OLLAMA_API_KEY: '',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.provider, 'openai_compat');
      assert.equal(result.model, 'qwen2.5-coder:14b');
      assert.equal(result.fallbackDepth, 1);
      assert.ok(
        events.some(
          (event) =>
            event.type === 'runtime_fallback' &&
            event.fromProvider === 'openai' &&
            event.toProvider === 'openai_compat',
        ),
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop injects a recovery hint after repeated inspection-only iterations', async () => {
  const workspace = createWorkspace();
  fs.writeFileSync(path.join(workspace, 'README.md'), 'bootstrap workspace\n', 'utf8');

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      const toolMessages = body.messages.filter((message) => message.role === 'tool');
      const userMessages = body.messages
        .filter((message) => message.role === 'user')
        .map((message) => message.content)
        .filter(Boolean);

      if (toolMessages.length === 0) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou ler o arquivo base.',
                  tool_calls: [
                    {
                      id: 'call_readme',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                          startLine: 1,
                          endLine: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      if (toolMessages.length === 1) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou buscar referências adicionais.',
                  tool_calls: [
                    {
                      id: 'call_search',
                      type: 'function',
                      function: {
                        name: 'grep_search',
                        arguments: JSON.stringify({
                          pattern: 'workspace',
                          path: '.',
                          maxResults: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      assert.ok(
        userMessages.some((message) => /Guardrail de autonomia/.test(String(message))),
        'o recovery hint deveria ser reinjetado após iterações só de leitura',
      );
      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        prompt: 'Bootstrap do workspace.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
          NEXUS_AUTONOMOUS_READONLY_STREAK_LIMIT: '2',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.ok(
        events.some(
          (event) =>
            event.type === 'status' &&
            /Guardrail de autonomia/.test(String(event.message || '')),
        ),
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop falls back to the next runtime after repeated inspection-only stalls', async () => {
  const workspace = createWorkspace();
  fs.writeFileSync(path.join(workspace, 'README.md'), 'bootstrap workspace\n', 'utf8');
  let primaryRuntimeRequests = 0;

  try {
    await withFetch(async (url, init) => {
      if (String(url).includes('openai.test')) {
        primaryRuntimeRequests += 1;
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou seguir lendo antes de editar.',
                  tool_calls: [
                    {
                      id: `call_read_${primaryRuntimeRequests}`,
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                          startLine: 1,
                          endLine: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      assert.equal(String(url), 'http://127.0.0.1:11434/v1/chat/completions');
      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'qwen2.5-coder:14b',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        prompt: 'Finalize quando o runtime primario ficar preso em discovery.',
        fallbackChain: [
          {
            provider: 'openai_compat',
            model: 'qwen2.5-coder:14b',
          },
        ],
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
          OPENAI_COMPAT_BASE_URL: 'http://127.0.0.1:11434',
          OPENAI_COMPAT_API_KEY: '',
          OLLAMA_API_KEY: '',
          NEXUS_AUTONOMOUS_READONLY_STREAK_LIMIT: '1',
          NEXUS_AUTONOMOUS_INSPECTION_FALLBACK_STREAK_LIMIT: '2',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(primaryRuntimeRequests, 2);
      assert.equal(result.provider, 'openai_compat');
      assert.equal(result.model, 'qwen2.5-coder:14b');
      assert.equal(result.fallbackDepth, 1);
      assert.ok(
        events.some(
          (event) =>
            event.type === 'runtime_fallback' &&
            event.internalRecovery === true &&
            event.fromProvider === 'openai' &&
            event.toProvider === 'openai_compat' &&
            /preso em leitura\/inspecao/.test(String(event.message || '')),
        ),
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop retries internally when the model returns an empty response', async () => {
  const workspace = createWorkspace();

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      const userMessages = body.messages
        .filter((message) => message.role === 'user')
        .map((message) => message.content)
        .filter(Boolean);

      if (!userMessages.some((message) => /Recuperacao interna: sua ultima resposta veio vazia/.test(String(message)))) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: '',
                },
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        prompt: 'Finalize quando a recuperacao interna funcionar.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
          NEXUS_AUTONOMOUS_EMPTY_RESPONSE_RETRIES: '2',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.ok(
        events.some(
          (event) =>
            event.type === 'status' &&
            /retornou vazio/.test(String(event.message || '')),
        ),
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop preserves xhigh and errors after repeated empty responses without downstream fallback', async () => {
  const workspace = createWorkspace();
  const requestBodies = [];

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      requestBodies.push(body);

      if (body.reasoning_effort === 'xhigh') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5.4',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: '',
                },
              },
            ],
          }),
        };
      }
    }, async () => {
      const events = [];
      await assert.rejects(
        runAutonomousToolLoop({
          provider: 'azure_openai',
          model: 'gpt-5.4',
          cwd: workspace,
          prompt: 'Finalize quando a recuperacao do reasoning funcionar.',
          reasoningEffort: 'xhigh',
          env: {
            AZURE_OPENAI_API_KEY: 'azure-test-key',
            AZURE_OPENAI_ENDPOINT: 'https://azure.test',
            AZURE_OPENAI_API_VERSION: '2025-03-01-preview',
            AZURE_OPENAI_DEPLOYMENT: 'gpt-5.4',
            NEXUS_AUTONOMOUS_EMPTY_RESPONSE_RETRIES: '1',
          },
          onEvent(event) {
            events.push(event);
          },
        }),
        /resposta vazia repetida/,
      );

      assert.equal(requestBodies.filter((body) => body.reasoning_effort === 'xhigh').length, 2);
      assert.equal(
        requestBodies.filter(
          (body) => !Object.prototype.hasOwnProperty.call(body, 'reasoning_effort'),
        ).length,
        0,
      );
      assert.equal(events.some((event) => event.type === 'runtime_fallback'), false);
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop falls through to the downstream runtime after Azure empty responses without relaxing reasoning effort', async () => {
  const workspace = createWorkspace();
  const azureRequestBodies = [];

  try {
    await withFetch(async (url, init) => {
      const body = JSON.parse(init.body);

      if (String(url).includes('azure.test')) {
        azureRequestBodies.push(body);
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5.4',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: '',
                },
              },
            ],
          }),
        };
      }

      assert.equal(String(url), 'http://127.0.0.1:11434/v1/chat/completions');
      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'qwen2.5-coder:14b',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'azure_openai',
        model: 'gpt-5.4',
        cwd: workspace,
        prompt: 'Finalize quando o fallback downstream resolver a resposta vazia do Azure.',
        reasoningEffort: 'xhigh',
        fallbackChain: [
          {
            provider: 'openai_compat',
            model: 'qwen2.5-coder:14b',
          },
        ],
        env: {
          AZURE_OPENAI_API_KEY: 'azure-test-key',
          AZURE_OPENAI_ENDPOINT: 'https://azure.test',
          AZURE_OPENAI_API_VERSION: '2025-03-01-preview',
          AZURE_OPENAI_DEPLOYMENT: 'gpt-5.4',
          OPENAI_COMPAT_BASE_URL: 'http://127.0.0.1:11434',
          OPENAI_COMPAT_API_KEY: '',
          OLLAMA_API_KEY: '',
          NEXUS_AUTONOMOUS_EMPTY_RESPONSE_RETRIES: '2',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.equal(result.provider, 'openai_compat');
      assert.equal(
        azureRequestBodies.filter((body) => body.reasoning_effort === 'xhigh').length,
        1,
      );
      assert.equal(
        azureRequestBodies.filter(
          (body) => !Object.prototype.hasOwnProperty.call(body, 'reasoning_effort'),
        ).length,
        0,
      );
      assert.ok(
        events.some(
          (event) =>
            event.type === 'runtime_fallback' &&
            event.fromProvider === 'azure_openai' &&
            event.toProvider === 'openai_compat',
        ),
      );
      assert.equal(
        events.some(
          (event) =>
            event.type === 'runtime_fallback' &&
            event.fromProvider === 'azure_openai' &&
            event.toProvider === 'azure_openai',
        ),
        false,
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop emits provider wait heartbeats while awaiting a slow model response', async () => {
  const workspace = createWorkspace();

  try {
    await withFetch(
      async () => new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            text: async () => JSON.stringify({
              model: 'gpt-5',
              choices: [
                {
                  finish_reason: 'stop',
                  message: {
                    content: 'NEXUS_TASK_COMPLETE',
                  },
                },
              ],
            }),
          });
        }, 1200);
      }),
      async () => {
        const events = [];
        const result = await runAutonomousToolLoop({
          provider: 'openai',
          model: 'gpt-5',
          cwd: workspace,
          prompt: 'Finalize quando a resposta lenta retornar.',
          env: {
            OPENAI_API_KEY: 'openai-test-key',
            OPENAI_BASE_URL: 'https://openai.test/v1',
            NEXUS_AUTONOMOUS_PROVIDER_TIMEOUT_MS: '5000',
            NEXUS_AUTONOMOUS_PROVIDER_HEARTBEAT_MS: '1000',
          },
          onEvent(event) {
            events.push(event);
          },
        });

        assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
        const waitEvents = events.filter(
          (event) =>
            event.type === 'status' &&
            /Aguardando resposta do modelo openai\/gpt-5/.test(String(event.message || '')),
        );
        assert.ok(waitEvents.length >= 2);
      },
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop auto-completes bootstrap foundation work after repeated empty responses when the scaffold already validates', async () => {
  const workspace = createWorkspace();
  initGitWorkspace(workspace);
  seedBootstrapFoundationWorkspace(workspace);

  try {
    const events = [];
    await withFetch(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        model: 'gpt-5',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: '',
            },
          },
        ],
      }),
    }), async () => {
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        taskId: 'GH-1',
        taskTitle: 'GTMNY-001 Bootstrap do monorepo e convencoes do workspace',
        prompt: 'Finalize o bootstrap quando os artefatos estiverem válidos.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
          NEXUS_AUTONOMOUS_EMPTY_RESPONSE_RETRIES: '1',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.equal(result.finishReason, 'auto_closeout_bootstrap_foundation');
      assert.ok(
        events.some(
          (event) =>
            event.type === 'status' &&
            /Auto-closeout do bootstrap acionado/.test(String(event.message || '')),
        ),
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop auto-completes bootstrap foundation before calling the provider when the workspace already validates', async () => {
  const workspace = createWorkspace();
  initGitWorkspace(workspace);
  seedBootstrapFoundationWorkspace(workspace);
  let fetchCalls = 0;

  try {
    await withFetch(async () => {
      fetchCalls += 1;
      throw new Error('o provider nao deveria ser chamado');
    }, async () => {
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        taskId: 'GH-1',
        taskTitle: 'GTMNY-001 Bootstrap do monorepo e convencoes do workspace',
        prompt: 'Feche imediatamente quando o bootstrap ja estiver validado.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.equal(result.finishReason, 'auto_closeout_bootstrap_foundation');
      assert.equal(fetchCalls, 0);
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop auto-completes game factory work when catalog validates and builds', async () => {
  const workspace = createWorkspace();

  try {
    fs.mkdirSync(path.join(workspace, 'games', 'demo-game'), { recursive: true });
    fs.mkdirSync(path.join(workspace, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({
        type: 'module',
        scripts: {
          test: 'node scripts/validate-games.mjs',
          build: 'node scripts/validate-games.mjs',
        },
      }, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(workspace, 'scripts', 'validate-games.mjs'),
      'console.log("Validated 1 game(s).");\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(workspace, 'games', 'index.json'),
      '[{"slug":"demo-game","title":"Demo Game","entry":"index.html"}]\n',
      'utf8',
    );
    fs.writeFileSync(path.join(workspace, 'games', 'demo-game', 'index.html'), '<!doctype html>\n', 'utf8');

    await withFetch(async () => {
      throw new Error('provider should not be called after game factory auto-closeout');
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        taskTitle: 'Create playable HTML5 game: demo game',
        prompt: 'Finish the game factory card at games/demo-game/index.html.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.equal(result.finishReason, 'auto_closeout_game_factory');
      assert.ok(
        events.some((event) =>
          event.type === 'status' &&
          /Auto-closeout da game factory acionado/i.test(String(event.message || '')),
        ),
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop auto-materializes a missing game factory slug after one model turn', async () => {
  const workspace = createWorkspace();
  let fetchCalls = 0;

  try {
    fs.mkdirSync(path.join(workspace, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(workspace, 'games'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'games', 'index.json'), '[]\n', 'utf8');
    fs.writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({
        type: 'module',
        scripts: {
          test: 'node scripts/validate-games.mjs',
          build: 'node scripts/validate-games.mjs',
        },
      }, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(workspace, 'scripts', 'validate-games.mjs'),
      'console.log("Validated 1 game(s).");\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(workspace, 'scripts', 'create-compact-game.mjs'),
      [
        'import fs from "node:fs";',
        'const [slug, title] = process.argv.slice(2);',
        'fs.mkdirSync(`games/${slug}`, { recursive: true });',
        'fs.writeFileSync(`games/${slug}/index.html`, "<!doctype html><html><body><script></script></body></html>\\n");',
        'fs.writeFileSync(`games/${slug}/manifest.json`, JSON.stringify({ slug, title, entry: "index.html", assets: ["assets/hero-background.png"] }, null, 2));',
        'fs.writeFileSync(`games/${slug}/README.md`, "# " + title + "\\n");',
        'fs.writeFileSync("games/index.json", JSON.stringify([{ slug, title, entry: "index.html" }], null, 2) + "\\n");',
      ].join('\n'),
      'utf8',
    );

    await withFetch(async (_url, init) => {
      fetchCalls += 1;
      const body = JSON.parse(init.body);
      assert.equal(body.messages.some((message) => /demo-game/.test(JSON.stringify(message))), true);
      if (fetchCalls > 1) {
        throw new Error('provider should not be called after auto-materialization');
      }

      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5',
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: 'Vou inspecionar antes.',
                tool_calls: [
                  {
                    id: 'call_read_catalog',
                    type: 'function',
                    function: {
                      name: 'read_file',
                      arguments: JSON.stringify({ path: 'games/index.json' }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      };
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        taskTitle: 'Create playable HTML5 game: demo game',
        prompt: 'Finish the game factory card at games/demo-game/index.html.',
        maxIterations: 3,
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
          NEXUS_GAME_FACTORY_AUTOMATERIALIZE_ENABLED: 'true',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.equal(result.finishReason, 'auto_closeout_game_factory');
      assert.equal(fetchCalls, 1);
      assert.equal(fs.existsSync(path.join(workspace, 'games', 'demo-game', 'index.html')), true);
      assert.ok(
        events.some((event) =>
          event.type === 'status' &&
          /Auto-materializacao da game factory concluida para demo-game/i.test(String(event.message || '')),
        ),
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop does not auto-complete game factory work for a different catalog slug', async () => {
  const workspace = createWorkspace();

  try {
    fs.mkdirSync(path.join(workspace, 'games', 'demo-game'), { recursive: true });
    fs.mkdirSync(path.join(workspace, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({
        type: 'module',
        scripts: {
          test: 'node scripts/validate-games.mjs',
          build: 'node scripts/validate-games.mjs',
        },
      }, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(workspace, 'scripts', 'validate-games.mjs'),
      'console.log("Validated 1 game(s).");\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(workspace, 'games', 'index.json'),
      '[{"slug":"demo-game","title":"Demo Game","entry":"index.html"}]\n',
      'utf8',
    );
    fs.writeFileSync(path.join(workspace, 'games', 'demo-game', 'index.html'), '<!doctype html>\n', 'utf8');

    await withFetch(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{
          finish_reason: 'stop',
          message: { content: 'not done yet' },
        }],
      }),
    }), async () => {
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        taskTitle: 'Create playable HTML5 game: wrong game',
        prompt: 'Finish the game factory card at games/wrong-game/index.html.',
        maxIterations: 1,
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
        },
      });

      assert.equal(result.finishReason, 'stop');
      assert.equal(result.text, 'not done yet');
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop blocks further inspection-only tool calls after the guardrail trips', async () => {
  const workspace = createWorkspace();
  fs.writeFileSync(path.join(workspace, 'README.md'), 'bootstrap workspace\n', 'utf8');

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      const toolMessages = body.messages.filter((message) => message.role === 'tool');

      if (toolMessages.length === 0) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou ler o arquivo base.',
                  tool_calls: [
                    {
                      id: 'call_read_first',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                          startLine: 1,
                          endLine: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      if (toolMessages.length === 1) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou confirmar mais um detalhe.',
                  tool_calls: [
                    {
                      id: 'call_read_second',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                          startLine: 1,
                          endLine: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      const blockedToolMessage = toolMessages.find((message) =>
        /Discovery bloqueado/.test(JSON.stringify(message)),
      );
      if (!blockedToolMessage) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou insistir em outra leitura.',
                  tool_calls: [
                    {
                      id: 'call_read_blocked',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                          startLine: 1,
                          endLine: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        prompt: 'Finalize quando o discovery bloqueado funcionar.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
          NEXUS_AUTONOMOUS_READONLY_STREAK_LIMIT: '2',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.ok(
        events.some(
          (event) =>
            event.type === 'status' &&
            /(Discovery bloqueado|Guardrail de autonomia)/.test(String(event.message || '')),
        ),
      );
      assert.ok(
        events.some(
          (event) =>
            event.type === 'tool_result' &&
            event.isError === true &&
            /Discovery bloqueado/.test(String(event.preview || '')),
        ),
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop blocks synthetic tool calls outside the active allowlist after the guardrail trips', async () => {
  const workspace = createWorkspace();
  fs.writeFileSync(path.join(workspace, 'README.md'), 'bootstrap workspace\n', 'utf8');

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      const toolMessages = body.messages.filter((message) => message.role === 'tool');

      if (toolMessages.length === 0) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou ler o arquivo base.',
                  tool_calls: [
                    {
                      id: 'call_read_first_allowlist',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                          startLine: 1,
                          endLine: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      if (toolMessages.length === 1) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou reler mais uma vez.',
                  tool_calls: [
                    {
                      id: 'call_read_second_allowlist',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                          startLine: 1,
                          endLine: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      const blockedToolMessage = toolMessages.find((message) =>
        /Tool bloqueada nesta iteracao: deploy_app\./.test(String(message.content || '')),
      );
      if (!blockedToolMessage) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5-chat',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: '{"tool":"deploy_app","input":{"target":"production"}}',
                },
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        prompt: 'Finalize quando a allowlist ativa bloquear tool calls sinteticas fora do schema.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
          NEXUS_AUTONOMOUS_READONLY_STREAK_LIMIT: '2',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.equal(fs.existsSync(path.join(workspace, 'blocked.txt')), false);
      assert.ok(
        events.some(
          (event) =>
            event.type === 'status' &&
            /Allowlist ativa recusou/.test(String(event.message || '')),
        ),
      );
      assert.ok(
        events.some(
          (event) =>
            event.type === 'tool_result' &&
            event.isError === true &&
            /Tool bloqueada nesta iteracao: deploy_app\./.test(String(event.preview || '')),
        ),
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop treats read-only shell for-loops as inspection-only for the guardrail', async () => {
  const workspace = createWorkspace();
  fs.mkdirSync(path.join(workspace, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'docs', 'README.md'), '# docs\n', 'utf8');

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      const toolMessages = body.messages.filter((message) => message.role === 'tool');
      const userMessages = body.messages
        .filter((message) => message.role === 'user')
        .map((message) => message.content)
        .filter(Boolean);

      if (toolMessages.length < 2) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou listar os diretórios em loop.',
                  tool_calls: [
                    {
                      id: `call_loop_${toolMessages.length + 1}`,
                      type: 'function',
                      function: {
                        name: 'bash',
                        arguments: JSON.stringify({
                          command: 'for d in docs; do ls -la "$d"; done',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      assert.ok(
        userMessages.some((message) => /Guardrail de autonomia/.test(String(message))),
        'o guardrail deveria considerar loops read-only como discovery',
      );
      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        prompt: 'Finalize quando loops read-only contarem para o guardrail.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
          NEXUS_AUTONOMOUS_READONLY_STREAK_LIMIT: '2',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.ok(
        events.some(
          (event) =>
            event.type === 'status' &&
            /Guardrail de autonomia/.test(String(event.message || '')),
        ),
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop switches to required tool choice after the inspection guard trips', async () => {
  const workspace = createWorkspace();
  fs.writeFileSync(path.join(workspace, 'README.md'), 'bootstrap workspace\n', 'utf8');
  const capturedBodies = [];

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      capturedBodies.push(body);
      const toolMessages = body.messages.filter((message) => message.role === 'tool');

      if (toolMessages.length === 0) {
        assert.equal(body.tool_choice, 'auto');
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou ler o README.',
                  tool_calls: [
                    {
                      id: 'call_required_read_1',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                          startLine: 1,
                          endLine: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      if (toolMessages.length === 1) {
        assert.equal(body.tool_choice, 'auto');
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou reler o README.',
                  tool_calls: [
                    {
                      id: 'call_required_read_2',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                          startLine: 1,
                          endLine: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      if (toolMessages.length === 2) {
        assert.equal(body.tool_choice, 'required');
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou materializar um arquivo real.',
                  tool_calls: [
                    {
                      id: 'call_required_write',
                      type: 'function',
                      function: {
                        name: 'write_file',
                        arguments: JSON.stringify({
                          path: '.editorconfig',
                          content: 'root = true\n',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      assert.equal(body.tool_choice, 'auto');
      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        prompt: 'Force tool_choice required apos o guardrail.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
          NEXUS_AUTONOMOUS_READONLY_STREAK_LIMIT: '2',
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.equal(fs.readFileSync(path.join(workspace, '.editorconfig'), 'utf8'), 'root = true\n');
      assert.ok(capturedBodies.some((body) => body.tool_choice === 'required'));
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop keeps tool choice auto for openai-compatible inspection recovery by default', async () => {
  const workspace = createWorkspace();
  fs.writeFileSync(path.join(workspace, 'README.md'), 'bootstrap workspace\n', 'utf8');
  const capturedBodies = [];

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      capturedBodies.push(body);
      const toolMessages = body.messages.filter((message) => message.role === 'tool');

      if (toolMessages.length === 0) {
        assert.equal(body.tool_choice, 'auto');
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'qwen3.5-397b-a17b',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou ler o README.',
                  tool_calls: [
                    {
                      id: 'call_openai_compat_read',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                          startLine: 1,
                          endLine: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      if (toolMessages.length === 1) {
        assert.equal(body.tool_choice, 'auto');
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'qwen3.5-397b-a17b',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou materializar um arquivo real.',
                  tool_calls: [
                    {
                      id: 'call_openai_compat_write',
                      type: 'function',
                      function: {
                        name: 'write_file',
                        arguments: JSON.stringify({
                          path: '.editorconfig',
                          content: 'root = true\n',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'qwen3.5-397b-a17b',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const result = await runAutonomousToolLoop({
        provider: 'openai_compat',
        model: 'qwen3.5-397b-a17b',
        cwd: workspace,
        prompt: 'Force recovery sem required para runtime OpenAI-compatible local.',
        env: {
          OPENAI_COMPAT_BASE_URL: 'http://127.0.0.1:8001/v1',
          OPENAI_COMPAT_API_KEY: '',
          NEXUS_AUTONOMOUS_READONLY_STREAK_LIMIT: '1',
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.equal(fs.readFileSync(path.join(workspace, '.editorconfig'), 'utf8'), 'root = true\n');
      assert.equal(capturedBodies.length, 3);
      assert.equal(capturedBodies.every((body) => body.tool_choice === 'auto'), true);
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop compacts large write_file arguments in conversation history', async () => {
  const workspace = createWorkspace();
  const capturedBodies = [];
  const largeContent = `${'x'.repeat(1500)}\n`;

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      capturedBodies.push(body);

      if (capturedBodies.length === 1) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_large_write',
                      type: 'function',
                      function: {
                        name: 'write_file',
                        arguments: JSON.stringify({
                          path: 'large.txt',
                          content: largeContent,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      const assistantWithToolCall = body.messages.find((message) =>
        message.role === 'assistant' && Array.isArray(message.tool_calls),
      );
      const args = JSON.parse(
        assistantWithToolCall.tool_calls[0].function.arguments,
      );
      assert.equal(args.path, 'large.txt');
      assert.match(args.content, /NEXUS_PAYLOAD_OMITTED/);
      assert.equal(args.content.includes(largeContent.slice(0, 100)), false);

      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        prompt: 'Write a large file once and finish.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
          NEXUS_AUTONOMOUS_HISTORY_TOOL_ARG_CHARS: '200',
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.equal(fs.readFileSync(path.join(workspace, 'large.txt'), 'utf8'), largeContent);
      assert.equal(capturedBodies.length, 2);
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('buildToolExecutor rejects history omission markers as write_file content', async () => {
  const workspace = createWorkspace();
  try {
    const executeTool = buildToolExecutor(workspace);
    await assert.rejects(
      executeTool('write_file', {
        path: 'bad.js',
        content: '[write_file content omitted from conversation history: 5461 chars already sent to the tool]',
      }),
      /marcador compactado do histórico/i,
    );
    assert.equal(fs.existsSync(path.join(workspace, 'bad.js')), false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('buildToolExecutor blocks repeated game index rewrites before catalog and validation gates', async () => {
  const workspace = createWorkspace();
  const events = [];
  const firstHtml = '<!doctype html><html><body><canvas id="game"></canvas><script>let score=0;function restart(){score=0}addEventListener("keydown",restart);requestAnimationFrame(restart);</script></body></html>\n';
  const secondHtml = firstHtml.replace('let score=0', 'let score=1');
  const thirdHtml = firstHtml.replace('let score=0', 'let score=2');

  try {
    const executeTool = buildToolExecutor(workspace, {
      hookContext: {
        taskId: 'NX-TASK-0005',
        taskTitle: 'Create playable HTML5 game: sorting puzzle rush in toybox dungeon',
        taskStatus: 'in_progress',
        requestKind: 'primary',
        agent: { id: 'dev', role: 'dev' },
      },
      onEvent(event) {
        events.push(event);
      },
    });

    await executeTool('write_file', {
      path: 'games/sorting-puzzle-rush-toybox-dungeon-5/index.html',
      content: firstHtml,
    });

    await assert.rejects(
      () => executeTool('write_file', {
        path: 'games/sorting-puzzle-rush-toybox-dungeon-5/index.html',
        content: secondHtml,
      }),
      /sync-game-catalog\.mjs sorting-puzzle-rush-toybox-dungeon-5/i,
    );

    await executeTool('write_file', {
      path: 'games/index.json',
      content: JSON.stringify([
        {
          slug: 'sorting-puzzle-rush-toybox-dungeon-5',
          title: 'Sorting Puzzle Rush',
          entry: 'index.html',
        },
      ], null, 2) + '\n',
    });

    await executeTool('write_file', {
      path: 'games/sorting-puzzle-rush-toybox-dungeon-5/index.html',
      content: secondHtml,
    });

    await assert.rejects(
      () => executeTool('write_file', {
        path: 'games/sorting-puzzle-rush-toybox-dungeon-5/index.html',
        content: thirdHtml,
      }),
      /Rode `npm test`/i,
    );

    assert.ok(
      events.some((event) =>
        event.type === 'tool_policy' &&
        event.toolName === 'write_file' &&
        /Reescrita bloqueada/i.test(String(event.message || '')),
      ),
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('buildToolExecutor rejects incomplete game factory manifest before saving it', async () => {
  const workspace = createWorkspace();

  try {
    const executeTool = buildToolExecutor(workspace, {
      hookContext: {
        taskId: 'NX-TASK-0005',
        taskTitle: 'Create playable HTML5 game: sorting puzzle rush in toybox dungeon',
        taskStatus: 'in_progress',
        requestKind: 'primary',
        agent: { id: 'dev', role: 'dev' },
      },
    });

    await assert.rejects(
      () => executeTool('write_file', {
        path: 'games/sorting-puzzle-rush-toybox-dungeon-5/manifest.json',
        content: '{ "slug": "sorting-puzzle-rush-toybox-dungeon-5", "title": "Sorting',
      }),
      /manifest\.json nao é JSON completo/i,
    );

    assert.equal(
      fs.existsSync(path.join(workspace, 'games', 'sorting-puzzle-rush-toybox-dungeon-5', 'manifest.json')),
      false,
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('buildToolExecutor forces deterministic game helper before manual game writes when available', async () => {
  const workspace = createWorkspace();

  try {
    fs.mkdirSync(path.join(workspace, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'scripts', 'create-compact-game.mjs'), '', 'utf8');
    fs.mkdirSync(path.join(workspace, 'games'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'games', 'index.json'), '[]\n', 'utf8');

    const executeTool = buildToolExecutor(workspace, {
      hookContext: {
        taskId: 'NX-TASK-0005',
        taskTitle: 'Create playable HTML5 game: sorting puzzle rush in toybox dungeon',
        taskStatus: 'in_progress',
        requestKind: 'primary',
        agent: { id: 'dev', role: 'dev' },
      },
    });

    await assert.rejects(
      () => executeTool('write_file', {
        path: 'games/sorting-puzzle-rush-toybox-dungeon-5/index.html',
        content: '<!doctype html><html><body><script></script></body></html>\n',
      }),
      /create-compact-game\.mjs sorting-puzzle-rush-toybox-dungeon-5/i,
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('buildToolExecutor falls back to filesystem glob search when rg is unavailable', async () => {
  const workspace = createWorkspace();
  const previousPath = process.env.PATH;

  try {
    fs.mkdirSync(path.join(workspace, 'apps', 'mobile'), { recursive: true });
    fs.mkdirSync(path.join(workspace, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'apps', 'mobile', 'package.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(workspace, 'docs', 'README.md'), '# docs\n', 'utf8');

    process.env.PATH = '';
    const executeTool = buildToolExecutor(workspace);
    const result = await executeTool('glob_search', { pattern: '**/package.json' });

    assert.match(result, /apps\/mobile\/package\.json/);
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('buildToolExecutor falls back to filesystem grep search when rg is unavailable', async () => {
  const workspace = createWorkspace();
  const previousPath = process.env.PATH;

  try {
    fs.mkdirSync(path.join(workspace, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, 'docs', 'README.md'),
      'workspace conventions\nmonorepo bootstrap\n',
      'utf8',
    );

    process.env.PATH = '';
    const executeTool = buildToolExecutor(workspace);
    const result = await executeTool('grep_search', {
      pattern: 'workspace',
      path: '.',
      maxResults: 5,
    });

    assert.match(result, /docs\/README\.md:1:workspace conventions/);
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('buildToolExecutor blocks critical bash commands when approval mode is enforce', async () => {
  const workspace = createWorkspace();
  const events = [];

  try {
    const executeTool = buildToolExecutor(workspace, {
      approvalMode: 'enforce',
      env: {
        NEXUS_EXEC_APPROVAL_MODE: 'enforce',
      },
      onEvent(event) {
        events.push(event);
      },
    });

    await assert.rejects(
      () => executeTool('bash', { command: 'git reset --hard' }),
      /Comando bloqueado por policy/,
    );
    assert.ok(
      events.some(
        (event) => event.type === 'tool_policy' && event.toolName === 'bash' && event.verdict === 'block',
      ),
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('buildToolExecutor blocks control-plane file mutation inside task workspaces', async () => {
  const workspace = createWorkspace();
  const events = [];

  try {
    fs.mkdirSync(path.join(workspace, '.nexus'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.nexus', 'hooks.js'), 'module.exports = {};\n', 'utf8');

    const executeTool = buildToolExecutor(workspace, {
      onEvent(event) {
        events.push(event);
      },
    });

    await assert.rejects(
      () => executeTool('edit_file', {
        path: '.nexus/hooks.js',
        oldText: 'module.exports = {};\n',
        newText: 'module.exports = { blocked: true };\n',
      }),
      /Edicoes no control plane do Nexus foram bloqueadas pelo servidor/,
    );

    assert.equal(
      fs.readFileSync(path.join(workspace, '.nexus', 'hooks.js'), 'utf8'),
      'module.exports = {};\n',
    );
    assert.ok(
      events.some(
        (event) =>
          event.type === 'tool_policy' &&
          event.toolName === 'edit_file' &&
          event.verdict === 'block',
      ),
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('buildToolExecutor blocks file mutation and mutating bash in review mode', async () => {
  const workspace = createWorkspace();
  const events = [];

  try {
    execSync('git init -q', { cwd: workspace, stdio: 'ignore' });
    const executeTool = buildToolExecutor(workspace, {
      reviewMode: true,
      onEvent(event) {
        events.push(event);
      },
    });

    await assert.rejects(
      () => executeTool('write_file', { path: 'note.txt', content: 'blocked' }),
      /Lane em review tecnico: edicoes de arquivo foram bloqueadas pelo servidor/,
    );
    await assert.rejects(
      () => executeTool('bash', { command: 'printf "blocked" > blocked.txt' }),
      /Lane em review tecnico: bash mutante foi bloqueado pelo servidor/,
    );

    const safeResult = await executeTool('bash', {
      command: 'set -e\nprintf "review-check\\n"\ncd .\ntrue',
    });
    const gitRemoteResult = await executeTool('bash', {
      command: 'git ls-remote . HEAD',
    });

    assert.match(safeResult, /exitCode: 0/);
    assert.match(safeResult, /review-check/);
    assert.match(gitRemoteResult, /exitCode: 0/);
    assert.equal(fs.existsSync(path.join(workspace, 'note.txt')), false);
    assert.equal(fs.existsSync(path.join(workspace, 'blocked.txt')), false);
    assert.ok(
      events.some(
        (event) =>
          event.type === 'tool_policy' &&
          event.toolName === 'write_file' &&
          event.verdict === 'block',
      ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.type === 'tool_policy' &&
          event.toolName === 'bash' &&
          event.verdict === 'block',
      ),
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop accepts a task-specific read-only streak limit of 1', async () => {
  const workspace = createWorkspace();
  fs.writeFileSync(path.join(workspace, 'README.md'), 'bootstrap workspace\n', 'utf8');

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      const toolMessages = body.messages.filter((message) => message.role === 'tool');
      const discoveryBlocked = toolMessages.some((message) =>
        /Discovery bloqueado/.test(JSON.stringify(message)),
      );

      if (toolMessages.length === 0) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou ler o contexto inicial.',
                  tool_calls: [
                    {
                      id: 'call_read_first_limit_one',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                          startLine: 1,
                          endLine: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      if (!discoveryBlocked) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou insistir em mais uma leitura.',
                  tool_calls: [
                    {
                      id: 'call_read_second_limit_one',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                          startLine: 1,
                          endLine: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        prompt: 'Finalize quando o guardrail em 1 rodada bloquear o discovery.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
          NEXUS_AUTONOMOUS_READONLY_STREAK_LIMIT: '1',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.ok(
        events.some(
          (event) =>
            event.type === 'tool_result' &&
            event.isError === true &&
            /Discovery bloqueado/.test(String(event.preview || '')),
        ),
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop escalates hook-blocked inspection into the discovery guard', async () => {
  const workspace = createWorkspace();
  fs.mkdirSync(path.join(workspace, '.nexus'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'README.md'), 'bootstrap workspace\n', 'utf8');
  fs.writeFileSync(
    path.join(workspace, '.nexus', 'hooks.js'),
    `module.exports = {
  beforeToolCall({ payload }) {
    if (payload?.toolName === 'grep_search') {
      return {
        blocked: true,
        reason: 'hook block grep_search',
      };
    }
    return null;
  },
};
`,
    'utf8',
  );

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      const toolMessages = body.messages.filter((message) => message.role === 'tool');
      const discoveryBlocked = toolMessages.some((message) =>
        /Discovery bloqueado/.test(JSON.stringify(message)),
      );

      if (toolMessages.length === 0) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou localizar arquivos primeiro.',
                  tool_calls: [
                    {
                      id: 'call_grep_hook_first',
                      type: 'function',
                      function: {
                        name: 'grep_search',
                        arguments: JSON.stringify({
                          pattern: 'workspace',
                          path: '.',
                          maxResults: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      if (!discoveryBlocked) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou tentar outra busca mesmo assim.',
                  tool_calls: [
                    {
                      id: 'call_grep_hook_second',
                      type: 'function',
                      function: {
                        name: 'grep_search',
                        arguments: JSON.stringify({
                          pattern: 'workspace',
                          path: '.',
                          maxResults: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        taskId: 'GH-2',
        taskTitle: 'GTMNY-002 App Flutter base com navegacao, tema e shells mobile/web',
        prompt: 'Finalize quando o hook bloqueado alimentar o guardrail de discovery.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
          NEXUS_AUTONOMOUS_READONLY_STREAK_LIMIT: '1',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.ok(
        events.some(
          (event) =>
            event.type === 'tool_result' &&
            event.isError === true &&
            /hook block grep_search/.test(String(event.preview || '')),
        ),
      );
      assert.ok(
        events.some(
          (event) =>
            event.type === 'tool_result' &&
            event.isError === true &&
            /Discovery bloqueado/.test(String(event.preview || '')),
        ),
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop passes task metadata into beforeToolCall hooks', async () => {
  const workspace = createWorkspace();
  fs.mkdirSync(path.join(workspace, '.nexus'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'README.md'), 'bootstrap workspace\n', 'utf8');
  fs.writeFileSync(
    path.join(workspace, '.nexus', 'hooks.js'),
    `module.exports = {
  beforeToolCall({ payload }) {
    if (
      payload?.taskId === 'GH-4' &&
      String(payload?.taskTitle || '').includes('GTMNY-004') &&
      payload?.toolName === 'read_file'
    ) {
      return {
        blocked: true,
        reason: 'task-aware hook block',
      };
    }
    return null;
  },
};
`,
    'utf8',
  );

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      const toolMessages = body.messages.filter((message) => message.role === 'tool');
      const blocked = toolMessages.some((message) =>
        /task-aware hook block/.test(JSON.stringify(message)),
      );

      if (toolMessages.length === 0) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou tentar ler o README.',
                  tool_calls: [
                    {
                      id: 'call_task_aware_read',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                          startLine: 1,
                          endLine: 5,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      if (!blocked) {
        throw new Error('O hook deveria ter bloqueado a leitura com base no task metadata.');
      }

      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        taskId: 'GH-4',
        taskTitle: 'GTMNY-004 Modelagem inicial de dados e migrations do MVP',
        prompt: 'Finalize quando o hook task-aware bloquear a leitura.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.ok(
        events.some(
          (event) =>
            event.type === 'tool_result' &&
            event.isError === true &&
            /task-aware hook block/.test(String(event.preview || '')),
        ),
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop passes shell recovery metadata into project hooks', async () => {
  const workspace = createWorkspace();
  fs.mkdirSync(path.join(workspace, '.nexus'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'README.md'), 'bootstrap workspace\n', 'utf8');
  fs.writeFileSync(
    path.join(workspace, '.nexus', 'hooks.js'),
    `module.exports = {
  beforeToolCall({ payload, commandRecoveryCount, recoveryHint }) {
    if (
      payload?.toolName === 'bash' &&
      commandRecoveryCount === 2 &&
      /pgrep/.test(String(recoveryHint || ''))
    ) {
      return {
        blocked: true,
        reason: 'recovery-aware hook block',
      };
    }
    return null;
  },
};
`,
    'utf8',
  );

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      const toolMessages = body.messages.filter((message) => message.role === 'tool');
      const blocked = toolMessages.some((message) =>
        /recovery-aware hook block/.test(JSON.stringify(message)),
      );

      if (toolMessages.length === 0) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou tentar um comando de processo.',
                  tool_calls: [
                    {
                      id: 'call_recovery_bash',
                      type: 'function',
                      function: {
                        name: 'bash',
                        arguments: JSON.stringify({
                          command: 'pgrep -fa node',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      if (!blocked) {
        throw new Error('O hook deveria ter bloqueado o bash com base no contexto de recovery.');
      }

      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: workspace,
        taskId: 'GH-37',
        taskTitle: 'GTMNY-035 Fechar verificacao de email, social auth e handoff seguro do onboarding',
        prompt: 'Finalize quando o hook recovery-aware bloquear o bash inseguro.',
        commandRecoveryCount: 2,
        recoveryHint: 'Nao dependa de pgrep sem verificar se existe.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.ok(
        events.some(
          (event) =>
            event.type === 'tool_result' &&
            event.isError === true &&
            /recovery-aware hook block/.test(String(event.preview || '')),
        ),
      );
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('runAutonomousToolLoop loads project hooks from projectDir even when cwd is a worktree', async () => {
  const projectRoot = createWorkspace();
  const worktree = path.join(projectRoot, 'worktrees', 'gh-11');
  fs.mkdirSync(path.join(projectRoot, '.nexus'), { recursive: true });
  fs.mkdirSync(worktree, { recursive: true });
  fs.writeFileSync(path.join(worktree, 'README.md'), 'workspace readme\n', 'utf8');
  fs.writeFileSync(
    path.join(projectRoot, '.nexus', 'hooks.js'),
    `module.exports = {
  beforeToolCall({ payload }) {
    if (payload?.toolName === 'read_file') {
      return {
        blocked: true,
        reason: 'project-root hook block',
      };
    }
    return null;
  },
};
`,
    'utf8',
  );

  try {
    await withFetch(async (_url, init) => {
      const body = JSON.parse(init.body);
      const toolMessages = body.messages.filter((message) => message.role === 'tool');
      const blocked = toolMessages.some((message) =>
        /project-root hook block/.test(JSON.stringify(message)),
      );

      if (toolMessages.length === 0) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou ler o README do workspace.',
                  tool_calls: [
                    {
                      id: 'call_read_readme',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      if (!blocked) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            model: 'gpt-5',
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Vou tentar ler novamente.',
                  tool_calls: [
                    {
                      id: 'call_read_readme_retry',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({
                          path: 'README.md',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        text: async () => JSON.stringify({
          model: 'gpt-5',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'NEXUS_TASK_COMPLETE',
              },
            },
          ],
        }),
      };
    }, async () => {
      const events = [];
      const result = await runAutonomousToolLoop({
        provider: 'openai',
        model: 'gpt-5',
        cwd: worktree,
        projectDir: projectRoot,
        taskId: 'GH-11',
        taskTitle: 'GTMNY-011 Preferencias de busca e filtros do discovery',
        prompt: 'Finalize quando o hook do projeto raiz bloquear a leitura.',
        env: {
          OPENAI_API_KEY: 'openai-test-key',
          OPENAI_BASE_URL: 'https://openai.test/v1',
          NEXUS_AUTONOMOUS_READONLY_STREAK_LIMIT: '1',
        },
        onEvent(event) {
          events.push(event);
        },
      });

      assert.equal(result.text, 'NEXUS_TASK_COMPLETE');
      assert.ok(
        events.some(
          (event) =>
            event.type === 'tool_result' &&
            event.isError === true &&
            /project-root hook block/.test(String(event.preview || '')),
        ),
      );
    });
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
