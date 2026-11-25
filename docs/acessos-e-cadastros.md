# Acessos, colaboradores e equipes

## Escopo dos perfis

| Perfil | O que pode fazer |
| --- | --- |
| **Administrador** | Administrar a empresa, as unidades, os cadastros, os acessos, as regras e os prazos de alerta. Também pode operar o estoque e as entregas da empresa. |
| **Gestor** | Consultar as equipes, cadastrar pessoas, conceder acesso de Gerência e operar o estoque, as solicitações e as entregas nas unidades autorizadas. |
| **Gerência** | Acompanhar e cadastrar integrantes da equipe direta na própria unidade. Pode operar o estoque da unidade e atender pedidos e entregas no escopo da equipe. A decisão de aprovação aparece quando esse fluxo está ativado. |
| **Operador de estoque** | Consultar colaboradores no escopo, cadastrar itens e lotes, operar o estoque e atender solicitações e entregas nas unidades autorizadas. |
| **Colaborador** | Consultar o próprio cadastro, solicitar itens, acompanhar os pedidos, confirmar recebimentos, pedir trocas e retirar itens de uso. |

Pessoas com os perfis Gestor, Gerência e Operador de estoque também usam **Meus itens** e **Meus pedidos** quando têm um cadastro de colaborador ativo vinculado à conta. O vínculo pessoal define a unidade e o destinatário dos próprios pedidos.

O seletor de empresa aparece para quem está na empresa atual como administrador e tem acesso a mais de uma empresa. A permissão é conferida no servidor em cada empresa. Uma conta pode ter perfis diferentes na TSA e na TSA Lynx.

## Cadastro da pessoa

1. Na empresa onde a pessoa atua, abra **Colaboradores → Novo colaborador**. Para gestor, a tela se chama **Equipe**. Para Gerência, **Minha equipe**.
2. Informe nome, matrícula, unidade e função. Em **Contrato**, escolha um contrato de estoque da unidade, quando houver. A matrícula é única dentro da empresa e é armazenada em maiúsculas.
3. Em **Empresa**, informe o empregador quando houver terceirização, por exemplo, **LUK**. Se deixar em branco, o sistema mostra **TSA** ou **TSA Lynx** conforme a empresa do cadastro. A busca aceita o nome da empresa.
4. No campo **Gerência**, selecione uma pessoa da mesma unidade, quando aplicável, e salve. Quando alguém da Gerência faz o cadastro, o sistema vincula o novo integrante à equipe dessa pessoa. O sistema impede vínculos que criariam um ciclo na equipe.

O administrador edita registros existentes. Para corrigir a unidade de um cadastro já relacionado a outros registros, confira os vínculos antes de salvar. Alguns vínculos podem impedir a movimentação direta.

## Liberar o login

1. Como administrador, encontre a pessoa em **Colaboradores** e clique em **Configurar acesso**.
2. Confira o **Colaborador vinculado**, defina o **Perfil de trabalho** e informe o e-mail usado no login.
3. Para uma conta nova, defina uma senha temporária de 6 a 128 caracteres. Para vincular uma conta existente a outra empresa, use o mesmo e-mail e deixe o campo da senha vazio.
4. Em perfis **Gestor** e **Operador de estoque**, escolha as unidades autorizadas ou marque **Todas as unidades**. Para **Gerência** e **Colaborador**, o vínculo pessoal é obrigatório e determina a unidade.
5. Na primeira entrada com senha temporária, a pessoa cria a própria senha e depois entra de novo.

Para cadastrar alguém da **LUK** com o perfil Gerência, informe LUK no cadastro, atribua o perfil **Gerência** no acesso e selecione essa pessoa em **Gerência** nos cadastros de sua equipe. Por exemplo, alguém da LUK pode liderar colaboradores da TSA Lynx na unidade onde todos atuam.

### Conceder acesso de Gerência como gestor

1. Em **Equipe**, abra o menu de três pontos da pessoa e clique em **Dar acesso de Gerência**. A opção vale para colaboradores ativos, inclusive terceirizados, nas unidades autorizadas ao gestor.
2. Se a pessoa já tiver o perfil **Colaborador** ativo, confirme a alteração. Ela usará o mesmo e-mail e a mesma senha.
3. Para criar um login, informe um e-mail ainda sem conta e uma senha temporária de 6 a 128 caracteres. Contas com outro perfil ou vínculos preexistentes pelo e-mail passam pela revisão de um administrador.

O acesso segue a unidade do cadastro da pessoa. A equipe direta é definida pelo campo **Gerência** nos cadastros dos integrantes.

## Troca e redefinição de senha

- Quem está conectado usa **Trocar senha** no menu da conta e informa a senha atual.
- Se esquecer a senha, a pessoa pede a um administrador para abrir **Acessos e perfis → Editar acesso → Redefinir senha**.
- O administrador precisa ter permissão em todas as empresas vinculadas à conta. A redefinição revoga as sessões e exige troca da senha temporária ao entrar.
- A conta inicial criada pelo comando `db:seed` usa a senha definida na instalação. O administrador pode alterá-la pelo próprio menu.

[Voltar ao índice](README.md)
