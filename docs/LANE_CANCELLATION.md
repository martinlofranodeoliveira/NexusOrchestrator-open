# Cancelamento no fechamento de uma lane

Quando o processo fecha e o orquestrador já marcou `stoppedBySystem`, o fechamento
tem disposição `cancelled`, mesmo que a saída anterior contenha conclusão,
rejeição de review ou pedido de ação administrativa. Esses sinais não autorizam
integração, conclusão de tarefas, handoff, rejeição de review ou novas tentativas.

O callback libera somente a reserva que ainda pertence ao processo encerrado.
A fila existente pode iniciar o próximo trabalho; um callback antigo não remove
nem sobrescreve a reserva ou o estado de um sucessor. Sem sucessor, a lane mantém
o estado cancelado e o agente fica ocioso. O workspace encerrado recebe a limpeza
normal e o hook `afterLaneClose` recebe disposição e resultado `cancelled`.

O limite é o sinal de parada observado **na entrada do callback de fechamento**.
O comportamento não desfaz integrações ou outros efeitos que já começaram antes
da parada. Também não muda as opções de despacho automático, autenticação ou
configuração de provedores.

As regressões em `lab_tests/laneCancellation.test.js` exercitam o avaliador
puro e o callback real com dados sintéticos e operações externas substituídas.
O helper original `scripts/checks-offline.py web` executa essas 13 regressões
na etapa existente de `lab_tests`, depois dos testes, lint e build da interface.
O helper e a contagem dos 330 testes originais do servidor permanecem intactos. A validação usa fontes e dependências
somente leitura, ambiente limpo e rede isolada; nenhum provedor real é chamado.
