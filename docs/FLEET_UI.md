# Interface do observador de equipe externa

## Escopo

Modo **Operate**: acompanhar atividade confirmada, fila, entregas e eventos de uma equipe externa. Esta é uma extensão opcional do escritório Nexus existente, com as mesmas salas, personagens, sprites e linguagem pixelada. Este registro vale somente para o observador; não define um novo sistema visual para toda a aplicação.

O controlador independente cria e distribui tarefas, executa e valida o trabalho. O Nexus recebe sua projeção pública por Socket.IO e permite consulta. O modo padrão continua com o comportamento anterior; o observador depende da ativação explícita do servidor de equipe externa. O [contrato da fonte](EXTERNAL_FLEET.md) descreve configuração, validação e limites dos dados.

## Identidade e hierarquia

A barra inicial apresenta **NexusOrchestrator**, “Laboratório de código aberto”, estado da fonte, contagens “em atividade” e “na fila”, e ações “Quadro de tarefas” e “Atualizar”. Ela começa à direita dos controles de zoom, mantendo essas informações legíveis no primeiro viewport.

Preservar os tokens existentes: `--pixel-bg` (`#1e1e2e`), bordas, texto, botões e foco com `--pixel-accent`. A conexão atual usa verde (`#95f3ae`); avisos usam amarelo (`#ffcb6b`) e texto explícito. A tipografia global continua `FS Pixel Sans`. A marca tem 32px e a barra 24px no desktop; abaixo de 700px, passam a 26px e 20px. Botões mantêm hover e contorno visível de foco.

## Layout e interação

- **Desktop:** a barra ocupa o topo sem cobrir o zoom. O quadro abre sobre o lado direito, limitado a `min(1100px, 100vw)`, com colunas em rolagem horizontal. O escritório permanece visível ao fundo.
- **Mobile:** a identidade ocupa uma linha própria e as contagens e ações se reorganizam. O quadro cabe na largura da tela; cabeçalho, fonte, explicação e botão de fechar ficam acessíveis. As colunas usam `calc(100vw - 58px)`, deixando visível a continuidade lateral. A instrução “Deslize o quadro” explica o acesso às demais colunas.
- **Quadro gerenciado:** a ordem é “Em andamento”, “Na fila”, “Publicadas” e “Bloqueadas”. O título humano lidera cada cartão, seguido do repositório e de uma referência de até oito caracteres; o identificador completo fica no atributo `title`. Títulos usam 16px; referências, 12px. “Abrir no GitHub” aparece quando há URL e abre outra aba.
- **Consulta:** o observador oculta criação de tarefas, mudança de estado, atribuição manual, gerenciamento de agentes, início de reuniões e envio de comandos. “Atualizar” consulta novamente o estado; não inicia trabalho. O painel legado **Ops Status** fica oculto. **Live Logs** conserva título e controle “Hide”, com afastamento inferior de 76px para liberar a barra de ferramentas.

## Estado e confiança

| Estado visível | Significado e apresentação |
| --- | --- |
| Conectado | A projeção está atual; atividade soma execuções ativas e em preparação. |
| Sinais desatualizados | A fonte deixou de estar atual. Exibir “A atividade atual dos agentes não foi confirmada.” |
| Fonte indisponível | Falha de fonte ou perda do transporte. Exibir o mesmo aviso de atividade não confirmada. |

O cliente verifica a idade a cada dois segundos e expira sinais acima de 30 segundos. Ao expirar ou perder o transporte, zera atividade/fila, remove atribuições atuais e deixa tarefas não concluídas como bloqueadas; o histórico de concluídas permanece. A reconexão precisa de um novo evento de operações para voltar a confirmar atividade. Presença visual de personagem, conexão e evento de log não comprovam execução ou entrega.

## Guardrails e alcance da revisão

Preservar o mundo pixelado, a hierarquia de títulos humanos, a identificação da fonte e a consulta sem controles de execução. Não acrescentar afirmações de saúde do motor nativo, salas, lanes, autenticação ou sucesso de provedores ao observador. Projetar apenas dados públicos mínimos; a interface não garante anonimização nem substitui saneamento na origem.

As capturas finais de escritório e quadro em **1920×960** e **390×844** receberam parecer visual **ship**, com os seis ajustes materiais resolvidos: sobreposição da marca, encaixe do quadro, alegações do painel legado, cobertura dos logs, leitura dos cartões e ordem das colunas. Esse parecer é limitado às capturas; não certifica comportamento em execução, destinos dos links, correção da fonte, acessibilidade completa ou testes de interação.

Referências de implementação: `web-v2/src/components/FleetStatusBar.tsx`, `FleetStatusBar.css`, `KanbanSidebar.tsx`, `KanbanSidebar.css`, `web-v2/src/App.tsx` e `web-v2/src/index.css`.
