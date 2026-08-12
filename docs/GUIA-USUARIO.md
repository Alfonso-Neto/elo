# Guia do usuário — Elo

Este guia explica como usar a homologação do Elo como professor ou aluno. As telas se adaptam a celular e computador, mas o papel da conta não muda: uma conta criada como professor não pode entrar como aluno, e vice-versa.

> O ambiente atual é de homologação. Use apenas informações fictícias ou autorizadas para teste. Não registre dados reais de saúde, documentos ou conversas sensíveis.

## Índice

- [Entrar e recuperar acesso](#entrar-e-recuperar-acesso)
- [Guia do professor](#guia-do-professor)
- [Guia do aluno](#guia-do-aluno)
- [Notificações, busca e navegação](#notificações-busca-e-navegação)
- [Privacidade e segurança](#privacidade-e-segurança)
- [Problemas comuns](#problemas-comuns)

## Entrar e recuperar acesso

Acesse [elo-homolog.vercel.app](https://elo-homolog.vercel.app), informe e-mail e senha e selecione **Entrar**. Não é necessário escolher o papel no login: ele foi fixado quando a conta foi criada.

Para criar uma conta, escolha **Criar conta**, selecione professor ou aluno, preencha os dados essenciais e confirme o endereço de e-mail quando solicitado.

Em **Esqueci minha senha**, informe o mesmo e-mail da conta. Por privacidade, a tela não revela se o endereço está cadastrado. Abra somente o link mais recente recebido. Se ele estiver expirado, solicite outro. A recuperação só está aceita para uma release quando o link volta à origem HTTPS da homologação; um redirecionamento para `localhost` é defeito de configuração e deve ser comunicado ao responsável pelo ambiente.

Ao terminar, use **Sair da conta**, especialmente em computador compartilhado. Professor e aluno devem ser testados em perfis ou janelas privadas separados para evitar substituir a sessão ativa.

## Guia do professor

### 1. Acesso profissional e CREF

Depois do cadastro, informe número do CREF, UF e, opcionalmente, nome do espaço. **Enviar para revisão** cria uma solicitação; não aprova a conta.

Os estados possíveis são:

- **não verificado:** dados ainda não enviados ou aguardando correção;
- **em revisão:** solicitação recebida e recursos profissionais bloqueados;
- **verificado:** revisão humana concluída;
- **rejeitado:** a tela mostra um motivo objetivo e permite corrigir e reenviar;
- **acesso temporário de homologação:** exceção com prazo, exibida na interface e sem equivaler a CREF verificado.

Use **Atualizar situação** para consultar novamente o servidor. A equipe citada na tela é a operação humana responsável por conferir o registro em fonte oficial; não é uma aprovação automática do Elo.

### 2. Visão geral

**Visão geral** reúne o estado do workspace e os sinais recentes permitidos à conta. Um alerta é contexto para avaliação, não diagnóstico. Abra o aluno relacionado antes de tomar uma decisão.

### 3. Convidar e abrir um aluno

Em **Alunos**, selecione **Convidar aluno**, informe exatamente o e-mail usado pela conta do aluno e gere o código. Na homologação, o código é mostrado uma vez e deve ser compartilhado manualmente por um canal seguro. Ele expira em 72 horas e só funciona para o e-mail indicado.

Depois que o aluno aceitar, ele aparece na base vinculada. Abra seu perfil para consultar:

- linha de relatos de dor, execuções e feedbacks;
- estado de acompanhamento de cada relato;
- treino publicado e contexto autorizado;
- notas profissionais privadas.

Não copie dados de um aluno para mensagens ou sistemas externos sem finalidade e autorização adequadas.

### 4. Relatos de dor

No perfil do aluno, abra um relato para conferir região, movimento, momento, intensidade, sinais informados e orientação de segurança exibida ao aluno. O professor pode registrar reconhecimento, acompanhamento e resolução conforme o fluxo disponível.

O relato não é diagnóstico. Sinais importantes exigem julgamento profissional e, quando apropriado, orientação para avaliação por profissional de saúde.

### 5. Copiloto

Em **Copiloto**, selecione somente o aluno e o contexto pertinentes. A resposta apresenta proposta estruturada, justificativas, incertezas e limites.

Revise antes de aceitar ou rejeitar. A proposta é inerte: aceitar uma ideia não altera o treino. Para que o aluno receba uma mudança, o professor precisa editar e publicar uma nova versão em **Treinos**.

### 6. Treinos

Em **Treinos**, escolha o aluno, monte a prescrição e revise exercícios, séries, repetições, carga, descanso, cadência, RIR e recados. Publicar cria uma nova versão; uma versão já publicada não é reescrita silenciosamente.

Confirme o aluno e o conteúdo antes da publicação. O aluno vê a versão vigente e pode registrar a conclusão com esforço percebido e comentário.

### 7. Anamneses

Em **Anamneses**, crie o formulário e atribua uma versão ao aluno. A resposta enviada é preservada como submissão. Use perguntas necessárias à finalidade do acompanhamento e evite solicitar documentos ou dados excessivos.

### 8. Agenda

Em **Agenda**, crie horários informando data, modalidade, local e capacidade. O aluno solicita um horário aberto; o professor confirma ou recusa. Cancelamentos e mudanças de estado ficam separados como eventos para evitar alterações ambíguas.

Atualize a tela antes de responder se outro dispositivo ou usuário puder ter alterado a agenda.

### 9. Conversas

Em **Conversas**, escolha um aluno vinculado e envie mensagens relativas ao acompanhamento. A conversa é privada dentro do workspace, mas não deve receber senhas, documentos, diagnóstico, dados bancários ou informação sem necessidade.

### 10. Nutrição

O professor apenas consulta o resumo autorizado de um plano enviado por integração de nutricionista habilitado. Ele não cria nem altera dieta. Se o aluno retirar o consentimento, o acesso e novos registros ficam limitados conforme a regra do servidor.

## Guia do aluno

### 1. Aceitar o vínculo

Após criar e confirmar a conta, informe o código enviado pelo professor. O código precisa corresponder ao mesmo e-mail, estar dentro da validade e ainda não ter sido usado. A aceitação vincula a conta ao workspace do professor; não existe seleção manual de outro espaço.

### 2. Hoje

**Hoje** resume o que está disponível: treino vigente, compromissos, formulários e atualizações. Se não houver conteúdo, isso pode significar que o professor ainda não publicou ou atribuiu uma atividade.

### 3. Meu treino

Em **Treino**, consulte os exercícios e os recados do professor. Ao concluir, registre esforço percebido e comentário fiel ao que aconteceu. A conclusão não modifica a prescrição.

Uma demonstração visual é apoio de interface, não substitui orientação profissional. Se houver dor ou dúvida, pare quando necessário e use o fluxo apropriado.

### 4. Assistente e relato de dor

Em **Assistente**, escolha **Senti uma dor** e informe:

1. região;
2. movimento ou situação;
3. momento;
4. intensidade de 0 a 10;
5. sinais de segurança apresentados;
6. detalhe opcional.

Revise o resumo e autorize o uso do dado de saúde antes de enviar. O consentimento é obrigatório para salvar e compartilhar o relato com o professor.

O Assistente organiza o relato e pode exibir orientação conservadora; ele não diagnostica nem muda seu treino. Em emergência ou piora importante, procure atendimento adequado em vez de aguardar resposta no aplicativo.

As opções **Dúvida em um exercício** e **Não consigo treinar hoje** ajudam a consultar orientações ou preservar contexto, conforme as funções disponíveis na versão atual.

### 5. Agenda

Em **Agenda**, consulte horários abertos, solicite um slot e acompanhe se ficou solicitado, confirmado, recusado ou cancelado. Uma solicitação não equivale a confirmação.

### 6. Conversas e anamnese

Use **Conversas** para falar com o professor do workspace. Em **Anamnese**, abra o formulário atribuído, revise suas respostas e envie. Evite incluir informação além do que foi pedido e necessário.

### 7. Nutrição e consentimento

Em **Nutrição**, você decide se a integração pode usar seus dados para exibir o plano de um nutricionista parceiro. Quando houver um plano válido, é possível registrar refeições e hidratação.

Você pode pausar a integração. A tela explica o efeito antes de confirmar; o plano existente pode continuar visível enquanto novos registros e acesso da equipe ficam pausados. O professor não prescreve nem edita esse plano.

## Notificações, busca e navegação

- O sino abre **O que mudou** e permite marcar itens como lidos.
- No computador, a busca também abre com `Ctrl+K` ou `⌘K`.
- No celular, **Mais** reúne as seções que não cabem na barra inferior e o comando de sair.
- Use `Tab`, `Shift+Tab`, `Enter` e `Esc` para navegar por teclado; modais e painéis devem manter o foco dentro da área ativa.
- O aviso **Sem conexão** significa que gravações e atualizações estão indisponíveis até a rede voltar. Confirme o resultado antes de repetir uma ação.

## Privacidade e segurança

- Nunca compartilhe senha, link de recuperação, código de convite ou sessão.
- Confirme o nome do workspace e do aluno antes de registrar ou publicar algo.
- Use somente os dados necessários; não anexe documentos em campos de texto.
- Saúde e nutrição possuem consentimentos separados.
- Notificações evitam mostrar o conteúdo sensível da conversa.
- A homologação não deve receber dados reais até existir autorização jurídica/LGPD e liberação operacional.
- O cadeado/HTTPS protege o transporte, mas não torna apropriado compartilhar credenciais ou deixar uma sessão aberta.

## Problemas comuns

### “Configuração indisponível” ou tela não abre

Atualize a página uma vez e confira a conexão. Se persistir, envie ao suporte o horário, a tela e a ação realizada — sem senha, token, código ou conteúdo de saúde.

### O link de recuperação abre `localhost`

Não prossiga. Solicite ao responsável que corrija a Site URL e os redirects do Supabase para a URL HTTPS da homologação; depois gere um novo link.

### O professor vê “CREF com a equipe”

Isso é o bloqueio esperado enquanto a revisão humana não termina. Use **Atualizar situação**. Para testes autorizados pode existir acesso temporário, que aparece explicitamente e expira.

### O aluno não aceita o convite

Confirme que o e-mail da conta é exatamente o informado pelo professor, que o código tem 72 horas ou menos e que ainda não foi usado. Gere outro código se necessário; não tente reutilizar o anterior.

### Conteúdo ou aluno não aparece

Confirme a conta, o papel e o workspace. O professor precisa ter vínculo ativo e acesso profissional; o aluno precisa ter aceitado o convite. Treinos e anamneses só aparecem depois de publicados ou atribuídos.

### Uma ação ficou carregando ou houve conflito

Não clique repetidamente. Aguarde, atualize e confira o estado final. As mutações usam chaves de idempotência, mas o usuário ainda deve verificar o resultado antes de criar uma nova intenção.

### Como pedir suporte

Informe URL, data/hora, navegador, largura aproximada da tela, papel da conta, passos e mensagem exibida. Mascare o e-mail e não envie captura contendo relato de dor, conversa, senha, token ou código de convite.
