import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTaskStatuses } from '../web-v2/src/taskSummary.ts';

function assertInvalid(fn, hint) {
  assert.throws(
    fn,
    (err) => err instanceof TypeError && err.message === 'INVALID_TASK_SUMMARY_INPUT',
    hint,
  );
}

describe('summarizeTaskStatuses sintético sem títulos/prompts', () => {
  it('array vazio retorna zeros', () => {
    assert.deepEqual(summarizeTaskStatuses([]), {
      total: 0,
      todo: 0,
      doing: 0,
      done: 0,
      blocked: 0,
      other: 0,
    });
  });

  it('conta status literais e agrupa desconhecidos em other', () => {
    const result = summarizeTaskStatuses([
      { status: 'todo' },
      { status: 'todo' },
      { status: 'doing' },
      { status: 'done' },
      { status: 'blocked' },
      { status: 'in_progress' },
      { status: 'review' },
      { status: '' },
    ]);
    assert.deepEqual(result, {
      total: 8,
      todo: 2,
      doing: 1,
      done: 1,
      blocked: 1,
      other: 3,
    });
  });

  it('contagem é literal e sensível a maiúsculas/espaços', () => {
    const result = summarizeTaskStatuses([
      { status: 'Todo' },
      { status: 'TODO' },
      { status: ' todo' },
      { status: 'todo ' },
      { status: 'todo' },
    ]);
    assert.equal(result.total, 5);
    assert.equal(result.todo, 1);
    assert.equal(result.other, 4);
    assert.equal(result.doing, 0);
    assert.equal(result.done, 0);
    assert.equal(result.blocked, 0);
  });

  it('retorna somente as 6 chaves e ignora título/prompt/identificador', () => {
    const result = summarizeTaskStatuses([
      { status: 'todo', title: 'Comprar café', prompt: 'secreto', id: 't-1' },
      { status: 'done', title: 'Outro', prompt: 'x', id: 't-2' },
    ]);
    assert.deepEqual(Object.keys(result).sort(), ['blocked', 'doing', 'done', 'other', 'todo', 'total']);
    assert.deepEqual(result, { total: 2, todo: 1, doing: 0, done: 1, blocked: 0, other: 0 });
    assert.equal('title' in result, false);
    assert.equal('prompt' in result, false);
    assert.equal('id' in result, false);
  });

  it('não muta a entrada e retorna objeto novo', () => {
    const input = [{ status: 'todo' }, { status: 'mystery' }];
    const before = JSON.stringify(input);
    const first = summarizeTaskStatuses(input);
    const second = summarizeTaskStatuses(input);
    assert.equal(JSON.stringify(input), before);
    assert.deepEqual(first, { total: 2, todo: 1, doing: 0, done: 0, blocked: 0, other: 1 });
    assert.notEqual(first, second);
    assert.deepEqual(input, [{ status: 'todo' }, { status: 'mystery' }]);
  });

  it('aceita entrada congelada sem mutar', () => {
    const input = Object.freeze([{ status: 'doing' }, { status: 'done' }]);
    const result = summarizeTaskStatuses(input);
    assert.deepEqual(result, { total: 2, todo: 0, doing: 1, done: 1, blocked: 0, other: 0 });
  });

  it('aceita exatamente 10000 linhas', () => {
    const rows = Array.from({ length: 10000 }, () => ({ status: 'todo' }));
    const result = summarizeTaskStatuses(rows);
    assert.equal(result.total, 10000);
    assert.equal(result.todo, 10000);
    assert.equal(result.other, 0);
  });

  it('rejeita entrada que não é array', () => {
    assertInvalid(() => summarizeTaskStatuses(null), 'null');
    assertInvalid(() => summarizeTaskStatuses(undefined), 'undefined');
    assertInvalid(() => summarizeTaskStatuses('todo'), 'string');
    assertInvalid(() => summarizeTaskStatuses({ length: 0 }), 'objeto');
    assertInvalid(() => summarizeTaskStatuses(42), 'número');
  });

  it('rejeita linhas malformadas sem vazar conteúdo', () => {
    assertInvalid(() => summarizeTaskStatuses([null]), 'nulo');
    assertInvalid(() => summarizeTaskStatuses([undefined]), 'indefinido');
    assertInvalid(() => summarizeTaskStatuses(['todo']), 'string no lugar de objeto');
    assertInvalid(() => summarizeTaskStatuses([[{ status: 'todo' }]]), 'array aninhado');
    assertInvalid(() => summarizeTaskStatuses([{}]), 'sem status');
    assertInvalid(() => summarizeTaskStatuses([{ status: 1 }]), 'status numérico');
    assertInvalid(() => summarizeTaskStatuses([{ status: null }]), 'status nulo');
    assertInvalid(() => summarizeTaskStatuses([{ status: undefined }]), 'status indefinido');
    assertInvalid(() => summarizeTaskStatuses([{ title: 'segredo' }]), 'só título');
    try {
      summarizeTaskStatuses([{ status: 123, title: 'SEGREDO-TITULO-XYZ' }]);
      assert.fail('deveria lançar');
    } catch (err) {
      assert.ok(err instanceof TypeError);
      assert.equal(err.message, 'INVALID_TASK_SUMMARY_INPUT');
      assert.equal(String(err).includes('SEGREDO-TITULO-XYZ'), false);
    }
  });

  it('rejeita excesso acima de 10000 sem conteúdo', () => {
    const rows = Array.from({ length: 10001 }, () => ({ status: 'todo' }));
    try {
      summarizeTaskStatuses(rows);
      assert.fail('deveria lançar por excesso');
    } catch (err) {
      assert.ok(err instanceof TypeError);
      assert.equal(err.message, 'INVALID_TASK_SUMMARY_INPUT');
    }
  });
});
