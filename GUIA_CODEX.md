# GUIA CODEX — Gestão de EPIs | Grupo TSA

## 1. Objetivo
Construir um sistema web interno, simples e responsivo, para gestão de EPIs e uniformes das empresas **TSA** e **TSA Lynx**, pertencentes ao Grupo TSA. O foco é saber quais itens foram entregues, a quem, quais recebimentos aguardam confirmação e quais produtos ou CAs se aproximam do vencimento.

A [documentação do sistema](docs/README.md) detalha o comportamento implementado, os fluxos de uso e a publicação.

## 2. Princípios
- Priorizar simplicidade operacional e telas rápidas.
- Reduzir cliques e mudanças de tela. Quando faltar um cadastro necessário, permitir criá-lo no próprio fluxo e preservar os dados já preenchidos.
- Nos formulários de cadastro e configuração, **Salvar** conclui a edição e **Salvar e continuar** mantém o formulário aberto. Em entregas anteriores, manter o colaborador e a data após cada lançamento.
- Um sistema, duas identidades visuais e dados segregados por empresa.
- Atender múltiplas unidades e contratos.
- Registrar devoluções para descarte no atendimento de trocas. Manutenção e compras ficam fora da V1.
- Prototipar telas primeiro em HTML/CSS/JS simples; somente depois integrar ao aplicativo.
- Não inventar regras de segurança: parâmetros de prazo e fornecimento devem ser definidos pelos responsáveis da empresa.

## 3. Identidade visual
- Marca institucional: Grupo TSA.
- Tema TSA: vermelho corporativo aproximado `#A51E22`.
- Tema TSA Lynx: azul corporativo aproximado `#303D82`.
- Cores provisórias, extraídas visualmente da referência fornecida; validar com os arquivos oficiais de marca.
- Menu lateral grafite, cartões brancos, fundo cinza-claro e geometria discreta inspirada no material institucional.
- Alterar tema, logotipo e escopo de dados conforme empresa selecionada e permissões.
- Não recriar logotipos manualmente se houver ativos oficiais disponíveis.

## 4. Perfis
- **Administrador:** usuários, empresas, unidades, contratos, configurações e regras de aprovação.
- **Gestor:** cadastro de colaboradores, concessão do perfil Gerência, operação de estoque e entregas, e acompanhamento das unidades autorizadas.
- **Gerência:** cadastro e consulta da equipe direta, atendimento de solicitações no seu escopo e operação de estoque da unidade. Pode decidir solicitações da equipe quando a aprovação estiver ativada.
- **Operador de estoque:** estoque, entradas, entregas e atendimento de solicitações.
- **Colaborador:** consulta de seus itens, confirmação do recebimento e abertura/acompanhamento de solicitações.
- O usuário com cadastro de colaborador ativo vinculado também tem acesso à área pessoal.
- A autorização deve ser verificada no servidor e restringida por empresa/unidade/equipe conforme o caso.

## 5. Módulos V1
1. Login e seleção de empresa quando autorizado.
2. Dashboard por perfil.
3. Colaboradores: matrícula, nome, empresa do grupo, empresa terceirizada quando houver, unidade, setor, função, Gerência e situação.
4. Cadastro de itens: tipo EPI ou uniforme, nome, fabricante/modelo e observações. Para EPI, CA e sua validade, com consulta à base importada do CAEPI.
5. Estoque: item, validade opcional do produto, quantidade por contrato, entradas e baixas.
6. Histórico: entregas com baixa e registros de fichas de papel com o saldo preservado. Ambos guardam colaborador, item, quantidade, data, responsável e anexo opcional. A confirmação digital do destinatário se aplica às entregas com baixa.
7. Meus itens: EPIs e uniformes recebidos, histórico e confirmação de recebimento.
8. Solicitações: item, quantidade, motivo, situação e aprovação quando exigida. Item fora do catálogo aguarda identificação.
9. Alertas separados para estoque baixo ou zerado, validade de CA e validade de produto/lote.
10. Relatórios de entregas, pendências, vencimentos e ficha individual de EPI, com filtros por empresa e unidade.

## 6. Regras de negócio
- Cada colaborador pertence a uma empresa e unidade; matrícula única no escopo da empresa.
- A empresa terceirizada identifica o empregador. O administrador ou o gestor da unidade pode conceder a um colaborador terceirizado o perfil Gerência na unidade em que atua.
- Cada contrato de estoque pertence a uma unidade.
- A baixa de estoque e o registro da entrega ocorrem em uma transação atômica que impede estoque negativo. A confirmação de recebimento é feita depois pelo destinatário.
- Nova entrega de substituição acrescenta um registro ao histórico.
- O destinatário confirma o recebimento. O sistema registra quem confirmou e quando.
- CA e validade do produto/lote são campos e alertas distintos. A validade física do lote é preenchida quando aplicável.
- O vencimento do CA não significa automaticamente que um EPI já entregue deva ser trocado. Conferir requisitos normativos aplicáveis antes de bloquear novas entregas.
- Produto vencido ou bloqueado não pode ser entregue.
- Alertas configuráveis: inicialmente 30, 15 e 7 dias; vencido/atrasado após a data.
- Solicitações seguem para atendimento sem aprovação. Pedidos fora do catálogo passam pela identificação do item antes da entrega.
- As regras de aprovação por unidade e item ficam disponíveis para uso futuro. Quando a aprovação for ativada, a regra específica prevalece sobre a geral e a aprovação é exigida na ausência de regra.
- O estoque baixo usa o limite por item e unidade, com padrão de cinco unidades disponíveis. O saldo disponível soma as entradas válidas e liberadas de cada contrato ativo. O controle das entradas usa lotes internos. A fila informa quando falta saldo para atender a quantidade pedida.
- Solicitação com aprovação: `pendente_aprovacao -> aguardando_entrega -> concluida`; rejeição com justificativa.
- Solicitação sem aprovação: `aguardando_entrega -> concluida`.
- Uma solicitação por item. O atendimento é integral, e pedidos em aberto podem ser cancelados.
- Entrega direta por operador autorizado continua permitida.
- O administrador pode editar ou apagar registros no Histórico mediante justificativa. A exclusão mantém o registro para auditoria e estorna a baixa, quando houver.
- Anexos de comprovantes devem ser vinculados à entrega, protegidos por autorização e integridade.
- A entrega para reposição por dano ou desgaste segue o fluxo de estoque e entrega.
- O pedido de troca aceita texto, foto ou ambos como justificativa. A foto fica vinculada ao pedido e disponível para visualização conforme as permissões da solicitação.
- Para concluir uma troca, registrar a data em que o item antigo foi recebido para descarte. As unidades devolvidas saem de uso e o saldo disponível não é acrescido.

## 7. Modelo de dados inicial
Entidades: `empresas`, `unidades`, `almoxarifados`, `usuarios`, `usuario_escopos`, `colaboradores`, `epis`, `epi_lotes`, `estoques`, `movimentacoes`, `solicitacoes`, `regras_aprovacao`, `entregas`, `comprovantes`, `auditoria_eventos`.

Relacionamentos principais:
- Empresa 1:N unidades; unidade 1:N contratos de estoque e colaboradores.
- EPI 1:N lotes; estoque indexado por contrato de estoque e lote.
- Colaborador 1:N solicitações e entregas.
- Entrega referencia EPI, lote, colaborador, contrato de estoque e usuário responsável.
- Regra de aprovação referencia unidade e opcionalmente tipo de EPI.

Detalhar colunas, índices e migrações antes de programar o banco. Usar identificadores estáveis e restrições de integridade.

## 8. Arquitetura sugerida
- Next.js (App Router) + TypeScript.
- Tailwind CSS e componentes acessíveis.
- PostgreSQL + Prisma.
- Autenticação com sessões seguras e controle de acesso no servidor.
- Comprovantes privados armazenados no PostgreSQL, com autorização de download e verificação de integridade.
- Monólito modular inicialmente, com serviços de domínio para estoque, entregas, solicitações e alertas.
- Segredos somente em variáveis de ambiente; não registrar dados pessoais sensíveis em logs desnecessários.

## 9. Plano incremental
### Etapa 0 — Protótipo HTML
Criar `prototype/index.html`, responsivo e sem dependências externas obrigatórias, com seletor de tema entre TSA e TSA Lynx, menu lateral, dashboard e dados fictícios. Não conectar banco nem simular gravação real.

### Etapa 1 — Base
Inicializar Next.js, tema, layout, autenticação, empresas/unidades, usuários e colaboradores.

### Etapa 2 — EPIs e estoque
Catálogo de EPIs e uniformes, CA, lotes, validade, entradas e saldos por contrato.

### Etapa 3 — Entregas
Registro, baixa atômica, histórico, confirmação de recebimento e anexos opcionais.

### Etapa 4 — Solicitações
Portal do colaborador, aprovação configurável, fila da Gerência e atendimento pelo operador de estoque.

### Etapa 5 — Alertas e relatórios
Dashboard por perfil, alertas de validade de CA e lote, filtros e exportação básica.

### Etapa 6 — Qualidade
Testes, acessibilidade, segurança, autorização entre empresas, concorrência de estoque e documentação de implantação.

## 10. Critérios de aceite essenciais
- Alternar entre TSA e TSA Lynx altera marca e cores sem misturar dados.
- Colaborador visualiza apenas seus EPIs e pedidos.
- A Gerência aprova somente solicitações da equipe autorizada.
- Entrega sem estoque disponível é rejeitada sem gravar baixa parcial.
- Apenas o destinatário confirma o recebimento da própria entrega.
- Alertas de CA e lote/produto são exibidos separadamente.
- Quando a aprovação está ativada, as solicitações seguem a regra específica da unidade e do item quando existir.
- Dashboard é utilizável em celular e desktop.

## 11. Instrução para o Codex — primeiro trabalho
> Leia este guia. Não implemente o sistema completo ainda. Comece somente pela **Etapa 0**: crie um protótipo funcional em HTML/CSS/JavaScript puro, com visual corporativo Grupo TSA, seletor de tema entre TSA e TSA Lynx, dashboard, menu e telas demonstrativas de Meus EPIs, Solicitações e Entregas. Use dados fictícios claramente identificados. Não utilize backend, banco de dados nem autenticação real. Mantenha código simples, organizado e responsivo. Ao finalizar, informe quais arquivos criou e como abrir o protótipo localmente.
