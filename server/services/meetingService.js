const { runPrompt } = require('./llmService');
const { resolveAgentPromptModel, resolveAgentReasoningEffort } = require('./modelRegistry');
const { buildDefaultAgentPrompt, buildMeetingDirective } = require('./agentProfiles');

function extractStructuredReply(stdout) {
  const rawReply = String(stdout || '').trim();
  if (!rawReply) return '';

  const fencedJsonMatch = rawReply.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonCandidates = [
    rawReply,
    fencedJsonMatch ? fencedJsonMatch[1].trim() : '',
  ].filter(Boolean);

  for (const candidate of jsonCandidates) {
    const trimmedCandidate = String(candidate || '').trim();
    if (!trimmedCandidate.startsWith('{') || !trimmedCandidate.endsWith('}')) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmedCandidate);
      const extracted =
        parsed.reply || parsed.message || parsed.text || parsed.output || parsed.content || '';
      if (String(extracted || '').trim()) {
        return String(extracted).trim();
      }
    } catch (error) {
      // Resposta livre continua válida; só abandonamos o parse estruturado.
    }
  }

  return rawReply;
}

async function askAgent(agent, context) {
  return new Promise((resolve) => {
    const systemPrompt = agent.prompt || buildDefaultAgentPrompt(agent);
    const promptLlm = resolveAgentPromptModel(agent, context);
    const reasoningEffort = resolveAgentReasoningEffort(agent);
    const promptStr = `Contexto da Reunião:\n${context}\n\nDiretriz do seu papel nesta reunião:\n${buildMeetingDirective(agent)}\n\nSua vez de falar. REGRA DE OURO: Você é OBRIGADO a ser proativo. Se já estiver com task em andamento, NÃO assuma outra; apenas reporte progresso ou bloqueio curto em até 2 linhas. Se estiver livre e houver tarefas no backlog da sua área, você DEVE pegar uma usando [TAKE_TASK: "ID_DA_TASK"]. Só pegue task claramente alinhada ao seu papel ou já atribuída ao seu id. Não pegue tarefa de outra função. Se não houver task adequada e você realmente precisar abrir uma nova frente, use [CREATE_TICKET: "Nome da Task" TO "${agent.id}"]. Responda de forma direta e curta (max 3 linhas).`;

    console.log(`[Meeting] Enviando prompt para ${agent.name}... (${promptStr.length} chars)`);
    runPrompt(promptStr, {
      systemPrompt,
      reasoningEffort,
      llmProvider: promptLlm.provider,
      model: promptLlm.model,
    })
      .then(({ stdout }) => {
        const reply = extractStructuredReply(stdout);
        resolve(reply.trim() || `[${agent.name} não tinha nada a acrescentar]`);
      })
      .catch((error) => {
        console.error(`[Meeting] Erro no exec do ${agent.name}:`, error.message);
        console.error(`[Meeting] STDERR do ${agent.name}:`, error.stderr || '');
        resolve(`[${agent.name} ficou em silêncio devido a erro técnico]`);
      });
  });
}

async function runMeeting(agentsToMeet, topic, emitLog, onAgentAction) {
  const meetingBrief = `Tópico: ${topic}\n\n`;
  let discussionLog = '';
  emitLog(`📢 [SISTEMA] Reunião iniciada! Tópico: ${topic}`);

  for (const agent of agentsToMeet) {
    if (agent.role === 'ceo') continue; 
    
    emitLog(`🗣️ [${agent.name}] está pensando...`);
    
    let safeDiscussionLog = discussionLog;
    if (safeDiscussionLog.length > 2200) {
      safeDiscussionLog = "... " + safeDiscussionLog.substring(safeDiscussionLog.length - 2200);
    }
    const safeContext = `${meetingBrief}${safeDiscussionLog}`;
    
    const reply = await askAgent(agent, safeContext);
    discussionLog += `${agent.name}: ${reply}\n\n`;
    emitLog(`💬 [${agent.name}]: ${reply}`);

    if (onAgentAction) {
       await onAgentAction(agent, reply);
    }
  }

  emitLog(`📢 [SISTEMA] Reunião concluída. Ata enviada ao CEO.`);
  return `${meetingBrief}${discussionLog}`;
}

module.exports = { runMeeting };
