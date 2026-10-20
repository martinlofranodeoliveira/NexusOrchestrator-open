const INTERNAL_RUNTIME_EVENT_PREFIX = '__NEXUS_EVENT__';

function encodeRuntimeEvent(event) {
  return `${INTERNAL_RUNTIME_EVENT_PREFIX}${JSON.stringify(event)}\n`;
}

function consumeRuntimeEventBuffer(buffer, rawChunk) {
  const merged = `${buffer || ''}${String(rawChunk || '')}`;
  const lines = merged.split('\n');
  const pending = lines.pop() || '';
  const events = [];
  const passthrough = [];

  lines.forEach((line) => {
    if (line.startsWith(INTERNAL_RUNTIME_EVENT_PREFIX)) {
      const payload = line.slice(INTERNAL_RUNTIME_EVENT_PREFIX.length);
      try {
        const parsed = JSON.parse(payload);
        if (parsed && typeof parsed === 'object') {
          events.push(parsed);
        }
      } catch (_error) {
        passthrough.push(line);
      }
      return;
    }
    passthrough.push(line);
  });

  return {
    buffer: pending,
    events,
    text: passthrough.join('\n'),
  };
}

module.exports = {
  INTERNAL_RUNTIME_EVENT_PREFIX,
  consumeRuntimeEventBuffer,
  encodeRuntimeEvent,
};
