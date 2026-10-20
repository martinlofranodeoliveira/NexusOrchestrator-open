const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ASSET_MODELS,
  assertLocalGameFactoryRuntimeEnv,
  assertLocalOnlyAgentConfiguration,
  assertReferencedModelsInstalled,
  buildLocalGameFactoryLaunchEnv,
  buildLocalGameFactoryRoomTemplates,
  getLocalGameFactoryProfile,
  listReferencedAgentModels,
} = require('../services/gameFactoryProfile');

test('local game factory profile uses only the two installed Ollama models for every agent', () => {
  const rooms = buildLocalGameFactoryRoomTemplates();
  const agents = rooms.flatMap((room) => room.agents);

  const director = agents.find((agent) => agent.id === 'game_director');
  const dailyWorker = agents.find((agent) => agent.id === 'game_engineer_daily');
  const hardWorker = agents.find((agent) => agent.id === 'game_engineer_hard');
  const reviewer = agents.find((agent) => agent.id === 'game_qa_review');

  const assetDirector = agents.find((agent) => agent.id === 'asset_director');

  assert.equal(director.llmProvider, 'openai_compat');
  assert.equal(director.model, 'qwen3.6:35b-a3b-mtp-q4_K_M');
  assert.equal(director.reasoningEffort, undefined);
  assert.equal(assetDirector.llmProvider, 'openai_compat');
  assert.equal(assetDirector.model, 'qwen3.6:35b-a3b-mtp-q4_K_M');
  assert.equal(dailyWorker.llmProvider, 'openai_compat');
  assert.equal(dailyWorker.model, 'gpt-oss:20b');
  assert.equal(hardWorker.model, 'qwen3.6:35b-a3b-mtp-q4_K_M');
  assert.equal(reviewer.llmProvider, 'openai_compat');
  assert.equal(reviewer.model, 'qwen3.6:35b-a3b-mtp-q4_K_M');
  assert.deepEqual(
    new Set(listReferencedAgentModels(rooms)),
    new Set(['qwen3.6:35b-a3b-mtp-q4_K_M', 'gpt-oss:20b']),
  );
  assert.equal(assertLocalOnlyAgentConfiguration(rooms), true);
});

test('local-only guard rejects any cloud provider or unknown model reintroduced in an agent', () => {
  const rooms = buildLocalGameFactoryRoomTemplates();
  const cloudRooms = structuredClone(rooms);
  cloudRooms[0].agents[0].llmProvider = 'openai';
  cloudRooms[0].agents[0].model = 'gpt-5.5';

  assert.throws(
    () => assertLocalOnlyAgentConfiguration(cloudRooms),
    /provider nao local: openai/,
  );

  const unknownRooms = structuredClone(rooms);
  unknownRooms[0].agents[0].fallbackModels = ['openai_compat/modelo-inexistente:latest'];
  assert.throws(
    () => assertLocalOnlyAgentConfiguration(unknownRooms),
    /modelo local desconhecido: openai_compat\/modelo-inexistente:latest/,
  );
});

test('Ollama installation guard fails when any referenced model is absent', async () => {
  const onlyQwen = async () => ({
    ok: true,
    json: async () => ({ models: [{ name: 'qwen3.6:35b-a3b-mtp-q4_K_M' }] }),
  });

  await assert.rejects(
    assertReferencedModelsInstalled({ fetchImpl: onlyQwen }),
    /nao instalado.*gpt-oss:20b/,
  );

  const bothModels = async () => ({
    ok: true,
    json: async () => ({
      models: [
        { name: 'qwen3.6:35b-a3b-mtp-q4_K_M' },
        { name: 'gpt-oss:20b' },
      ],
    }),
  });
  const result = await assertReferencedModelsInstalled({ fetchImpl: bothModels });
  assert.deepEqual(new Set(result.referenced), new Set([
    'qwen3.6:35b-a3b-mtp-q4_K_M',
    'gpt-oss:20b',
  ]));
});

test('local game factory launch env targets Ollama, Qwen-Image and TRELLIS', () => {
  const lines = buildLocalGameFactoryLaunchEnv({
    workspaceDir: '/tmp/nexus-game-factory',
    runtimeRoot: '/tmp/nexus-runtime',
  });
  const env = Object.fromEntries(
    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );

  assert.equal(env.NEXUS_DEFAULT_LLM_PROVIDER, 'openai_compat');
  assert.equal(env.OPENAI_COMPAT_BASE_URL, 'http://127.0.0.1:11434/v1');
  assert.equal(env.OPENAI_BASE_URL, undefined);
  assert.equal(env.NEXUS_OPENAI_DEFAULT_MODEL, undefined);
  assert.equal(env.NEXUS_OPENAI_COMPAT_ENABLE_THINKING, 'false');
  assert.equal(env.NEXUS_OPENAI_COMPAT_DEFAULT_REASONING_EFFORT, 'none');
  assert.equal(env.NEXUS_AUTONOMOUS_TEST_COMMAND, 'npm test');
  assert.equal(env.NEXUS_AUTONOMOUS_TEST_RETRIES_PER_MODEL, '3');
  assert.equal(env.NEXUS_GAME_FACTORY_ASSETS_ENABLED, 'false');
  assert.equal(env.NEXUS_GAME_FACTORY_ASSET_NETWORK_POLICY, 'loopback-only');
  assert.equal(env.NEXUS_GAME_FACTORY_IMAGE_MODEL, ASSET_MODELS.image.primary);
  assert.equal(env.NEXUS_GAME_FACTORY_3D_MODEL, ASSET_MODELS.threeD.primary);
  assert.equal(env.NEXUS_GAME_FACTORY_TRELLIS_MIN_VRAM_GB, '8');
  assert.equal(env.NEXUS_GAME_FACTORY_TRELLIS_RECOMMENDED_VRAM_GB, '16');
  assert.equal(env.NEXUS_GAME_FACTORY_TRELLIS_NATIVE_RECOMMENDED_VRAM_GB, '24');
  assert.equal(env.NEXUS_CRAZYGAMES_PACKAGE_WARN_MB, '50');
  assert.match(env.NEXUS_ROOM_TEMPLATES_JSON, /qwen3\.6:35b-a3b-mtp-q4_K_M/);
  const agents = JSON.parse(env.NEXUS_ROOM_TEMPLATES_JSON).flatMap((room) => room.agents);
  assert.equal(assertLocalOnlyAgentConfiguration([{ agents }]), true);
  assert.equal(ASSET_MODELS.image.enabledByDefault, false);
  assert.equal(ASSET_MODELS.image.localOnly, true);
  assert.equal(ASSET_MODELS.threeD.enabledByDefault, false);
  assert.equal(ASSET_MODELS.threeD.localOnly, true);
});

test('local game factory rejects non-loopback model and asset endpoints', () => {
  assert.throws(
    () => buildLocalGameFactoryLaunchEnv({ ollamaBaseUrl: 'https://ollama.example.com' }),
    /deve apontar para localhost\/loopback/,
  );
  assert.throws(
    () => assertLocalGameFactoryRuntimeEnv({
      OPENAI_COMPAT_BASE_URL: 'http://127.0.0.1:11434/v1',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
      QWEN_IMAGE_BASE_URL: 'https://assets.example.com',
    }),
    /QWEN_IMAGE_BASE_URL deve apontar para localhost\/loopback/,
  );
});

test('local game factory profile exposes model context recommendations', () => {
  const profile = getLocalGameFactoryProfile({
    workspaceDir: '/tmp/nexus-game-factory',
    runtimeRoot: '/tmp/nexus-runtime',
  });

  assert.equal(profile.director.provider, 'openai_compat');
  assert.equal(profile.director.model, 'qwen3.6:35b-a3b-mtp-q4_K_M');
  assert.equal(profile.localModels.some((model) => model.model === 'gpt-oss:20b'), true);
  assert.equal(profile.localModels.some((model) => model.context === 262144), true);
  assert.equal(profile.assetModels.threeD.minVramGb, 8);
  assert.equal(profile.assetModels.threeD.recommendedVramGb, 16);
  assert.equal(profile.assetModels.threeD.nativeRecommendedVramGb, 24);
});
