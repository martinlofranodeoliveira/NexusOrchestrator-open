import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FleetStatusBar } from '../src/components/FleetStatusBar.js';
import type { OperationsSnapshot } from '../src/operationsTypes.js';

function render(snapshot: OperationsSnapshot) {
  return renderToStaticMarkup(createElement(FleetStatusBar, {
    snapshot,
    onOpenBoard() { throw new Error('Rendering must not invoke actions'); },
    onRefresh() { throw new Error('Rendering must not invoke actions'); },
  }));
}

test('normal Nexus mode keeps its existing interface', () => {
  assert.equal(render({}), '');
});

test('live fleet shows actual active and preparing counts plus queue', () => {
  const html = render({
    settings: { externalFleet: { enabled: true, state: 'live', updatedAtMs: 1 } },
    runs: { active: 2, preparing: 1, queued: 4 },
  });
  assert.match(html, /3 em atividade/);
  assert.match(html, /4 na fila/);
  assert.match(html, /role="status">Conectado/);
  assert.match(html, /Atualizar estado do laboratório/);
});

for (const state of ['stale', 'unavailable'] as const) {
  test(`${state} never presents previous active counts as current work`, () => {
    const html = render({
      settings: { externalFleet: { enabled: true, state, updatedAtMs: null } },
      runs: { active: 10, preparing: 3, queued: 0 },
    });
    assert.match(html, /0 em atividade/);
    assert.doesNotMatch(html, /13 em atividade/);
    assert.match(html, /A atividade atual dos agentes não foi confirmada/);
  });
}

test('disabled external mode does not introduce a fleet bar', () => {
  assert.equal(render({ settings: { externalFleet: { enabled: false, state: 'live', updatedAtMs: 1 } } }), '');
});
