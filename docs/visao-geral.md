# Visão geral e navegação

Use o sistema para consultar o saldo do almoxarifado, acompanhar pedidos, conferir entregas e descobrir quem ainda precisa confirmar o recebimento.

## Termos do sistema

| Termo | Significado |
| --- | --- |
| Empresa | TSA ou TSA Lynx. Define o tema e o conjunto de dados em uso. |
| Unidade | Local de trabalho do colaborador. Organiza equipes e almoxarifados. |
| Terceirizada | Empregador informado no cadastro de uma pessoa que atua em uma unidade. |
| Item | EPI ou uniforme cadastrado, com nome, fabricante/modelo e, para EPI, dados do CA. |
| Lote | Conjunto de unidades de um item identificado por código, com validade física quando aplicável. |
| Saldo | Quantidade de um lote em um almoxarifado específico. |
| Entrega | Registro criado pelo operador no momento em que dá baixa no estoque. |
| Recebimento | Confirmação feita pelo próprio destinatário depois da entrega. |

## Onde encontrar cada processo

- **Visão geral** abre o resumo do perfil, com atalhos para pendências, histórico e outras tarefas.
- **Colaboradores**, **Equipe**, **Minha equipe** e **Meu cadastro** são os nomes da área de pessoas conforme o perfil.
- **Cadastro de itens** concentra os EPIs e uniformes que podem ser selecionados ao solicitar, registrar lotes e entregar.
- **Estoque** concentra saldos, lotes, almoxarifados e entradas.
- **Solicitações** abre a fila de operação ou os pedidos pessoais. Um operador com vínculo pessoal ativo pode alternar entre as duas áreas.
- **Histórico** reúne as entregas registradas no escopo operacional. **Meus itens** reúne as próprias entregas, confirmações, itens em uso e retiradas.
- **Alertas** e **Relatórios** apoiam o acompanhamento operacional. A exportação de relatórios é em CSV.
- **Acessos e perfis**, **Unidades**, **Empresa** e **Regras de aprovação** concentram a configuração administrativa.

O menu lateral pode ser recolhido no desktop. Os nomes dos botões aparecem ao passar o mouse ou chegar ao botão pelo teclado. No celular, use o menu que abre no topo.

## Exemplo do cadastro ao recebimento

1. Na **TSA Lynx**, o administrador cadastra a unidade e uma pessoa da **LUK** que trabalha nela. Em **Configurar acesso**, atribui o perfil **Encarregado** e vincula os colaboradores da equipe à pessoa cadastrada.
2. O operador cadastra uma camiseta em **Cadastro de itens**, cria um lote e registra uma entrada para o almoxarifado da unidade.
3. Um colaborador pede cinco camisetas. A solicitação entra na fila. Se houver apenas três disponíveis, a fila indica que faltam duas e o estoque baixo aparece em **Alertas**.
4. Após a reposição, um operador registra a entrega usando um almoxarifado e lote habilitados com saldo suficiente. O sistema reduz o saldo e conclui o pedido.
5. O destinatário abre **Meus itens** e clica em **Confirmo que recebi**. A entrega fica no histórico e o item passa a aparecer em uso.

[Voltar ao índice](README.md)
