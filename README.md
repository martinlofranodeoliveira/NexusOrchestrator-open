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
