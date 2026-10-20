import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RH_MCP_OPTIONS } from '../src/components/rhConfig.js';

test('RH MCP catalog includes figma bridge option', () => {
  const ids = RH_MCP_OPTIONS.map((option) => option.id);
  assert.ok(ids.includes('figma'));

  const figmaOption = RH_MCP_OPTIONS.find((option) => option.id === 'figma');
  assert.equal(figmaOption?.label, 'Figma (Design context)');
});

test('RH MCP catalog includes stitch bridge option', () => {
  const ids = RH_MCP_OPTIONS.map((option) => option.id);
  assert.ok(ids.includes('stitch'));

  const stitchOption = RH_MCP_OPTIONS.find((option) => option.id === 'stitch');
  assert.equal(stitchOption?.label, 'Stitch (Remote MCP)');
});
