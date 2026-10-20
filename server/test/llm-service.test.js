const test = require('node:test');
const assert = require('node:assert/strict');

const {
  anthropicMessagesEndpoint,
  azureChatCompletionsEndpoint,
  chatCompletionsEndpoint,
  extractAnthropicText,
  extractOpenAiText,
  runPrompt,
} = require('../services/llmService');

function withEnv(overrides, fn) {
  const previous = new Map();
  Object.keys(overrides).forEach((key) => {
    previous.set(key, process.env[key]);
    const nextValue = overrides[key];
    if (nextValue === null || nextValue === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = String(nextValue);
  });

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      previous.forEach((value, key) => {
        if (value === undefined) {
          delete process.env[key];
          return;
        }
        process.env[key] = value;
      });
    });
}

test('endpoint helpers preserve explicit provider paths', () => {
  assert.equal(
    anthropicMessagesEndpoint('https://api.anthropic.com'),
    'https://api.anthropic.com/v1/messages',
  );
  assert.equal(
    anthropicMessagesEndpoint('https://api.anthropic.com/v1/messages'),
    'https://api.anthropic.com/v1/messages',
  );
  assert.equal(
    chatCompletionsEndpoint('https://api.openai.com/v1'),
    'https://api.openai.com/v1/chat/completions',
  );
  assert.equal(
    chatCompletionsEndpoint('https://api.x.ai/v1/chat/completions'),
    'https://api.x.ai/v1/chat/completions',
  );
  assert.equal(
    azureChatCompletionsEndpoint(
      'https://example-resource.openai.azure.com/openai',
      'gpt-5-ops',
      '2025-04-01-preview',
    ),
    'https://example-resource.openai.azure.com/openai/deployments/gpt-5-ops/chat/completions?api-version=2025-04-01-preview',
  );
  assert.equal(
    azureChatCompletionsEndpoint(
      'https://example-resource.openai.azure.com/openai/deployments/custom/chat/completions?api-version=2025-04-01-preview',
      'ignored-deployment',
      '2025-04-01-preview',
    ),
    'https://example-resource.openai.azure.com/openai/deployments/custom/chat/completions?api-version=2025-04-01-preview',
  );
});

test('extract helpers normalize anthropic and openai payloads', () => {
  assert.equal(
    extractAnthropicText({
      content: [
        { type: 'text', text: 'Primeira linha' },
        { type: 'text', text: 'Segunda linha' },
      ],
    }),
    'Primeira linha\nSegunda linha',
  );

  assert.equal(
    extractOpenAiText({
      choices: [
        {
          message: {
            content: [
              { text: 'Ol' },
              { text: 'a' },
            ],
          },
        },
      ],
    }),
    'Ol\na',
  );
});

test('runPrompt sends anthropic payloads through /v1/messages', async () => {
  let captured = null;
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      text: async () => JSON.stringify({
        content: [{ type: 'text', text: 'Resposta Claude' }],
      }),
    };
  };

  try {
    await withEnv({ ANTHROPIC_API_KEY: 'anthropic-test-key', ANTHROPIC_BASE_URL: 'https://anthropic.test' }, async () => {
      const result = await runPrompt('Explique o plano', {
        llmProvider: 'anthropic',
        model: 'sonnet',
      });

      assert.equal(result.provider, 'anthropic');
      assert.equal(result.model, 'claude-sonnet-4-6');
      assert.equal(result.stdout, 'Resposta Claude');
      assert.equal(captured.url, 'https://anthropic.test/v1/messages');
      const body = JSON.parse(captured.init.body);
      assert.equal(body.model, 'claude-sonnet-4-6');
      assert.equal(body.messages[0].role, 'user');
      assert.equal(captured.init.headers['x-api-key'], 'anthropic-test-key');
      assert.equal(captured.init.headers['anthropic-version'], '2023-06-01');
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('runPrompt sends openai-compatible payloads through /chat/completions', async () => {
  let captured = null;
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      text: async () => JSON.stringify({
        choices: [
          {
            message: {
              content: 'Resposta GPT',
            },
          },
        ],
      }),
    };
  };

  try {
    await withEnv({ OPENAI_API_KEY: 'openai-test-key', OPENAI_BASE_URL: 'https://openai.test/v1' }, async () => {
      const result = await runPrompt('Resuma o diff', {
        llmProvider: 'openai',
        model: 'gpt-5',
        reasoningEffort: 'high',
      });

      assert.equal(result.provider, 'openai');
      assert.equal(result.model, 'gpt-5');
      assert.equal(result.stdout, 'Resposta GPT');
      assert.equal(captured.url, 'https://openai.test/v1/chat/completions');
      const body = JSON.parse(captured.init.body);
      assert.equal(body.model, 'gpt-5');
      assert.equal(body.reasoning_effort, 'high');
      assert.equal(body.messages[0].role, 'user');
      assert.equal(captured.init.headers.authorization, 'Bearer openai-test-key');
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('runPrompt supports local openai-compatible endpoints without auth headers', async () => {
  let captured = null;
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      text: async () => JSON.stringify({
        choices: [
          {
            message: {
              content: 'Resposta Local',
            },
          },
        ],
      }),
    };
  };

  try {
    await withEnv({
      OPENAI_COMPAT_BASE_URL: 'http://127.0.0.1:11434',
      OPENAI_COMPAT_API_KEY: null,
      OLLAMA_API_KEY: null,
      OPENAI_API_KEY: null,
    }, async () => {
      const result = await runPrompt('Resuma o diff', {
        llmProvider: 'ollama',
        model: 'qwen2.5-coder:14b',
        reasoningEffort: 'xhigh',
      });

      assert.equal(result.provider, 'openai_compat');
      assert.equal(result.model, 'qwen2.5-coder:14b');
      assert.equal(result.stdout, 'Resposta Local');
      assert.equal(captured.url, 'http://127.0.0.1:11434/v1/chat/completions');
      const body = JSON.parse(captured.init.body);
      assert.equal(body.model, 'qwen2.5-coder:14b');
      assert.equal(body.reasoning_effort, 'none');
      assert.equal(body.chat_template_kwargs.enable_thinking, false);
      assert.equal(captured.init.headers.authorization, undefined);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('runPrompt sends azure openai payloads through deployment chat/completions', async () => {
  let captured = null;
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      text: async () => JSON.stringify({
        choices: [
          {
            message: {
              content: 'Resposta Azure',
            },
          },
        ],
      }),
    };
  };

  try {
    await withEnv({
      AZURE_OPENAI_ENDPOINT: 'https://azure.test/openai',
      AZURE_OPENAI_API_KEY: 'azure-test-key',
      AZURE_OPENAI_API_VERSION: '2025-04-01-preview',
      AZURE_OPENAI_DEPLOYMENT: 'gpt-5.4-codex',
    }, async () => {
      const result = await runPrompt('Planeje a release', {
        llmProvider: 'azure',
        model: 'azure-openai-deployment',
        reasoningEffort: 'xhigh',
      });

      assert.equal(result.provider, 'azure_openai');
      assert.equal(result.model, 'gpt-5.4-codex');
      assert.equal(result.stdout, 'Resposta Azure');
      assert.equal(
        captured.url,
        'https://azure.test/openai/deployments/gpt-5.4-codex/chat/completions?api-version=2025-04-01-preview',
      );
      const body = JSON.parse(captured.init.body);
      assert.equal(body.reasoning_effort, 'xhigh');
      assert.equal(body.messages[0].role, 'user');
      assert.equal(captured.init.headers['api-key'], 'azure-test-key');
      assert.equal(captured.init.headers.authorization, undefined);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('runPrompt lets an explicit azure deployment override the environment default', async () => {
  let captured = null;
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      text: async () => JSON.stringify({
        choices: [
          {
            message: {
              content: 'Resposta Azure override',
            },
          },
        ],
      }),
    };
  };

  try {
    await withEnv({
      AZURE_OPENAI_ENDPOINT: 'https://azure.test/openai',
      AZURE_OPENAI_API_KEY: 'azure-test-key',
      AZURE_OPENAI_API_VERSION: '2025-04-01-preview',
      AZURE_OPENAI_DEPLOYMENT: 'env-default-deployment',
    }, async () => {
      const result = await runPrompt('Planeje a release', {
        llmProvider: 'azure',
        model: 'project-chat-deployment',
      });

      assert.equal(result.provider, 'azure_openai');
      assert.equal(result.model, 'project-chat-deployment');
      assert.equal(result.stdout, 'Resposta Azure override');
      assert.equal(
        captured.url,
        'https://azure.test/openai/deployments/project-chat-deployment/chat/completions?api-version=2025-04-01-preview',
      );
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('runPrompt rejects azure placeholder model when no deployment is configured', async () => {
  await withEnv({
    AZURE_OPENAI_ENDPOINT: 'https://azure.test/openai',
    AZURE_OPENAI_API_KEY: 'azure-test-key',
    AZURE_OPENAI_API_VERSION: '2025-04-01-preview',
    AZURE_OPENAI_DEPLOYMENT: null,
  }, async () => {
    await assert.rejects(
      () => runPrompt('Planeje a release', {
        llmProvider: 'azure',
        model: 'azure-openai-deployment',
      }),
      /AZURE_OPENAI_DEPLOYMENT/,
    );
  });
});
