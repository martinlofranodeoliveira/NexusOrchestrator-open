import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveBackendOrigin } from '../src/backend.ts';

test('resolveBackendOrigin uses the current HTTP origin for local project instances on custom ports', () => {
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        protocol: 'http:',
        hostname: '127.0.0.1',
        origin: 'http://127.0.0.1:4001',
      },
    },
  });

  try {
    assert.equal(resolveBackendOrigin(), 'http://127.0.0.1:4001');
  } finally {
    if (typeof originalWindow === 'undefined') {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  }
});

test('resolveBackendOrigin falls back to localhost:4000 outside browser http contexts', () => {
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        protocol: 'vscode-webview:',
        hostname: '',
        origin: 'vscode-webview://workspace',
      },
    },
  });

  try {
    assert.equal(resolveBackendOrigin(), 'http://localhost:4000');
  } finally {
    if (typeof originalWindow === 'undefined') {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  }
});
