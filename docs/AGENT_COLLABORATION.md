# Coordenação por capacidades entre agentes

`server/services/agentCollaboration.js` fornece um registro e um quadro de
pedidos de ajuda em memória, com exportação/importação verificadas por replay.
Serve para um controlador conectar executores diferentes sem confundir um
pedido aceito com trabalho executado. O módulo usa somente metadados JSON e
não importa bibliotecas, acessa arquivos/rede, chama ferramentas ou executa
modelos. A integração com o servidor, o controlador da frota e a sede ainda
precisa ser feita por um adaptador confiável.

## Registro e seleção

Cada agente declara exatamente `id`, `role`, `provider`, `model`, `capabilities`,
`available` e `floor`. IDs/capacidades são identificadores ASCII minúsculos de
até 64 caracteres. `floor` aceita 0 a 100 e organiza a apresentação; não cria
um executor nem comprova que alguém está trabalhando.

`role` é uma política confiável e imutável do registro: `planner` pode iniciar
objetivos raiz; `executor` só pode pedir ajuda no contexto de uma reserva ativa.
Possuir capacidade `planning` não concede autoridade de planner. Um planner
pode ter outras capacidades, mas só o operador define esse papel; operações de
disponibilidade e mensagens de agentes não conseguem alterá-lo.

| Provedor | Modelo exigido | Prioridade | Reservas simultâneas padrão |
| --- | --- | --- | --- |
| `muse` | `opencode-go/muse-spark-1.3-contributor` | 1 | 4 |
| `gemini` | `gemini-3.8-flash-high` | 2 | 1 |
| `codex` | Identificador exato informado pelo operador | 3 | 1, e uma reserva por dia |
| `local` | Identificador do modelo atual informado pelo operador | 4 | 1, compartilhada por todos os agentes locais |

O registro não descobre modelos nem verifica autenticação. O adaptador deve
comprovar que o executor usou o modelo declarado, preservando a autenticação
nativa. Não há troca silenciosa de modelo. Limites configuráveis podem ser
reduzidos; os tetos são 10 Muse, 4 Gemini, 1 Codex e 1 local. Isso não indica
cota disponível no provedor nem autoriza aumentar os limites reais da máquina.
Cada agente individual mantém no máximo uma reserva.

A seleção automática considera capacidade, disponibilidade e reservas. Prefere
Muse e depois Gemini; dentro da mesma prioridade distribui a fila entre agentes
com menos pedidos abertos, usando o ID como desempate determinístico. Um alvo
explícito indisponível gera `AGENT_UNAVAILABLE`; não é substituído. Ausência de
capacidade gera `UNSUPPORTED_CAPABILITY`. Disponibilidade é informação recebida
do adaptador, não um health check feito pelo módulo.

## API mínima

O exemplo é sintético e não executa modelos:

```js
const { AgentCollaboration } = require('../server/services/agentCollaboration');

const board = new AgentCollaboration({ agents: [
  {
    id: 'director', role: 'planner', provider: 'muse',
    model: 'opencode-go/muse-spark-1.3-contributor',
    capabilities: ['planning'], available: true, floor: 0,
  },
  {
    id: 'reviewer', role: 'executor', provider: 'gemini', model: 'gemini-3.8-flash-high',
    capabilities: ['review'], available: true, floor: 2,
  },
] });

const receipt = board.apply('request', {
  taskId: 'review-parser', from: 'director', capability: 'review',
  sourceRefs: [{
    repository: 'example/public-parser', commit: 'a'.repeat(40),
    visibility: 'public', paths: ['src/parser.js'],
  }],
}, { expectedRevision: 0, idempotencyKey: 'request-parser-1' });

// receipt.status === 'accepted'; ainda não houve execução.
const claim = board.apply('claim', {
  taskId: receipt.taskId, agentId: receipt.agentId, day: '2026-10-23',
}, { expectedRevision: 1, idempotencyKey: 'claim-parser-1' });

// O adaptador executaria o agente e a validação fora deste módulo.
// Uma reserva também não comprova que uma chamada ao provedor ocorreu.
console.log(claim.claimToken); // review-parser:r2
```

Métodos:

- `snapshot()` / `exportState()`: devolvem cópia profundamente congelada.
- `getTask(taskId)`: consulta destacada, sem alterar estado.
- `apply(operation, input, { expectedRevision, idempotencyKey })`: transação
  síncrona; qualquer erro preserva o estado anterior.
- `AgentCollaboration.fromState(state)`: reexecuta o journal e compara todo o
  estado derivado e os recibos. Divergência ou versão desconhecida é rejeitada.

O formato atual é `schemaVersion: 2`. A versão 1 experimental não identifica
papéis nem faz fencing da delegação; ela é rejeitada, sem migrar ou presumir
autoridade de registros antigos. Antes de integrar, o operador deve construir
um registro explícito e reconciliar trabalhos/reservas anteriores fora deste
módulo. Não importar estado de modelo ou de UI como política confiável.

Operações e entradas:

| Operação | Campos da entrada | Revisão esperada |
| --- | --- | --- |
| `request` | `taskId`, `from`, `capability`, `sourceRefs`; opcionais `to`, `dependencies`, `parentTaskId`, `parentClaimToken`, `hopBudget` | Global |
| `claim` | `taskId`, `agentId`, `day` | Da tarefa |
| `release` | `taskId`, `agentId`, `claimToken` | Da tarefa |
| `settle` | `taskId`, `agentId`, `claimToken`, `status`, `code`, `evidenceRefs` | Da tarefa |
| `dependencies` | `taskId`, `dependencies` | Da tarefa |
| `availability` | `agentId`, `available` | Global |

O recibo contém apenas `operation`, `status`, `taskId`, `taskRevision`,
`stateRevision`, `agentId`, `claimToken` e `resultCode`. Um replay da mesma chave
e mesma operação normalizada retorna o recibo original mesmo se a revisão já
avançou. Reusar a chave para outra operação/payload gera
`IDEMPOTENCY_CONFLICT`. A revisão esperada não faz parte da identidade da
operação: ela protege a primeira aplicação, não impede seu replay.

## Ajuda, dependências e resultados

Somente agentes registrados com `role: 'planner'` iniciam pedidos raiz. Nenhuma
combinação de capacidades técnicas concede esse papel implicitamente.
Um executor pede ajuda indicando `parentTaskId` e `parentClaimToken`; `from`
precisa ser o destinatário desse pedido pai ainda aberto **e reservado**, e o
token precisa ser exatamente o da reserva atual. Token omitido, liberado ou
anterior a uma nova reserva gera `STALE_PARENT_CLAIM` sem criar tarefa. Um token
anexado a pedido raiz é rejeitado. O orçamento raiz é de no máximo dois saltos;
cada filho herda um a menos. O executor não pode reiniciar esse orçamento
omitindo o pai, nem pedir ajuda a si mesmo, a desconhecidos ou de volta a um
agente ancestral.

O fencing é aplicado antes de aceitar qualquer novo pedido de ajuda. Um replay
de uma operação já aceita devolve apenas seu recibo original, mesmo depois da
rotação do token; ele não cria outro pedido. O adaptador não deve interpretar
esse replay como autorização para executar novamente a mesma ajuda.

Dependências referenciam tarefas existentes. CAS rejeita atualizações baseadas
em revisão antiga; o grafo rejeita ciclos. A verificação inclui a relação
pai/ajudante, evitando o impasse “pai espera ajuda e ajudante depende do pai”.
Uma tarefa só pode ser reservada depois de suas dependências terminarem com
`completed`. Dependências de tarefas em execução não podem ser alteradas.
O pai só termina quando os ajudantes terminaram; ajudante com falha impede
considerar o pai concluído com sucesso.

`claimToken` usa a identidade completa da tarefa e sua revisão. Uma reserva
antiga não pode encerrar uma reserva posterior. O token é um identificador de
fencing, não uma credencial secreta. Somente o destinatário registrado pode
reservar, liberar ou registrar resultado de sua tarefa.

Estados são `accepted`, `completed` e `failed`. `accepted` pode estar na fila ou
reservado (`claimToken` presente). Resultado bem sucedido exige código
`DELIVERED` e ao menos uma referência pública de evidência; falhas usam um dos
códigos fixos `VALIDATION_FAILED`, `PROVIDER_UNAVAILABLE`, `INVALID_RESULT` ou
`CANCELLED`, com evidências vazias. Não são aceitos logs, diagnósticos livres,
prompts, comandos ou justificativas que possam conter dados privados.

`completed` registra a declaração do adaptador; **não prova teste, publicação,
CI, revisão independente nem execução de modelo**. O adaptador só deve chamar
essa operação depois de seus gates independentes. Nenhum recibo deste módulo
autoriza publicar, alterar permissões ou dispensar os testes existentes.

## Limites e responsabilidade do adaptador

- Verificar PUBLIC e HEAD no GitHub antes de ler fontes e de publicar. Uma
  referência contém somente `repository`, commit hexadecimal de 40 caracteres,
  `visibility: 'public'` e caminhos relativos explícitos. A marca `public` é
  validada estruturalmente e não substitui essa verificação externa.
- Não incluir fontes privadas, oráculos privados, aceites, credenciais,
  histórico, `.git`, `.env`, pastas de autenticação ou conteúdo de arquivos.
  Campos extras, acessores e objetos não JSON são rejeitados; nomes de caminhos
  sensíveis comuns também são recusados. Isso não é um detector de segredos.
  Arrays devem ser densos, com apenas índices próprios de `0` a `length - 1`.
  Propriedades extras com nomes numéricos fora desse intervalo, como
  `4294967295`, também são rejeitadas, inclusive acessores, sem ler seu valor.
  Isso evita descartar metadados silenciosamente durante normalização ou replay;
  arrays JSON válidos, inclusive congelados, mantêm o mesmo contrato.
- Autenticar o ator e vincular `from`/`agentId` à identidade real. Não expor
  `apply` diretamente à UI, ao modelo ou a requisições sem autorização.
- Serializar acesso entre processos com armazenamento transacional/lock e CAS
  externo. O módulo em memória não fornece lock de arquivos ou de processos.
  Persistir snapshot/journal atomicamente **antes** de iniciar um executor;
  assinar ou proteger seu armazenamento. Replay detecta inconsistência, não
  adulteração coerente feita por alguém com acesso de escrita.
- Uma reserva não tem timeout nem expiração automática. Após falha/restart,
  preservar reservas até provar encerramento do executor anterior. `release`
  registra essa decisão; não mata processos nem desfaz efeitos externos.
- Fornecer `day` a partir de relógio confiável em UTC. O módulo não lê horário.
  Codex permite uma reserva por dia, inclusive se a reserva for depois liberada
  ou falhar; replay não consome outra. Dias anteriores ao último observado são
  rejeitados. Pedidos aceitos para Codex podem ficar na fila até a cota diária
  permitir uma reserva. Isto é um teto conservador de tentativas, não uma
  consulta ao limite semanal da conta.
- Preservar sandbox externo, origem/dependências somente leitura, ausência de
  credenciais/rede nos testes e aceitação independente. Não inferir segurança
  apenas de JSON válido ou da conclusão de outro modelo.
- Há tetos de 128 agentes, 4096 tarefas, 16384 operações e 8 MiB de estado.
  Atingi-los rejeita novas mutações. Não descartar journal ou reservas ativas
  para contornar o limite; arquivamento/rotação precisam de adaptador revisado.
  O módulo não cria novos projetos, não gera commits nem mantém agentes ativos
  artificialmente quando não há trabalho útil aprovado.

## Testes separados

```sh
cd server
node --test tests/agentCollaboration.test.js tests/agentCollaborationJsonArrays.test.js
```

O caminho `tests/` é adicional: o script `npm test` atual executa `test/`
(singular), e não foi alterado. A suíte nova deve ser chamada explicitamente
pelo adaptador/CI. Ela cobre escolha por capacidade, filas, resultados,
idempotência/replay, CAS, tokens antigos, ciclos, contabilidade diária,
concorrência local agregada, modelos exatos, entrada malformada e referências
públicas. Também verifica fencing da delegação após release/reclaim, token de
pai omitido e autoridade de raiz separada de capacidades técnicas. Não usa rede,
autenticação ou provedores reais.

A suíte adicional de arrays verifica esse limite também em referências públicas,
dependências, capacidades e importação do journal. Os 30 testes originais de
colaboração continuam separados e inalterados.

## Referências e atribuição

Implementação original deste projeto, sob sua licença MIT; não copia código do
DeepSeek Harness. O estudo usou fontes públicas fixadas no commit
`687f282e8625c6b8d11ff58211a90524be2e4317`, versão `0.2.1-rc.2`:

- [Arquitetura de capacidades, eventos duráveis e projeções](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/architecture.md).
- [Agent Teams: quadro com CAS, DAG e mensagens](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/experimental/agent-team/README.md).
- [Contrato de subagentes e resultados](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/subagent.md).
- [Licença MIT, copyright 2026 DeepSeek](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/LICENSE).
- [Aviso de segurança do preview experimental](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/SAFETY.md).

O Harness upstream não foi instalado nem é uma dependência. Seus Agent Teams
não oferecem outbox deduplicado ou locks de escrita entre processos, e seus
adapters ACP/Codex não comprovam compatibilidade com todos os nossos CLIs.
Não há promessa de agentes trabalhando por meio dele nesta entrega.
