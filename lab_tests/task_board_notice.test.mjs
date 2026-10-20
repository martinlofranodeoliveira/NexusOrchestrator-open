import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildTaskBoardNotice } from '../web-v2/src/taskBoardNotice.ts';

function invalidInputThrows(input) {
  assert.throws(
    () => {
      buildTaskBoardNotice(input);
    },
    (err) => err instanceof TypeError && err.message === 'INVALID_TASK_BOARD_NOTICE_INPUT',
  );
}

describe('buildTaskBoardNotice estados', () => {
  it('offline tem prioridade sobre loading e contagem', () => {
    assert.deepEqual(buildTaskBoardNotice({ connection: 'offline', loading: true, taskCount: 5 }), {
      state: 'offline',
      role: 'status',
      ariaLive: 'polite',
      ariaBusy: false,
      message: 'Servidor local indisponível.',
      action: { id: 'retry', label: 'Tentar novamente' },
    });
    assert.deepEqual(buildTaskBoardNotice({ connection: 'offline', loading: false, taskCount: 0 }), {
      state: 'offline',
      role: 'status',
      ariaLive: 'polite',
      ariaBusy: false,
      message: 'Servidor local indisponível.',
      action: { id: 'retry', label: 'Tentar novamente' },
    });
  });

  it('loading via connecting ou flag loading', () => {
    assert.deepEqual(buildTaskBoardNotice({ connection: 'connecting', loading: false, taskCount: 0 }), {
      state: 'loading',
      role: 'status',
      ariaLive: 'polite',
      ariaBusy: true,
      message: 'Carregando tarefas.',
      action: null,
    });
    assert.deepEqual(buildTaskBoardNotice({ connection: 'online', loading: true, taskCount: 4 }), {
      state: 'loading',
      role: 'status',
      ariaLive: 'polite',
      ariaBusy: true,
      message: 'Carregando tarefas.',
      action: null,
    });
    assert.deepEqual(buildTaskBoardNotice({ connection: 'connecting', loading: true, taskCount: 7 }), {
      state: 'loading',
      role: 'status',
      ariaLive: 'polite',
      ariaBusy: true,
      message: 'Carregando tarefas.',
      action: null,
    });
  });

  it('empty e ready dependem da contagem com online sem loading', () => {
    assert.deepEqual(buildTaskBoardNotice({ connection: 'online', loading: false, taskCount: 0 }), {
      state: 'empty',
      role: 'status',
      ariaLive: 'polite',
      ariaBusy: false,
      message: 'Não há tarefas para mostrar.',
      action: { id: 'create-task', label: 'Criar tarefa' },
    });
    assert.deepEqual(buildTaskBoardNotice({ connection: 'online', loading: false, taskCount: 2 }), {
      state: 'ready',
      role: 'status',
      ariaLive: 'polite',
      ariaBusy: false,
      message: 'Tarefas disponíveis.',
      action: null,
    });
  });

  it('-0 é tratado como 0', () => {
    const notice = buildTaskBoardNotice({ connection: 'online', loading: false, taskCount: -0 });
    assert.equal(notice.state, 'empty');
    assert.equal(notice.message, 'Não há tarefas para mostrar.');
  });

  it('valida os três campos antes de escolher offline ou loading', () => {
    invalidInputThrows({ connection: 'offline', loading: false });
    invalidInputThrows({ connection: 'offline', taskCount: 1 });
    invalidInputThrows({ loading: false, taskCount: 1 });
    invalidInputThrows({ connection: 'offline', loading: 'não', taskCount: 1 });
    invalidInputThrows({ connection: 'connecting', loading: false, taskCount: Number.NaN });
    invalidInputThrows({ connection: 'online', loading: true });
  });

  it('rejeita formas e protótipos inválidos', () => {
    invalidInputThrows(null);
    invalidInputThrows(undefined);
    invalidInputThrows('online');
    invalidInputThrows(42);
    invalidInputThrows([]);
    invalidInputThrows([{ connection: 'online', loading: false, taskCount: 1 }]);
    invalidInputThrows(Object.assign(['x'], { connection: 'online', loading: false, taskCount: 1 }));
    invalidInputThrows(Object.create({ connection: 'online', loading: false, taskCount: 1 }));
    class Custom {
      constructor() {
        this.connection = 'online';
        this.loading = false;
        this.taskCount = 1;
      }
    }
    invalidInputThrows(new Custom());
  });

  it('aceita objeto simples e objeto com protótipo nulo', () => {
    const fromNull = Object.assign(Object.create(null), {
      connection: 'online',
      loading: false,
      taskCount: 1,
    });
    assert.equal(buildTaskBoardNotice(fromNull).state, 'ready');
    assert.equal(buildTaskBoardNotice({ connection: 'online', loading: false, taskCount: 0 }).state, 'empty');
  });

  it('rejeita ausente, herdado, acessor, undefined, encaixotado ou coagido', () => {
    invalidInputThrows({ connection: 'online', loading: false, taskCount: undefined });
    invalidInputThrows({ connection: new String('online'), loading: false, taskCount: 1 });
    invalidInputThrows({ connection: 'online', loading: new Boolean(false), taskCount: 1 });
    invalidInputThrows({ connection: 'online', loading: false, taskCount: new Number(1) });
    invalidInputThrows({ connection: 'online', loading: 0, taskCount: 1 });
    invalidInputThrows({ connection: 'online', loading: false, taskCount: '1' });
    const inherited = Object.create({ connection: 'online', loading: false, taskCount: 1 });
    invalidInputThrows(inherited);
    const withGetter = {};
    Object.defineProperty(withGetter, 'connection', { get() { return 'online'; }, enumerable: true, configurable: true });
    withGetter.loading = false;
    withGetter.taskCount = 1;
    invalidInputThrows(withGetter);
    const withSetterOnly = {};
    Object.defineProperty(withSetterOnly, 'loading', { set(_v) {}, enumerable: true, configurable: true });
    withSetterOnly.connection = 'online';
    withSetterOnly.taskCount = 1;
    invalidInputThrows(withSetterOnly);
  });

  it('rejeita literais e intervalos inválidos', () => {
    invalidInputThrows({ connection: 'OFFLINE', loading: false, taskCount: 0 });
    invalidInputThrows({ connection: '', loading: false, taskCount: 0 });
    invalidInputThrows({ connection: 'online ', loading: false, taskCount: 0 });
    invalidInputThrows({ connection: 'online', loading: false, taskCount: -1 });
    invalidInputThrows({ connection: 'online', loading: false, taskCount: 10001 });
    invalidInputThrows({ connection: 'online', loading: false, taskCount: 1.5 });
    invalidInputThrows({ connection: 'online', loading: false, taskCount: Number.POSITIVE_INFINITY });
    invalidInputThrows({ connection: 'online', loading: false, taskCount: Number.NaN });
  });

  it('ignora campos desconhecidos sem ler seus valores', () => {
    const input = { connection: 'online', loading: false, taskCount: 1 };
    Object.defineProperty(input, 'extra', {
      get() { throw new Error('não deve ler'); },
      enumerable: true,
      configurable: true,
    });
    const notice = buildTaskBoardNotice(input);
    assert.equal(notice.state, 'ready');
    const sym = Symbol('extra');
    const withSymbol = { connection: 'online', loading: false, taskCount: 0 };
    Object.defineProperty(withSymbol, sym, {
      get() { throw new Error('não deve ler símbolo'); },
      enumerable: true,
      configurable: true,
    });
    assert.equal(buildTaskBoardNotice(withSymbol).state, 'empty');
  });

  it('retorna objetos novos com chaves exatas e sem alias entre chamadas', () => {
    const first = buildTaskBoardNotice({ connection: 'offline', loading: false, taskCount: 0 });
    const second = buildTaskBoardNotice({ connection: 'offline', loading: false, taskCount: 0 });
    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.action, second.action);
    assert.deepEqual(Object.keys(first).sort(), ['action', 'ariaBusy', 'ariaLive', 'message', 'role', 'state']);
    assert.deepEqual(Object.keys(first.action).sort(), ['id', 'label']);
    for (const key of ['state', 'role', 'ariaLive', 'ariaBusy', 'message', 'action']) {
      const desc = Object.getOwnPropertyDescriptor(first, key);
      assert.ok(desc !== undefined && !('get' in desc) && !('set' in desc));
    }
    const emptyA = buildTaskBoardNotice({ connection: 'online', loading: false, taskCount: 0 });
    const emptyB = buildTaskBoardNotice({ connection: 'online', loading: false, taskCount: 0 });
    assert.notStrictEqual(emptyA.action, emptyB.action);
    const ready = buildTaskBoardNotice({ connection: 'online', loading: false, taskCount: 3 });
    assert.equal(ready.action, null);
  });

  it('não muta a entrada no sucesso ou na falha', () => {
    const input = { connection: 'online', loading: false, taskCount: 1 };
    const before = { ...input };
    buildTaskBoardNotice(input);
    assert.deepEqual(input, before);
    const bad = { connection: 'online', loading: false, taskCount: 1.5 };
    try {
      buildTaskBoardNotice(bad);
    } catch {}
    assert.deepEqual(bad, { connection: 'online', loading: false, taskCount: 1.5 });
  });

  it('erro não copia valores da entrada', () => {
    try {
      buildTaskBoardNotice({ connection: 'secreto', loading: false, taskCount: 1 });
      assert.fail('deveria lançar');
    } catch (err) {
      assert.ok(err instanceof TypeError);
      assert.equal(err.message, 'INVALID_TASK_BOARD_NOTICE_INPUT');
      assert.equal(String(err.message).includes('secreto'), false);
    }
  });
});
