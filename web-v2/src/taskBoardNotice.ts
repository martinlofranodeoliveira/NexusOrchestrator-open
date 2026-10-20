/**
 * Descritor sintético de aviso do quadro de tarefas.
 *
 * Escopo: descreve apenas estados do quadro com metadados acessíveis
 * (`state`, `role`, `ariaLive`, `ariaBusy`, `message`, `action`) a partir de
 * `{ connection, loading, taskCount }` fornecidos pelo chamador.
 * Não lê títulos/prompts/identificadores, não consulta relógio/rede,
 * não muta a entrada e não ativa serviços, backend ou agentes.
 */

export type TaskBoardNoticeConnection = 'connecting' | 'online' | 'offline';
export type TaskBoardNoticeState = 'loading' | 'offline' | 'empty' | 'ready';

export interface TaskBoardNoticeAction {
  id: 'retry' | 'create-task';
  label: string;
}

export interface TaskBoardNotice {
  state: TaskBoardNoticeState;
  role: 'status';
  ariaLive: 'polite';
  ariaBusy: boolean;
  message: string;
  action: TaskBoardNoticeAction | null;
}

const INVALID_MESSAGE = 'INVALID_TASK_BOARD_NOTICE_INPUT';

/**
 * Constrói um descritor de aviso do quadro sem efeitos colaterais.
 *
 * @param input objeto simples com `{ connection, loading, taskCount }`.
 * @returns descritor novo com `{ state, role, ariaLive, ariaBusy, message, action }`.
 * @throws TypeError('INVALID_TASK_BOARD_NOTICE_INPUT') para entrada malformada.
 */
export function buildTaskBoardNotice(input: unknown): TaskBoardNotice {
  let connectionValue: unknown;
  let loadingValue: unknown;
  let taskCountValue: unknown;
  try {
    if (typeof input !== 'object' || input === null) {
      throw new TypeError(INVALID_MESSAGE);
    }
    if (Array.isArray(input)) {
      throw new TypeError(INVALID_MESSAGE);
    }
    const proto: unknown = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError(INVALID_MESSAGE);
    }
    const connectionDesc = Object.getOwnPropertyDescriptor(input, 'connection');
    const loadingDesc = Object.getOwnPropertyDescriptor(input, 'loading');
    const taskCountDesc = Object.getOwnPropertyDescriptor(input, 'taskCount');
    if (connectionDesc === undefined || loadingDesc === undefined || taskCountDesc === undefined) {
      throw new TypeError(INVALID_MESSAGE);
    }
    if ('get' in connectionDesc || 'set' in connectionDesc) {
      throw new TypeError(INVALID_MESSAGE);
    }
    if ('get' in loadingDesc || 'set' in loadingDesc) {
      throw new TypeError(INVALID_MESSAGE);
    }
    if ('get' in taskCountDesc || 'set' in taskCountDesc) {
      throw new TypeError(INVALID_MESSAGE);
    }
    if (!('value' in connectionDesc) || !('value' in loadingDesc) || !('value' in taskCountDesc)) {
      throw new TypeError(INVALID_MESSAGE);
    }
    connectionValue = connectionDesc.value;
    loadingValue = loadingDesc.value;
    taskCountValue = taskCountDesc.value;
    if (typeof connectionValue !== 'string') {
      throw new TypeError(INVALID_MESSAGE);
    }
    if (connectionValue !== 'connecting' && connectionValue !== 'online' && connectionValue !== 'offline') {
      throw new TypeError(INVALID_MESSAGE);
    }
    if (typeof loadingValue !== 'boolean') {
      throw new TypeError(INVALID_MESSAGE);
    }
    if (typeof taskCountValue !== 'number') {
      throw new TypeError(INVALID_MESSAGE);
    }
    if (!Number.isSafeInteger(taskCountValue)) {
      throw new TypeError(INVALID_MESSAGE);
    }
    if (!Number.isFinite(taskCountValue)) {
      throw new TypeError(INVALID_MESSAGE);
    }
    if (taskCountValue < 0 || taskCountValue > 10000) {
      throw new TypeError(INVALID_MESSAGE);
    }
  } catch {
    throw new TypeError(INVALID_MESSAGE);
  }
  const connection = connectionValue as TaskBoardNoticeConnection;
  const loading = loadingValue as boolean;
  const rawCount = taskCountValue as number;
  const taskCount = rawCount === 0 ? 0 : rawCount;
  if (connection === 'offline') {
    return {
      state: 'offline',
      role: 'status',
      ariaLive: 'polite',
      ariaBusy: false,
      message: 'Servidor local indisponível.',
      action: { id: 'retry', label: 'Tentar novamente' },
    };
  }
  if (connection === 'connecting' || loading === true) {
    return {
      state: 'loading',
      role: 'status',
      ariaLive: 'polite',
      ariaBusy: true,
      message: 'Carregando tarefas.',
      action: null,
    };
  }
  if (taskCount === 0) {
    return {
      state: 'empty',
      role: 'status',
      ariaLive: 'polite',
      ariaBusy: false,
      message: 'Não há tarefas para mostrar.',
      action: { id: 'create-task', label: 'Criar tarefa' },
    };
  }
  return {
    state: 'ready',
    role: 'status',
    ariaLive: 'polite',
    ariaBusy: false,
    message: 'Tarefas disponíveis.',
    action: null,
  };
}
