# Equipe externa: contrato e limites

Esse modo é um observador de um controlador independente. Ele não instala agentes, não cria tarefas automaticamente, não executa comandos e não acessa credenciais de modelos. Use `server/fleetServer.js` em vez de `server/index.js`; os dois servidores usam a porta 4000 e não devem ser iniciados juntos nessa porta. O modo padrão da aplicação mantém seu comportamento anterior.

O operador deve gerar um arquivo JSON UTF-8 com caminho absoluto, arquivo regular de proprietário igual ao processo e permissão `0600`. Diretórios ancestrais devem pertencer ao usuário ou ao root, sem escrita de grupo/outros, e não podem ser links simbólicos. Publique o arquivo por substituição atômica no mesmo diretório; o leitor recusa mudanças durante a leitura, links e arquivos acima de 2 MiB. Guarde o snapshot fora do repositório e não o envie a provedores.

Exemplo **sintético**, com todos os campos obrigatórios. Troque `updatedAtMs` pelo instante real da coleta em milissegundos Unix; o valor abaixo é apenas ilustrativo e será considerado desatualizado:

```json
{
  "schemaVersion": 1,
  "updatedAtMs": 1700000000000,
  "agents": [
    {
      "id": "worker1",
      "name": "Implementador",
      "role": "developer",
      "status": "idle",
      "model": "",
      "task": "",
      "repo": ""
    }
  ],
  "tasks": [],
  "events": []
}
```

Campos de cada coleção:

| Coleção | Campos exatos | Limite |
| --- | --- | --- |
| `agents` | `id`, `name`, `role`, `status`, `model`, `task`, `repo` | 64 |
| `tasks` | `id`, `title`, `status`, `assignee`, `repo`, `url` | 200 |
| `events` | `id`, `agentId`, `at`, `message` | 250 |

IDs devem ser únicos por coleção, com até 80 caracteres, começando com letra/número e usando somente letras, números, `.`, `_`, `:`, `-`. `assignee` aceita ID ou `null`. `repo` aceita `owner/repository` ou string vazia; `url` aceita string vazia ou HTTPS em `github.com`, sem credenciais, query ou fragmento. Títulos e tarefas têm até 512 caracteres, mensagens até 1024; não use quebras de linha ou caracteres de controle. Nome tem até 120 caracteres, papel até 64 e modelo até 160.

Estados literais de agente: `idle`, `preparing`, `running`, `testing`, `reviewing`, `publishing`, `blocked`, `unavailable`. Estados de tarefa: `queued`, `preparing`, `implementing`, `published`, `rejected`, `quarantined`. O produtor deve derivá-los de evidências reais, distinguir bloqueio/espera de execução e nunca marcar tentativa ou resposta parcial como entrega. Identidade de modelo é declarada pelo produtor; a interface não comprova autenticação ou resposta do provedor.

`updatedAtMs` e `events[].at` são inteiros não negativos e não podem estar mais de cinco segundos no futuro. Há rejeição de padrões comuns de segredos e caminhos privados, mas isso **não substitui saneamento no produtor** nem garante anonimização. Nunca inclua dados de clientes/pacientes, prompts privados, `.env`, tokens, chaves, arquivos de autenticação ou logs brutos.

O arquivo válido com até 30 segundos de idade produz estado `live`. Depois disso, `stale` preserva o histórico de tarefas, limpa associações atuais e zera atividade confirmada. Falha de leitura/validação produz `unavailable` sem inventar dados. A aplicação atualiza o estado a cada dois segundos e emite apenas eventos novos; um evento perdido durante desconexão não constitui histórico persistente.

O cliente também expira sinais com mais de 30 segundos. Se perder o transporte Socket.IO, mostra a fonte indisponível, zera atividade/fila e deixa de atribuir execução aos agentes. O histórico de tarefas concluídas permanece disponível. Reconectar o transporte, sozinho, não restaura a indicação de atividade: é necessário receber um estado de operações atual. Não é preciso recarregar a página para essa recuperação.

As rotas `GET /health`, `/api/status`, `/api/operations`, `/api/agents` e `/api/tasks` expõem somente a projeção validada. `health.ok` informa que o servidor responde; verifique também `status.source.state` para saber se a fonte está atual. Nenhuma rota de aplicação altera o controlador externo. A interface oculta controles de escrita nesse modo; o backend também os recusa. Não exponha a porta à internet nem trate o modo local como autenticação de servidor público.
