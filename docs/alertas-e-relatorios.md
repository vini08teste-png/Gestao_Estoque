# Alertas e relatórios

## Visão geral e equipe

O painel apresenta atalhos e indicadores de acordo com o perfil. Quem opera o estoque vê pedidos, entregas ou alertas do seu escopo. O colaborador acompanha os próprios pedidos e os recebimentos a confirmar.

Em **Equipe** ou **Minha equipe**, abra a pessoa para ver itens em uso, entregas aguardando confirmação e pedidos em aberto. Use o filtro **Recebimento** para encontrar colaboradores que ainda precisam confirmar.

Em **Itens esperados**, o administrador escolhe o item e a quantidade por função, por unidade ou pela combinação dos dois. Quando várias regras se aplicam à mesma pessoa e ao mesmo item, vale a maior quantidade. Na equipe, o gestor e o encarregado veem **Recebido**, **A confirmar** ou quantas unidades faltam. A comparação usa a entrega mais recente em uso e a entrega pendente mais recente, sem somar as duas como se fossem uma única entrega.

## Demanda e estoque

O cartão **Itens com falta para pedidos** abre o resumo **Demanda e estoque**. Para cada item e unidade, o sistema soma os pedidos identificados aguardando entrega no escopo do perfil e compara com o saldo elegível. Por exemplo, cinco camisetas pedidas e três disponíveis resultam em duas em falta. Para o encarregado, entram somente os pedidos da equipe. A fila verifica se um almoxarifado consegue atender o pedido inteiro.

## Alertas

| Tipo | Como interpretar |
| --- | --- |
| **Estoque baixo ou zerado** | Considera o saldo elegível por item e unidade. O alerta aparece quando o saldo atinge ou fica abaixo do mínimo. Um item com mínimo configurado pode aparecer zerado mesmo antes da primeira entrada. |
| **Validade do CA** | Considera o Certificado de Aprovação registrado em um EPI ativo. O prazo acompanha o cadastro do item. |
| **Validade do produto** | Considera a validade física dos itens ativos com saldo. O alerta identifica o almoxarifado. |

Os três prazos de validade começam em **7, 15 e 30 dias**. O administrador pode ajustá-los em **Alertas → Configurar prazos de alerta**, usando três números em ordem crescente entre 1 e 365. Em **Estoque → Estoque mínimo**, o administrador e o gestor definem o limite por item e unidade. **Usar padrão** restaura o limite de cinco unidades. O valor zero aciona o alerta quando o saldo zera.

O vencimento do CA e a validade física do produto são acompanhados separadamente. O saldo de produtos vencidos fica indisponível para entrega. As notificações desta versão são apresentadas no aplicativo.

## Relatórios e exportação

| Relatório | O que inclui | Data usada no filtro |
| --- | --- | --- |
| **Entregas** | Empresa, unidade, almoxarifado quando houver, destinatário, item, quantidade e situação do recebimento. | Data da entrega ou da ficha |
| **Pendências** | Pedidos em aberto e entregas sem confirmação. | Abertura do pedido ou data da entrega |
| **Vencimentos** | CA e validade física do produto, com referência e situação. | Data de vencimento |

O gestor, o encarregado, o almoxarifado e o administrador podem consultar relatórios no seu escopo. Os filtros por unidade e período se aplicam à tela e ao CSV. O CSV usa UTF-8 e ponto e vírgula como separador.

O painel e **Meus itens** destacam recebimentos pendentes de entregas que ainda não foram retiradas de uso. O relatório de **Pendências** inclui entregas sem confirmação pelo registro de recebimento, inclusive quando já existe uma retirada. Use o histórico pessoal para conferir essa situação.

[Voltar ao índice](README.md)
