# Itens, estoque e entregas

## Preparar o estoque

1. Em **Cadastro de itens → Novo item**, escolha **EPI** ou **Uniforme**. Informe nome e fabricante/modelo. Para EPI, preencha número do CA e a data de validade do CA.
2. Em **Estoque → Novo almoxarifado**, selecione uma unidade ativa e informe o nome. Cada almoxarifado atende uma unidade.
3. Em **Estoque → Registrar entrada**, escolha o almoxarifado e o item. Informe a quantidade e a validade física do produto, quando houver. A movimentação registra quantidade, responsável e data.

Se o item ainda não existir no catálogo, use **Cadastrar novo item** no próprio formulário. Ao salvar, o sistema cadastra o item e registra a entrada juntos.

O almoxarifado aparece na lista assim que é cadastrado. A seção **Saldo por item** mostra as quantidades disponíveis e indisponíveis por local. O administrador pode editar ou inativar itens. A inativação preserva os registros anteriores.

## Entender a disponibilidade

O saldo operacional usa os almoxarifados ativos da unidade e considera itens ativos, liberados e dentro da validade. Um produto com validade para hoje ainda está disponível para entrega. O sistema usa a data do dia em `America/Sao_Paulo`.

| Indicador do pedido | Como é calculado |
| --- | --- |
| **Disponível em estoque** | Um almoxarifado da unidade tem a quantidade integral solicitada. |
| **Saldo dividido entre almoxarifados** | A unidade tem a quantidade no total, distribuída entre locais. |
| **Saldo insuficiente** | Há saldo disponível, porém abaixo da quantidade pedida. A tela mostra o quanto falta. |
| **Sem saldo disponível** | A unidade tem zero unidades elegíveis para o pedido. |

A disponibilidade é consultada quando a tela carrega. O estoque só é baixado quando a entrega é registrada. Em caso de saldo insuficiente, o sistema indica que a operação deve avaliar reposição ou compra. A compra acontece fora deste fluxo.

## Registrar a entrega

- Para atender um pedido, use **Solicitações → Pronto para entregar → Atender pedido**. O sistema preenche o destinatário, o item, a quantidade e a data sugerida. Se houver um único almoxarifado com saldo suficiente, ele já vem selecionado.
- Para entregar diretamente, abra **Histórico → Nova entrega**, selecione o colaborador, o almoxarifado e o item. Informe a quantidade.
- Preencha a data. Ela pode ser de hoje ou anterior. Para pedidos, também precisa ser igual ou posterior à abertura do pedido.
- Em **Comprovante (opcional)**, use **Tirar foto** para capturar a evidência pela câmera ou **Anexar comprovante** para escolher um PDF, PNG ou JPG de até **3 MB**. Confira a prévia antes de salvar.
- Clique em **Confirmar entrega**. O sistema usa o saldo disponível do almoxarifado selecionado e prioriza as unidades com validade mais próxima.

Em uma transação, o sistema dá baixa no saldo, registra a entrega, grava a movimentação e conclui o pedido, quando vinculado. Se alguma operação falhar, o conjunto é desfeito. Uma verificação no momento da baixa impede saldo negativo se dois operadores tentarem usar as últimas unidades.

## Registrar entregas anteriores

Em **Histórico → Registrar entregas anteriores**, escolha o colaborador e o item. Use **Cadastrar novo item** quando necessário. Informe a quantidade e a data original. O comprovante é opcional. **Salvar e continuar** mantém a tela aberta com o colaborador e a data selecionados.

O registro aparece em **Itens em uso** com a indicação **Entrega anterior**. O sistema preserva o saldo do estoque e registra o responsável pelo lançamento.

## Corrigir o Histórico

Em **Registrado em**, confira a data e a hora em que o lançamento foi salvo, no horário de Brasília. A coluna **Data da entrega** mostra a data informada no lançamento. Uma edição mantém a data do registro original.

O Histórico inicia pelos registros mais recentes. Use **Ordenar por** para mudar a ordem por data de registro ou de entrega. A busca aceita item, nome do colaborador e matrícula. Os filtros de período usam a data da entrega e podem ser combinados com a situação do recebimento.

Como administrador, abra **Editar** ou **Apagar** na linha da entrega e informe o motivo. A edição permite corrigir data e comprovante. A quantidade também pode ser corrigida quando estiver livre de vínculos com pedido, troca ou retirada. Em entregas anteriores sem comprovante ou vínculos, é possível corrigir o colaborador e o item.

As correções de quantidade ajustam o estoque quando a entrega teve baixa. Se o colaborador já havia confirmado, o sistema pede que ele confirme a quantidade corrigida. Ao apagar uma entrega, o sistema a remove das telas operacionais, estorna a baixa quando houver e mantém a justificativa e o responsável na auditoria. A solicitação de origem volta à fila quando a entrega vinculada for apagada e o pedido ainda puder ser atendido.

## Confirmar o recebimento

O operador registra a saída. Em seguida, o destinatário abre **Meus itens → Aguardando confirmação** e clica em **Confirmo que recebi**. O sistema registra a pessoa e a data/hora da confirmação. Essa ação é feita separadamente e mantém o saldo já registrado na entrega.

**Itens em uso** mostra, por item, o registro mais recente entre entregas confirmadas e fichas de papel, desde que continue em uso. Uma nova entrega fica pendente enquanto aguarda a confirmação do destinatário. O histórico pessoal guarda também entregas anteriores e retiradas. O comprovante fica disponível no histórico para quem tem acesso à entrega.

[Voltar ao índice](README.md)
