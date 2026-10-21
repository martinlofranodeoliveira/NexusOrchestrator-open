# NexusOrchestrator Open

Aplicação de orquestração de agentes com servidor Node/Express e interface React de escritório pixelado. Mantém o código funcional de tarefas, salas, políticas de despacho, integrações opcionais e frontend; o histórico e os dados da operação privada não fazem parte desta edição.

## Executar localmente

Requer Node.js 22 ou posterior. Instale as dependências em `server` e `web-v2`. Copie `.env.example` para `.env` e escolha uma pasta de trabalho própria; configure somente os provedores que pretende usar. Em terminais separados, inicie `node server/index.js` e o comando `npm run dev` de `web-v2`. O servidor usa loopback na porta 4000 por padrão.

Credenciais do usuário não são distribuídas. Despacho automático, retomada de órfãos e criação de tarefas de demonstração ficam desativados por padrão e exigem opt-in explícito. A interface pode ser aberta sem provisionar serviços; integrações externas precisam de configuração própria e podem consumir recursos quando acionadas pelo usuário. Esta edição não inclui implantação hospedada ou contas de provedores.

## Testes

Os testes de servidor e frontend foram preservados, incluindo os que estavam somente na cópia local; foi acrescentado um teste dos defaults da edição aberta. Passaram 330 testes do servidor, 11 da interface, checagem de sintaxe, TypeScript, ESLint e build Vite. A execução usou fontes e dependências somente leitura, ambiente sem credenciais e rede externa bloqueada; os hashes permaneceram iguais. Execute `npm test` em `server` e `web-v2`, e `npm run build`/`npm run lint` em `web-v2`. Provedores reais, GitHub/GitLab, serviços externos e execução autônoma não foram exercitados por essa validação.

## Resumo de estados de tarefas (sintético)

O helper `web-v2/src/taskSummary.ts` exporta `summarizeTaskStatuses(rows)` para contar apenas estados literais, sem ler títulos/prompts/identificadores e sem conectar backend/agentes.

Uso sintético dentro de `web-v2/src` (TypeScript):

```ts
import { summarizeTaskStatuses } from './taskSummary.js';

const summary = summarizeTaskStatuses([
  { status: 'todo' },
  { status: 'done' },
  { status: 'review' },
]);
// { total: 3, todo: 1, doing: 0, done: 1, blocked: 0, other: 1 }
```

Limites: a entrada deve ser um array com até 10000 objetos `{ status: string }`; array vazio é válido; qualquer entrada malformada ou acima do limite lança `TypeError('INVALID_TASK_SUMMARY_INPUT')` sem incluir conteúdo da entrada. A contagem é literal e sensível a maiúsculas (`todo`, `doing`, `done`, `blocked`; demais valores caem em `other`) e não muta a entrada. As contagens não inferem progresso, prioridade, autoria ou próximos passos.

## Aviso do quadro de tarefas (sintético)

O helper `web-v2/src/taskBoardNotice.ts` exporta `buildTaskBoardNotice(input)` para descrever apenas estados do quadro com metadados acessíveis, sem ativar serviços. A entrada deve ser um objeto simples com `{ connection, loading, taskCount }` sintéticos; qualquer forma malformada lança `TypeError('INVALID_TASK_BOARD_NOTICE_INPUT')`. A saída é um descritor novo com `{ state, role, ariaLive, ariaBusy, message, action }`, onde `role` é sempre `status` e `ariaLive` é sempre `polite`.

Casos sintéticos e prioridade (validar os três campos antes de escolher):

- `connection === 'offline'` sempre seleciona `offline` (`"Servidor local indisponível."`, `action` `{ id: 'retry', label: 'Tentar novamente' }`).
- Senão, `connection === 'connecting'` ou `loading === true` seleciona `loading` (`"Carregando tarefas."`, `action` `null`).
- Senão, `online` + `loading: false` + `taskCount === 0` seleciona `empty` (`"Não há tarefas para mostrar."`, `action` `{ id: 'create-task', label: 'Criar tarefa' }`).
- Senão seleciona `ready` (`"Tarefas disponíveis."`, `action` `null`).

```ts
import { buildTaskBoardNotice } from './taskBoardNotice.js';

buildTaskBoardNotice({ connection: 'offline', loading: false, taskCount: 3 });
// { state: 'offline', role: 'status', ariaLive: 'polite', ariaBusy: false, message: 'Servidor local indisponível.', action: { id: 'retry', label: 'Tentar novamente' } }
buildTaskBoardNotice({ connection: 'connecting', loading: false, taskCount: 0 });
// { state: 'loading', role: 'status', ariaLive: 'polite', ariaBusy: true, message: 'Carregando tarefas.', action: null }
buildTaskBoardNotice({ connection: 'online', loading: false, taskCount: 0 });
// { state: 'empty', role: 'status', ariaLive: 'polite', ariaBusy: false, message: 'Não há tarefas para mostrar.', action: { id: 'create-task', label: 'Criar tarefa' } }
buildTaskBoardNotice({ connection: 'online', loading: false, taskCount: 2 });
// { state: 'ready', role: 'status', ariaLive: 'polite', ariaBusy: false, message: 'Tarefas disponíveis.', action: null }
```

Exemplo sintético de adaptador React (somente dados locais, sem backend). O helper puro nunca invoca callbacks; o componente apenas repassa o clique para o callback local correspondente e nunca faz fetch/socket, executa comandos, despacha agentes nem repete/cria tarefas automaticamente:

```tsx
import { buildTaskBoardNotice } from './taskBoardNotice.js';

type TaskBoardConnection = 'connecting' | 'online' | 'offline';

interface TaskBoardNoticeProps {
  connection: TaskBoardConnection;
  loading: boolean;
  taskCount: number;
  onRetry: () => void;
  onCreateTask: () => void;
}

export function TaskBoardNoticeView({
  connection,
  loading,
  taskCount,
  onRetry,
  onCreateTask,
}: TaskBoardNoticeProps) {
  const notice = buildTaskBoardNotice({ connection, loading, taskCount });

  const handleAction = () => {
    if (notice.action === null) return;
    if (notice.action.id === 'retry') {
      onRetry();
    } else {
      onCreateTask();
    }
  };

  return (
    <div role={notice.role} aria-live={notice.ariaLive} aria-busy={notice.ariaBusy}>
      <span>{notice.message}</span>
      {notice.action !== null ? (
        <button type="button" onClick={handleAction}>
          {notice.action.label}
        </button>
      ) : null}
    </div>
  );
}

// Uso somente com dados sintéticos fornecidos pelo chamador:
// <TaskBoardNoticeView connection="online" loading={false} taskCount={0} onRetry={() => {}} onCreateTask={() => {}} />
```

Este exemplo e a API reutilizável de descritores são separados do `App`/`KanbanSidebar` existentes, que permanecem inalterados. Nenhuma renderização, interação de teclado/foco, conformidade de tecnologia assistiva, saúde de backend, anonimização, progresso ou segurança foi validada por esses testes puros; a integração real da UI e seus testes independentes de teclado/foco/ARIA continuam como trabalho revisado separado. Use apenas dados sintéticos, sem backend/provedor real ou configuração operacional.

## Exclusões e licença

Não estão incluídos `.env` da operação, handoffs internos, roteiro/seed específico de organização, configurações de implantação, scripts de espelhamento/publicação automática ou as duas imagens promocionais de origem não comprovada. O código útil da aplicação e sprites com proveniência pública permanecem presentes. O recorte não contém histórico privado.

MIT para código de titularidade autorizada, com declaração ISC do servidor e licenças/atribuições de Pixel Agents e MetroCity preservadas. Consulte `LICENSE`, `LICENSES` e `THIRD_PARTY_NOTICES.md`.

As alterações úteis da cópia local de tarefas, workspaces, provedores e correção de código foram incorporadas. Branches experimentais não foram fundidas automaticamente. Credenciais devem continuar em arquivos ignorados; somente o template `.env.example` é distribuído.


<!-- community-core:room-occupancy-descriptor -->
### Room Occupancy Descriptor for Pixel Office Tiles

Provides a small deterministic helper to describe pixel-office room occupancy from synthetic configuredSlots and occupants counts, letting the open edition render capacity badges consistently without reading titles, calling backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/room_occupancy_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function describeRoomOccupancy(input) with no I/O, env, time, randomness, callbacks, or dependencies. Input must be a plain object with integer configuredSlots 0..10000 and integer occupants 0..10000; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, non-integers, out-of-range or non-finite values throws TypeError('INVALID_ROOM_OCCUPANCY_INPUT') without echoing input. On valid synthetic input return a fresh object with configuredSlots, occupants, freeSlots, empty, full, overfilled where freeSlots is configuredSlots minus occupants clamped to 0, empty is occupants equals 0, full is configuredSlots above 0 and occupants at or above configuredSlots, and overfilled is occupants above configuredSlots. Computation is literal and makes no inference about teams, roles, progress, or next steps and never contacts backend or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "configuredSlots": 4,
    "occupants": 0
  },
  "output": {
    "configuredSlots": 4,
    "empty": true,
    "freeSlots": 4,
    "full": false,
    "occupants": 0,
    "overfilled": false
  }
}
```

```json
{
  "input": {
    "configuredSlots": 4,
    "occupants": 4
  },
  "output": {
    "configuredSlots": 4,
    "empty": false,
    "freeSlots": 0,
    "full": true,
    "occupants": 4,
    "overfilled": false
  }
}
```

```json
{
  "input": {
    "configuredSlots": 2,
    "occupants": 5
  },
  "output": {
    "configuredSlots": 2,
    "empty": false,
    "freeSlots": 0,
    "full": true,
    "occupants": 5,
    "overfilled": true
  }
}
```

Public regression tests: `lab_tests/community_room_occupancy_descriptor.test.mjs`.


<!-- community-core:attention-severity-descriptor -->
### Attention Severity Descriptor for Operations Tasks

Provides a small deterministic helper to describe operations attention severity from a synthetic severity flag, supporting consistent local handling without reading task titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/attention_severity_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with string severity equal to one of 'ok', 'info', 'medium', 'high', 'critical'; extra properties are ignored and input is never mutated. Any malformed shape, missing field, null, array, non-plain-object or any severity value outside the five literals throws TypeError('INVALID_ATTENTION_SEVERITY_INPUT') without echoing input. On valid synthetic input return a fresh object with severity, level, isOk, needsAttention, isCritical where level is 0 for 'ok', 1 for 'info', 2 for 'medium', 3 for 'high', 4 for 'critical', isOk is true only when severity equals 'ok', needsAttention is true only when level is at or above 2, and isCritical is true only when severity equals 'critical'. Build results only with object literals, use only for-of and Object.entries/values with Map get/set where needed, no dynamic computed property access, no property assignment/update/delete, no Object.assign/create and no aliased builtins. Computation is literal and makes no inference about tasks, assignees, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "severity": "ok"
  },
  "output": {
    "isCritical": false,
    "isOk": true,
    "level": 0,
    "needsAttention": false,
    "severity": "ok"
  }
}
```

```json
{
  "input": {
    "severity": "medium"
  },
  "output": {
    "isCritical": false,
    "isOk": false,
    "level": 2,
    "needsAttention": true,
    "severity": "medium"
  }
}
```

```json
{
  "input": {
    "severity": "critical"
  },
  "output": {
    "isCritical": true,
    "isOk": false,
    "level": 4,
    "needsAttention": true,
    "severity": "critical"
  }
}
```

Public regression tests: `lab_tests/community_attention_severity_descriptor.test.mjs`.


<!-- community-core:run-queue-load-descriptor -->
### Run Queue Load Descriptor for Orchestrator Runs

Provides a small deterministic helper to describe orchestrator run queue load from synthetic active, preparing and queued counts, letting the open edition render run badges consistently without reading titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/run_queue_load_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with integer active 0..10000, integer preparing 0..10000 and integer queued 0..10000; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null, array, non-plain-object, non-integer, non-finite or out-of-range values throws TypeError('INVALID_RUN_QUEUE_LOAD_INPUT') without echoing input. On valid synthetic input return a fresh object with active, preparing, queued, total, idle, hasBacklog where total is active plus preparing plus queued, idle is total equals 0, and hasBacklog is queued greater than 0. Build results only with object literals, use only for-of and Object.entries/values with Map get/set where needed, no dynamic computed property access, no property assignment/update/delete, no Object.assign/create and no aliased builtins. Computation is literal and makes no inference about agents, tasks, rooms, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "active": 0,
    "preparing": 0,
    "queued": 0
  },
  "output": {
    "active": 0,
    "hasBacklog": false,
    "idle": true,
    "preparing": 0,
    "queued": 0,
    "total": 0
  }
}
```

```json
{
  "input": {
    "active": 2,
    "preparing": 1,
    "queued": 0
  },
  "output": {
    "active": 2,
    "hasBacklog": false,
    "idle": false,
    "preparing": 1,
    "queued": 0,
    "total": 3
  }
}
```

```json
{
  "input": {
    "active": 1,
    "preparing": 0,
    "queued": 4
  },
  "output": {
    "active": 1,
    "hasBacklog": true,
    "idle": false,
    "preparing": 0,
    "queued": 4,
    "total": 5
  }
}
```

Public regression tests: `lab_tests/community_run_queue_load_descriptor.test.mjs`.


<!-- community-core:lane-load-descriptor -->
### Lane Load Descriptor for Agent Lanes

Provides a small deterministic helper to describe agent lane load from synthetic totalTracked and active counts, letting the open edition render lane badges consistently without reading titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/lane_load_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with integer totalTracked 0..10000 and integer active 0..10000 where active is at most totalTracked; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null, array, non-plain-object, non-integer, non-finite, out-of-range values or active above totalTracked throws TypeError('INVALID_LANE_LOAD_INPUT') without echoing input. On valid synthetic input return a fresh object with totalTracked, active, idleCount, empty, idle, hasActive where idleCount is totalTracked minus active, empty is totalTracked equals 0, idle is active equals 0, and hasActive is active greater than 0. Build results only with object literals, use only for-of and Object.entries/values with Map get/set where needed, no dynamic computed property access, no property assignment/update/delete, no Object.assign/create and no aliased builtins. Computation is literal and makes no inference about agents, tasks, rooms, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "active": 2,
    "totalTracked": 5
  },
  "output": {
    "active": 2,
    "empty": false,
    "hasActive": true,
    "idle": false,
    "idleCount": 3,
    "totalTracked": 5
  }
}
```

```json
{
  "input": {
    "active": 0,
    "totalTracked": 0
  },
  "output": {
    "active": 0,
    "empty": true,
    "hasActive": false,
    "idle": true,
    "idleCount": 0,
    "totalTracked": 0
  }
}
```

```json
{
  "input": {
    "active": 3,
    "totalTracked": 3
  },
  "output": {
    "active": 3,
    "empty": false,
    "hasActive": true,
    "idle": false,
    "idleCount": 0,
    "totalTracked": 3
  }
}
```

Public regression tests: `lab_tests/community_lane_load_descriptor.test.mjs`.


<!-- community-core:attention-health-descriptor -->
### Attention Health Descriptor for Operations Attention

Provides a small deterministic helper to describe operations attention health from synthetic healthy flag plus flagged and critical counts, letting the open edition render health badges consistently without reading task titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/attention_health_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with boolean healthy, integer flaggedCount 0..10000 and integer criticalCount 0..10000 where criticalCount is at most flaggedCount; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null, array, non-plain-object, non-boolean healthy, non-integer, non-finite, out-of-range counts or criticalCount above flaggedCount throws TypeError('INVALID_ATTENTION_HEALTH_INPUT') without echoing input. On valid synthetic input return a fresh object with healthy, flaggedCount, criticalCount, hasFlagged, hasCritical, needsReview where hasFlagged is flaggedCount greater than 0, hasCritical is criticalCount greater than 0, and needsReview is true when healthy is false or hasFlagged is true. Build results only with object literals, use only for-of and Object.entries/values with Map get/set where needed, no dynamic computed property access, no property assignment/update/delete, no Object.assign/create and no aliased builtins. Computation is literal and makes no inference about tasks, assignees, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "criticalCount": 0,
    "flaggedCount": 0,
    "healthy": true
  },
  "output": {
    "criticalCount": 0,
    "flaggedCount": 0,
    "hasCritical": false,
    "hasFlagged": false,
    "healthy": true,
    "needsReview": false
  }
}
```

```json
{
  "input": {
    "criticalCount": 1,
    "flaggedCount": 2,
    "healthy": true
  },
  "output": {
    "criticalCount": 1,
    "flaggedCount": 2,
    "hasCritical": true,
    "hasFlagged": true,
    "healthy": true,
    "needsReview": true
  }
}
```

```json
{
  "input": {
    "criticalCount": 0,
    "flaggedCount": 0,
    "healthy": false
  },
  "output": {
    "criticalCount": 0,
    "flaggedCount": 0,
    "hasCritical": false,
    "hasFlagged": false,
    "healthy": false,
    "needsReview": true
  }
}
```

Public regression tests: `lab_tests/community_attention_health_descriptor.test.mjs`.


<!-- community-core:execution-activity-descriptor -->
### Execution Activity Descriptor for Operations Tasks

Provides a small deterministic helper to describe operations task execution activity from synthetic running, preparing and queued flags, letting the open edition render execution badges consistently without reading titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/execution_activity_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with boolean running, boolean preparing and boolean queued; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null, array, non-plain-object or non-boolean flags throws TypeError('INVALID_EXECUTION_ACTIVITY_INPUT') without echoing input. On valid synthetic input return a fresh object with running, preparing, queued, active, idle, hasQueued where active is true when any flag is true, idle is true only when all flags are false, and hasQueued is true only when queued is true. Build results only with object literals, use only for-of and Object.entries/values with Map get/set where needed, no dynamic computed property access, no property assignment/update/delete, no Object.assign/create and no aliased builtins. Computation is literal and makes no inference about tasks, assignees, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "preparing": false,
    "queued": false,
    "running": false
  },
  "output": {
    "active": false,
    "hasQueued": false,
    "idle": true,
    "preparing": false,
    "queued": false,
    "running": false
  }
}
```

```json
{
  "input": {
    "preparing": false,
    "queued": false,
    "running": true
  },
  "output": {
    "active": true,
    "hasQueued": false,
    "idle": false,
    "preparing": false,
    "queued": false,
    "running": true
  }
}
```

```json
{
  "input": {
    "preparing": true,
    "queued": true,
    "running": false
  },
  "output": {
    "active": true,
    "hasQueued": true,
    "idle": false,
    "preparing": true,
    "queued": true,
    "running": false
  }
}
```

Public regression tests: `lab_tests/community_execution_activity_descriptor.test.mjs`.
