# NexusOrchestrator Open

Aplicação de orquestração de agentes com servidor Node/Express e interface React de escritório pixelado. Mantém o código funcional de tarefas, salas, políticas de despacho, integrações opcionais e frontend; o histórico e os dados da operação privada não fazem parte desta edição.

## Executar localmente

Requer Node.js 22 ou posterior. Instale as dependências em `server` e `web-v2`. Copie `.env.example` para `.env` e escolha uma pasta de trabalho própria; configure somente os provedores que pretende usar. Em terminais separados, inicie `node server/index.js` e o comando `npm run dev` de `web-v2`. O servidor usa loopback na porta 4000 por padrão.

Credenciais do usuário não são distribuídas. Despacho automático, retomada de órfãos e criação de tarefas de demonstração ficam desativados por padrão e exigem opt-in explícito. A interface pode ser aberta sem provisionar serviços; integrações externas precisam de configuração própria e podem consumir recursos quando acionadas pelo usuário. Esta edição não inclui implantação hospedada ou contas de provedores.

## Acompanhar uma equipe externa em tempo real

O modo opcional de equipe externa reutiliza o escritório Nexus para acompanhar agentes, fila, entregas e eventos de um controlador independente. A interface recebe atualizações por Socket.IO a cada dois segundos. O controlador continua responsável por criar e distribuir tarefas, executar modelos, validar alterações e publicar; este modo do Nexus permite apenas acompanhar essa execução.

Depois de instalar as dependências acima, execute `npm run build` em `web-v2`. Inicie **somente** o servidor específico deste modo:

```sh
NEXUS_FLEET_SNAPSHOT=/caminho/absoluto/privado/snapshot.json node server/fleetServer.js
```

Abra <http://127.0.0.1:4000/>. Esse servidor não carrega `.env`, não importa o motor de execução padrão e não chama provedores. A criação manual de agentes/tarefas e o envio de comandos ficam ocultos nesse modo. Os endpoints de aplicação aceitam apenas leitura; os POSTs internos do transporte Socket.IO não executam ações. O servidor exige Host/Origin de loopback na mesma porta.

O snapshot deve ser produzido pelo operador, com dados públicos mínimos e sem credenciais. Se estiver inválido, indisponível ou sem atualização há mais de 30 segundos, o Nexus deixa de confirmar atividade dos agentes. Serviço conectado e agente realmente trabalhando são estados distintos. Consulte [o contrato do snapshot e os limites deste modo](docs/EXTERNAL_FLEET.md).

O [registro da interface do modo observador](docs/FLEET_UI.md) descreve os estados, o quadro responsivo e as diferenças para o modo padrão.

## Testes

Os testes de servidor e frontend foram preservados, incluindo os que estavam somente na cópia local; foi acrescentado um teste dos defaults da edição aberta. Passaram 330 testes do servidor, 11 da interface, checagem de sintaxe, TypeScript, ESLint e build Vite. A execução usou fontes e dependências somente leitura, ambiente sem credenciais e rede externa bloqueada; os hashes permaneceram iguais. Execute `npm test` em `server` e `web-v2`, e `npm run build`/`npm run lint` em `web-v2`. Provedores reais, GitHub/GitLab, serviços externos e execução autônoma não foram exercitados por essa validação.

O modo de equipe externa acrescenta seis regressões de servidor e cinco de interface, executadas separadamente pelo helper `scripts/check-fleet-offline.py` e pelo workflow `fleet-tests.yml`. As contagens e os helpers originais permanecem intactos. Exemplos: `python3 scripts/check-fleet-offline.py server --dependencies /caminho/deps-server/node_modules --node /caminho/node` e o mesmo comando com `web` e as dependências de `web-v2`. O helper usa `bwrap`, fontes/dependências somente leitura e ambiente sem credenciais; não instale dependências dentro desse sandbox.

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

Este exemplo e a API reutilizável de descritores são separados do `App`/`KanbanSidebar`. Nenhuma renderização, interação de teclado/foco, conformidade de tecnologia assistiva, saúde de backend, anonimização, progresso ou segurança foi validada por esses testes puros. O modo de equipe externa descrito acima tem integração e regressões próprias; os testes deste descritor não comprovam essa integração. Use apenas dados sintéticos, sem backend/provedor real ou configuração operacional.

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


<!-- community-core:lane-retry-descriptor -->
### Lane Retry Descriptor for Agent Lanes

Provides a small deterministic helper to describe agent lane retry pressure from synthetic retryCount and recoveryCount values, letting the open edition render lane retry badges consistently without reading task titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/lane_retry_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with integer retryCount 0..10000 and integer recoveryCount 0..10000; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null, array, non-plain-object, non-integer, non-finite or out-of-range values throws TypeError('INVALID_LANE_RETRY_INPUT') without echoing input. On valid synthetic input return a fresh object with retryCount, recoveryCount, totalAttempts, hasRetries, hasRecovery, isClean where totalAttempts is retryCount plus recoveryCount, hasRetries is retryCount greater than 0, hasRecovery is recoveryCount greater than 0, and isClean is true only when totalAttempts equals 0. Build results only with object literals, use only for-of and Object.entries/values with Map get/set where needed, no dynamic computed property access, no property assignment/update/delete, no Object.assign/create and no aliased builtins. Computation is literal and makes no inference about agents, tasks, rooms, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "recoveryCount": 0,
    "retryCount": 0
  },
  "output": {
    "hasRecovery": false,
    "hasRetries": false,
    "isClean": true,
    "recoveryCount": 0,
    "retryCount": 0,
    "totalAttempts": 0
  }
}
```

```json
{
  "input": {
    "recoveryCount": 0,
    "retryCount": 2
  },
  "output": {
    "hasRecovery": false,
    "hasRetries": true,
    "isClean": false,
    "recoveryCount": 0,
    "retryCount": 2,
    "totalAttempts": 2
  }
}
```

```json
{
  "input": {
    "recoveryCount": 3,
    "retryCount": 1
  },
  "output": {
    "hasRecovery": true,
    "hasRetries": true,
    "isClean": false,
    "recoveryCount": 3,
    "retryCount": 1,
    "totalAttempts": 4
  }
}
```

Public regression tests: `lab_tests/community_lane_retry_descriptor.test.mjs`.


<!-- community-core:automation-optin-descriptor -->
### Automation Opt-In Descriptor for Open Edition Defaults

Provides a small deterministic helper to describe automation opt-in state from synthetic enabled flags, supporting consistent local handling without reading credentials, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/automation_optin_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with boolean autoDispatchEnabled, boolean orphanRescueEnabled and boolean demoTasksEnabled; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null, array, non-plain-object or non-boolean flags throws TypeError('INVALID_AUTOMATION_OPTIN_INPUT') without echoing input. On valid synthetic input return a fresh object with autoDispatchEnabled, orphanRescueEnabled, demoTasksEnabled, enabledCount, anyEnabled, allEnabled, allDisabled where enabledCount is the number of true flags from 0 to 3, anyEnabled is true when enabledCount is above 0, allEnabled is true only when enabledCount equals 3, and allDisabled is true only when enabledCount equals 0. Build results only with object literals, use only for-of and Object.entries/values with Map get/set where needed, no dynamic computed property access, no property assignment/update/delete, no Object.assign/create and no aliased builtins. Computation is literal and makes no inference about tasks, agents, rooms, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "autoDispatchEnabled": false,
    "demoTasksEnabled": false,
    "orphanRescueEnabled": false
  },
  "output": {
    "allDisabled": true,
    "allEnabled": false,
    "anyEnabled": false,
    "autoDispatchEnabled": false,
    "demoTasksEnabled": false,
    "enabledCount": 0,
    "orphanRescueEnabled": false
  }
}
```

```json
{
  "input": {
    "autoDispatchEnabled": true,
    "demoTasksEnabled": true,
    "orphanRescueEnabled": false
  },
  "output": {
    "allDisabled": false,
    "allEnabled": false,
    "anyEnabled": true,
    "autoDispatchEnabled": true,
    "demoTasksEnabled": true,
    "enabledCount": 2,
    "orphanRescueEnabled": false
  }
}
```

```json
{
  "input": {
    "autoDispatchEnabled": true,
    "demoTasksEnabled": true,
    "orphanRescueEnabled": true
  },
  "output": {
    "allDisabled": false,
    "allEnabled": true,
    "anyEnabled": true,
    "autoDispatchEnabled": true,
    "demoTasksEnabled": true,
    "enabledCount": 3,
    "orphanRescueEnabled": true
  }
}
```

Public regression tests: `lab_tests/community_automation_optin_descriptor.test.mjs`.


<!-- community-core:recovery-escalation-descriptor -->
### Recovery Escalation Descriptor for Agent Lanes

Provides a small deterministic helper to describe agent lane recovery escalation pressure from synthetic attempt, maxAttempts and escalated values, supporting consistent local badge handling without reading task titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/recovery_escalation_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with integer attempt 0..10000, integer maxAttempts 0..10000 and boolean escalated; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null, array, non-plain-object, non-integer, non-finite, out-of-range or non-boolean escalated throws TypeError('INVALID_RECOVERY_ESCALATION_INPUT') without echoing input. On valid synthetic input return a fresh object with attempt, maxAttempts, escalated, remainingAttempts, exhausted, needsEscalation where remainingAttempts is maxAttempts minus attempt clamped to 0, exhausted is true when attempt is at or above maxAttempts, and needsEscalation is true only when exhausted is true and escalated is false. Build results only with object literals, use only for-of and Object.entries/values with Map get/set where needed, no dynamic computed property access, no property assignment/update/delete, no Object.assign/create and no aliased builtins. Computation is literal and makes no inference about agents, tasks, rooms, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "attempt": 0,
    "escalated": false,
    "maxAttempts": 3
  },
  "output": {
    "attempt": 0,
    "escalated": false,
    "exhausted": false,
    "maxAttempts": 3,
    "needsEscalation": false,
    "remainingAttempts": 3
  }
}
```

```json
{
  "input": {
    "attempt": 3,
    "escalated": false,
    "maxAttempts": 3
  },
  "output": {
    "attempt": 3,
    "escalated": false,
    "exhausted": true,
    "maxAttempts": 3,
    "needsEscalation": true,
    "remainingAttempts": 0
  }
}
```

```json
{
  "input": {
    "attempt": 5,
    "escalated": true,
    "maxAttempts": 3
  },
  "output": {
    "attempt": 5,
    "escalated": true,
    "exhausted": true,
    "maxAttempts": 3,
    "needsEscalation": false,
    "remainingAttempts": 0
  }
}
```

Public regression tests: `lab_tests/community_recovery_escalation_descriptor.test.mjs`.


<!-- community-core:room-floor-descriptor -->
### Room Floor Descriptor for Pixel Office Levels

Provides a small deterministic helper to describe pixel-office room floor assignment from a synthetic floor index, supporting consistent local level badges without reading titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/room_floor_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with integer floor 0..10000; extra properties are ignored and input is never mutated. Any malformed shape, missing field, null, array, non-plain-object, non-integer, non-finite or out-of-range value throws TypeError('INVALID_ROOM_FLOOR_INPUT') without echoing input. On valid synthetic input return a fresh object with floor, isBuiltinFloor, isGroundFloor, isUpperFloor where isGroundFloor is true only when floor equals 0, isBuiltinFloor is true only when floor is between 0 and 8 inclusive, and isUpperFloor is true only when floor is greater than 0. Build results only with object literals, use only for-of and Object.entries/values with Map get/set where needed, no dynamic computed property access, no property assignment/update/delete, no Object.assign/create and no aliased builtins. Computation is literal and makes no inference about rooms, teams, topology, occupants, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "floor": 0
  },
  "output": {
    "floor": 0,
    "isBuiltinFloor": true,
    "isGroundFloor": true,
    "isUpperFloor": false
  }
}
```

```json
{
  "input": {
    "floor": 3
  },
  "output": {
    "floor": 3,
    "isBuiltinFloor": true,
    "isGroundFloor": false,
    "isUpperFloor": true
  }
}
```

```json
{
  "input": {
    "floor": 12
  },
  "output": {
    "floor": 12,
    "isBuiltinFloor": false,
    "isGroundFloor": false,
    "isUpperFloor": true
  }
}
```

Public regression tests: `lab_tests/community_room_floor_descriptor.test.mjs`.


<!-- community-core:agent-presence-descriptor -->
### Agent Presence Descriptor for Orchestrator Agents

Provides a small deterministic helper to describe orchestrator agent presence from a synthetic total count, supporting consistent local handling without reading titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/agent_presence_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with integer total 0..10000; extra properties are ignored and input is never mutated. Any malformed shape, missing field, null, array, non-plain-object, non-integer, non-finite or out-of-range value throws TypeError('INVALID_AGENT_PRESENCE_INPUT') without echoing input. On valid synthetic input return a fresh object with total, isEmpty, hasAgents, isSingle, hasMultiple where isEmpty is true only when total equals 0, hasAgents is true only when total is greater than 0, isSingle is true only when total equals 1, and hasMultiple is true only when total is greater than 1. Build results only with object literals, use only for-of and Object.entries/values with Map get/set where needed, no dynamic computed property access, no property assignment/update/delete, no Object.assign/create and no aliased builtins. Computation is literal and makes no inference about tasks, rooms, teams, roles, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "total": 0
  },
  "output": {
    "hasAgents": false,
    "hasMultiple": false,
    "isEmpty": true,
    "isSingle": false,
    "total": 0
  }
}
```

```json
{
  "input": {
    "total": 1
  },
  "output": {
    "hasAgents": true,
    "hasMultiple": false,
    "isEmpty": false,
    "isSingle": true,
    "total": 1
  }
}
```

```json
{
  "input": {
    "total": 5
  },
  "output": {
    "hasAgents": true,
    "hasMultiple": true,
    "isEmpty": false,
    "isSingle": false,
    "total": 5
  }
}
```

Public regression tests: `lab_tests/community_agent_presence_descriptor.test.mjs`.


<!-- community-core:review-gate-mode-descriptor -->
### Review Gate Mode Descriptor for Opencode Checks

Provides a small deterministic helper to describe opencode review gate mode from synthetic enabled and mode flags, supporting consistent local handling without reading code, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/review_gate_mode_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with boolean enabled and string mode equal to one of 'advisory', 'required'; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null, array, non-plain-object, non-boolean enabled or mode outside the two literals throws TypeError('INVALID_REVIEW_GATE_MODE_INPUT') without echoing input. On valid synthetic input return a fresh object with enabled, mode, isAdvisory, isRequired, isInactive where isAdvisory is true only when enabled is true and mode equals 'advisory', isRequired is true only when enabled is true and mode equals 'required', and isInactive is true only when enabled is false. Build results only with object literals, use only for-of and Object.entries/values with Map get/set where needed, no dynamic computed property access, no property assignment/update/delete, no Object.assign/create and no aliased builtins. Computation is literal and makes no inference about tasks, agents, rooms, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "enabled": true,
    "mode": "advisory"
  },
  "output": {
    "enabled": true,
    "isAdvisory": true,
    "isInactive": false,
    "isRequired": false,
    "mode": "advisory"
  }
}
```

```json
{
  "input": {
    "enabled": true,
    "mode": "required"
  },
  "output": {
    "enabled": true,
    "isAdvisory": false,
    "isInactive": false,
    "isRequired": true,
    "mode": "required"
  }
}
```

```json
{
  "input": {
    "enabled": false,
    "mode": "advisory"
  },
  "output": {
    "enabled": false,
    "isAdvisory": false,
    "isInactive": true,
    "isRequired": false,
    "mode": "advisory"
  }
}
```

Public regression tests: `lab_tests/community_review_gate_mode_descriptor.test.mjs`.


<!-- community-core:external-fleet-state-descriptor -->
### External Fleet State Descriptor for Observer Mode

Provides a small deterministic helper to describe external observer fleet state from a synthetic live/stale/unavailable flag, supporting consistent local handling without reading snapshots, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/external_fleet_state_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with string state equal to one of 'live', 'stale', 'unavailable'; extra properties are ignored and input is never mutated. Any malformed shape, missing field, null, array, non-plain-object or any state value outside the three literals throws TypeError('INVALID_FLEET_STATE_INPUT') without echoing input. On valid synthetic input return a fresh object with state, level, isLive, isStale, isUnavailable where level is 2 for 'live', 1 for 'stale', 0 for 'unavailable', isLive is true only when state equals 'live', isStale is true only when state equals 'stale', and isUnavailable is true only when state equals 'unavailable'. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about agents, tasks, rooms, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "state": "live"
  },
  "output": {
    "isLive": true,
    "isStale": false,
    "isUnavailable": false,
    "level": 2,
    "state": "live"
  }
}
```

```json
{
  "input": {
    "state": "stale"
  },
  "output": {
    "isLive": false,
    "isStale": true,
    "isUnavailable": false,
    "level": 1,
    "state": "stale"
  }
}
```

```json
{
  "input": {
    "state": "unavailable"
  },
  "output": {
    "isLive": false,
    "isStale": false,
    "isUnavailable": true,
    "level": 0,
    "state": "unavailable"
  }
}
```

Public regression tests: `lab_tests/community_external_fleet_state_descriptor.test.mjs`.


<!-- community-core:validator-readiness-descriptor -->
### Validator Readiness Descriptor for Local Checks

Provides a small deterministic helper to describe opencode validator readiness from synthetic enabled, available, ready and removed flags, supporting consistent local badges without reading code, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/validator_readiness_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with boolean enabled, boolean available, boolean ready and boolean removed; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null, array, non-plain-object or non-boolean enabled/available/ready/removed throws TypeError('INVALID_VALIDATOR_READINESS_INPUT') without echoing input. On valid synthetic input return a fresh object with enabled, available, ready, removed, isReady, isDisabled, isUnavailable where isReady is true only when enabled is true and available is true and ready is true and removed is false, isDisabled is true only when enabled is false or removed is true, and isUnavailable is true only when enabled is true and removed is false and (available is false or ready is false). Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about tasks, agents, rooms, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "available": true,
    "enabled": true,
    "ready": true,
    "removed": false
  },
  "output": {
    "available": true,
    "enabled": true,
    "isDisabled": false,
    "isReady": true,
    "isUnavailable": false,
    "ready": true,
    "removed": false
  }
}
```

```json
{
  "input": {
    "available": true,
    "enabled": false,
    "ready": true,
    "removed": false
  },
  "output": {
    "available": true,
    "enabled": false,
    "isDisabled": true,
    "isReady": false,
    "isUnavailable": false,
    "ready": true,
    "removed": false
  }
}
```

```json
{
  "input": {
    "available": false,
    "enabled": true,
    "ready": true,
    "removed": false
  },
  "output": {
    "available": false,
    "enabled": true,
    "isDisabled": false,
    "isReady": false,
    "isUnavailable": true,
    "ready": true,
    "removed": false
  }
}
```

Public regression tests: `lab_tests/community_validator_readiness_descriptor.test.mjs`.


<!-- community-core:task-status-descriptor -->
### Task Status Descriptor for Kanban Rows

Provides a small deterministic helper to describe single Kanban task status from a synthetic todo/doing/done/blocked flag, supporting consistent local badges without reading titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/task_status_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with string status equal to one of 'todo', 'doing', 'done', 'blocked'; extra properties are ignored and input is never mutated. Any malformed shape, missing field, null, array, non-plain-object or any status value outside the four literals throws TypeError('INVALID_TASK_STATUS_INPUT') without echoing input. On valid synthetic input return a fresh object with status, level, isTodo, isDoing, isDone, isBlocked where level is 0 for 'todo', 1 for 'doing', 2 for 'done', 3 for 'blocked', isTodo is true only when status equals 'todo', isDoing is true only when status equals 'doing', isDone is true only when status equals 'done', and isBlocked is true only when status equals 'blocked'. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about tasks, assignees, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "status": "todo"
  },
  "output": {
    "isBlocked": false,
    "isDoing": false,
    "isDone": false,
    "isTodo": true,
    "level": 0,
    "status": "todo"
  }
}
```

```json
{
  "input": {
    "status": "doing"
  },
  "output": {
    "isBlocked": false,
    "isDoing": true,
    "isDone": false,
    "isTodo": false,
    "level": 1,
    "status": "doing"
  }
}
```

```json
{
  "input": {
    "status": "done"
  },
  "output": {
    "isBlocked": false,
    "isDoing": false,
    "isDone": true,
    "isTodo": false,
    "level": 2,
    "status": "done"
  }
}
```

```json
{
  "input": {
    "status": "blocked"
  },
  "output": {
    "isBlocked": true,
    "isDoing": false,
    "isDone": false,
    "isTodo": false,
    "level": 3,
    "status": "blocked"
  }
}
```

Public regression tests: `lab_tests/community_task_status_descriptor.test.mjs`.


<!-- community-core:task-stale-age-descriptor -->
### Task Stale Age Descriptor for Operations Tasks

Provides a small deterministic helper to describe operations task staleness from synthetic last-activity age and threshold, supporting consistent local staleness badges without reading titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/task_stale_age_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with integer staleThresholdMs 1..9007199254740991 and lastActivityAgeMs either integer 0..9007199254740991 or null; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object, non-integer, non-finite, or out-of-range values throws TypeError('INVALID_TASK_STALE_AGE_INPUT') without echoing input. On valid synthetic input return a fresh object with staleThresholdMs, lastActivityAgeMs, hasKnownAge, isStale, overdueMs, needsReview where hasKnownAge is true only when lastActivityAgeMs is an integer, isStale is true only when hasKnownAge is true and lastActivityAgeMs is at or above staleThresholdMs, overdueMs is lastActivityAgeMs minus staleThresholdMs clamped to 0 and 0 when age is null, and needsReview mirrors isStale. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, roles, tasks, agents, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "lastActivityAgeMs": 10000,
    "staleThresholdMs": 60000
  },
  "output": {
    "hasKnownAge": true,
    "isStale": false,
    "lastActivityAgeMs": 10000,
    "needsReview": false,
    "overdueMs": 0,
    "staleThresholdMs": 60000
  }
}
```

```json
{
  "input": {
    "lastActivityAgeMs": 90000,
    "staleThresholdMs": 60000
  },
  "output": {
    "hasKnownAge": true,
    "isStale": true,
    "lastActivityAgeMs": 90000,
    "needsReview": true,
    "overdueMs": 30000,
    "staleThresholdMs": 60000
  }
}
```

```json
{
  "input": {
    "lastActivityAgeMs": null,
    "staleThresholdMs": 60000
  },
  "output": {
    "hasKnownAge": false,
    "isStale": false,
    "lastActivityAgeMs": null,
    "needsReview": false,
    "overdueMs": 0,
    "staleThresholdMs": 60000
  }
}
```

Public regression tests: `lab_tests/community_task_stale_age_descriptor.test.mjs`.


<!-- community-core:provider-env-hint-descriptor -->
### Provider Env Hint Descriptor for Validator Hints

Provides a small deterministic helper to describe validator provider hint readiness from synthetic scope, ok and optional flags, enabling consistent local handling without reading environment, credentials, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/provider_env_hint_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with string scope equal to one of 'auth', 'metadata', boolean ok and boolean optional; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object, non-string scope outside the two literals, non-boolean ok or non-boolean optional throws TypeError('INVALID_PROVIDER_ENV_HINT_INPUT') without echoing input. On valid synthetic input return a fresh object with scope, ok, optional, isAuth, isMetadata, isReady, needsSetup where isAuth is true only when scope equals 'auth', isMetadata is true only when scope equals 'metadata', isReady mirrors ok, and needsSetup is true only when ok is false and optional is false. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about providers, credentials, environment, tasks, agents, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "ok": true,
    "optional": false,
    "scope": "auth"
  },
  "output": {
    "isAuth": true,
    "isMetadata": false,
    "isReady": true,
    "needsSetup": false,
    "ok": true,
    "optional": false,
    "scope": "auth"
  }
}
```

```json
{
  "input": {
    "ok": false,
    "optional": true,
    "scope": "metadata"
  },
  "output": {
    "isAuth": false,
    "isMetadata": true,
    "isReady": false,
    "needsSetup": false,
    "ok": false,
    "optional": true,
    "scope": "metadata"
  }
}
```

```json
{
  "input": {
    "ok": false,
    "optional": false,
    "scope": "auth"
  },
  "output": {
    "isAuth": true,
    "isMetadata": false,
    "isReady": false,
    "needsSetup": true,
    "ok": false,
    "optional": false,
    "scope": "auth"
  }
}
```

Public regression tests: `lab_tests/community_provider_env_hint_descriptor.test.mjs`.


<!-- community-core:task-assignment-descriptor -->
### Task Assignment Descriptor for Operations Tasks

Provides a small deterministic helper to describe operations task assignment from a synthetic assignee value, supporting consistent local handling without reading titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/task_assignment_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with assignee either string length 0..1024 with valid Unicode without unpaired surrogates and without C0 controls except LF/CR/TAB or null; extra properties are ignored and input is never mutated. Any malformed shape, missing field, null payload, array payload, non-plain-object, non-string non-null assignee, overlong string or disallowed characters throws TypeError('INVALID_TASK_ASSIGNMENT_INPUT') without echoing input. On valid synthetic input return a fresh object with assignee, hasAssignee, isUnassigned, assigneeLength where assignee preserves input value, assigneeLength is string length or 0 when null, hasAssignee is true only when assignee is string with length above 0, and isUnassigned mirrors negated hasAssignee. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about tasks, roles, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "assignee": null
  },
  "output": {
    "assignee": null,
    "assigneeLength": 0,
    "hasAssignee": false,
    "isUnassigned": true
  }
}
```

```json
{
  "input": {
    "assignee": ""
  },
  "output": {
    "assignee": "",
    "assigneeLength": 0,
    "hasAssignee": false,
    "isUnassigned": true
  }
}
```

```json
{
  "input": {
    "assignee": "mara"
  },
  "output": {
    "assignee": "mara",
    "assigneeLength": 4,
    "hasAssignee": true,
    "isUnassigned": false
  }
}
```

Public regression tests: `lab_tests/community_task_assignment_descriptor.test.mjs`.


<!-- community-core:room-role-distribution-descriptor -->
### Room Role Distribution Descriptor for Pixel Office Tiles

Provides a small deterministic helper to describe pixel-office room role distribution from synthetic roles maps, supporting consistent local handling without reading titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/room_role_distribution_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with roles plain object containing 0..100 entries where each key is a string length 1..64 with valid Unicode without unpaired surrogates and without C0 controls except LF/CR/TAB and each value is an integer 0..10000 finite safe; extra properties are ignored and input is never mutated. Any malformed shape, missing field, null payload, array payload, non-plain-object, non-plain roles object, wrong entry count, non-string key, overlong key, empty key, disallowed characters, non-integer value, non-finite value or out-of-range value throws TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT') without echoing input. On valid synthetic input return a fresh object with roleCount, totalAssignments, hasRoles, isEmpty where roleCount equals number of roles entries, totalAssignments equals sum of all role values, hasRoles is true only when roleCount is above 0, and isEmpty is true only when roleCount equals 0. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, tasks, agents, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "roles": {}
  },
  "output": {
    "hasRoles": false,
    "isEmpty": true,
    "roleCount": 0,
    "totalAssignments": 0
  }
}
```

```json
{
  "input": {
    "roles": {
      "builder": 2
    }
  },
  "output": {
    "hasRoles": true,
    "isEmpty": false,
    "roleCount": 1,
    "totalAssignments": 2
  }
}
```

```json
{
  "input": {
    "roles": {
      "builder": 2,
      "reviewer": 3
    }
  },
  "output": {
    "hasRoles": true,
    "isEmpty": false,
    "roleCount": 2,
    "totalAssignments": 5
  }
}
```

Public regression tests: `lab_tests/community_room_role_distribution_descriptor.test.mjs`.


<!-- community-core:room-interlink-count-descriptor -->
### Room Interlink Count Descriptor for Pixel Office Tiles

Provides a small deterministic helper to describe pixel-office room interlink counts from synthetic interlinkedRoomIds lists, supporting consistent local handling without reading titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/room_interlink_count_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with interlinkedRoomIds array of 0..100 string entries where each entry has length 1..64 with valid Unicode without unpaired surrogates and without C0 control characters except LF/CR/TAB; extra properties are ignored and input is never mutated. Any malformed shape, missing field, null payload, array payload, non-plain-object, non-array field, wrong entry count, non-string entry, empty entry, overlong entry, disallowed characters or unpaired surrogates throws TypeError('INVALID_ROOM_INTERLINK_COUNT_INPUT') without echoing input. On valid synthetic input return a fresh object with linkCount, hasLinks, isIsolated where linkCount equals number of interlinkedRoomIds entries, hasLinks is true only when linkCount is above 0, and isIsolated is true only when linkCount equals 0. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, roles, tasks, agents, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "interlinkedRoomIds": []
  },
  "output": {
    "hasLinks": false,
    "isIsolated": true,
    "linkCount": 0
  }
}
```

```json
{
  "input": {
    "interlinkedRoomIds": [
      "room-a"
    ]
  },
  "output": {
    "hasLinks": true,
    "isIsolated": false,
    "linkCount": 1
  }
}
```

```json
{
  "input": {
    "extra": 123,
    "interlinkedRoomIds": [
      "room-a",
      "room-b"
    ]
  },
  "output": {
    "hasLinks": true,
    "isIsolated": false,
    "linkCount": 2
  }
}
```

Public regression tests: `lab_tests/community_room_interlink_count_descriptor.test.mjs`.


<!-- community-core:project-sync-status-descriptor -->
### Project Sync Status Descriptor for Board Integrations

Provides a small deterministic helper to describe project sync readiness from synthetic githubConfigured and projectSyncEnabled flags, supporting consistent local handling without reading files, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/project_sync_status_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with boolean githubConfigured and boolean projectSyncEnabled; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object, or non-boolean field values throws TypeError('INVALID_PROJECT_SYNC_STATUS_INPUT') without echoing input. On valid synthetic input return a fresh object with githubConfigured, projectSyncEnabled, ready, needsProvider, syncDisabled where the first two preserve input values, ready is true only when both are true, needsProvider is true only when githubConfigured is false, and syncDisabled is true only when githubConfigured is true and projectSyncEnabled is false. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about tasks, roles, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "githubConfigured": true,
    "projectSyncEnabled": true
  },
  "output": {
    "githubConfigured": true,
    "needsProvider": false,
    "projectSyncEnabled": true,
    "ready": true,
    "syncDisabled": false
  }
}
```

```json
{
  "input": {
    "githubConfigured": false,
    "projectSyncEnabled": false
  },
  "output": {
    "githubConfigured": false,
    "needsProvider": true,
    "projectSyncEnabled": false,
    "ready": false,
    "syncDisabled": false
  }
}
```

```json
{
  "input": {
    "githubConfigured": true,
    "projectSyncEnabled": false
  },
  "output": {
    "githubConfigured": true,
    "needsProvider": false,
    "projectSyncEnabled": false,
    "ready": false,
    "syncDisabled": true
  }
}
```

Public regression tests: `lab_tests/community_project_sync_status_descriptor.test.mjs`.


<!-- community-core:room-replica-gap-descriptor -->
### Room Replica Gap Descriptor for Pixel Office Rooms

Provides a small deterministic helper to describe pixel-office room replica gaps from synthetic configuredSlots and replicaTarget counts, supporting consistent local handling without reading titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/room_replica_gap_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with integer configuredSlots 0..10000 and integer replicaTarget 0..10000, each finite safe; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object, non-integer value, non-finite value or out-of-range value throws TypeError('INVALID_ROOM_REPLICA_GAP_INPUT') without echoing input. On valid synthetic input return a fresh object with configuredSlots, replicaTarget, gap, needsScale, atTarget, overProvisioned where the first two preserve input values, gap equals replicaTarget minus configuredSlots, needsScale is true only when replicaTarget is above configuredSlots, atTarget is true only when both are equal, and overProvisioned is true only when configuredSlots is above replicaTarget. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, roles, tasks, agents, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "configuredSlots": 4,
    "replicaTarget": 4
  },
  "output": {
    "atTarget": true,
    "configuredSlots": 4,
    "gap": 0,
    "needsScale": false,
    "overProvisioned": false,
    "replicaTarget": 4
  }
}
```

```json
{
  "input": {
    "configuredSlots": 2,
    "replicaTarget": 5
  },
  "output": {
    "atTarget": false,
    "configuredSlots": 2,
    "gap": 3,
    "needsScale": true,
    "overProvisioned": false,
    "replicaTarget": 5
  }
}
```

```json
{
  "input": {
    "configuredSlots": 5,
    "replicaTarget": 2
  },
  "output": {
    "atTarget": false,
    "configuredSlots": 5,
    "gap": -3,
    "needsScale": false,
    "overProvisioned": true,
    "replicaTarget": 2
  }
}
```

Public regression tests: `lab_tests/community_room_replica_gap_descriptor.test.mjs`.


<!-- community-core:room-template-count-descriptor -->
### Room Template Count Descriptor for Pixel Office Catalog

Provides a small deterministic helper to describe pixel-office room template inventory from a synthetic configured count, supporting consistent local handling without reading files, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/room_template_count_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with integer roomTemplatesConfigured 0..10000, finite safe; extra properties are ignored and input is never mutated. Any malformed shape, missing field, null payload, array payload, non-plain-object, non-integer value, non-finite value or out-of-range value throws TypeError('INVALID_ROOM_TEMPLATE_COUNT_INPUT') without echoing input. On valid synthetic input return a fresh object with roomTemplatesConfigured, hasTemplates, empty, single, many where the first preserves input value, hasTemplates is true only when count is above 0, empty is true only when count equals 0, single is true only when count equals 1, and many is true only when count is above 1. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, roles, tasks, agents, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "roomTemplatesConfigured": 0
  },
  "output": {
    "empty": true,
    "hasTemplates": false,
    "many": false,
    "roomTemplatesConfigured": 0,
    "single": false
  }
}
```

```json
{
  "input": {
    "roomTemplatesConfigured": 1
  },
  "output": {
    "empty": false,
    "hasTemplates": true,
    "many": false,
    "roomTemplatesConfigured": 1,
    "single": true
  }
}
```

```json
{
  "input": {
    "roomTemplatesConfigured": 4
  },
  "output": {
    "empty": false,
    "hasTemplates": true,
    "many": true,
    "roomTemplatesConfigured": 4,
    "single": false
  }
}
```

Public regression tests: `lab_tests/community_room_template_count_descriptor.test.mjs`.


<!-- community-core:attention-queue-depth-descriptor -->
### Attention Queue Depth Descriptor for Operations Backlog

Provides a small deterministic helper to describe operations attention backlog from synthetic activeWithoutAssignee, waitingWithoutExecution and queued counts, supporting consistent local handling without reading titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/attention_queue_depth_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with integer activeWithoutAssigneeCount 0..10000, integer waitingWithoutExecutionCount 0..10000 and integer queuedCount 0..10000, each finite safe; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object, non-integer value, non-finite value or out-of-range value throws TypeError('INVALID_ATTENTION_QUEUE_DEPTH_INPUT') without echoing input. On valid synthetic input return a fresh object with activeWithoutAssigneeCount, waitingWithoutExecutionCount, queuedCount, totalWaiting, hasBacklog, empty where the first three preserve input values, totalWaiting equals the exact sum of the three counts, hasBacklog is true only when totalWaiting is above 0, and empty is true only when totalWaiting equals 0. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about tasks, assignees, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "activeWithoutAssigneeCount": 0,
    "queuedCount": 0,
    "waitingWithoutExecutionCount": 0
  },
  "output": {
    "activeWithoutAssigneeCount": 0,
    "empty": true,
    "hasBacklog": false,
    "queuedCount": 0,
    "totalWaiting": 0,
    "waitingWithoutExecutionCount": 0
  }
}
```

```json
{
  "input": {
    "activeWithoutAssigneeCount": 2,
    "queuedCount": 3,
    "waitingWithoutExecutionCount": 1
  },
  "output": {
    "activeWithoutAssigneeCount": 2,
    "empty": false,
    "hasBacklog": true,
    "queuedCount": 3,
    "totalWaiting": 6,
    "waitingWithoutExecutionCount": 1
  }
}
```

```json
{
  "input": {
    "activeWithoutAssigneeCount": 0,
    "queuedCount": 5,
    "waitingWithoutExecutionCount": 0
  },
  "output": {
    "activeWithoutAssigneeCount": 0,
    "empty": false,
    "hasBacklog": true,
    "queuedCount": 5,
    "totalWaiting": 5,
    "waitingWithoutExecutionCount": 0
  }
}
```

Public regression tests: `lab_tests/community_attention_queue_depth_descriptor.test.mjs`.


<!-- community-core:ralph-failure-budget-descriptor -->
### Ralph Failure Budget Descriptor for Extension Health

Provides a small deterministic helper to describe Ralph extension failure budget from synthetic failureCount and failureLimit counts, supporting consistent local handling without reading titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/ralph_failure_budget_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with integer failureCount 0..10000 and integer failureLimit 0..10000, each finite safe; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object, non-integer value, non-finite value or out-of-range value throws TypeError('INVALID_RALPH_FAILURE_BUDGET_INPUT') without echoing input. On valid synthetic input return a fresh object with failureCount, failureLimit, remaining, hasBudget, atLimit, overLimit where the first two preserve input values, remaining equals failureLimit minus failureCount clamped to 0, hasBudget is true only when failureCount is below failureLimit, atLimit is true only when both are equal, and overLimit is true only when failureCount is above failureLimit. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, roles, tasks, agents, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "failureCount": 0,
    "failureLimit": 3
  },
  "output": {
    "atLimit": false,
    "failureCount": 0,
    "failureLimit": 3,
    "hasBudget": true,
    "overLimit": false,
    "remaining": 3
  }
}
```

```json
{
  "input": {
    "failureCount": 3,
    "failureLimit": 3
  },
  "output": {
    "atLimit": true,
    "failureCount": 3,
    "failureLimit": 3,
    "hasBudget": false,
    "overLimit": false,
    "remaining": 0
  }
}
```

```json
{
  "input": {
    "failureCount": 5,
    "failureLimit": 2
  },
  "output": {
    "atLimit": false,
    "failureCount": 5,
    "failureLimit": 2,
    "hasBudget": false,
    "overLimit": true,
    "remaining": 0
  }
}
```

Public regression tests: `lab_tests/community_ralph_failure_budget_descriptor.test.mjs`.


<!-- community-core:github-sync-readiness-descriptor -->
### GitHub Sync Readiness Descriptor for Project Mirroring

Provides a small deterministic helper to describe project mirroring readiness from synthetic githubConfigured and projectSyncEnabled flags, supporting consistent local handling without reading files, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/github_sync_readiness_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with boolean githubConfigured and boolean projectSyncEnabled; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object, or non-boolean values throws TypeError('INVALID_GITHUB_SYNC_READINESS_INPUT') without echoing input. On valid synthetic input return a fresh object with githubConfigured, projectSyncEnabled, ready, partial, idle, needsSetup where the first two preserve input values, ready is true only when both inputs are true, idle is true only when both inputs are false, partial is true only when exactly one input is true, and needsSetup is true only when ready is false. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, roles, tasks, agents, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "githubConfigured": false,
    "projectSyncEnabled": false
  },
  "output": {
    "githubConfigured": false,
    "idle": true,
    "needsSetup": true,
    "partial": false,
    "projectSyncEnabled": false,
    "ready": false
  }
}
```

```json
{
  "input": {
    "githubConfigured": false,
    "projectSyncEnabled": true
  },
  "output": {
    "githubConfigured": false,
    "idle": false,
    "needsSetup": true,
    "partial": true,
    "projectSyncEnabled": true,
    "ready": false
  }
}
```

```json
{
  "input": {
    "githubConfigured": true,
    "projectSyncEnabled": false
  },
  "output": {
    "githubConfigured": true,
    "idle": false,
    "needsSetup": true,
    "partial": true,
    "projectSyncEnabled": false,
    "ready": false
  }
}
```

```json
{
  "input": {
    "githubConfigured": true,
    "projectSyncEnabled": true
  },
  "output": {
    "githubConfigured": true,
    "idle": false,
    "needsSetup": false,
    "partial": false,
    "projectSyncEnabled": true,
    "ready": true
  }
}
```

Public regression tests: `lab_tests/community_github_sync_readiness_descriptor.test.mjs`.


<!-- community-core:attention-assignment-gap-descriptor -->
### Attention Assignment Gap Descriptor for Operations Tasks

Provides a small deterministic helper to describe operations attention assignment gaps from synthetic activeWithoutAssigneeCount and waitingWithoutExecutionCount values, supporting consistent local handling without reading task titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/attention_assignment_gap_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with integer activeWithoutAssigneeCount 0..10000 and integer waitingWithoutExecutionCount 0..10000; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object, non-integer, non-finite or out-of-range values throws TypeError('INVALID_ATTENTION_ASSIGNMENT_GAP_INPUT') without echoing input. On valid synthetic input return a fresh object with activeWithoutAssigneeCount, waitingWithoutExecutionCount, totalGap, hasGap, needsAssignment, needsExecution, clear where the first two preserve input values, totalGap is the arithmetic sum of both inputs, hasGap is true only when totalGap is above 0, needsAssignment is true only when activeWithoutAssigneeCount is above 0, needsExecution is true only when waitingWithoutExecutionCount is above 0, and clear is true only when totalGap equals 0. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, roles, tasks, agents, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "activeWithoutAssigneeCount": 0,
    "waitingWithoutExecutionCount": 0
  },
  "output": {
    "activeWithoutAssigneeCount": 0,
    "clear": true,
    "hasGap": false,
    "needsAssignment": false,
    "needsExecution": false,
    "totalGap": 0,
    "waitingWithoutExecutionCount": 0
  }
}
```

```json
{
  "input": {
    "activeWithoutAssigneeCount": 2,
    "waitingWithoutExecutionCount": 0
  },
  "output": {
    "activeWithoutAssigneeCount": 2,
    "clear": false,
    "hasGap": true,
    "needsAssignment": true,
    "needsExecution": false,
    "totalGap": 2,
    "waitingWithoutExecutionCount": 0
  }
}
```

```json
{
  "input": {
    "activeWithoutAssigneeCount": 1,
    "waitingWithoutExecutionCount": 3
  },
  "output": {
    "activeWithoutAssigneeCount": 1,
    "clear": false,
    "hasGap": true,
    "needsAssignment": true,
    "needsExecution": true,
    "totalGap": 4,
    "waitingWithoutExecutionCount": 3
  }
}
```

Public regression tests: `lab_tests/community_attention_assignment_gap_descriptor.test.mjs`.


<!-- community-core:attention-stale-severity-descriptor -->
### Attention Stale Severity Descriptor for Operations Tasks

Provides a small deterministic helper to describe operations attention need from a synthetic stale flag and severity value, supporting consistent local handling without reading task titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/attention_stale_severity_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with stale boolean and severity string equal to one of 'ok', 'info', 'medium', 'high', 'critical'; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object, non-boolean stale or any severity value outside the five literals throws TypeError('INVALID_ATTENTION_STALE_SEVERITY_INPUT') without echoing input. On valid synthetic input return a fresh object with stale, severity, level, requiresAttention, isCritical, isClear where level is 0 for 'ok', 1 for 'info', 2 for 'medium', 3 for 'high', 4 for 'critical', requiresAttention is true only when stale is true or level is at or above 2, isCritical is true only when severity equals 'critical', and isClear is true only when stale is false and severity equals 'ok'. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about tasks, assignees, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "severity": "ok",
    "stale": false
  },
  "output": {
    "isClear": true,
    "isCritical": false,
    "level": 0,
    "requiresAttention": false,
    "severity": "ok",
    "stale": false
  }
}
```

```json
{
  "input": {
    "severity": "high",
    "stale": false
  },
  "output": {
    "isClear": false,
    "isCritical": false,
    "level": 3,
    "requiresAttention": true,
    "severity": "high",
    "stale": false
  }
}
```

```json
{
  "input": {
    "severity": "info",
    "stale": true
  },
  "output": {
    "isClear": false,
    "isCritical": false,
    "level": 1,
    "requiresAttention": true,
    "severity": "info",
    "stale": true
  }
}
```

```json
{
  "input": {
    "severity": "critical",
    "stale": false
  },
  "output": {
    "isClear": false,
    "isCritical": true,
    "level": 4,
    "requiresAttention": true,
    "severity": "critical",
    "stale": false
  }
}
```

Public regression tests: `lab_tests/community_attention_stale_severity_descriptor.test.mjs`.


<!-- community-core:lane-failure-presence-descriptor -->
### Lane Failure Presence Descriptor for Operations Lanes

Provides a small deterministic helper to describe operations lane failure presence from synthetic failureClass and failureMessage values, supporting consistent local handling without interpreting message text, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/lane_failure_presence_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection or dependencies. Input must be a plain object with failureClass null or string length 0..500 and failureMessage null or string length 0..500; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object, non-null/string type or string length above 500 throws TypeError('INVALID_LANE_FAILURE_PRESENCE_INPUT') without echoing input. On valid synthetic input return a fresh object with failureClass, failureMessage, hasFailureClass, hasFailureMessage, failed, clear where the first two preserve input values, hasFailureClass is true only when failureClass is a string with length above 0, hasFailureMessage is true only when failureMessage is a string with length above 0, failed is true only when hasFailureClass or hasFailureMessage is true, and clear is true only when both hasFailureClass and hasFailureMessage are false. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, roles, tasks, agents, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "failureClass": null,
    "failureMessage": null
  },
  "output": {
    "clear": true,
    "failed": false,
    "failureClass": null,
    "failureMessage": null,
    "hasFailureClass": false,
    "hasFailureMessage": false
  }
}
```

```json
{
  "input": {
    "failureClass": "TIMEOUT",
    "failureMessage": ""
  },
  "output": {
    "clear": false,
    "failed": true,
    "failureClass": "TIMEOUT",
    "failureMessage": "",
    "hasFailureClass": true,
    "hasFailureMessage": false
  }
}
```

```json
{
  "input": {
    "failureClass": "RETRY_EXHAUSTED",
    "failureMessage": "lane failed after retries"
  },
  "output": {
    "clear": false,
    "failed": true,
    "failureClass": "RETRY_EXHAUSTED",
    "failureMessage": "lane failed after retries",
    "hasFailureClass": true,
    "hasFailureMessage": true
  }
}
```

Public regression tests: `lab_tests/community_lane_failure_presence_descriptor.test.mjs`.

## Coordenação por capacidade e pedidos de ajuda

O módulo opcional [AgentCollaboration](docs/AGENT_COLLABORATION.md) acrescenta um registro explícito de planejadores/executores e pedidos de ajuda estruturados, com revisão concorrente, idempotência, dependências acíclicas, reserva com token e limite de delegações. Distingue pedido aceito, reserva e resultado; oferece exportação/importação por replay. Políticas incluem preferência Muse/Gemini, Codex limitado por dia e um slot agregado local.

É uma biblioteca pura para integração por um controlador confiável. Não chama modelos, não concede acesso, não verifica PUBLIC/HEAD nem substitui testes, processos ou autorização do adaptador. O workflow `collaboration-tests.yml` executa sua suíte separada sem rede, fontes graváveis, home ou credenciais. Isso não altera o opt-in dos executores do servidor padrão.


<!-- community-core:lane-event-failure-count-descriptor -->
### Lane Event Failure Count Descriptor for Operations Lanes

Provides a small deterministic helper to count operations lane events with failure markers from synthetic event lists, supporting consistent local review of dependencies without interpreting message text, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/lane_event_failure_count_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection, mutable module variables or dependencies. Input must be a plain object with events array length 0..200 where each element is a plain object with failureClass null or string length 0..500; extra properties on outer and inner objects are ignored and input is never mutated. Any malformed shape, missing field, null payload, array payload, non-plain-object, non-array events, length above 200, non-plain-object element, missing failureClass, non-null/string type or string length above 500 throws TypeError('INVALID_LANE_EVENT_FAILURE_COUNT_INPUT') without echoing input. On valid synthetic input return a fresh object with total, failedCount, clearCount, hasFailures, allClear where total is events length, failedCount counts elements where failureClass is a string with length above 0, clearCount is total minus failedCount, hasFailures is true only when failedCount is above 0, and allClear is true only when failedCount equals 0. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, roles, tasks, agents, progress, priority or next steps and never contacts backends or agents.

Examples (JSON input and expected output):

```json
{
  "input": {
    "events": []
  },
  "output": {
    "allClear": true,
    "clearCount": 0,
    "failedCount": 0,
    "hasFailures": false,
    "total": 0
  }
}
```

```json
{
  "input": {
    "events": [
      {
        "failureClass": null
      },
      {
        "failureClass": ""
      },
      {
        "failureClass": "TIMEOUT"
      }
    ]
  },
  "output": {
    "allClear": false,
    "clearCount": 2,
    "failedCount": 1,
    "hasFailures": true,
    "total": 3
  }
}
```

```json
{
  "input": {
    "events": [
      {
        "failureClass": "AUTH"
      },
      {
        "failureClass": "NETWORK"
      }
    ]
  },
  "output": {
    "allClear": false,
    "clearCount": 0,
    "failedCount": 2,
    "hasFailures": true,
    "total": 2
  }
}
```

Public regression tests: `lab_tests/community_lane_event_failure_count_descriptor.test.mjs`.


<!-- community-core:lane-event-sequence-gap-descriptor -->
### Lane Event Sequence Gap Descriptor for Operations Lanes

Provides a small deterministic helper to describe gaps in operations lane event sequences from synthetic first, last and total counts, supporting consistent local review of module coordination without interpreting message text, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/lane_event_sequence_gap_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection, mutable module variables or dependencies. Input must be a plain object with firstSeq integer 0..1000000, lastSeq integer 0..1000000 and total integer 0..1000000 where firstSeq is at or below lastSeq; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object, non-integer, non-finite, out-of-range or firstSeq above lastSeq throws TypeError('INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT') without echoing input. On valid synthetic input return a fresh object with firstSeq, lastSeq, total, expected, missing, hasGap, contiguous where the first three preserve input values, expected is lastSeq minus firstSeq plus 1, missing is expected minus total clamped to 0, hasGap is true only when missing is above 0, and contiguous is true only when missing equals 0. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, roles, tasks, agents, progress, priority or next steps and never contacts backends or agents. This module is independently tested; application/UI integration is outside this change.

Examples (JSON input and expected output):

```json
{
  "input": {
    "firstSeq": 10,
    "lastSeq": 12,
    "total": 3
  },
  "output": {
    "contiguous": true,
    "expected": 3,
    "firstSeq": 10,
    "hasGap": false,
    "lastSeq": 12,
    "missing": 0,
    "total": 3
  }
}
```

```json
{
  "input": {
    "firstSeq": 10,
    "lastSeq": 14,
    "total": 3
  },
  "output": {
    "contiguous": false,
    "expected": 5,
    "firstSeq": 10,
    "hasGap": true,
    "lastSeq": 14,
    "missing": 2,
    "total": 3
  }
}
```

```json
{
  "input": {
    "firstSeq": 5,
    "lastSeq": 5,
    "total": 1
  },
  "output": {
    "contiguous": true,
    "expected": 1,
    "firstSeq": 5,
    "hasGap": false,
    "lastSeq": 5,
    "missing": 0,
    "total": 1
  }
}
```

Public regression tests: `lab_tests/community_lane_event_sequence_gap_descriptor.test.mjs`.


<!-- community-core:attention-flagged-share-descriptor -->
### Attention Flagged Share Descriptor for Operations Attention

Provides a small deterministic helper to describe operations attention flagged share from synthetic flaggedCount and criticalCount values, supporting consistent local review of coordination needs without reading task titles, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/attention_flagged_share_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection, mutable module variables or dependencies. Input must be a plain object with flaggedCount integer 0..1000000 and criticalCount integer 0..1000000 where criticalCount is at or below flaggedCount; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object, non-integer, non-finite, out-of-range or criticalCount above flaggedCount throws TypeError('INVALID_ATTENTION_FLAGGED_SHARE_INPUT') without echoing input. On valid synthetic input return a fresh object with flaggedCount, criticalCount, nonCriticalFlagged, hasFlagged, hasCritical, allCritical where the first two preserve input values, nonCriticalFlagged is flaggedCount minus criticalCount, hasFlagged is true only when flaggedCount is above 0, hasCritical is true only when criticalCount is above 0, and allCritical is true only when flaggedCount is above 0 and equals criticalCount. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, roles, tasks, agents, progress, priority or next steps and never contacts backends or agents. This module is independently tested; application/UI integration is outside this change.

Examples (JSON input and expected output):

```json
{
  "input": {
    "criticalCount": 0,
    "flaggedCount": 0
  },
  "output": {
    "allCritical": false,
    "criticalCount": 0,
    "flaggedCount": 0,
    "hasCritical": false,
    "hasFlagged": false,
    "nonCriticalFlagged": 0
  }
}
```

```json
{
  "input": {
    "criticalCount": 1,
    "flaggedCount": 3
  },
  "output": {
    "allCritical": false,
    "criticalCount": 1,
    "flaggedCount": 3,
    "hasCritical": true,
    "hasFlagged": true,
    "nonCriticalFlagged": 2
  }
}
```

```json
{
  "input": {
    "criticalCount": 2,
    "flaggedCount": 2
  },
  "output": {
    "allCritical": true,
    "criticalCount": 2,
    "flaggedCount": 2,
    "hasCritical": true,
    "hasFlagged": true,
    "nonCriticalFlagged": 0
  }
}
```

Public regression tests: `lab_tests/community_attention_flagged_share_descriptor.test.mjs`.


<!-- community-core:lane-command-recovery-descriptor -->
### Lane Command Recovery Descriptor for Operations Lanes

Provides a small deterministic helper to describe operations lane recovery pressure from synthetic retryCount and commandRecoveryCount values, supporting consistent local review of module coordination without interpreting message text, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/lane_command_recovery_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection, mutable module variables or dependencies. Input must be a plain object with retryCount integer 0..1000000 and commandRecoveryCount integer 0..1000000; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object, non-integer, non-finite or out-of-range throws TypeError('INVALID_LANE_COMMAND_RECOVERY_INPUT') without echoing input. On valid synthetic input return a fresh object with retryCount, commandRecoveryCount, totalRecoveries, hasRetries, hasCommandRecoveries, hasAnyRecovery where the first two preserve input values, totalRecoveries is retryCount plus commandRecoveryCount, hasRetries is true only when retryCount is above 0, hasCommandRecoveries is true only when commandRecoveryCount is above 0, and hasAnyRecovery is true only when totalRecoveries is above 0. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, roles, tasks, agents, progress, priority or next steps and never contacts backends or agents. This module is independently tested; application/UI integration is outside this change.

Examples (JSON input and expected output):

```json
{
  "input": {
    "commandRecoveryCount": 0,
    "retryCount": 0
  },
  "output": {
    "commandRecoveryCount": 0,
    "hasAnyRecovery": false,
    "hasCommandRecoveries": false,
    "hasRetries": false,
    "retryCount": 0,
    "totalRecoveries": 0
  }
}
```

```json
{
  "input": {
    "commandRecoveryCount": 1,
    "retryCount": 2
  },
  "output": {
    "commandRecoveryCount": 1,
    "hasAnyRecovery": true,
    "hasCommandRecoveries": true,
    "hasRetries": true,
    "retryCount": 2,
    "totalRecoveries": 3
  }
}
```

```json
{
  "input": {
    "commandRecoveryCount": 5,
    "retryCount": 0
  },
  "output": {
    "commandRecoveryCount": 5,
    "hasAnyRecovery": true,
    "hasCommandRecoveries": true,
    "hasRetries": false,
    "retryCount": 0,
    "totalRecoveries": 5
  }
}
```

Public regression tests: `lab_tests/community_lane_command_recovery_descriptor.test.mjs`.


<!-- community-core:stale-threshold-order-descriptor -->
### Stale Threshold Order Descriptor for Operations Tasks

Provides a small deterministic helper to describe operations stale-threshold order from synthetic active and review threshold values, supporting consistent local review of monitoring dependencies without reading task content, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/stale_threshold_order_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection, mutable module variables or dependencies. Input must be a plain object with activeTaskStaleMs integer 0..1000000000 and reviewTaskStaleMs integer 0..1000000000; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object, non-integer, non-finite or out-of-range throws TypeError('INVALID_STALE_THRESHOLD_ORDER_INPUT') without echoing input. On valid synthetic input return a fresh object with activeTaskStaleMs, reviewTaskStaleMs, minThreshold, maxThreshold, equal, activeIsLower, reviewIsLower where the first two preserve input values, minThreshold is the smaller of the two values, maxThreshold is the larger of the two values, equal is true only when both values are equal, activeIsLower is true only when activeTaskStaleMs is below reviewTaskStaleMs, and reviewIsLower is true only when reviewTaskStaleMs is below activeTaskStaleMs. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, roles, tasks, agents, progress, priority or next steps and never contacts backends or agents. This module is independently tested; application/UI integration is outside this change.

Examples (JSON input and expected output):

```json
{
  "input": {
    "activeTaskStaleMs": 1000,
    "reviewTaskStaleMs": 2000
  },
  "output": {
    "activeIsLower": true,
    "activeTaskStaleMs": 1000,
    "equal": false,
    "maxThreshold": 2000,
    "minThreshold": 1000,
    "reviewIsLower": false,
    "reviewTaskStaleMs": 2000
  }
}
```

```json
{
  "input": {
    "activeTaskStaleMs": 5000,
    "reviewTaskStaleMs": 5000
  },
  "output": {
    "activeIsLower": false,
    "activeTaskStaleMs": 5000,
    "equal": true,
    "maxThreshold": 5000,
    "minThreshold": 5000,
    "reviewIsLower": false,
    "reviewTaskStaleMs": 5000
  }
}
```

```json
{
  "input": {
    "activeTaskStaleMs": 9000,
    "reviewTaskStaleMs": 3000
  },
  "output": {
    "activeIsLower": false,
    "activeTaskStaleMs": 9000,
    "equal": false,
    "maxThreshold": 9000,
    "minThreshold": 3000,
    "reviewIsLower": true,
    "reviewTaskStaleMs": 3000
  }
}
```

Public regression tests: `lab_tests/community_stale_threshold_order_descriptor.test.mjs`.


<!-- community-core:ralph-activation-descriptor -->
### Ralph Activation Descriptor for Operations Settings

Provides a small deterministic helper to describe Ralph extension activation stage from synthetic configured, installed and active flags, supporting consistent local review of setup dependencies without reading task content, contacting backends, or dispatching agents.

Reusable deterministic JSON core: `web-v2/src/community/ralph_activation_descriptor.mjs`, API `runFeature(payload)`. This module is independently tested; application/UI integration is outside this change.

Export pure function runFeature(payload) with no I/O, env, processes, time, randomness, callbacks, imports, classes, async, this, reflection, mutable module variables or dependencies. Input must be a plain object with boolean ralphExtensionConfigured, boolean ralphExtensionInstalled and boolean ralphExtensionActive; extra properties are ignored and input is never mutated. Any malformed shape, missing fields, null payload, array payload, non-plain-object or non-boolean flags throws TypeError('INVALID_RALPH_ACTIVATION_INPUT') without echoing input. On valid synthetic input return a fresh object with ralphExtensionConfigured, ralphExtensionInstalled, ralphExtensionActive, activationLevel, fullyActive, inactive, consistent, activatable where the first three preserve input values, activationLevel is 0..3 count of true flags, fullyActive is true only when all three are true, inactive is true only when all three are false, consistent is true only when (!ralphExtensionActive || (ralphExtensionInstalled && ralphExtensionConfigured)) && (!ralphExtensionInstalled || ralphExtensionConfigured), and activatable is true only when ralphExtensionConfigured and ralphExtensionInstalled are true and ralphExtensionActive is false. Build results only with object literals or Object.fromEntries, arrays with push and maps with set where needed, use only for-of and Object.entries/Object.values with Map get/set, allow computed access only for literal nonnegative numeric indices, no dynamic computed access, no reassignment of function/builtin identifiers, no property assignment/update/delete, no Object.assign/create, no aliased builtins or callbacks, no prototype/constructor access. Computation is literal and makes no inference about teams, roles, tasks, agents, progress, priority or next steps and never contacts backends or agents. This module is independently tested; application/UI integration is outside this change.

Examples (JSON input and expected output):

```json
{
  "input": {
    "ralphExtensionActive": false,
    "ralphExtensionConfigured": false,
    "ralphExtensionInstalled": false
  },
  "output": {
    "activatable": false,
    "activationLevel": 0,
    "consistent": true,
    "fullyActive": false,
    "inactive": true,
    "ralphExtensionActive": false,
    "ralphExtensionConfigured": false,
    "ralphExtensionInstalled": false
  }
}
```

```json
{
  "input": {
    "ralphExtensionActive": false,
    "ralphExtensionConfigured": true,
    "ralphExtensionInstalled": true
  },
  "output": {
    "activatable": true,
    "activationLevel": 2,
    "consistent": true,
    "fullyActive": false,
    "inactive": false,
    "ralphExtensionActive": false,
    "ralphExtensionConfigured": true,
    "ralphExtensionInstalled": true
  }
}
```

```json
{
  "input": {
    "ralphExtensionActive": true,
    "ralphExtensionConfigured": false,
    "ralphExtensionInstalled": false
  },
  "output": {
    "activatable": false,
    "activationLevel": 1,
    "consistent": false,
    "fullyActive": false,
    "inactive": false,
    "ralphExtensionActive": true,
    "ralphExtensionConfigured": false,
    "ralphExtensionInstalled": false
  }
}
```

Public regression tests: `lab_tests/community_ralph_activation_descriptor.test.mjs`.
