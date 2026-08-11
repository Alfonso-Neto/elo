# Elo — documentação do produto

> Fonte de verdade sobre a proposta, os limites e a direção do Elo. Procedimentos de implantação e aceite ficam em [HOMOLOGACAO.md](./HOMOLOGACAO.md).

**Status:** MVP técnico implementado localmente; implantação e aceite remoto pendentes.

**Nome:** Elo é o vínculo entre aluno e professor e entre um sinal percebido e uma decisão profissional.

## 1. Identidade e promessa

Elo é uma aplicação de acompanhamento para personal trainers e seus alunos. Ela reúne o contexto produzido entre sessões — dor, esforço percebido, execução, faltas, respostas e conversas — e o coloca diante do professor no momento de decidir.

A promessa do produto é **preservar o vínculo e melhorar a qualidade do acompanhamento sem terceirizar o julgamento profissional para a IA**.

Elo não se posiciona como gerador automático de treinos. Seu centro é um ciclo de sinais, reflexão, decisão humana, publicação e acompanhamento.

## 2. Público

### Professor

O público primário é o personal trainer que valoriza individualização, contexto e controle sobre a prescrição. A hipótese inicial é que esse perfil aceita dedicar atenção à decisão quando a tecnologia reduz a dispersão das informações e torna os sinais acionáveis.

O professor é o provável cliente pagante, mas modelo comercial, faixa de preço e disposição a pagar ainda precisam ser validados.

### Aluno

O aluno é participante essencial do ciclo. Ele precisa de clareza sobre o treino, uma forma simples de registrar o que sentiu e confiança de que seu relato chegará ao profissional sem ser convertido em diagnóstico ou decisão automática.

## 3. Problema

O acompanhamento entre professor e aluno frequentemente se fragmenta entre mensagens, planilhas, agendas e memória. Sinais importantes podem chegar sem estrutura, fora de contexto ou tarde demais para orientar a próxima decisão.

As hipóteses de problema que o Elo busca validar são:

- profissionais perdem tempo reunindo o histórico antes de ajustar um treino;
- alunos não encontram um caminho claro para comunicar dor, dificuldade ou esforço;
- automatizar a prescrição pode reduzir a confiança de profissionais que valorizam autoria e responsabilidade;
- um ciclo visível de atenção e resposta pode fortalecer percepção de cuidado e continuidade.

Essas afirmações orientam pesquisa e produto; não são conclusões universais sobre o mercado.

## 4. Ciclo central

```text
Relato ou feedback do aluno
            ↓
Sinal estruturado, consentido e protegido
            ↓
Contexto apresentado ao professor
            ↓
Proposta inerte do Copiloto
            ↓
Decisão e edição pelo profissional
            ↓
Publicação separada de uma nova versão
            ↓
Execução e novo feedback
```

O valor esperado está na continuidade desse ciclo. O histórico pode reduzir perda de contexto e custo de troca, mas qualquer vantagem competitiva baseada nele é uma hipótese a validar. Os dados pertencem às pessoas e organizações legitimamente responsáveis por eles, sujeitos a consentimento, finalidade, acesso e direitos aplicáveis. Elo não reivindica propriedade sobre dados de saúde e não presume autorização para usá-los no treinamento de modelos.

## 5. Jornadas por papel

### 5.1 Professor

1. Cria e confirma sua conta, define o workspace e envia dados para verificação profissional.
2. Após verificação de CREF — ou concessão temporária de homologação claramente identificada — convida um aluno.
3. Consulta o painel do dia e identifica sinais que merecem atenção.
4. Abre o histórico consentido do aluno e solicita apoio do Copiloto quando necessário.
5. Avalia perguntas, justificativas, incertezas e mudanças sugeridas.
6. Aceita apenas o que fizer sentido em um rascunho editável.
7. Publica explicitamente uma nova versão do treino.
8. Acompanha execução e feedback para orientar o ciclo seguinte.

O professor também pode operar anamneses, agenda, conversas e notificações. Na área de nutrição, visualiza somente o resumo autorizado; não cria nem altera plano nutricional.

### 5.2 Aluno

1. Cria e confirma sua conta e aceita um convite compatível com seu e-mail.
2. Concede ou retira consentimentos específicos conforme a jornada.
3. Consulta o treino publicado e as orientações de cada exercício.
4. Registra execução, esforço e feedback.
5. Relata dor por um fluxo estruturado de local, momento e intensidade.
6. Recebe atualizações do professor e acompanha a continuidade do caso.

O aluno também pode responder anamneses, conversar com o professor, solicitar horários e visualizar nutrição proveniente de parceiro habilitado.

## 6. Copiloto e Assistente

### 6.1 Comportamento do Copiloto

O Copiloto serve ao professor. Ele reúne um contexto autorizado e minimizado, apresenta uma proposta estruturada e explicita perguntas, justificativas, riscos e incertezas. Mudanças de treino ficam limitadas a operações conhecidas e verificáveis.

Regras invariáveis:

1. A proposta não executa mutações nem publica conteúdo.
2. Aceitar uma sugestão altera somente o rascunho da sessão.
3. O profissional pode editar, rejeitar ou dispensar a proposta.
4. A decisão fica associada à proposta para auditoria.
5. A publicação é posterior, explícita, versionada e idempotente.
6. Uma resposta se torna obsoleta se o aluno ou o rascunho mudar durante a solicitação.

Frase-âncora: **“Eu organizo sinais e proponho caminhos. Quem decide é você.”**

### 6.2 Comportamento do Assistente

O Assistente serve ao aluno durante o treino e no relato de dor. Ele ajuda a explicar a informação disponível, conduz a coleta estruturada e sinaliza o professor. Não diagnostica, prescreve, recomenda tratamento, interpreta-se como atendimento profissional nem promete resposta imediata.

Sinais de alerta exigem uma orientação de segurança compatível com o fluxo definido, sem transformar a interface em serviço de emergência.

## 7. Confiança, segurança e responsabilidade

### Decisão humana

Elo é copiloto, não autopilot. A IA não possui ferramentas ou autoridade para salvar, publicar ou enviar prescrições. Uma proposta persistida continua inerte até que uma pessoa autorizada registre sua decisão.

### Consentimento e minimização

Dados de dor, anamnese e outros sinais de saúde são sensíveis. O acesso depende de consentimento vigente, finalidade específica e vínculo válido. O provedor de IA recebe somente o contexto necessário; identificadores de autorização permanecem na fronteira do Elo.

### Isolamento e falha fechada

Papéis, associação ao workspace e acesso ao aluno são impostos no servidor por RLS e RPCs. O sistema deve falhar fechado diante de configuração ausente, consentimento expirado, papel incompatível, vínculo inválido, origem não permitida ou indisponibilidade do backend.

### Verificação profissional

O envio de dados de CREF não equivale a aprovação. O acesso profissional protegido depende de revisão por operação confiável. Uma concessão temporária pode existir apenas para homologação: deve ser atribuível, limitada ao professor e workspace, ter prazo curto, ser revogável por evento append-only e aparecer como temporária — nunca como CREF verificado.

### Rastreabilidade

Relatos relevantes e versões publicadas são imutáveis; tentativas repetidas usam chaves de idempotência; propostas e decisões podem ser correlacionadas. Notificações não devem expor conteúdo sensível.

### Limites profissionais

- O Elo não oferece diagnóstico, tratamento ou atendimento emergencial.
- O personal trainer não prescreve dieta pelo produto.
- Planos nutricionais entram por integração confiável com profissional habilitado e consentimento específico; o professor permanece em leitura.
- Uso com dados reais depende de revisão jurídica, base legal e operação compatível com a LGPD.
- Dados sensíveis não são considerados ativos proprietários do Elo nem material livre para treinamento de modelos.

## 8. Escopo funcional atual

| Domínio | Capacidade |
|---|---|
| Identidade | autenticação, sessão, papéis, workspaces, convites e verificação profissional |
| Acompanhamento | painel, perfil do aluno, histórico e sinais de atenção |
| Dor e IA | relato estruturado, triagem mediada, propostas do Copiloto e decisões auditáveis |
| Treino | biblioteca, rascunho, editor detalhado, publicação versionada, execução e feedback |
| Anamnese | modelos, construtor de perguntas, atribuição e respostas imutáveis |
| Agenda | slots, solicitações, confirmação, recusa e cancelamento |
| Conversas | canal privado por vínculo, paginação, idempotência e notificações discretas |
| Nutrição | ingestão por parceiro confiável, consentimento, plano e acompanhamento em leitura para o professor |
| Notificações | feed orientado por papel e recibos de leitura |

As demonstrações de exercícios são vetoriais e servem como referência visual. Não substituem orientação individualizada. Conteúdo próprio ou licenciado em vídeo continua sendo uma decisão futura.

## 9. Estado atual e maturidade

### Implementado localmente

- interface web mobile-first com jornadas de professor e aluno;
- contratos de autenticação, persistência, RLS/RPC, consentimento e auditoria versionados;
- Edge Function de triagem e Copiloto com validação de entrada e saída;
- verificações automatizadas de documentação, fonte, SQL, TypeScript, testes, estilos e build.

### Pendente de aceite

- aplicar o conjunto versionado de migrations em um Supabase exclusivo de homologação;
- configurar e atestar os segredos da Edge Function;
- completar o ciclo principal com contas reais de teste;
- provar o isolamento com um segundo workspace;
- validar recuperação, conectividade, acessibilidade, responsividade e procedimentos operacionais;
- concluir revisão jurídica/LGPD antes de usar dados reais.

“Implementado” significa presente no repositório e verificável localmente. Não significa implantado, aceito remotamente ou pronto para produção. A matriz e os critérios operacionais estão em [HOMOLOGACAO.md](./HOMOLOGACAO.md).

## 10. Hipóteses de produto e negócio

As seguintes ideias ainda exigem evidência com usuários e operação real:

- profissionais orientados à individualização preferem apoio à decisão a prescrição automática;
- o ciclo de sinais aumenta percepção de cuidado, adesão ou retenção;
- a organização do contexto economiza tempo suficiente para justificar adoção;
- professores pagariam por uma assinatura que inclua o aluno sem cobrança direta;
- um nicho inicial — como corrida, reabilitação, idosos ou saúde da mulher — pode tornar a proposta mais clara;
- histórico útil e portável pode aumentar valor acumulado sem criar aprisionamento indevido.

Preço, planos, freemium, aquisição e parcerias não estão definidos. Custos de IA, infraestrutura, comunicação, suporte, conteúdo e conformidade devem ser medidos antes de qualquer modelo comercial.

## 11. Direção visual

Elo evita a estética genérica de academia baseada apenas em preto e neon. A direção é de consultoria próxima, calma e premium:

- verde-pinho como base de confiança e crescimento;
- coral-apricot para ação e energia;
- superfícies claras com contraste acessível;
- tipografia expressiva nos momentos editoriais e neutra na interface;
- dados e estados com hierarquia clara, sem transformar alerta em ansiedade;
- tratamento próprio do Copiloto para comunicar reflexão, não autoridade.

A experiência deve permanecer responsiva, navegável por teclado, compatível com redução de movimento e clara em estados de carregamento, erro e perda de conectividade.

## 12. Roadmap orientado a risco

### Agora: provar o ciclo e a fronteira

- implantar em ambiente isolado e completar o aceite remoto;
- validar dor → proposta → decisão → versão → feedback;
- demonstrar isolamento, consentimento, idempotência e falha fechada;
- observar professores e alunos usando o ciclo sem mediação artificial.

### Depois: validar valor e operação

- medir clareza da proposta, tempo até decisão e aceites/rejeições;
- identificar quais áreas sustentam o acompanhamento e quais geram complexidade;
- estabelecer processos de suporte, incidente, exclusão e retirada de consentimento;
- validar nicho, disposição a pagar e custo operacional.

### Somente com evidência

- ampliar automações sem diluir a decisão profissional;
- introduzir conteúdo de exercício próprio ou licenciado;
- definir integrações e parcerias nutricionais;
- considerar módulos comerciais em decisão de produto separada.

## 13. Não objetivos

- prescrever ou publicar treinos automaticamente;
- diagnosticar dor ou substituir avaliação profissional;
- permitir prescrição nutricional pelo personal trainer;
- usar dados de saúde para treinar modelos;
- operar financeiro ou pagamentos no escopo atual;
- oferecer modo demo, troca local de papel ou atalhos que contornem autenticação;
- tratar aprovação local como evidência de segurança ou prontidão de produção.

## 14. Decisões em aberto

- Qual nicho percebe mais valor no ciclo central?
- Que evidência mostra melhora de acompanhamento, e não apenas mais interação?
- Em quais momentos o Copiloto deve ser acionado para ajudar sem gerar fadiga?
- Deve existir geração opcional de rascunho completo, ou isso enfraquece a tese de copiloto?
- Que conteúdo visual de exercícios equilibra confiança, custo e direitos de uso?
- Qual modelo de parceria nutricional respeita escopo profissional e consentimento?
- Como garantir portabilidade e exclusão sem perder a rastreabilidade necessária?
- Qual é a menor coorte capaz de validar valor e operação com risco controlado?

---

Este é um documento vivo. Afirmações de mercado e negócio devem permanecer identificadas como hipóteses até receberem evidência.
