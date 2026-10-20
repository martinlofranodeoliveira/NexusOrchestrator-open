/**
 * Contagem sintética de estados de tarefas por status literal.
 *
 * Escopo: recebe apenas linhas `{ status: string }` e retorna somente
 * `{ total, todo, doing, done, blocked, other }`.
 * Não lê títulos, prompts ou identificadores, não muta a entrada e não
 * conecta backend/agentes. A contagem é literal e sensível a maiúsculas:
 * apenas `'todo'`, `'doing'`, `'done'` e `'blocked'` têm baldes próprios;
 * qualquer outra string cai em `other`. Nenhuma inferência além das
 * contagens é feita.
 */

export interface TaskStatusRow {
  status: string;
}

export interface TaskSummaryCounts {
  total: number;
  todo: number;
  doing: number;
  done: number;
  blocked: number;
  other: number;
}

export const MAX_TASK_SUMMARY_ROWS = 10000;

/**
 * Resume estados de tarefas sem títulos ou prompts.
 *
 * @param rows array com até 10000 objetos `{ status: string }`.
 * @returns somente `{ total, todo, doing, done, blocked, other }`.
 * @throws TypeError('INVALID_TASK_SUMMARY_INPUT') para entrada malformada ou excesso.
 */
export function summarizeTaskStatuses(rows: readonly TaskStatusRow[]): TaskSummaryCounts {
  if (!Array.isArray(rows)) {
    throw new TypeError('INVALID_TASK_SUMMARY_INPUT');
  }
  if (rows.length > MAX_TASK_SUMMARY_ROWS) {
    throw new TypeError('INVALID_TASK_SUMMARY_INPUT');
  }

  let todo = 0;
  let doing = 0;
  let done = 0;
  let blocked = 0;

  for (const row of rows) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new TypeError('INVALID_TASK_SUMMARY_INPUT');
    }
    const status = (row as { status?: unknown }).status;
    if (typeof status !== 'string') {
      throw new TypeError('INVALID_TASK_SUMMARY_INPUT');
    }
    if (status === 'todo') {
      todo += 1;
    } else if (status === 'doing') {
      doing += 1;
    } else if (status === 'done') {
      done += 1;
    } else if (status === 'blocked') {
      blocked += 1;
    }
  }

  const total = rows.length;
  const other = total - todo - doing - done - blocked;
  return { total, todo, doing, done, blocked, other };
}
