# Nexus Orchestrator Open

**Orquestração de tarefas e acompanhamento de equipes de IA, com servidor Node/Express e interface React.** Edição pública de desenvolvimento e auto-hospedagem da [LOFRANO TECNOLOGIA](https://lofranotecnologia.com.br).

O projeto reúne tarefas, salas, filas e integrações opcionais com executores. A interface de escritório permite visualizar o trabalho; um modo separado acompanha uma frota externa apenas para leitura. A existência de um agente na tela não comprova que um modelo foi chamado ou que uma entrega foi publicada.

## Escolha como usar

| Modo | Processo | Finalidade |
| --- | --- | --- |
| Aplicação local | `server/index.js` | Trabalhar com a aplicação e configurar integrações opcionais em ambiente próprio. |
| Observador de equipe externa | `server/fleetServer.js` | Exibir um snapshot produzido por outro controlador, sem executar modelos ou comandos. |

Os dois servidores usam a porta **4000** por padrão. Execute somente um deles nessa porta. Este repositório não provisiona contas de provedores nem inclui a operação privada, dados ou implantação hospedada da LOFRANO.

## Instalar e iniciar a aplicação local

Requisitos: **Node.js 22.12 ou superior**, npm e Git. Os comandos abaixo usam um shell compatível com POSIX. As dependências de servidor e interface são separadas; não há um `package.json` na raiz.

```sh
git clone https://github.com/martinlofranodeoliveira/NexusOrchestrator-open.git
cd NexusOrchestrator-open
npm --prefix server ci
npm --prefix web-v2 ci
cp -n .env.example .env
npm --prefix web-v2 run build
node server/index.js
```

Abra <http://127.0.0.1:4000/>. Antes de iniciar, revise sua configuração local e escolha uma pasta de trabalho própria. Configure somente os provedores e integrações que pretende usar. Chamadas a serviços externos podem consumir recursos ou créditos quando acionadas pelo operador.

Despacho automático, retomada de órfãos e criação de tarefas demonstrativas ficam **desativados por padrão** e exigem configuração explícita. Usar o servidor normal não transforma automaticamente o computador em uma equipe autônoma configurada.

Para desenvolver a interface com recarga local, use `npm --prefix web-v2 run dev` em outro terminal; mantenha o servidor normal separado e consulte o endereço informado pelo Vite.

## Observar uma equipe externa

Depois de instalar as dependências e construir a interface, inicie **somente** este servidor:

```sh
NEXUS_FLEET_SNAPSHOT=/caminho/absoluto/privado/snapshot.json node server/fleetServer.js
```

O modo observador:

- Lê o snapshot indicado pelo operador e atualiza a interface por Socket.IO.
- Não carrega o arquivo de ambiente, não importa o motor normal e não chama provedores.
- Não permite criar tarefas/agentes ou enviar comandos pela interface.
- Exige Host/Origin de loopback; não confirma atividade se o snapshot estiver inválido, indisponível ou sem atualização há mais de 30 segundos.

O controlador externo continua responsável por planejar, executar, validar e publicar. Os POSTs internos do transporte Socket.IO não concedem autoridade para executar ações. Veja o [contrato de snapshot](docs/EXTERNAL_FLEET.md) e o [guia da interface observadora](docs/FLEET_UI.md).

## Componentes e documentação

| Caminho | Conteúdo |
| --- | --- |
| [`server/`](server/) | API, serviços, testes e motor da aplicação local. |
| [`web-v2/`](web-v2/) | Interface React/TypeScript, testes e build Vite. |
| [`docs/AGENT_COLLABORATION.md`](docs/AGENT_COLLABORATION.md) | Registro de capacidades, pedidos de ajuda e limites de um módulo de coordenação; sua integração ainda requer adaptador confiável. |
| [`docs/LANE_CANCELLATION.md`](docs/LANE_CANCELLATION.md) | Comportamento e limites do cancelamento de uma lane. |
| [`lab_tests/`](lab_tests/) | Regressões complementares e testes de módulos reutilizáveis. |
| [`scripts/`](scripts/) | Helpers de validação com ambiente isolado. |

Os módulos em `community/` são auxiliares independentes, em geral funções determinísticas sobre dados sintéticos. Seus testes não comprovam integração na interface, execução de agentes, disponibilidade de provedores ou operação em produção. Consulte o código e o teste do módulo antes de adotá-lo.

### Referência histórica preservada

A [documentação anterior completa](docs/README-HISTORICO.md) foi preservada **byte a byte** a partir do commit `ffcd36d588592d72fc2b022481e9e9c392ab7cf1`. Ela reúne os contratos, exemplos e registros técnicos disponíveis naquele snapshot.

**Os links relativos desse documento histórico foram escritos para a raiz do repositório.** Abra seus caminhos a partir da raiz; eles não foram reescritos para manter o snapshot intacto. As instruções de entrada nesta página e os guias atuais de `docs/` são os pontos de partida. A referência histórica não é um resultado de testes atualizado nem uma garantia de integração de todos os auxiliares.

## Verificar a sua instalação

Com as dependências instaladas em ambiente de desenvolvimento:

```sh
npm --prefix server test
npm --prefix web-v2 test
npm --prefix web-v2 run lint
npm --prefix web-v2 run build
```

Os workflows de [testes gerais](.github/workflows/tests.yml), [observador](.github/workflows/fleet-tests.yml) e [coordenação](.github/workflows/collaboration-tests.yml) registram a validação de cada commit. Os helpers `scripts/checks-offline.py` e `scripts/check-fleet-offline.py` usam fontes/dependências somente leitura e ambiente sem credenciais; dependências são preparadas antes de entrar no sandbox. Consulte os parâmetros dos scripts e os workflows para reproduzir a configuração.

Esta reorganização documental não executa provedores, instala integrações ou certifica plataformas, serviços externos e uso autônomo. Um teste puro de descritor não equivale a um teste de uma equipe real.

## Contribuir

Abra uma issue com objetivo, comportamento observado, versão e exemplo mínimo sintético. Para código, inclua testes relevantes, reprodução e documentação. Prefira uma melhoria útil e completa a alterações feitas apenas para gerar atividade.

Não publique credenciais, arquivos de ambiente reais, bancos, uploads ou dados pessoais em commits, issues, capturas ou pull requests. Exemplos devem usar dados fictícios. Não exponha este ambiente de desenvolvimento à internet sem avaliar autenticação, permissões e implantação.

## Licença e atribuições

O código de titularidade autorizada é distribuído sob [MIT](LICENSE). A declaração **ISC do servidor** e suas condições são preservadas em [LICENSES/ISC-server.txt](LICENSES/ISC-server.txt). O frontend e recursos derivados de **Pixel Agents** mantêm a licença e os créditos; sprites baseados em **MetroCity** mantêm a atribuição CC0 do autor.

Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) e [LICENSES/](LICENSES/) antes de redistribuir. O nome técnico e a URL existentes são mantidos para preservar imports, links e automações.
