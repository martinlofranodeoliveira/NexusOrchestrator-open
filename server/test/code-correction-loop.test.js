const test = require('node:test');
const assert = require('node:assert/strict');

const {
  focusValidationFailure,
  runCodeCorrectionLoop,
} = require('../services/codeCorrectionLoop');

test('code correction loop returns after the configured gate passes', async () => {
  const calls = [];
  const result = await runCodeCorrectionLoop({
    provider: 'openai_compat',
    model: 'gpt-oss:20b',
    prompt: 'Implemente a task.',
    validationCommand: 'npm test',
    runLoop: async (options) => {
      calls.push(options);
      return { ok: true, provider: options.provider, model: options.model, text: 'feito' };
    },
    validationRunner: async () => ({ ok: true, exitCode: 0, stdout: 'ok', stderr: '' }),
  });

  assert.equal(calls.length, 1);
  assert.equal(result.validation.command, 'npm test');
  assert.equal(result.validation.attempts, 1);
});

test('code correction loop batches retries on one model before switching to the fallback', async () => {
  const runtimes = [];
  const prompts = [];
  let validationCall = 0;
  const result = await runCodeCorrectionLoop({
    provider: 'openai_compat',
    model: 'qwen3.6:35b-a3b-mtp-q4_K_M',
    fallbackChain: ['openai_compat/gpt-oss:20b'],
    prompt: 'Corrija o projeto.',
    validationCommand: 'npm test',
    attemptsPerModel: 2,
    runLoop: async (options) => {
      runtimes.push(options.model);
      prompts.push(options.prompt);
      return { ok: true, provider: options.provider, model: options.model, text: 'feito' };
    },
    validationRunner: async () => {
      validationCall += 1;
      if (validationCall < 3) {
        return {
          ok: false,
          exitCode: 1,
          stdout: 'not ok 1 - soma\nAssertionError: expected 2, actual 3',
          stderr: '',
        };
      }
      return { ok: true, exitCode: 0, stdout: 'ok', stderr: '' };
    },
  });

  assert.deepEqual(runtimes, [
    'qwen3.6:35b-a3b-mtp-q4_K_M',
    'qwen3.6:35b-a3b-mtp-q4_K_M',
    'gpt-oss:20b',
  ]);
  assert.match(prompts[1], /AssertionError: expected 2, actual 3/);
  assert.match(prompts[2], /AssertionError: expected 2, actual 3/);
  assert.equal(result.validation.runtime, 'openai_compat/gpt-oss:20b');
});

test('code correction loop exits with an error after every local model exhausts its attempts', async () => {
  await assert.rejects(
    runCodeCorrectionLoop({
      provider: 'openai_compat',
      model: 'gpt-oss:20b',
      fallbackChain: ['openai_compat/qwen3.6:35b-a3b-mtp-q4_K_M'],
      prompt: 'Corrija.',
      validationCommand: 'npm test',
      attemptsPerModel: 1,
      runLoop: async (options) => ({ ok: true, provider: options.provider, model: options.model }),
      validationRunner: async () => ({
        ok: false,
        exitCode: 1,
        stdout: 'not ok 1 - ainda falha',
        stderr: '',
      }),
    }),
    (error) => error.code === 'NEXUS_TEST_CORRECTION_EXHAUSTED' && error.exitCode === 1,
  );
});

test('failure truncation keeps the failure region instead of the tail', () => {
  const output = [
    ...Array.from({ length: 100 }, (_, index) => `prelude ${index}`),
    'not ok 1 - causa importante',
    'AssertionError: expected true, actual false',
    ...Array.from({ length: 500 }, (_, index) => `ruido posterior ${index}`),
  ].join('\n');

  const focused = focusValidationFailure(output, 700);
  assert.match(focused, /causa importante/);
  assert.match(focused, /expected true, actual false/);
  assert.doesNotMatch(focused, /ruido posterior 499/);
});
