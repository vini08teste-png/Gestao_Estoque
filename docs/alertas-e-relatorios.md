# Alertas e relatórios

## Visão geral e equipe

O painel apresenta atalhos e indicadores de acordo com o perfil. Quem opera o estoque vê pedidos, entregas ou alertas do seu escopo. O colaborador acompanha os próprios pedidos e os recebimentos a confirmar.

Em **Equipe** ou **Minha equipe**, os indicadores acompanham a busca e o filtro de pendências. Use **Mais filtros** para selecionar unidade, contrato ou situação do colaborador. Abra o cartão da pessoa e escolha a aba **Em uso**, **A confirmar**, **Pedidos em aberto** ou **Itens esperados**. O menu de três pontos reúne as ações disponíveis. As tabelas distinguem a validade física do equipamento da validade do CA e mostram as datas que estiverem disponíveis.

Em **Itens esperados**, o administrador escolhe o item e a quantidade por função, por unidade ou pela combinação dos dois. Quando várias regras se aplicam à mesma pessoa e ao mesmo item, vale a maior quantidade. Na equipe, Gestor e Gerência veem **Recebido**, **A confirmar** ou quantas unidades faltam. A comparação usa a entrega mais recente em uso e a entrega pendente mais recente, sem somar as duas como se fossem uma única entrega.

A aba diferencia unidades sem configuração de itens esperados de funções às quais nenhuma regra da unidade se aplica. As quantidades esperadas são avaliadas independentemente dos pedidos em aberto.

## Demanda e estoque

Na **Visão geral**, **Estoque baixo ou zerado** aparece acima dos indicadores da operação quando há itens no mínimo, abaixo dele ou zerados. Em **Alertas**, o cartão de estoque fica destacado quando há alertas e os itens zerados aparecem primeiro.

O cartão **Itens com falta para pedidos** abre a categoria **Saldo para pedidos**. Para cada item e unidade, o sistema soma os pedidos identificados aguardando entrega no escopo do perfil e compara com o saldo elegível. Por exemplo, cinco camisetas pedidas e três disponíveis resultam em duas em falta. Para a Gerência, entram somente os pedidos da equipe. A fila verifica se um contrato da unidade consegue atender o pedido inteiro.

## Alertas

Escolha uma unidade autorizada e clique em **Filtrar**. Os cartões mostram a quantidade de registros por categoria nessa seleção e filtram a mesma tabela. **Todos os alertas** reúne estoque, falta para pedidos e vencimentos, nessa ordem.

| Tipo | Como interpretar |
| --- | --- |
| **Estoque baixo ou zerado** | Considera o saldo elegível por item e unidade. O alerta aparece quando o saldo atinge ou fica abaixo do mínimo. Um item com mínimo configurado pode aparecer zerado mesmo antes da primeira entrada. |
| **Validade do CA** | Considera o Certificado de Aprovação registrado em um EPI ativo. O prazo acompanha o cadastro do item. |
| **Validade do produto** | Considera a validade física dos itens ativos com saldo. O alerta exibe o número do contrato quando informado. |

Os três prazos de validade começam em **7, 15 e 30 dias**. O administrador pode ajustá-los em **Alertas → Configurar prazos de alerta**, usando três números em ordem crescente entre 1 e 365. Em **Estoque → Estoque mínimo**, o administrador e o gestor definem o limite por item e unidade. **Usar padrão** restaura o limite de cinco unidades. O valor zero aciona o alerta quando o saldo zera.

O vencimento do CA e a validade física do produto são acompanhados separadamente. O saldo de produtos vencidos fica indisponível para entrega. As notificações desta versão são apresentadas no aplicativo.

## Relatórios e exportação

| Relatório | O que inclui | Data usada no filtro |
| --- | --- | --- |
| **Entregas** | Colaborador e matrícula, quantidade, unidade de medida, especificação, CA, número do contrato, datas de entrega e devolução, empresa, unidade e recebimento. | Data da entrega ou da ficha |
| **Pendências** | Pedidos em aberto e entregas sem confirmação. | Abertura do pedido ou data da entrega |
| **Vencimentos** | CA e validade física do produto, com referência e situação. | Data de vencimento |
| **Ficha individual de EPI** | EPIs entregues ao colaborador selecionado, com campos em branco para rubricas de entrega e devolução. | Data da entrega ou da ficha |

Os perfis Gestor, Gerência, Operador de estoque e Administrador podem consultar relatórios no seu escopo. Os filtros por unidade e período se aplicam à tela e ao CSV. O CSV usa UTF-8 e ponto e vírgula como separador.

Para a ficha, selecione **Ficha individual de EPI**, escolha o colaborador e clique em **Gerar ficha**. Os botões de impressão e PDF abrem o diálogo do navegador em A4 paisagem. As datas de devolução aparecem quando registradas. O número do contrato vem do estoque vinculado ou do registro de entrega anterior. Os campos sem dados ficam em branco na ficha.

O painel e **Meus itens** destacam recebimentos pendentes de entregas que ainda não foram retiradas de uso. O relatório de **Pendências** inclui entregas sem confirmação pelo registro de recebimento, inclusive quando já existe uma retirada. Use o histórico pessoal para conferir essa situação.

[Voltar ao índice](README.md)
