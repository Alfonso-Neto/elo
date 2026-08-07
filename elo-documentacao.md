# Elo — Documentação do Produto

> Plataforma de gestão para personal trainers e seus alunos, com um **copiloto de IA que aumenta o julgamento do profissional em vez de substituí-lo.**

**Status:** conceito + protótipo navegável — **MVP fechado** (pronto para validação de mercado)
**Documento:** v3 · 14/07/2026 *(inclui construtor de treino, copiloto flutuante, demonstrações de movimento e anamnese)*
**Nome provisório:** Elo *(vínculo — a ligação aluno↔professor e o elo entre a dor do aluno e a decisão do professor. Trocável.)*

---

## 1. Resumo em uma frase

Elo reúne agenda, treino, nutrição, chat e pagamento num único app para personal trainers — mas o que o diferencia não é juntar tudo isso (o mercado já faz), e sim um **copiloto de IA que captura as dores do aluno de forma estruturada e ajuda o professor a raciocinar sobre a prescrição, sem entregar o treino pronto no automático.**

---

## 2. Contexto e problema

### O que já existe
O mercado brasileiro de apps para personal trainer é maduro e saturado. MFIT, Tecnofit, TreinoAI, NextFit, Mobitrainer, HexFit e outros já oferecem prescrição de treino, biblioteca de vídeos, avaliação física, chat interno, gestão financeira com Pix, agenda e, em alguns casos, nutrição e IA de prescrição.

**Conclusão importante:** "juntar tudo num app só" **não é diferencial** — é o padrão atual. Um produto que apenas replique MFIT + funcionalidades já existentes entra num mercado lotado sem motivo para o profissional trocar.

### A dor real (do cliente pagante = o professor)
O personal trainer sente atrito diário ao operar seu negócio com ferramentas soltas: planilha + WhatsApp para fichas, Calendly para agenda, cobrança manual por Pix, vídeos no YouTube, conversas misturadas com a vida pessoal. É uma dor **profissional e desejada** — ele quer resolver e já paga por soluções.

### A brecha
Todos os concorrentes correm na mesma direção: **IA que entrega o treino pronto (autopilot).** Isso ignora dois pontos:
1. O medo real do personal de ser substituído/commoditizado pela IA.
2. O ponto fraco de todo mundo: **retenção do aluno** (o professor já é bem servido; quem abandona é o aluno).

Elo ataca essa brecha com um posicionamento oposto — **copiloto, não autopilot** — e mira um nicho específico.

---

## 3. Público-alvo (nicho)

**Primário:** o personal trainer que valoriza **qualidade acima de volume** — o profissional que se orgulha da individualização e não quer que um robô prescreva por ele. Poucos alunos, ticket mais alto, consultoria online + presencial.

Esse recorte é intencional. A filosofia copiloto **não serve para todo mundo**: o personal de alto volume (100+ alunos) quer economizar horas e prefere que a IA faça *por* ele. Para esse perfil, "fazer o professor pensar mais" é um defeito, não uma qualidade. Por isso o copiloto **define o nicho** em vez de ser um recurso genérico.

**Secundário (usuário final, não pagante):** o aluno de consultoria, que ganha um assistente que o ajuda durante o treino e dá voz às suas dores de forma que realmente chega ao professor.

---

## 4. O diferencial: copiloto + loop de dados

### 4.1 Filosofia "copiloto, não autopilot"
Onde os concorrentes automatizam a decisão, Elo **estrutura a informação e devolve a decisão ao professor**. Na tela de prescrição, a IA:
1. **Reúne os sinais** que o aluno gerou nas últimas semanas (dores, RPE, faltas, feedbacks).
2. **Faz perguntas de raciocínio** ao professor ("antes de repetir o agachamento, como você quer conduzir o membro inferior?").
3. **Oferece caminhos com o *porquê* e o *risco* de cada um** — nunca uma resposta única.
4. **Monta um rascunho editável** que o professor revisa e envia. A prescrição continua sendo dele.

Mensagem central para o profissional: *"você continua sendo o especialista; a IA só te dá superpoder."*

### 4.2 O loop de dados (o moat de verdade)
O ativo defensável **não é a palavra "IA"** — qualquer um copia isso em seis meses. O ativo é o **loop**:

```
Aluno relata dor/feedback  →  Assistente transforma em DADO ESTRUTURADO
        →  Dado alimenta o Copiloto do professor
        →  Professor decide com mais contexto
        →  Resultado do treino gera novo feedback  →  (repete)
```

Ao longo de meses, isso cria uma **base proprietária de dor-do-aluno mapeada** que nenhum concorrente tem. Dado proprietário + histórico que melhora a prescrição com o tempo = o tipo de diferencial que se sustenta e aumenta o custo de troca (quanto mais o professor usa, mais valioso fica e mais difícil é sair).

---

## 5. Funcionalidades por perfil

### 5.1 Professor
| Área | O que faz |
|---|---|
| **Início** | Painel do dia: alunos que "precisam de você" (dores, feedbacks, pagamentos), agenda de hoje, resumo financeiro. |
| **Alunos** | Base ordenada por *atenção* (prioridade), não por ordem alfabética. Status por aluno: em dia, feedback novo, pagamento atrasado, prioridade. |
| **Copiloto** *(centro)* | Assistente de prescrição. Surface de sinais → perguntas de raciocínio → rascunho editável. É a tela-assinatura. |
| **Construtor de treino** | Editor detalhado: cada exercício abre séries, reps, carga, descanso, cadência, RIR e observação para o aluno. Miniatura animada do movimento em cada exercício e biblioteca para adicionar novos. |
| **Copiloto flutuante (a "bolinha")** | Assistente que acompanha o professor enquanto ele monta o treino. Aponta lembretes e contradições (ver §6.2) sem alterar nada sozinho. |
| **Anamnese** | Galeria de 8 modelos prontos (geral, PAR-Q, emagrecimento, hipertrofia, corrida, reabilitação, saúde da mulher, idosos) e um **construtor dinâmico** para criar formulários de nicho, com 7 tipos de pergunta e sugestões do copiloto (ver §6.4). |
| **Agenda** | Semana com sessões presenciais, online e em grupo. Horários livres viram slots agendáveis pelo aluno. |
| **Chat** | Conversas separadas do WhatsApp pessoal. Ninguém troca número. |
| **Financeiro** | Recebido / a receber / atrasado. Cobrança automática por Pix e cartão, sem perseguir inadimplente no zap. |

### 5.2 Aluno
| Área | O que faz |
|---|---|
| **Hoje** | Treino do dia, próxima sessão, plano alimentar e um atalho de "como você está?" para reportar dores. |
| **Treino** | Exercícios com marcação de concluído, barra de progresso e feedback. Cada exercício abre uma ficha completa com séries/reps/carga/descanso/cadência, o recado do professor e uma **demonstração animada do movimento** (ver §6.3). |
| **Assistente** *(centro)* | Ajuda durante o treino ("como faço este exercício?"), registra dores de forma estruturada (local → quando → intensidade 0-10) e avisa o professor. |
| **Nutrição** | Plano do dia com refeições e macros. Montado por nutricionista parceiro (ver §8, ponto legal). |
| **Chat** | Conversa direta com o professor. |
| **Pagamento** | Plano, forma de pagamento, Pix automático, código Pix e histórico. |
| **Anamnese** | Recebe a anamnese enviada pelo professor e responde no app (texto, escolhas, escala, sim/não, número). As respostas ficam anexadas ao perfil e alimentam o histórico. |

---

## 6. Especificação do Copiloto (tela-chave)

Fluxo do protótipo, passo a passo:

1. **Cabeçalho de contexto** — seleciona o aluno e declara a postura: *"Você prescreve. Eu só organizo o que a Marina te contou."*
2. **Sinais** — cartões com o que o aluno gerou, com fonte e frequência:
   - Dor no joelho no agachamento — 3× em 14 dias (registrada pelo assistente)
   - RPE médio de perna 9/10 (marcado como "muito puxado" 4×)
   - Faltou 2 sessões esta semana (padrão novo)
3. **Pergunta de raciocínio 1** — como conduzir o membro inferior, com 3 opções, cada uma com **POR QUÊ** e **risco**:
   - Manter agachamento com menos carga/amplitude
   - Trocar por leg press + extensora
   - Focar estabilizadores antes (tratar a causa)
4. **Pergunta de raciocínio 2** (revelada após a escolha) — ajustar volume por causa das faltas.
5. **Rascunho editável** — treino montado com marcações do que foi *substituído/adicionado*, botão "revisar e enviar", e a assinatura: *"Eu junto os sinais e sugiro caminhos. A prescrição é sua."*

**Princípio de UX:** nada é enviado no automático. Toda sugestão vem com justificativa e contrapartida. O professor sempre dá a última palavra.

### 6.1 Construtor de treino detalhado

A partir do rascunho do copiloto, o professor abre o **editor detalhado**. Cada exercício expande e permite definir séries, repetições, carga, descanso, cadência, RIR e uma observação escrita para o aluno. É possível renomear o treino, adicionar exercícios de uma biblioteca e pré-visualizar exatamente como o aluno verá. Tudo o que o professor preenche aqui é o que aparece na ficha do aluno — sem retrabalho, sem "traduzir" a planilha depois.

### 6.2 Copiloto flutuante (a "bolinha")

Enquanto o professor monta o treino, um copiloto flutuante (uma bolinha no canto da tela, com contador) acompanha o que ele está fazendo. Ao tocar, abre um painel que **provoca o raciocínio** em vez de corrigir por conta própria. Três tipos de intervenção:

- **Lembrete de contexto** — cruza o treino com o histórico do aluno. Ex.: "A Marina relatou dor no joelho 3× e você não incluiu aquecimento de mobilidade. Foi proposital?" — com as ações *"Adicionar mobilidade"* ou *"Foi proposital"*.
- **Provocação de raciocínio** — aponta desequilíbrios. Ex.: "2 exercícios de quadríceps e 1 de posterior; para joelho sensível, reforçar posterior costuma proteger. Quer rever a proporção?"
- **Lembrete técnico** — confere coerência com o objetivo. Ex.: "Descanso de 60s na extensora — para hipertrofia, 60–90s é o esperado. Só confirmando que não foi um deslize."

Regras de comportamento que definem o produto:
1. Sempre em tom de **pergunta**, nunca de ordem.
2. **Não altera nada sozinho.** Quando o professor aceita uma sugestão, o item entra marcado como *"sugerido pelo copiloto, confirmado por você"*.
3. O contador diminui conforme o professor resolve cada ponto — e ao final some, deixando explícito que a decisão foi toda dele.
4. Frase-âncora: *"Eu só te lembro e te faço pensar. Quem decide é você."*

Isto é a materialização mais concreta da tese copiloto-não-autopilot: a IA fica **ao lado** do professor no momento da decisão, não no lugar dele.

### 6.3 Demonstração de movimento por exercício

Cada exercício tem uma **demonstração animada da execução correta**, visível tanto na ficha do aluno quanto na miniatura de cada exercício no construtor do professor. Serve para reduzir dúvida de execução (o ponto onde o aluno mais erra sozinho) e para o professor conferir o movimento na hora de prescrever.

**Nota de implementação:** no protótipo, as demonstrações são animações vetoriais desenhadas em código (sem dependência externa e sem material de terceiros). No produto real, elas seriam substituídas por **vídeos filmados**. Aqui há uma decisão de negócio: os vídeos podem ser gravados pelo próprio professor (reforça o toque pessoal e vira mais um diferencial), licenciados de uma biblioteca pronta, ou um misto. O lugar do vídeo já está previsto na interface.

### 6.4 Anamnese: modelos prontos + construtor dinâmico

A anamnese resolve dois públicos ao mesmo tempo:

- **Modelos prontos** para a maioria: 8 formulários já montados (geral, PAR-Q, emagrecimento, hipertrofia, corrida/endurance, reabilitação, saúde da mulher/gestante, terceira idade). O professor abre, ajusta o que quiser e envia. Cobre o grosso dos casos sem trabalho.
- **Construtor dinâmico** para o nicho: cria uma anamnese do zero (ou a partir de um modelo) com 7 tipos de pergunta — texto curto, texto longo, escolha única, múltipla escolha, escala 0–10, sim/não e número. Cada pergunta é editável, com opções configuráveis; dá para adicionar, remover e pré-visualizar exatamente como o aluno responde.

O **copiloto aparece também aqui**, coerente com a tese do produto: ele oferece "perguntas que costumam faltar" (sono, estresse, histórico de lesões, medicação, restrição alimentar, disponibilidade) como sugestões que o professor adiciona **se fizer sentido** — nada entra sozinho. Do lado do aluno, o formulário é respondido dentro do app e as respostas viram dado estruturado no perfil, reforçando o mesmo loop de dados que sustenta o diferencial (§4.2): quanto mais o aluno responde e relata, mais contexto o professor acumula.

**Ponto de atenção (reforço do §8):** a anamnese coleta **dados sensíveis de saúde**. Consentimento explícito, base legal e armazenamento seguro (LGPD) são obrigatórios desde a primeira versão.

---

## 7. Modelo de negócio (hipótese)

- **Quem paga:** o personal trainer (B2B2C). O aluno usa grátis, dentro da assinatura do professor.
- **Formato:** assinatura mensal (SaaS). Referência de mercado: ~R$ 89/mês em média, com faixas por número de alunos.
- **Freemium sugerido:** grátis até 3 alunos para reduzir atrito de entrada; planos pagos por volume acima disso.
- **Custo marginal:** tende a zero por cliente novo (SaaS), exceto conteúdo (biblioteca de vídeos) e suporte.

---

## 8. Riscos e pontos de atenção

### Regulatórios / legais (atenção séria)
- **Nutrição:** no Brasil, **personal trainer não pode prescrever dieta** — só nutricionista (CFN). A parte de nutrição **precisa** operar via nutricionista parceiro/integrado, nunca como prescrição feita pelo personal. No protótipo isso já aparece como "plano montado por Nutri. parceira".
- **Dados de saúde (LGPD):** dor, avaliação física e histórico são **dados sensíveis**. Exige consentimento explícito, base legal, e cuidado redobrado no armazenamento e no uso para treinar qualquer modelo.
- **Pagamentos:** processar mensalidades exige gateway (ex.: parceiro de pagamento) e conformidade — não construir do zero.

### De produto / mercado
- **Mercado saturado:** o diferencial precisa ser sentido, não só descrito. Sem o copiloto e o nicho, é só mais um app.
- **A hipótese central ainda não foi validada** (ver §9): pode ser que a maioria queira "monta pra mim".
- **Migração é o gargalo, não a retenção:** tirar o professor do MFIT/Tecnofit exige um motivo forte. A retenção tende a ser boa *depois* que ele migra (custo de troca alto), mas a aquisição é difícil.

---

## 9. Plano de validação (antes de construir de verdade)

**Hipótese a testar primeiro** (com 10–15 personais reais):
> "Você prefere uma IA que monta o treino pra você, ou uma que te mostra as dores do aluno e te ajuda a decidir?"

- Se a maioria responder **"monta pra mim"** → o copiloto é um nicho pequeno; repensar posicionamento.
- Se uma parcela relevante disser **"prefiro decidir, não confio em treino de robô"** → há uma dor real e desatendida; vale construir.

**Próximos passos sugeridos (7 dias):**
1. Entrevistar 10–15 personais e mapear o que os *irrita* nas ferramentas atuais.
2. Definir 1 nicho concreto e testar uma landing page de lista de espera (medir interesse real).
3. Só então especificar o MVP — que **não é "tudo isso junto"**, e sim a UMA coisa que Elo faz melhor que os outros.

**Critério de go/no-go sugerido:** se X personais entrarem na lista de espera / demonstrarem intenção de pagar em 2 semanas, avança.

---

## 10. Escopo de MVP recomendado

Não construir o app inteiro de uma vez. Ordem sugerida:

**Fase 1 — provar o diferencial (o resto já existe no mercado):**
- Assistente do aluno que estrutura a dor (local → quando → intensidade).
- Copiloto do professor que exibe esses sinais e sugere caminhos com justificativa.
- Prescrição de treino editável.

**Fase 2 — tornar operável:**
- Chat interno, agenda com slots, pagamento via gateway parceiro.

**Fase 3 — completar:**
- Nutrição (via nutricionista parceiro), avaliação física/anamnese, biblioteca de vídeos, relatórios de evolução.

O motivo da ordem: as fases 2 e 3 são commodity — copiar não te diferencia. A fase 1 é a única que cria moat, então é onde o esforço inicial deve ir.

---

## 11. Direção visual

Deliberadamente fora do visual "app de academia" (preto + neon). Identidade de **consultoria premium**, coerente com o nicho de qualidade:

- **Cores:** verde-pinho (`#1b5e43`) como primária (saúde, crescimento, calma), coral-apricot (`#f2764a`) como ação/energia, sobre papel verde-claro (`#eef1ea`).
- **Tipografia:** Bricolage Grotesque (títulos, momentos de destaque), Inter (interface), Space Mono (números/métricas — dá cara de "dado de coaching").
- **Elemento-assinatura:** o Copiloto, com tratamento visual próprio (painel escuro, pulso animado) que comunica "estou pensando com você", não "decidindo por você".

---

## 12. Como navegar o protótipo

Arquivo: `elo-prototipo.html` (abre em qualquer navegador; no celular fica em tela cheia).

- Botão **Professor / Aluno** no topo alterna as duas experiências.
- **Copiloto / Assistente** ficam no botão central elevado de cada barra.

**Roteiro de demonstração sugerido:**
1. *Aluno → Assistente →* "Senti uma dor" → seguir o fluxo (local, quando, nota 0-10). Repare que a dor vira dado estruturado e "avisa o professor".
2. *Professor → Copiloto.* Repare que a mesma dor aparece como sinal. Escolha um caminho e veja as perguntas encadearem até o rascunho editável.
3. No rascunho, toque em **"Abrir editor detalhado"**. Expanda um exercício e veja os campos (séries, carga, descanso, cadência…) e a miniatura do movimento em cada um.
4. Ainda no construtor, toque na **bolinha verde flutuante** (canto inferior). Brinque com os lembretes — aceite "Adicionar mobilidade" e veja o item entrar marcado como confirmado por você.
5. *Aluno → Treino →* toque em um exercício para ver a **ficha completa com a demonstração animada** (botão pausar/tocar).
6. *Professor → Início → Anamnese e formulários.* Abra um **modelo pronto** (ex.: Corrida) ou toque em **"Criar anamnese dinâmica"**; adicione/edite perguntas, use as sugestões do copiloto e toque em "Ver como o aluno responde". Do lado do aluno, *Hoje → Responder* abre a anamnese para preencher.
7. Explore o resto: nutrição, chat (dá pra digitar), agenda, financeiro/pagamento com Pix.

O ponto a destacar em qualquer demo: **o loop fecha de ponta a ponta** — dor do aluno vira dado, dado vira contexto de decisão do professor. É isso, e não a "IA", que é o ativo defensável.

---

## 13. Perguntas em aberto

- Qual nicho exato atacar primeiro (corrida? reabilitação/pós-cirúrgico? idosos? gestantes?).
- O copiloto deve ter um modo opcional "gerar rascunho completo" para quem quer velocidade — ou isso dilui o diferencial?
- Tom da "bolinha": manter sempre em pergunta (respeitoso, mas pode parecer tímido para alguns) ou oferecer um modo mais assertivo/configurável?
- Vídeos de execução: gravados pelo próprio professor, licenciados de uma biblioteca, ou misto? (impacta custo, diferencial e velocidade de lançamento)
- Modelo com nutricionista parceiro: marketplace, parceria fixa ou white-label?
- Estratégia de aquisição: como tirar o professor da ferramenta atual (o gargalo real).

---

*Documento vivo. Atualizar conforme as entrevistas de validação trouxerem respostas às perguntas em aberto.*
