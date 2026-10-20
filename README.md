# NexusOrchestrator Open

Aplicação de orquestração de agentes com servidor Node/Express e interface React de escritório pixelado. Mantém o código funcional de tarefas, salas, políticas de despacho, integrações opcionais e frontend; o histórico e os dados da operação privada não fazem parte desta edição.

## Executar localmente

Requer Node.js 22 ou posterior. Instale as dependências em `server` e `web-v2`. Copie `.env.example` para `.env` e escolha uma pasta de trabalho própria; configure somente os provedores que pretende usar. Em terminais separados, inicie `node server/index.js` e o comando `npm run dev` de `web-v2`. O servidor usa loopback na porta 4000 por padrão.

Credenciais do usuário não são distribuídas. Despacho automático, retomada de órfãos e criação de tarefas de demonstração ficam desativados por padrão e exigem opt-in explícito. A interface pode ser aberta sem provisionar serviços; integrações externas precisam de configuração própria e podem consumir recursos quando acionadas pelo usuário. Esta edição não inclui implantação hospedada ou contas de provedores.

## Testes

Os testes de servidor e frontend foram preservados, incluindo os que estavam somente na cópia local; foi acrescentado um teste dos defaults da edição aberta. Passaram 330 testes do servidor, 11 da interface, checagem de sintaxe, TypeScript, ESLint e build Vite. A execução usou fontes e dependências somente leitura, ambiente sem credenciais e rede externa bloqueada; os hashes permaneceram iguais. Execute `npm test` em `server` e `web-v2`, e `npm run build`/`npm run lint` em `web-v2`. Provedores reais, GitHub/GitLab, serviços externos e execução autônoma não foram exercitados por essa validação.

## Exclusões e licença

Não estão incluídos `.env` da operação, handoffs internos, roteiro/seed específico de organização, configurações de implantação, scripts de espelhamento/publicação automática ou as duas imagens promocionais de origem não comprovada. O código útil da aplicação e sprites com proveniência pública permanecem presentes. O recorte não contém histórico privado.

MIT para código de titularidade autorizada, com declaração ISC do servidor e licenças/atribuições de Pixel Agents e MetroCity preservadas. Consulte `LICENSE`, `LICENSES` e `THIRD_PARTY_NOTICES.md`.

As alterações úteis da cópia local de tarefas, workspaces, provedores e correção de código foram incorporadas. Branches experimentais não foram fundidas automaticamente. Credenciais devem continuar em arquivos ignorados; somente o template `.env.example` é distribuído.
