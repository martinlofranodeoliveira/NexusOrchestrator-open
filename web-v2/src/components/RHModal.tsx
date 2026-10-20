import { useEffect, useMemo, useState } from 'react';

import { apiUrl } from '../backend.js';
import './RHModal.css';
import { RH_MCP_OPTIONS } from './rhConfig.js';

const MODEL_OPTIONS = {
  gemini: [
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview (Fast & Simple)' },
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview (Complex Reasoning)' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Balanced)' },
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Deep Reasoning)' },
    { value: 'claude-haiku-4-5-20251213', label: 'Claude Haiku 4.5 (Fast)' },
  ],
  openai: [
    { value: 'gpt-5', label: 'GPT-5 (General Purpose)' },
    { value: 'gpt-5.4', label: 'GPT-5.4 (Advanced Reasoning)' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini (Faster)' },
  ],
  azure_openai: [
    { value: 'azure-openai-deployment', label: 'Azure Deployment (usa AZURE_OPENAI_DEPLOYMENT)' },
    { value: 'gpt-5-chat', label: 'Azure GPT-5 Chat (deployment explícito)' },
    { value: 'gpt-5', label: 'Azure GPT-5 (via deployment)' },
    { value: 'gpt-5.4', label: 'Azure GPT-5.4 (via deployment)' },
    { value: 'gpt-5.4-mini', label: 'Azure GPT-5.4 Mini (via deployment)' },
  ],
  xai: [
    { value: 'grok-3', label: 'Grok 3 (General Purpose)' },
    { value: 'grok-3-mini', label: 'Grok 3 Mini (Faster)' },
    { value: 'grok-2', label: 'Grok 2' },
  ],
  openai_compat: [
    { value: 'qwen2.5-coder:7b', label: 'Qwen 2.5 Coder 7B (Ollama / Local)' },
    { value: 'qwen2.5-coder:14b', label: 'Qwen 2.5 Coder 14B (Ollama / Local)' },
    { value: 'llama3.1:8b', label: 'Llama 3.1 8B (Ollama / Local)' },
    { value: 'gpt-oss:20b', label: 'GPT-OSS 20B (OpenAI-compatible local)' },
  ],
} as const;

type LlmProvider = keyof typeof MODEL_OPTIONS;
type AgentModalMode = 'create' | 'edit';
type ReasoningEffortValue = '' | 'low' | 'medium' | 'high' | 'xhigh';
const REASONING_EFFORT_OPTIONS: Array<{ value: ReasoningEffortValue; label: string }> = [
  { value: '', label: 'Auto (usa o padrao do provider/papel)' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'X-High' },
];

function isKnownProvider(value: string | undefined): value is LlmProvider {
  return Boolean(value && Object.prototype.hasOwnProperty.call(MODEL_OPTIONS, value));
}

function getDefaultModelForProvider(provider: LlmProvider): string {
  return MODEL_OPTIONS[provider][0]?.value || 'gemini-3.1-flash-lite-preview';
}

function getModelOptions(provider: LlmProvider, currentModel: string) {
  const options = [...MODEL_OPTIONS[provider]];
  const trimmedCurrentModel = String(currentModel || '').trim();
  if (!trimmedCurrentModel) return options;
  if (options.some((option) => option.value === trimmedCurrentModel)) return options;
  return [
    {
      value: trimmedCurrentModel,
      label: `${trimmedCurrentModel} (Custom / Atual)`,
    },
    ...options,
  ];
}

function normalizeProvider(value: string | undefined): LlmProvider {
  return isKnownProvider(value) ? value : 'gemini';
}

function supportsReasoningEffort(provider: LlmProvider) {
  return provider === 'openai' || provider === 'azure_openai';
}

function defaultFloorForTeam(team: string) {
  return String(team || '').trim().toLowerCase() === 'review' ? '2' : '1';
}

function formatListField(values: string[] | undefined): string {
  return Array.isArray(values) ? values.join(', ') : '';
}

function parseListField(value: string): string[] {
  return [...new Set(
    String(value || '')
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  )];
}

export interface AgentConfig {
  name: string;
  role: string;
  llmProvider: string;
  model: string;
  reasoningEffort: string;
  fallbackModels: string[];
  skills: string[];
  prompt: string;
  mcps: string[];
  team: string;
  floor: number;
  roomId?: string;
}

export interface RoomOption {
  id: string;
  name: string;
  team: string;
  floor: number;
  topology?: string | null;
  archetypeId?: string | null;
  specializationRole?: string | null;
  occupants?: number;
  configuredSlots?: number;
  replicaTarget?: number;
}

interface RHModalProps {
  mode?: AgentModalMode;
  initialConfig?: Partial<AgentConfig>;
  roomOptions?: RoomOption[];
  onClose: () => void;
  onSubmit: (config: AgentConfig) => void;
}

export function RHModal({
  mode = 'create',
  initialConfig,
  roomOptions = [],
  onClose,
  onSubmit,
}: RHModalProps) {
  const initialProvider = normalizeProvider(initialConfig?.llmProvider);
  const initialModel = String(initialConfig?.model || '').trim() || getDefaultModelForProvider(initialProvider);
  const initialTeam = String(initialConfig?.team || 'primary').trim().toLowerCase() === 'review'
    ? 'review'
    : 'primary';

  const [name, setName] = useState(String(initialConfig?.name || ''));
  const [role, setRole] = useState(String(initialConfig?.role || 'dev'));
  const [llmProvider, setLlmProvider] = useState<LlmProvider>(initialProvider);
  const [model, setModel] = useState(initialModel);
  const [reasoningEffort, setReasoningEffort] = useState(String(initialConfig?.reasoningEffort || ''));
  const [fallbackModelsText, setFallbackModelsText] = useState(formatListField(initialConfig?.fallbackModels));
  const [skillsText, setSkillsText] = useState(formatListField(initialConfig?.skills));
  const [prompt, setPrompt] = useState(String(initialConfig?.prompt || ''));
  const [mcps, setMcps] = useState<string[]>(Array.isArray(initialConfig?.mcps) ? initialConfig.mcps : []);
  const [team, setTeam] = useState<'primary' | 'review'>(initialTeam);
  const [floor, setFloor] = useState(String(initialConfig?.floor || defaultFloorForTeam(initialTeam)));
  const [roomId, setRoomId] = useState(String(initialConfig?.roomId || ''));
  const [isGenerating, setIsGenerating] = useState(false);
  const selectedRoom = useMemo(
    () => roomOptions.find((room) => room.id === roomId) || null,
    [roomId, roomOptions],
  );

  useEffect(() => {
    const nextProvider = normalizeProvider(initialConfig?.llmProvider);
    const nextTeam = String(initialConfig?.team || 'primary').trim().toLowerCase() === 'review'
      ? 'review'
      : 'primary';
    setName(String(initialConfig?.name || ''));
    setRole(String(initialConfig?.role || 'dev'));
    setLlmProvider(nextProvider);
    setModel(String(initialConfig?.model || '').trim() || getDefaultModelForProvider(nextProvider));
    setReasoningEffort(String(initialConfig?.reasoningEffort || ''));
    setFallbackModelsText(formatListField(initialConfig?.fallbackModels));
    setSkillsText(formatListField(initialConfig?.skills));
    setPrompt(String(initialConfig?.prompt || ''));
    setMcps(Array.isArray(initialConfig?.mcps) ? initialConfig.mcps : []);
    setTeam(nextTeam);
    setFloor(String(initialConfig?.floor || defaultFloorForTeam(nextTeam)));
    setRoomId(String(initialConfig?.roomId || ''));
  }, [initialConfig]);

  const handleMcpToggle = (mcp: string) => {
    setMcps((prev) =>
      prev.includes(mcp) ? prev.filter((candidate) => candidate !== mcp) : [...prev, mcp],
    );
  };

  const handleAutoGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch(apiUrl('/api/generate_profile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, llmProvider, model, reasoningEffort }),
      });
      const data = await res.json();
      const nextProvider = normalizeProvider(data.llmProvider || llmProvider);
      setLlmProvider(nextProvider);
      if (data.prompt) setPrompt(data.prompt);
      if (typeof data.reasoningEffort === 'string') setReasoningEffort(data.reasoningEffort);
      setModel(String(data.model || '').trim() || getDefaultModelForProvider(nextProvider));
      if (data.mcps && Array.isArray(data.mcps)) setMcps(data.mcps);
    } catch (error) {
      console.error(error);
      alert('Falha ao gerar perfil com IA.');
    }
    setIsGenerating(false);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      alert('O agente precisa de um nome!');
      return;
    }

    onSubmit({
      name: name.trim(),
      role,
      llmProvider,
      model: model.trim() || getDefaultModelForProvider(llmProvider),
      reasoningEffort: reasoningEffort.trim(),
      fallbackModels: parseListField(fallbackModelsText),
      skills: parseListField(skillsText),
      prompt: prompt.trim(),
      mcps,
      team: selectedRoom?.team || team,
      floor:
        selectedRoom?.floor ||
        Math.max(1, Number.parseInt(floor, 10) || Number.parseInt(defaultFloorForTeam(team), 10)),
      roomId: selectedRoom?.id || String(roomId || '').trim() || '',
    });
  };

  const title =
    mode === 'edit'
      ? 'DEPARTAMENTO DE RH - TUNAR AGENTE'
      : 'DEPARTAMENTO DE RH - NOVA CONTRATAÇÃO';
  const submitLabel = mode === 'edit' ? 'SALVAR AJUSTES' : 'CONTRATAR AGENTE';

  return (
    <div className="rh-modal-overlay">
      <div className="rh-modal">
        <div className="rh-header">
          <div className="rh-title">{title}</div>
          <button className="rh-close" onClick={onClose}>
            [X]
          </button>
        </div>

        <div className="rh-body">
          <div className="rh-form-group">
            <label>NOME DO AGENTE</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Sophia (Dev Frontend)"
            />
          </div>

          <div className="rh-form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>CARGO / PAPEL</span>
              <button
                type="button"
                className="rh-btn-ai"
                onClick={handleAutoGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? '⏳ Gerando...' : '🪄 Auto-Completar com IA'}
              </button>
            </label>
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="pm">Product Manager (PM)</option>
              <option value="architect">Software Architect</option>
              <option value="sm">Scrum Master</option>
              <option value="dev">Software Engineer (Dev)</option>
              <option value="qa">QA Tester</option>
              <option value="devops">DevOps / CI-CD</option>
              <option value="marketing">Marketing / Creative</option>
            </select>
          </div>

          <div className="rh-grid">
            <div className="rh-form-group">
              <label>SALA</label>
              <select
                value={roomId}
                onChange={(event) => {
                  const nextRoomId = event.target.value;
                  setRoomId(nextRoomId);
                  const nextRoom = roomOptions.find((room) => room.id === nextRoomId);
                  if (nextRoom) {
                    setTeam(nextRoom.team === 'review' ? 'review' : 'primary');
                    setFloor(String(nextRoom.floor || defaultFloorForTeam(nextRoom.team)));
                  }
                }}
              >
                <option value="">Sem sala fixa (manual)</option>
                {roomOptions.map((room) => (
                  <option key={room.id} value={room.id}>
                    {`${room.name}${
                      room.specializationRole ? ` · ${room.specializationRole}` : ''
                    } · ${room.team} · andar ${room.floor}${
                      Number.isFinite(room.occupants) &&
                      Number.isFinite(room.replicaTarget || room.configuredSlots)
                        ? ` · ${room.occupants}/${room.replicaTarget || room.configuredSlots}`
                        : ''
                    }${
                      room.topology ? ` · ${room.topology}` : ''
                    }`}
                  </option>
                ))}
              </select>
              <div className="rh-help-text">
                Se uma sala for escolhida, squad e andar passam a herdar a configuracao declarativa dela.
              </div>
            </div>

            <div className="rh-form-group">
              <label>SQUAD</label>
              <select
                value={selectedRoom?.team || team}
                disabled={Boolean(selectedRoom)}
                onChange={(event) => {
                  const nextTeam = event.target.value === 'review' ? 'review' : 'primary';
                  setTeam(nextTeam);
                  setFloor(defaultFloorForTeam(nextTeam));
                }}
              >
                <option value="primary">Primary</option>
                <option value="review">Review</option>
              </select>
            </div>

            <div className="rh-form-group">
              <label>ANDAR</label>
              <input
                type="text"
                value={selectedRoom?.floor ? String(selectedRoom.floor) : floor}
                disabled={Boolean(selectedRoom)}
                onChange={(event) => setFloor(event.target.value)}
                placeholder={defaultFloorForTeam(team)}
              />
            </div>
          </div>

          <div className="rh-form-group">
            <label>PROVIDER DE IA</label>
            <select
              value={llmProvider}
              onChange={(event) => {
                const nextProvider = normalizeProvider(event.target.value);
                setLlmProvider(nextProvider);
                setModel(getDefaultModelForProvider(nextProvider));
              }}
            >
              <option value="gemini">Gemini</option>
              <option value="anthropic">Anthropic / Claude</option>
              <option value="openai">OpenAI / GPT</option>
              <option value="azure_openai">Azure OpenAI</option>
              <option value="xai">xAI / Grok</option>
              <option value="openai_compat">OpenAI-Compatible / Local (Ollama)</option>
            </select>
          </div>

          <div className="rh-form-group">
            <label>CÉREBRO (MODELO DE IA)</label>
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              {getModelOptions(llmProvider, model).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="Modelo, deployment ou alias custom"
            />
            {llmProvider === 'azure_openai' && (
              <div className="rh-help-text">
                Se este campo ficar em <code>azure-openai-deployment</code>, o runtime usa
                <code> AZURE_OPENAI_DEPLOYMENT</code>. Se você digitar um deployment explícito
                aqui, ele sobrescreve o valor global.
              </div>
            )}
            {llmProvider === 'openai_compat' && (
              <div className="rh-help-text">
                Para Ollama ou outro servidor local OpenAI-compatible, configure
                <code> OPENAI_COMPAT_BASE_URL</code> ou <code>OLLAMA_BASE_URL</code>. Em endpoint
                local, a API key é opcional.
              </div>
            )}
          </div>

          {supportsReasoningEffort(llmProvider) && (
            <div className="rh-form-group">
              <label>INTENSIDADE DE RACIOCINIO</label>
              <select
                value={reasoningEffort}
                onChange={(event) => setReasoningEffort(event.target.value)}
              >
                {REASONING_EFFORT_OPTIONS.map((option) => (
                  <option key={option.value || 'auto'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="rh-help-text">
                Vale para OpenAI e Azure OpenAI. Use <code>xhigh</code> quando quiser o
                maximo de pensamento do modelo para tasks mais dificeis.
              </div>
            </div>
          )}

          <div className="rh-form-group">
            <label>CADEIA DE FALLBACK DO RUNTIME</label>
            <textarea
              rows={2}
              value={fallbackModelsText}
              onChange={(event) => setFallbackModelsText(event.target.value)}
              placeholder="openai/gpt-5.4-mini, azure_openai/seu-deployment, openai_compat/qwen2.5-coder:14b"
            />
            <div className="rh-help-text">
              Use uma lista separada por vírgula. O runtime tenta o modelo principal primeiro e
              alterna para a cadeia quando houver falha de provider/modelo.
            </div>
          </div>

          <div className="rh-form-group">
            <label>SKILLS LOCAIS</label>
            <textarea
              rows={2}
              value={skillsText}
              onChange={(event) => setSkillsText(event.target.value)}
              placeholder="backend/api, review/security, deploy/vercel"
            />
            <div className="rh-help-text">
              IDs de skills encontrados em <code>.nexus/skills</code> ou <code>skills/</code>.
            </div>
          </div>

          <div className="rh-form-group">
            <label>SYSTEM PROMPT (Instruções do Cargo)</label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Descreva as responsabilidades, tom de voz e regras deste agente..."
            />
          </div>

          <div className="rh-form-group">
            <label>FERRAMENTAS (MCPs) HABILITADOS</label>
            <div className="rh-checkbox-group">
              {RH_MCP_OPTIONS.map((option) => (
                <label key={option.id}>
                  <input
                    type="checkbox"
                    checked={mcps.includes(option.id)}
                    onChange={() => handleMcpToggle(option.id)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="rh-footer">
          <button className="rh-btn-hire" onClick={handleSubmit}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
