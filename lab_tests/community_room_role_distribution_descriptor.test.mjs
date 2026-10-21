import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFeature } from '../web-v2/src/community/room_role_distribution_descriptor.mjs';

test('empty roles map returns zeros and empty flags', () => {
  const out = runFeature({ roles: {} });
  assert.deepEqual(out, { roleCount: 0, totalAssignments: 0, hasRoles: false, isEmpty: true });
});

test('single role entry returns count one and exact total', () => {
  const out = runFeature({ roles: { builder: 2 } });
  assert.deepEqual(out, { roleCount: 1, totalAssignments: 2, hasRoles: true, isEmpty: false });
});

test('multiple role entries return exact sum and flags', () => {
  const out = runFeature({ roles: { builder: 2, reviewer: 3 } });
  assert.deepEqual(out, { roleCount: 2, totalAssignments: 5, hasRoles: true, isEmpty: false });
  const out2 = runFeature({ roles: { a: 0, b: 10000, c: 10 } });
  assert.deepEqual(out2, { roleCount: 3, totalAssignments: 10010, hasRoles: true, isEmpty: false });
});

test('extra props ignored, input never mutated, fresh output', () => {
  const input = { roles: { a: 1, b: 2 }, extra: 42, other: 'x' };
  const before = JSON.stringify(input);
  const beforeRoles = JSON.stringify(input.roles);
  const first = runFeature(input);
  const second = runFeature(input);
  assert.deepEqual(first, { roleCount: 2, totalAssignments: 3, hasRoles: true, isEmpty: false });
  assert.deepEqual(second, first);
  assert.notEqual(first, second);
  assert.equal(JSON.stringify(input), before);
  assert.equal(JSON.stringify(input.roles), beforeRoles);
  first.roleCount = 999;
  const third = runFeature(input);
  assert.equal(third.roleCount, 2);
});

test('malformed payloads throw TypeError without echo', () => {
  const badInputs = [
    null,
    undefined,
    42,
    'roles',
    true,
    [],
    {},
    { roles: null },
    { roles: undefined },
    { roles: 42 },
    { roles: 'x' },
    { roles: [] },
    { roles: { '': 1 } },
    { roles: { a: 1.5 } },
    { roles: { a: '1' } },
    { roles: { a: null } },
    { roles: { a: true } },
    { roles: { a: -1 } },
    { roles: { a: 10001 } },
    { roles: { a: NaN } },
    { roles: { a: Infinity } },
    { roles: { a: -Infinity } }
  ];
  for (const value of badInputs) {
    assert.throws(() => runFeature(value), (err) => {
      assert.ok(err instanceof TypeError);
      assert.equal(err.message, 'INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
      return true;
    });
  }
});

test('bad keys and ranges throw', () => {
  assert.throws(() => runFeature({ roles: { ['a'.repeat(65)]: 1 } }), (err) => err instanceof TypeError && err.message === 'INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
  assert.throws(() => runFeature({ roles: { '\u0000': 1 } }), (err) => err instanceof TypeError && err.message === 'INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
  assert.throws(() => runFeature({ roles: { 'a\u0001b': 1 } }), (err) => err instanceof TypeError && err.message === 'INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
  assert.throws(() => runFeature({ roles: { '\uD800': 1 } }), (err) => err instanceof TypeError && err.message === 'INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
  assert.throws(() => runFeature({ roles: { 'a\uDFFFb': 1 } }), (err) => err instanceof TypeError && err.message === 'INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
  const many = { roles: {} };
  for (let i = 0; i < 101; i += 1) {
    many.roles['k' + i] = 1;
  }
  assert.throws(() => runFeature(many), (err) => err instanceof TypeError && err.message === 'INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
});

test('allowed controls and unicode pass, deterministic pure', () => {
  const withControls = runFeature({ roles: { 'a\tb': 1, 'c\nd': 2, 'e\rf': 3 } });
  assert.equal(withControls.roleCount, 3);
  assert.equal(withControls.totalAssignments, 6);
  assert.equal(withControls.hasRoles, true);
  assert.equal(withControls.isEmpty, false);
  const withEmoji = runFeature({ roles: { '\uD83D\uDE00': 4 } });
  assert.deepEqual(withEmoji, { roleCount: 1, totalAssignments: 4, hasRoles: true, isEmpty: false });
  const first = runFeature({ roles: { x: 5, y: 7 } });
  const second = runFeature({ roles: { x: 5, y: 7 } });
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
});
