const { runPrompt } = require('./llmService');
const { resolveAgentPromptModel, resolveAgentReasoningEffort } = require('./modelRegistry');
const { buildDefaultAgentPrompt } = require('./agentProfiles');

/**
 * Serviço que simula o AI Vision Forge para o Agente de Marketing
 * Ele usa o motor do Gemini para criar roteiros e promptear o Veo (simulado)
 */
async function generateCreativeContent(task, agent = {}) {
  return new Promise((resolve, reject) => {
    console.log(`🎬 [Creative Engine] Processando tarefa de marketing: "${task}"...`);
    const promptLlm = resolveAgentPromptModel(agent, task);
    const reasoningEffort = resolveAgentReasoningEffort(agent);
    const systemPrompt = agent.prompt || buildDefaultAgentPrompt({ ...agent, role: agent.role || 'marketing' });

    const promptStr = `Sua tarefa é: ${task}

Com base nessa tarefa, crie um roteiro visual detalhado e prompte uma IA de geração de vídeo (Veo).
Responda com:
1. Um título criativo.
2. O roteiro da cena.
3. O prompt técnico para o Veo.

Seja profissional e inovador.`;

    runPrompt(promptStr, {
      systemPrompt,
      reasoningEffort,
      llmProvider: promptLlm.provider,
      model: promptLlm.model,
    })
      .then(({ stdout }) => resolve(stdout.trim()))
      .catch(reject);
  });
}

module.exports = { generateCreativeContent };
