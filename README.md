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
