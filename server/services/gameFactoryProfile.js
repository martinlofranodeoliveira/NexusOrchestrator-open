const os = require('os');
const path = require('path');

const DEFAULT_WORKSPACE_DIR = path.join(os.homedir(), 'ai-game-factory', 'workspace');
const DEFAULT_RUNTIME_ROOT = path.join(os.homedir(), '.nexus-game-factory');
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const LOCAL_LLM_PROVIDERS = new Set(['ollama', 'openai_compat']);

// Os tres modelos anteriores (`north-mini-code:32k`, `qwen3-coder-30b:64k` e
// `qwen3-coder-next-q4:32k`) nao existem mais na maquina — a cadeia inteira
// apontava para o vazio. Estes dois sao os unicos que passam no arnes do
// stack-bench, ambos com 10/12, e por isso o catalogo tem dois itens e nao tres:
// listar o mesmo modelo duas vezes so para preservar a forma seria mentira.
//
// O especializado em codigo saiu de proposito. O `qwen3-coder-30b` fazia 3/10
// no mesmo arnes, entao esta troca melhora a fabrica, nao so a destrava.
const LOCAL_CODING_MODELS = Object.freeze([
  Object.freeze({
    key: 'daily',
    model: 'gpt-oss:20b',
    context: 131072,
    providerModel: 'openai_compat/gpt-oss:20b',
    agentModel: 'ollama/gpt-oss:20b',
    bestUse: 'execucao diaria, edicoes curtas, tarefas paralelas e prototipos jogaveis',
  }),
  Object.freeze({
    key: 'stable',
    model: 'qwen3.6:35b-a3b-mtp-q4_K_M',
    context: 262144,
    providerModel: 'openai_compat/qwen3.6:35b-a3b-mtp-q4_K_M',
    agentModel: 'ollama/qwen3.6:35b-a3b-mtp-q4_K_M',
    bestUse: 'arquitetura de jogo, refatoracoes medias, CSS e tarefas dificeis',
  }),
]);

const ASSET_MODELS = Object.freeze({
  image: Object.freeze({
    primary: 'Qwen/Qwen-Image-2512',
    fallback: 'black-forest-labs/FLUX.1-schnell',
    mode: 'disabled_by_default_local_only',
    enabledByDefault: false,
    localOnly: true,
    output: 'png/webp concepts, sprites, textures, backgrounds and UI art',
  }),
  threeD: Object.freeze({
    primary: 'microsoft/TRELLIS.2-4B',
    mode: 'disabled_by_default_local_reduced_res',
    enabledByDefault: false,
    localOnly: true,
    minVramGb: 8,
    recommendedVramGb: 16,
    nativeRecommendedVramGb: 24,
    output: 'glb assets with textured 3D geometry',
  }),
});

function normalizeNonEmpty(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function resolveLocalGameFactoryPaths(options = {}) {
  return {
    workspaceDir: path.resolve(
      normalizeNonEmpty(options.workspaceDir || process.env.NEXUS_GAME_FACTORY_PROJECT_DIR) ||
        DEFAULT_WORKSPACE_DIR,
    ),
    runtimeRoot: path.resolve(
      normalizeNonEmpty(options.runtimeRoot || process.env.NEXUS_GAME_FACTORY_RUNTIME_ROOT) ||
        DEFAULT_RUNTIME_ROOT,
    ),
  };
}

function buildPrompt(lines) {
  return lines.map((line) => String(line || '').trim()).filter(Boolean).join('\n');
}

function isLoopbackUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  } catch (_error) {
    return false;
  }
}

function assertLoopbackUrl(name, value, { optional = false } = {}) {
  const normalized = normalizeNonEmpty(value);
  if (!normalized && optional) return null;
  if (!normalized || !isLoopbackUrl(normalized)) {
    throw new Error(`${name} deve apontar para localhost/loopback; recebido: ${normalized || '[vazio]'}.`);
  }
  return normalized.replace(/\/+$/, '');
}

function normalizeReferencedModel(value) {
  const normalized = normalizeNonEmpty(value);
  if (!normalized) return null;
  const separator = normalized.indexOf('/');
  if (separator < 0) return normalized;
  const provider = normalized.slice(0, separator);
  return LOCAL_LLM_PROVIDERS.has(provider) ? normalized.slice(separator + 1) : normalized;
}

function listReferencedAgentModels(rooms = buildLocalGameFactoryRoomTemplates()) {
  return [...new Set(
    rooms
      .flatMap((room) => room.agents || [])
      .flatMap((agent) => [agent.model, ...(agent.fallbackModels || [])])
      .map(normalizeReferencedModel)
      .filter(Boolean),
  )];
}

function assertLocalOnlyAgentConfiguration(rooms = buildLocalGameFactoryRoomTemplates()) {
  const allowedModels = new Set(LOCAL_CODING_MODELS.map((entry) => entry.model));
  for (const agent of rooms.flatMap((room) => room.agents || [])) {
    if (!LOCAL_LLM_PROVIDERS.has(String(agent.llmProvider || '').trim())) {
      throw new Error(`Agente ${agent.id || '[sem id]'} usa provider nao local: ${agent.llmProvider || '[vazio]'}.`);
    }
    for (const model of [agent.model, ...(agent.fallbackModels || [])]) {
      const normalizedModel = normalizeReferencedModel(model);
      if (!allowedModels.has(normalizedModel)) {
        throw new Error(`Agente ${agent.id || '[sem id]'} referencia modelo local desconhecido: ${model}.`);
      }
    }
  }
  return true;
}

function assertLocalGameFactoryRuntimeEnv(env = process.env) {
  assertLoopbackUrl(
    'OPENAI_COMPAT_BASE_URL',
    env.OPENAI_COMPAT_BASE_URL || `${DEFAULT_OLLAMA_BASE_URL}/v1`,
  );
  assertLoopbackUrl('OLLAMA_BASE_URL', env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL);
  ['QWEN_IMAGE_BASE_URL', 'COMFYUI_BASE_URL', 'TRELLIS_BASE_URL'].forEach((key) => {
    assertLoopbackUrl(key, env[key], { optional: true });
  });
  assertLocalOnlyAgentConfiguration();
  return true;
}

async function assertReferencedModelsInstalled(options = {}) {
  const baseUrl = assertLoopbackUrl(
    'OLLAMA_BASE_URL',
    options.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
  );
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Fetch indisponivel para consultar o Ollama local.');

  const response = await fetchImpl(`${baseUrl}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama local respondeu HTTP ${response.status} ao listar modelos.`);
  }
  const payload = await response.json();
  const installed = new Set(
    (Array.isArray(payload.models) ? payload.models : [])
      .flatMap((entry) => [entry?.name, entry?.model])
      .map(normalizeNonEmpty)
      .filter(Boolean),
  );
  const referenced = listReferencedAgentModels(options.rooms);
  const missing = referenced.filter((model) => !installed.has(model));
  if (missing.length) {
    throw new Error(`Modelo(s) referenciado(s) nao instalado(s) no Ollama: ${missing.join(', ')}.`);
  }
  return { installed: [...installed], referenced };
}

function buildLocalGameFactoryRoomTemplates() {
  return [
    {
      id: 'game_director_cell',
      name: 'Game Director',
      team: 'primary',
      floor: 1,
      topology: 'local_game_factory',
      specializationRole: 'ceo',
      description: 'Qwen local coordena escopo, tarefas, criterios de aceite e revisao final.',
      agents: [
        {
          id: 'game_director',
          name: 'Local Game Director',
          role: 'ceo',
          modelTier: 'balanced',
          llmProvider: 'openai_compat',
          model: 'qwen3.6:35b-a3b-mtp-q4_K_M',
          fallbackModels: ['openai_compat/gpt-oss:20b'],
          prompt: buildPrompt([
            'Voce coordena uma fabrica de jogos local-first.',
            'Transforme pedidos em cards pequenos, criterios de aceite, plano de assets e gates de validacao.',
            'Priorize jogos HTML5 mobile-first prontos para CrazyGames: pacote leve, leitura em iframe 16:9/mobile, assets locais e loop jogavel imediato.',
            'Exija visual de jogo publicado: backdrop de gameplay, sprites legiveis, capas capturadas do jogo e rejeicao de arte geometrica simples.',
            'Use Qwen local para orquestracao/revisao e GPT-OSS local para execucao curta e rapida.',
            'Agrupe o trabalho por modelo: conclua as tentativas de um agente antes de acionar o fallback, porque os dois modelos nao cabem juntos na VRAM.',
            'Nunca delegue criptografia. Divida modulos acima de 1000 linhas antes de delegar e exija edicoes por trecho, nao arquivos inteiros.',
            'Raciocinio deve permanecer desligado e nenhuma etapa pode depender de provider, API, CDN ou asset remoto.',
          ]),
        },
      ],
    },
    {
      id: 'game_design_cell',
      name: 'Game Design and Assets',
      team: 'primary',
      floor: 1,
      topology: 'local_game_factory',
      specializationRole: 'marketing',
      description: 'Design de jogo, prompts de assets 2D e briefs de assets 3D.',
      agents: [
        {
          id: 'game_designer',
          name: 'Game Designer',
          role: 'pm',
          modelTier: 'balanced',
          llmProvider: 'openai_compat',
          model: 'qwen3.6:35b-a3b-mtp-q4_K_M',
          fallbackModels: [
            'openai_compat/gpt-oss:20b',
          ],
          prompt: buildPrompt([
            'Voce cria loops de jogo curtos, testaveis e mobile-first.',
            'Especifique controles, regras, dificuldade, pontuacao, assets e criterio de done antes da implementacao.',
            'Projete jogos de catalogo CrazyGames: faceis de entender em 5 segundos, bons em celular, com replay rapido e visual vendavel.',
            'Planeje a composicao visual junto da mecanica: o jogador precisa entender o tema pelo primeiro frame de gameplay.',
          ]),
        },
        {
          id: 'asset_director',
          name: 'Asset Director',
          role: 'marketing',
          modelTier: 'balanced',
          llmProvider: 'openai_compat',
          model: 'qwen3.6:35b-a3b-mtp-q4_K_M',
          fallbackModels: ['openai_compat/gpt-oss:20b'],
          prompt: buildPrompt([
            'Voce transforma mecanicas em prompts objetivos para Qwen-Image/FLUX e TRELLIS.2.',
            'Entregue sempre asset type, prompt, negative prompt, dimensoes, estilo, uso no jogo e criterio de aprovacao.',
            'Reprove arte com formas basicas, gradientes soltos, baixa silhueta ou cara de prototipo; peca materiais, props, fundo de gameplay, iluminacao e detalhes coerentes.',
            'Os geradores de asset sao opcionais, locais e desligados por padrao. Nunca sugira endpoint remoto nem dependa de chave de API.',
            'Para 3D, use TRELLIS.2 local apenas em resolucao reduzida quando couber em 16GB VRAM; caso contrario, registre o asset como adiado.',
          ]),
        },
      ],
    },
    {
      id: 'local_code_cell',
      name: 'Local Code Workers',
      team: 'primary',
      floor: 1,
      topology: 'local_game_factory',
      specializationRole: 'dev',
      description: 'Agentes Ollama executam implementacao, refatoracao e ajustes de jogo.',
      agents: [
        {
          id: 'game_engineer_daily',
          name: 'Daily Game Engineer',
          role: 'dev',
          modelTier: 'balanced',
          llmProvider: 'openai_compat',
          model: 'gpt-oss:20b',
          fallbackModels: [
            'openai_compat/qwen3.6:35b-a3b-mtp-q4_K_M',
          ],
          prompt: buildPrompt([
            'Implemente a menor mudanca correta com edicoes por trecho e rode os testes antes de concluir.',
            'Nao implemente criptografia. Se o modulo passar de 1000 linhas, divida a tarefa antes de editar.',
            'Quando um teste falhar, corrija a causa mostrada no feedback e rode o teste novamente.',
          ]),
        },
        {
          id: 'game_engineer_stable',
          name: 'Stable Game Engineer',
          role: 'dev',
          modelTier: 'balanced',
          llmProvider: 'openai_compat',
          model: 'qwen3.6:35b-a3b-mtp-q4_K_M',
          fallbackModels: [
            'openai_compat/gpt-oss:20b',
          ],
          prompt: buildPrompt([
            'Implemente arquitetura e refatoracoes locais com edicoes por trecho, nunca devolvendo o arquivo inteiro sem necessidade.',
            'Nao implemente criptografia. Divida modulos acima de 1000 linhas antes de delegar ou editar.',
            'Use a falha de teste recebida como feedback e repita ate o gate passar.',
          ]),
        },
        {
          id: 'game_engineer_hard',
          name: 'Hard Task Game Engineer',
          role: 'dev',
          modelTier: 'balanced',
          llmProvider: 'openai_compat',
          model: 'qwen3.6:35b-a3b-mtp-q4_K_M',
          fallbackModels: [
            'openai_compat/gpt-oss:20b',
          ],
          prompt: buildPrompt([
            'Resolva tarefas dificeis localmente, mantendo o raciocinio do provider desligado.',
            'Nao implemente criptografia. Divida modulos acima de 1000 linhas e prefira edit_file a reescrever arquivos completos.',
            'Corrija a falha apontada pelo teste antes de declarar conclusao.',
          ]),
        },
        {
          id: 'game_architect_local',
          name: 'Local Game Architect',
          role: 'architect',
          modelTier: 'balanced',
          llmProvider: 'openai_compat',
          model: 'qwen3.6:35b-a3b-mtp-q4_K_M',
          fallbackModels: [
            'openai_compat/gpt-oss:20b',
          ],
          prompt: buildPrompt([
            'Projete componentes menores que 1000 linhas e forneca passos implementaveis por edicoes localizadas.',
            'Nao delegue criptografia e nao introduza servicos ou assets remotos.',
          ]),
        },
      ],
    },
    {
      id: 'game_review_cell',
      name: 'Local Review Gate',
      team: 'review',
      floor: 2,
      topology: 'local_game_factory',
      specializationRole: 'qa',
      description: 'Qwen local valida diffs, jogabilidade, assets e gates antes de promover.',
      agents: [
        {
          id: 'game_qa_review',
          name: 'Local Game QA Review',
          role: 'qa',
          modelTier: 'balanced',
          llmProvider: 'openai_compat',
          model: 'qwen3.6:35b-a3b-mtp-q4_K_M',
          fallbackModels: ['openai_compat/gpt-oss:20b'],
          prompt: buildPrompt([
            'Voce revisa jogos gerados por agentes locais.',
            'Valide codigo, gameplay, assets, responsividade, ausencia de URLs externas, performance, checklist CrazyGames e evidencias de teste.',
            'Reprove sem hesitar quando houver falso verde, asset ausente, capa que nao venha de gameplay, visual geometrico simples, jogabilidade rasa ou texto quebrado em mobile.',
          ]),
        },
      ],
    },
  ];
}

function buildLocalGameFactoryLaunchEnv(options = {}) {
  const paths = resolveLocalGameFactoryPaths(options);
  const ollamaBaseUrl = assertLoopbackUrl(
    'OLLAMA_BASE_URL',
    options.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL,
  );
  const rooms = buildLocalGameFactoryRoomTemplates();
  assertLocalOnlyAgentConfiguration(rooms);

  return [
    'NEXUS_INSTANCE_ID=local-game-factory',
    'NEXUS_INSTANCE_OWNER=martin',
    'NEXUS_LOCAL_RUN_NAMESPACE=local-game-factory',
    'NEXUS_USE_GITHUB_BOARD=false',
    'NEXUS_BOOTSTRAP_DEMO_TASKS=false',
    'NEXUS_PROJECT_DIR_STRICT=true',
    `NEXUS_RUNTIME_STATE_DIR_OVERRIDE=${path.join(paths.runtimeRoot, 'runtime', 'state')}`,
    `NEXUS_WORKTREE_ROOT_OVERRIDE=${path.join(paths.runtimeRoot, 'worktrees')}`,
    'NEXUS_DEFAULT_LLM_PROVIDER=openai_compat',
    `OPENAI_COMPAT_BASE_URL=${ollamaBaseUrl.replace(/\/+$/, '')}/v1`,
    `OLLAMA_BASE_URL=${ollamaBaseUrl.replace(/\/+$/, '')}`,
    'OPENAI_COMPAT_API_KEY=',
    'OLLAMA_MODEL=qwen3.6:35b-a3b-mtp-q4_K_M',
    'NEXUS_OPENAI_COMPAT_DEFAULT_MODEL=qwen3.6:35b-a3b-mtp-q4_K_M',
    'NEXUS_OPENAI_COMPAT_FAST_MODEL=gpt-oss:20b',
    'NEXUS_OPENAI_COMPAT_REASONING_MODEL=qwen3.6:35b-a3b-mtp-q4_K_M',
    'NEXUS_OPENAI_COMPAT_DEFAULT_REASONING_EFFORT=none',
    'NEXUS_OPENAI_COMPAT_ENABLE_REASONING_EFFORT=false',
    'NEXUS_OPENAI_COMPAT_ENABLE_THINKING=false',
    'NEXUS_OPENAI_COMPAT_FALLBACK_CHAIN=openai_compat/qwen3.6:35b-a3b-mtp-q4_K_M,openai_compat/gpt-oss:20b',
    'NEXUS_PROVIDER_HTTP_TIMEOUT_MS=900000',
    'NEXUS_AUTONOMOUS_PROVIDER_TIMEOUT_MS=900000',
    'NEXUS_AUTONOMOUS_MAX_TOKENS=4096',
    'NEXUS_AUTONOMOUS_MAX_ITERATIONS=24',
    'NEXUS_AUTONOMOUS_TEST_COMMAND=npm test',
    'NEXUS_AUTONOMOUS_TEST_RETRIES_PER_MODEL=3',
    'NEXUS_AUTONOMOUS_TEST_TIMEOUT_MS=300000',
    'NEXUS_AUTONOMOUS_EMPTY_RESPONSE_RETRIES=1',
    'NEXUS_AUTONOMOUS_TOOL_OUTPUT_CHARS=16000',
    'NEXUS_AUTONOMOUS_READ_FILE_CHARS=16000',
    'NEXUS_AUTONOMOUS_SEARCH_OUTPUT_CHARS=10000',
    'NEXUS_AUTONOMOUS_SEARCH_RESULTS=120',
    'NEXUS_AUTONOMOUS_HISTORY_TOOL_ARG_CHARS=300',
    'NEXUS_AUTONOMOUS_READONLY_STREAK_LIMIT=2',
    'NEXUS_PROVIDER_WAIT_HEARTBEAT_MS=30000',
    'NEXUS_AUTO_DISPATCH=false',
    'NEXUS_AUTO_DISPATCH_FROM_BACKLOG=false',
    'NEXUS_GAME_FACTORY_SEEDER_ENABLED=false',
    'NEXUS_GAME_FACTORY_TARGET_OPEN_TASKS=1',
    'NEXUS_GAME_FACTORY_SEED_INTERVAL_MS=86400000',
    `NEXUS_GAME_FACTORY_IMAGE_MODEL=${ASSET_MODELS.image.primary}`,
    `NEXUS_GAME_FACTORY_IMAGE_FALLBACK_MODEL=${ASSET_MODELS.image.fallback}`,
    `NEXUS_GAME_FACTORY_3D_MODEL=${ASSET_MODELS.threeD.primary}`,
    'NEXUS_GAME_FACTORY_ASSETS_ENABLED=false',
    'NEXUS_GAME_FACTORY_IMAGE_ENABLED=false',
    'NEXUS_GAME_FACTORY_3D_ENABLED=false',
    'NEXUS_GAME_FACTORY_ASSET_NETWORK_POLICY=loopback-only',
    `NEXUS_GAME_FACTORY_3D_MODE=${ASSET_MODELS.threeD.mode}`,
    `NEXUS_GAME_FACTORY_TRELLIS_MIN_VRAM_GB=${ASSET_MODELS.threeD.minVramGb}`,
    `NEXUS_GAME_FACTORY_TRELLIS_RECOMMENDED_VRAM_GB=${ASSET_MODELS.threeD.recommendedVramGb}`,
    `NEXUS_GAME_FACTORY_TRELLIS_NATIVE_RECOMMENDED_VRAM_GB=${ASSET_MODELS.threeD.nativeRecommendedVramGb}`,
    'NEXUS_CRAZYGAMES_PACKAGE_WARN_MB=50',
    'NEXUS_CRAZYGAMES_SDK_MODE=disabled-local',
    'QWEN_IMAGE_BASE_URL=',
    'COMFYUI_BASE_URL=',
    'TRELLIS_BASE_URL=',
    'NEXUS_DEFAULT_ROOM_TOPOLOGY=role_cells',
    'NEXUS_PRIMARY_ROOM_REPLICAS=1',
    'NEXUS_REVIEW_ROOM_REPLICAS=1',
    `NEXUS_ROOM_TEMPLATES_JSON=${JSON.stringify(rooms)}`,
    'NEXUS_WORKTREE_INTEGRATION_MODE=cherry-pick',
    'NEXUS_TASK_BRANCH_PREFIX=nexus/game-factory',
    'NEXUS_LOCAL_SUPERVISOR_ENABLED=true',
    'NEXUS_LOCAL_SUPERVISOR_PROGRESS_STALL_MS=1800000',
    '',
  ];
}

function getLocalGameFactoryProfile(options = {}) {
  const paths = resolveLocalGameFactoryPaths(options);
  return {
    ...paths,
    ollamaBaseUrl: assertLoopbackUrl(
      'OLLAMA_BASE_URL',
      options.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL,
    ),
    director: {
      provider: 'openai_compat',
      model: 'qwen3.6:35b-a3b-mtp-q4_K_M',
      reasoningEffort: null,
    },
    localModels: LOCAL_CODING_MODELS,
    assetModels: ASSET_MODELS,
    rooms: buildLocalGameFactoryRoomTemplates(),
  };
}

module.exports = {
  ASSET_MODELS,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_RUNTIME_ROOT,
  DEFAULT_WORKSPACE_DIR,
  LOCAL_CODING_MODELS,
  assertLocalGameFactoryRuntimeEnv,
  assertLocalOnlyAgentConfiguration,
  assertReferencedModelsInstalled,
  buildLocalGameFactoryLaunchEnv,
  buildLocalGameFactoryRoomTemplates,
  getLocalGameFactoryProfile,
  isLoopbackUrl,
  listReferencedAgentModels,
  resolveLocalGameFactoryPaths,
};
