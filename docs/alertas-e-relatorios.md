# Alertas e relatórios

## Visão geral e equipe

O painel apresenta atalhos e indicadores de acordo com o perfil. Quem opera o estoque vê pedidos, entregas ou alertas do seu escopo. O colaborador acompanha os próprios pedidos e os recebimentos a confirmar.

Em **Equipe** ou **Minha equipe**, abra a pessoa para ver itens em uso, entregas aguardando confirmação e pedidos em aberto. Use o filtro **Recebimento** para encontrar colaboradores que ainda precisam confirmar.

## Alertas

| Tipo | Como interpretar |
| --- | --- |
| **Estoque baixo ou zerado** | Considera o saldo elegível por item e unidade. De uma a cinco unidades, mostra saldo baixo. Zero unidades disponíveis gera alerta para um item já registrado em estoque. |
| **Validade do CA** | Considera o Certificado de Aprovação registrado em um EPI ativo. O prazo acompanha o cadastro do item. |
| **Validade de produto ou lote** | Considera a validade física de lotes de itens ativos com saldo. O alerta identifica o lote e o almoxarifado. |

Os três prazos de validade começam em **7, 15 e 30 dias**. O administrador pode ajustá-los em **Alertas → Configurar prazos de alerta**, usando três números em ordem crescente entre 1 e 365. O alerta do estoque usa o limite de cinco unidades definido em `lib/stock-availability.ts`.

O vencimento do CA e o vencimento físico do lote são eventos separados. A validação de entrega aplica o bloqueio por validade física do lote. O vencimento do CA gera acompanhamento no painel. As notificações desta versão são apresentadas no aplicativo.

## Relatórios e exportação

| Relatório | O que inclui | Data usada no filtro |
| --- | --- | --- |
| **Entregas** | Empresa, unidade, almoxarifado, destinatário, item, lote, quantidade e confirmação. | Data da entrega |
| **Pendências** | Pedidos em aberto e entregas sem confirmação. | Abertura do pedido ou data da entrega |
| **Vencimentos** | CA e validade física do lote, com referência e situação. | Data de vencimento |

O gestor, o encarregado, o almoxarifado e o administrador podem consultar relatórios no seu escopo. Os filtros por unidade e período se aplicam à tela e ao CSV. O CSV usa UTF-8 e ponto e vírgula como separador.

O painel e **Meus itens** destacam recebimentos pendentes de entregas que ainda não foram retiradas de uso. O relatório de **Pendências** inclui entregas sem confirmação pelo registro de recebimento, inclusive quando já existe uma retirada. Use o histórico pessoal para conferir essa situação.

[Voltar ao índice](README.md)
