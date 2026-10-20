import type { OperationsAttentionTask, OperationsSnapshot } from './operationsTypes.js';
import { getNumericAgentId } from './agentIds.js';

export interface BackendAgent {
  id: string;
  name: string;
  displayName?: string;
  role?: string;
  team?: string;
  floor?: number;
  roomId?: string | null;
  roomName?: string | null;
  status?: string;
  state?: string;
  task?: string;
  currentTask?: string;
  currentTaskId?: string | null;
  activeTaskId?: string | null;
  llmProvider?: string;
  model?: string;
  reasoningEffort?: string | null;
  fallbackModels?: string[];
  skills?: string[];
  prompt?: string;
  mcps?: string[];
  currentProvider?: string;
  currentModel?: string;
  currentReasoningEffort?: string | null;
  fallbackActive?: boolean;
  fallbackDepth?: number;
  fallbackReason?: string | null;
  laneState?: string | null;
  laneUpdatedAt?: string | null;
  laneTaskId?: string | null;
  laneTaskKind?: string | null;
  laneFailureClass?: string | null;
  laneFailureMessage?: string | null;
  instanceId?: string | null;
  ownerId?: string | null;
}

export interface BoardTask {
  id: string;
  title: string;
  state?: string;
  status?: string;
  assignee?: string | null;
  ownerId?: string | null;
  ownerInstanceId?: string | null;
}

export type OperationalAgentStateKind =
  | 'working'
  | 'reviewing'
  | 'recovering'
  | 'suspicious'
  | 'meeting'
  | 'waiting'
  | 'idle';

export interface OperationalAgentState {
  agentId: number;
  backendId: string;
  kind: OperationalAgentStateKind;
  label: string;
  description: string;
  taskId: string | null;
  taskTitle: string | null;
  reason: string | null;
  severity: OperationsAttentionTask['severity'];
  activeTaskCount: number;
  accentColor: string;
  badgeBackground: string;
  provider: string | null;
  model: string | null;
}

const ACTIVE_TASK_STATUSES = new Set(['in_progress', 'in_review']);
const ACTIVE_BACKEND_STATES = new Set([
  'running',
  'coding',
  'helping',
  'testing',
  'preparing',
  'thinking',
]);
const WAITING_BACKEND_STATES = new Set(['waiting', 'paused', 'blocked', 'failed', 'error']);
const WORKING_LANE_STATES = new Set(['preparing_workspace', 'running', 'integrating']);
const RECOVERING_LANE_STATES = new Set(['retry_scheduled']);
const WAITING_LANE_STATES = new Set(['queued']);
const SUSPICIOUS_LANE_STATES = new Set(['failed']);

const OPERATIONAL_KIND_META: Record<
  OperationalAgentStateKind,
  { label: string; accentColor: string; badgeBackground: string }
> = {
  working: {
    label: 'CODANDO',
    accentColor: '#65b7ff',
    badgeBackground: 'rgba(55, 148, 255, 0.18)',
  },
  reviewing: {
    label: 'REVIEW',
    accentColor: '#95f3ae',
    badgeBackground: 'rgba(80, 180, 120, 0.18)',
  },
  recovering: {
    label: 'RESGATE',
    accentColor: '#ffcb6b',
    badgeBackground: 'rgba(217, 119, 6, 0.18)',
  },
  suspicious: {
    label: 'ALERTA',
    accentColor: '#ff8f8f',
    badgeBackground: 'rgba(190, 60, 60, 0.18)',
  },
  meeting: {
    label: 'REUNIAO',
    accentColor: '#f6ad55',
    badgeBackground: 'rgba(217, 119, 6, 0.18)',
  },
  waiting: {
    label: 'ESPERA',
    accentColor: '#f2d98a',
    badgeBackground: 'rgba(204, 167, 0, 0.18)',
  },
  idle: {
    label: 'LIVRE',
    accentColor: 'rgba(255, 255, 255, 0.74)',
    badgeBackground: 'rgba(255, 255, 255, 0.08)',
  },
};

function getTaskStatus(task: Pick<BoardTask, 'state' | 'status'> | null | undefined): string {
  return String(task?.state || task?.status || '').trim().toLowerCase();
}

function normalizeInstanceValue(value: string | null | undefined): string | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || null;
}

function isForeignOwnedTask(task: BoardTask, currentInstanceId: string | null): boolean {
  const taskOwnerInstanceId = normalizeInstanceValue(task.ownerInstanceId);
  const normalizedCurrentInstanceId = normalizeInstanceValue(currentInstanceId);
  return Boolean(taskOwnerInstanceId && normalizedCurrentInstanceId && taskOwnerInstanceId !== normalizedCurrentInstanceId);
}

function isGenericAgentTaskText(text: string): boolean {
  const normalized = String(text || '').trim().toLowerCase();
  return (
    !normalized ||
    normalized === 'supervisionando' ||
    normalized === 'aguardando ordens...' ||
    normalized === 'aguardando ordens' ||
    normalized === 'idle' ||
    normalized === 'waiting'
  );
}

function getAgentTaskText(agent: BackendAgent): string | null {
  const currentTask = String(agent.currentTask || agent.task || '').trim();
  return isGenericAgentTaskText(currentTask) ? null : currentTask;
}

function severityRank(severity: OperationsAttentionTask['severity'] | undefined): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'info':
      return 1;
    default:
      return 0;
  }
}

function compareAttentionTasks(left: OperationsAttentionTask, right: OperationsAttentionTask): number {
  const severityDelta = severityRank(right.severity) - severityRank(left.severity);
  if (severityDelta !== 0) return severityDelta;

  if (left.status === 'in_review' && right.status !== 'in_review') return -1;
  if (right.status === 'in_review' && left.status !== 'in_review') return 1;

  const leftAge = left.lastActivityAgeMs ?? -1;
  const rightAge = right.lastActivityAgeMs ?? -1;
  if (rightAge !== leftAge) return rightAge - leftAge;

  return String(left.id).localeCompare(String(right.id));
}

function choosePrimaryAttentionTask(
  tasks: OperationsAttentionTask[],
  preferredTaskId: string | null,
): OperationsAttentionTask | null {
  if (!tasks.length) return null;
  if (preferredTaskId) {
    const exactMatch = tasks.find((task) => task.id === preferredTaskId);
    if (exactMatch) return exactMatch;
  }
  return [...tasks].sort(compareAttentionTasks)[0] || null;
}

function choosePrimaryBoardTask(tasks: BoardTask[], preferredTaskId: string | null): BoardTask | null {
  if (!tasks.length) return null;
  if (preferredTaskId) {
    const exactMatch = tasks.find((task) => task.id === preferredTaskId);
    if (exactMatch) return exactMatch;
  }
  const reviewTask = tasks.find((task) => getTaskStatus(task) === 'in_review');
  return reviewTask || tasks[0] || null;
}

function formatTaskReference(taskId: string | null, activeTaskCount: number): string | null {
  if (!taskId) return null;
  const extraCount = activeTaskCount > 1 ? ` (+${activeTaskCount - 1})` : '';
  return `${taskId}${extraCount}`;
}

function buildDescription(params: {
  kind: OperationalAgentStateKind;
  reason: string | null;
  laneState: string;
  taskId: string | null;
  backendTaskText: string | null;
  activeTaskCount: number;
}): string {
  const { kind, reason, laneState, taskId, backendTaskText, activeTaskCount } = params;
  const taskRef = formatTaskReference(taskId, activeTaskCount);

  switch (kind) {
    case 'meeting':
      return 'Em reuniao';
    case 'reviewing':
      if (laneState === 'integrating') {
        return taskRef ? `Finalizando review ${taskRef}` : 'Finalizando review';
      }
      return taskRef ? `Revisando ${taskRef}` : backendTaskText || 'Revisando entrega';
    case 'recovering':
      if (laneState === 'retry_scheduled') {
        return taskRef ? `Retentativa agendada ${taskRef}` : 'Retentativa agendada';
      }
      if (reason === 'stalled_review') {
        return taskRef ? `Retomando review ${taskRef}` : 'Retomando review';
      }
      if (reason === 'awaiting_resume') {
        return taskRef ? `Aguardando retomada ${taskRef}` : 'Aguardando retomada';
      }
      if (reason === 'queued') {
        return taskRef ? `Na fila ${taskRef}` : 'Na fila';
      }
      return taskRef ? `Recuperando ${taskRef}` : backendTaskText || 'Recuperando execucao';
    case 'suspicious':
      if (laneState === 'failed') {
        return taskRef ? `Falha operacional ${taskRef}` : 'Falha operacional';
      }
      if (reason === 'silent_review') {
        return taskRef ? `Review sem logs ${taskRef}` : 'Review sem logs';
      }
      if (reason === 'active_without_assignee') {
        return taskRef ? `Sem assignee ${taskRef}` : 'Card ativo sem assignee';
      }
      return taskRef ? `Execucao silenciosa ${taskRef}` : 'Execucao silenciosa';
    case 'working':
      if (laneState === 'preparing_workspace') {
        return taskRef ? `Preparando ${taskRef}` : 'Preparando workspace';
      }
      if (laneState === 'integrating') {
        return taskRef ? `Integrando ${taskRef}` : 'Integrando mudancas';
      }
      return taskRef ? `Implementando ${taskRef}` : backendTaskText || 'Executando task';
    case 'waiting':
      if (laneState === 'queued') {
        return taskRef ? `Na fila ${taskRef}` : 'Na fila';
      }
      return backendTaskText || 'Aguardando acao';
    default:
      return activeTaskCount > 0 ? 'Sem execucao vinculada' : 'Sem task ativa';
  }
}

function deriveKind(params: {
  backendState: string;
  laneState: string;
  attentionTask: OperationsAttentionTask | null;
  fallbackTaskStatus: string;
  activeTaskCount: number;
}): OperationalAgentStateKind {
  const { backendState, laneState, attentionTask, fallbackTaskStatus, activeTaskCount } = params;

  if (backendState === 'meeting') return 'meeting';

  if (attentionTask) {
    if (
      ['stalled_review', 'stalled_execution', 'awaiting_resume', 'queued'].includes(
        attentionTask.reason,
      )
    ) {
      return 'recovering';
    }

    if (
      ['silent_review', 'silent_execution', 'active_without_assignee'].includes(
        attentionTask.reason,
      )
    ) {
      return 'suspicious';
    }

    if (attentionTask.status === 'in_review') return 'reviewing';
    return 'working';
  }

  if (SUSPICIOUS_LANE_STATES.has(laneState)) return 'suspicious';
  if (RECOVERING_LANE_STATES.has(laneState)) return 'recovering';
  if (WAITING_LANE_STATES.has(laneState)) return 'waiting';
  if (fallbackTaskStatus === 'in_review') return 'reviewing';
  if (WORKING_LANE_STATES.has(laneState)) {
    return fallbackTaskStatus === 'in_review' ? 'reviewing' : 'working';
  }
  if (activeTaskCount > 0 || ACTIVE_BACKEND_STATES.has(backendState)) return 'working';
  if (WAITING_BACKEND_STATES.has(backendState)) return 'waiting';
  return 'idle';
}

export function buildOperationalAgentStates(
  backendAgents: BackendAgent[],
  tasks: BoardTask[],
  snapshot: OperationsSnapshot | null,
): Record<number, OperationalAgentState> {
  const currentInstanceId = normalizeInstanceValue(snapshot?.instanceId || null);
  const attentionByAssignee = new Map<string, OperationsAttentionTask[]>();
  for (const task of snapshot?.attention?.tasks || []) {
    const assignee = String(task.assignee || '').trim();
    if (!assignee) continue;
    const current = attentionByAssignee.get(assignee) || [];
    current.push(task);
    attentionByAssignee.set(assignee, current);
  }

  const activeTasksByAssignee = new Map<string, BoardTask[]>();
  for (const task of tasks) {
    if (!ACTIVE_TASK_STATUSES.has(getTaskStatus(task))) continue;
    if (isForeignOwnedTask(task, currentInstanceId)) continue;
    const assignee = String(task.assignee || '').trim();
    if (!assignee) continue;
    const current = activeTasksByAssignee.get(assignee) || [];
    current.push(task);
    activeTasksByAssignee.set(assignee, current);
  }

  return backendAgents.reduce<Record<number, OperationalAgentState>>((acc, agent, index) => {
    const backendId = String(agent.id || '').trim();
    const agentId = getNumericAgentId(backendId, index);
    const backendState = String(agent.state || agent.status || '').trim().toLowerCase();
    const laneState = String(agent.laneState || '').trim().toLowerCase();
    const preferredTaskId =
      String(agent.currentTaskId || agent.activeTaskId || agent.laneTaskId || '').trim() || null;
    const attentionTask = choosePrimaryAttentionTask(
      attentionByAssignee.get(backendId) || [],
      preferredTaskId,
    );
    const boardTask = choosePrimaryBoardTask(
      activeTasksByAssignee.get(backendId) || [],
      preferredTaskId,
    );
    const taskId = attentionTask?.id || boardTask?.id || preferredTaskId || null;
    const taskTitle = attentionTask?.title || boardTask?.title || getAgentTaskText(agent);
    const fallbackTaskStatus = getTaskStatus(boardTask);
    const activeTaskCount = Math.max(
      attentionByAssignee.get(backendId)?.length || 0,
      activeTasksByAssignee.get(backendId)?.length || 0,
      preferredTaskId && laneState && laneState !== 'completed' && laneState !== 'cancelled' ? 1 : 0,
    );
    const kind = deriveKind({
      backendState,
      laneState,
      attentionTask,
      fallbackTaskStatus,
      activeTaskCount,
    });
    const meta = OPERATIONAL_KIND_META[kind];
    const backendTaskText = getAgentTaskText(agent);

    acc[agentId] = {
      agentId,
      backendId,
      kind,
      label: meta.label,
      description: buildDescription({
        kind,
        reason: attentionTask?.reason || null,
        laneState,
        taskId,
        backendTaskText,
        activeTaskCount,
      }),
      taskId,
      taskTitle,
      reason: attentionTask?.reason || null,
      severity: attentionTask?.severity || 'ok',
      activeTaskCount,
      accentColor: meta.accentColor,
      badgeBackground: meta.badgeBackground,
      provider: agent.currentProvider || agent.llmProvider || null,
      model: agent.currentModel || agent.model || null,
    };

    return acc;
  }, {});
}
