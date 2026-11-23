# Itens, estoque e entregas

## Preparar o estoque

1. Em **Cadastro de itens → Novo item**, escolha **EPI** ou **Uniforme**. Informe nome e fabricante/modelo. Para EPI, preencha número do CA e a data de validade do CA.
2. Em **Estoque → Novo almoxarifado**, selecione uma unidade ativa e informe o nome. Cada almoxarifado atende uma unidade.
3. Em **Estoque → Novo lote**, selecione um item ativo e informe o código do lote. Preencha a validade física se ela existir. O código é único por item e empresa.
4. Em **Estoque → Registrar entrada**, vincule almoxarifado, lote e quantidade. A entrada aumenta o saldo ou cria o registro para aquele par de almoxarifado e lote. A movimentação registra quantidade, responsável e data.

O administrador pode editar ou inativar itens e bloquear ou desbloquear lotes. A inativação preserva os registros anteriores. Um item ativo pode ter vários lotes, e um mesmo lote pode ter saldo em mais de um almoxarifado.

## Entender a disponibilidade

O saldo operacional usa os almoxarifados ativos da unidade e os lotes de itens ativos, liberados e dentro da validade quando aplicável. Um lote com validade para hoje ainda está válido para a operação de entrega. O sistema usa a data do dia em `America/Sao_Paulo`.

| Indicador do pedido | Como é calculado |
| --- | --- |
| **Disponível em estoque** | Um almoxarifado tem, em um único lote elegível, a quantidade integral solicitada. |
| **Saldo dividido entre lotes** | A unidade tem a quantidade no total, distribuída em entradas de estoque que, individualmente, são insuficientes. |
| **Saldo insuficiente** | Há saldo disponível, porém abaixo da quantidade pedida. A tela mostra o quanto falta. |
| **Sem saldo disponível** | A unidade tem zero unidades elegíveis para o pedido. |

A disponibilidade é consultada quando a tela carrega. O estoque só é baixado quando a entrega é registrada. Em caso de saldo insuficiente, o sistema indica que a operação deve avaliar reposição ou compra. A compra acontece fora deste fluxo.

## Registrar a entrega

- Para atender um pedido, use **Solicitações → Pronto para entregar → Atender pedido**. O sistema preenche o destinatário, o item, a quantidade e a data sugerida. Se houver um único lote apto, ele já vem selecionado.
- Para entregar diretamente, abra **Histórico → Nova entrega**, selecione o colaborador e informe a quantidade.
- Selecione **Almoxarifado e lote** dentro da unidade do colaborador e preencha a data. A data pode ser de hoje ou anterior. Para uma entrega vinculada a um pedido, ela também precisa ser igual ou posterior à abertura do pedido.
- Se houver comprovante, anexe PDF, PNG ou JPG de até **3 MB**. O anexo é opcional.
- Clique em **Confirmar entrega**. O servidor revalida o escopo, o destinatário ativo, a unidade, a validade, o bloqueio e a quantidade. Atender um pedido exige a quantidade completa em um único almoxarifado e lote.

Em uma transação, o sistema dá baixa no saldo, registra a entrega, grava a movimentação e conclui o pedido, quando vinculado. Se alguma operação falhar, o conjunto é desfeito. Uma verificação no momento da baixa impede saldo negativo se dois operadores tentarem usar as últimas unidades.

## Confirmar o recebimento

O operador registra a saída. Em seguida, o destinatário abre **Meus itens → Aguardando confirmação** e clica em **Confirmo que recebi**. O sistema registra a pessoa e a data/hora da confirmação. Essa ação é feita separadamente e mantém o saldo já registrado na entrega.

**Itens em uso** mostra, por item, somente a entrega confirmada mais recente, desde que ela continue em uso. Uma nova entrega fica pendente enquanto aguarda a confirmação do destinatário. O histórico pessoal guarda também entregas anteriores e retiradas. O comprovante fica disponível no histórico para quem tem acesso à entrega.

[Voltar ao índice](README.md)
