# Gestão de EPIs do Grupo TSA

A aplicação usa Next.js e PostgreSQL. O [protótipo HTML aprovado](prototype/index.html) continua disponível como referência.

Consulte a [documentação do sistema](docs/README.md) para entender os fluxos, as permissões, as regras de estoque, a arquitetura e a publicação no Vercel.

## Executar localmente

Use Node.js 24 e um banco PostgreSQL vazio. Com Docker Compose, o banco local pode ser iniciado pelo arquivo incluído no projeto.

1. Copie `.env.example` para `.env`. Preencha os dados do administrador inicial e use uma senha própria para o PostgreSQL. Se estiver usando um banco existente, aponte `DATABASE_URL` para ele e pule o comando Docker. Codifique caracteres especiais da senha ao inseri-la na URL.
2. Execute na pasta do projeto.

   ```powershell
   npm.cmd ci
   docker compose up -d --wait postgres
   npm.cmd run db:migrate
   npm.cmd run db:seed
   npm.cmd run dev
   ```

3. Abra `http://localhost:3000` e entre com o e-mail e a senha definidos para a conta inicial. Essa conta começa com acesso administrativo à TSA e à TSA Lynx. Remova as variáveis `INITIAL_ADMIN_*` do `.env` após o cadastro.

Para validar os tipos e compilar, execute `npm.cmd run typecheck` e `npm.cmd run build`. Em produção, sirva a aplicação via HTTPS. Para executar a compilação de produção em HTTP no próprio computador, defina `LOCAL_HTTP=true` no processo local de `npm.cmd start`.

## Cadastros e acesso

| Perfil | Escopo nesta etapa |
| --- | --- |
| Administrador | Edita a empresa selecionada e administra unidades, colaboradores e acessos. |
| Gestor | Cadastra colaboradores e opera almoxarifados nas unidades autorizadas. |
| Encarregado | Cadastra colaboradores na própria equipe, atende pedidos no seu escopo e opera o estoque da unidade. |
| Almoxarifado | Opera estoque e entregas nas unidades autorizadas. |
| Colaborador | Consulta o próprio cadastro e a unidade vinculada. |

Para conceder acesso à segunda empresa a uma conta existente, crie seu vínculo usando o mesmo e-mail e deixe a senha inicial em branco. Os perfis e escopos de cada empresa são independentes. O cadastro do colaborador precisa existir antes de vincular um usuário como Colaborador ou Encarregado. Ao criar a conta, informe a senha inicial ao usuário por um canal privado.

O seletor aparece ao acessar uma empresa como Administrador, desde que a conta tenha acesso a mais de uma empresa. Nos demais perfis, a barra superior exibe o nome da empresa atual.

Todo usuário com um colaborador ativo vinculado tem acesso a **Meus itens** e aos seus pedidos em **Solicitações**. O vínculo pessoal é independente das unidades autorizadas para a operação.

Em **Colaboradores**, um administrador pode abrir **Configurar acesso** para informar o e-mail usado no login, vincular a pessoa e escolher seu perfil. Para **Almoxarifado** e **Gestor**, selecione as unidades autorizadas. Para **Encarregado**, indique a pessoa no campo **Encarregado responsável** do cadastro de cada integrante da equipe.

Para terceiros, informe o empregador em **Empresa terceirizada**, por exemplo, LUK. O cadastro fica na empresa do grupo e na unidade onde a pessoa atua. O gestor pode conceder o perfil **Encarregado** em **Equipe → Dar acesso de encarregado** para colaboradores ativos de suas unidades, inclusive terceirizados.

**Trocar senha** fica no menu da conta. Para recuperar uma senha esquecida, um administrador pode abrir **Acessos e perfis**, editar a conta e usar **Redefinir senha**. A redefinição encerra as sessões da conta e exige a troca da senha temporária no login. Para uma conta vinculada a mais de uma empresa, o administrador precisa administrar todas elas.

## Entregas e solicitações

1. Cadastre o item como EPI ou uniforme e um almoxarifado vinculado à unidade. Em **Estoque → Registrar entrada**, escolha o item e informe a quantidade.
2. Para uma solicitação, entre como Colaborador e informe o item, a quantidade e o motivo. O pedido segue para atendimento. Se estiver fora do catálogo, o almoxarifado identifica o item antes da entrega.
3. Em **Solicitações**, os perfis operacionais veem o saldo da unidade e o que falta para atender. **Alertas** mostra saldo baixo ou zerado, com limite configurável por item e unidade e padrão de cinco unidades. As regras de aprovação ficam guardadas para uso futuro, com o fluxo de aprovação desativado por padrão.
4. Administrador, Gestor, Encarregado e Almoxarifado podem registrar entregas no seu escopo. O sistema baixa o saldo, registra a entrega e conclui a solicitação em uma única transação. O anexo PDF, PNG ou JPEG de até 3 MB é opcional.
5. Em **Meus itens**, o colaborador usa **Confirmo que recebi** na seção **Aguardando confirmação**. O item passa para **Itens em uso** e a confirmação aparece no histórico com autor, data e hora.

Use **Não encontrei o item** para descrever o que precisa. Um operador vincula o pedido a um item ativo do catálogo, e o pedido segue para atendimento com a configuração atual.

O fluxo registra a data da entrega e, quando o colaborador confirma, a data do recebimento. O CA é cadastrado nos EPIs. A validade física do produto pode ser informada na entrada. Para registrar itens já recebidos, use **Histórico → Registrar entregas anteriores**. O PDF ou imagem do comprovante fica no PostgreSQL e pode ser baixado por usuários com acesso à entrega.

Em **Meus itens**, o destinatário pode retirar o item de uso com motivo e justificativa ou solicitar uma troca. A retirada fica no histórico e a troca segue o fluxo das solicitações. O pedido de troca aceita texto, foto em JPG, PNG ou WebP de até 3 MB, ou ambos. O destinatário e quem tem acesso à solicitação podem ver a foto em **Ver detalhes**.

## Alertas e relatórios

- O painel traz indicadores do perfil. O colaborador acompanha os próprios pedidos e recebimentos.
- Em **Alertas**, acompanhe a validade do CA e a validade dos produtos com saldo. Administradores podem configurar os três prazos de alerta da empresa, inicialmente 7, 15 e 30 dias.
- Em **Relatórios**, escolha Entregas, Pendências ou Vencimentos. Filtre por unidade e período. Administradores com acesso a mais de uma empresa podem usar também o seletor de empresa. Pendências incluem pedidos em aberto e recebimentos a confirmar. O CSV usa os mesmos filtros da tela.

## Testes da Etapa 6

Crie um banco PostgreSQL dedicado e configure `TEST_DATABASE_URL`. No Docker Compose local, você pode criar o banco com `docker compose exec postgres createdb -U epi epi_test`. A suíte aplica as migrações nesse banco, cria dados fictícios e inicia o aplicativo em `127.0.0.1:3031`.

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run build
npm.cmd run test:e2e
```

Para usar o Google Chrome já instalado, defina `$env:PLAYWRIGHT_CHANNEL = "chrome"` no PowerShell antes de executar a suíte. Os testes verificam isolamento por empresa, unidade e equipe, aprovação e rejeição, entrega e confirmação, concorrência de estoque, sessão, teclado e acessibilidade automatizada em tela estreita.

## Implantação interna

1. Disponibilize um servidor com Node.js 24 e um PostgreSQL persistente. Configure `DATABASE_URL` como segredo. Reserve `LOCAL_HTTP=true` para a demonstração e os testes locais.
2. Instale as dependências com `npm ci`, execute `npm run build` e aplique as migrações com `npm run db:migrate`. Em um banco novo, configure `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD`, execute `npm run db:seed` e retire as variáveis usadas para criar a conta.
3. Execute `npm run start -- --hostname 127.0.0.1 --port 3000` com um gerenciador de serviço. Publique o endereço interno por um proxy reverso HTTPS que preserve o domínio de origem. Mantenha as páginas autenticadas e os downloads fora de caches compartilhados. [Guia de hospedagem do Next.js](https://nextjs.org/docs/app/guides/self-hosting)
4. Faça backup do PostgreSQL. O banco inclui cadastros, movimentações, confirmações e arquivos de comprovantes. Valide a restauração em um ambiente separado e confira o login, a segregação entre empresas e o download de um comprovante antes de liberar o acesso.
