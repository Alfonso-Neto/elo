# Arquitetura e segurança — Elo

Este documento descreve o desenho técnico do candidato de piloto do Elo. Ele explica responsabilidades e fronteiras; comandos operacionais ficam em [Homologação](../HOMOLOGACAO.md) e [Operação do piloto](./PILOT-OPERATIONS.md).

## Índice

- [Visão geral](#visão-geral)
- [Frontend e navegação](#frontend-e-navegação)
- [Identidade, papel e workspace](#identidade-papel-e-workspace)
- [Domínios de dados](#domínios-de-dados)
- [Autorização e mutações](#autorização-e-mutações)
- [Copiloto e Edge Function](#copiloto-e-edge-function)
- [Consentimento, privacidade e auditoria](#consentimento-privacidade-e-auditoria)
- [Migrations](#migrations)
- [Testes e critérios de aceite](#testes-e-critérios-de-aceite)
- [Deploy e observabilidade](#deploy-e-observabilidade)
- [Decisões e limitações](#decisões-e-limitações)

## Visão geral

```text
Navegador
  React + TypeScript
  configuração publicável
        │
        ├── Supabase Auth ── identidade e sessão
        │
        ├── PostgREST ────── SELECT sob RLS
        │                    RPCs para mutações
        │
        └── Edge Function assistant-triage
                 │ JWT do usuário + origem exata
                 ├── RPCs de ciclo de vida
                 └── OpenAI (contexto minimizado)

Postgres
  public: dados acessíveis somente sob políticas
  private: quotas, segredos derivados, auditoria operacional
```

O frontend é um artefato estático. Ele não contém servidor próprio, `service_role`, chave OpenAI nem autoridade administrativa. A fonte de verdade é o Postgres; a interface melhora a experiência, mas não constitui uma fronteira de segurança.

## Frontend e navegação

O cliente usa React 19, TypeScript e Vite. `src/App.tsx` define a navegação por papel e carrega telas sob demanda. Rotas de autenticação usam hash, inclusive confirmação e redefinição, para que a hospedagem estática sirva o mesmo `index.html`.

Áreas do professor:

- Visão geral;
- Alunos e perfil do aluno;
- Copiloto;
- Treinos;
- Agenda;
- Conversas;
- Anamneses.

Áreas do aluno:

- Hoje;
- Treino;
- Assistente;
- Nutrição;
- Agenda;
- Conversas;
- Anamnese.

`AuthProvider` restaura a sessão, carrega o perfil e a associação ativa e consulta o acesso profissional. `EloAppProvider` mantém apenas estado efêmero de interface, como rota e aluno selecionado. Dados simulados ou troca de papel por armazenamento local não fazem parte do fluxo autenticado.

As telas remotas são separadas em serviços por domínio (`src/live/*/service.ts`, `src/onboarding/*-service.ts`, `src/signals/service.ts`). Validadores convertem a resposta remota para tipos conhecidos e rejeitam estruturas inesperadas.

## Identidade, papel e workspace

### Cadastro

`auth.users` é a identidade primária. O gatilho `handle_new_user` cria:

- `profiles`, com papel global `trainer` ou `student`;
- `trainer_profiles`, quando aplicável;
- workspace e associação inicial para professor.

O papel não pode ser alterado pelo próprio usuário. O frontend deriva a área permitida do perfil retornado pelo servidor.

### Associação

`workspaces` representa o espaço de acompanhamento e `workspace_members` registra owner, professor ou aluno. Convites são criados para um e-mail específico, possuem validade e uso único. A aceitação valida o e-mail autenticado e cria a associação no workspace de origem.

O cliente não escolhe livremente um `workspace_id`. As consultas e RPCs resolvem a associação ativa e recusam IDs de outro workspace.

### Acesso profissional

Uma conta de professor possui ciclo `unverified → pending → verified` ou `rejected`. O próprio professor pode enviar ou corrigir CREF, mas somente uma operação privilegiada chama `review_trainer_verification`.

Uma concessão temporária de homologação é uma exceção independente:

- vinculada ao professor e workspace;
- limitada a sete dias;
- append-only, com motivo, referência de revisor e idempotência;
- encerrada antecipadamente por uma revogação também append-only;
- exibida como temporária, nunca como verificação de CREF.

Sem verificação ou concessão vigente, os domínios profissionais falham fechados. O procedimento humano está em [Operação do piloto](./PILOT-OPERATIONS.md#cref-decisão-e-auditoria).

## Domínios de dados

### Identidade e vínculo

`profiles`, `trainer_profiles`, `workspaces`, `workspace_members` e `workspace_invitations` sustentam cadastro, papel, workspace e convite.

### Sinais de saúde

`consent_policies` versiona a finalidade; `consent_events` registra concessão e retirada; `pain_reports` preserva o relato estruturado; `pain_report_events` guarda o ciclo de acompanhamento.

O relato inclui região, movimento, momento, intensidade, sinalizadores permitidos e detalhe limitado. Texto ou flags arbitrários enviados pelo cliente não substituem o registro autoritativo carregado pela Edge Function.

### IA

`ai_runs`, `ai_proposals` e `ai_proposal_decisions` separam execução, conteúdo proposto e decisão humana. Tabelas privadas guardam atestação do executor e orçamento de uso. O histórico `ai_workspace_access` não concede mais autorização.

### Treino e anamnese

`workout_versions` contém publicações imutáveis. `workout_completion_events` registra conclusão e feedback sem reescrever a versão. `anamnesis_assignments` e `anamnesis_submissions` separam o formulário atribuído da resposta. `trainer_student_notes` é leitura profissional restrita.

### Agenda e conversa

`schedule_slots`, `schedule_sessions` e suas tabelas de eventos representam disponibilidade e transições. `thread_messages` pertence ao vínculo professor–aluno e não pode ser inserida por DML direto; RPCs diferentes atendem professor e aluno.

### Nutrição

`nutrition_plan_versions` recebe versões de uma integração de servidor confiável, identificando nutricionista e CRN. `nutrition_meal_events` e `nutrition_hydration_events` registram acompanhamento diário. Saúde e nutrição possuem consentimentos e finalidades separados. O professor tem leitura autorizada, não autoridade de prescrição.

### Notificações

`list_my_notifications` deriva itens dos domínios acessíveis ao chamador. `notification_read_receipts` mantém o estado de leitura. Mensagens não são reproduzidas no texto da notificação, reduzindo exposição acidental.

## Autorização e mutações

Todas as tabelas expostas usam RLS. As políticas combinam:

- `auth.uid()`;
- papel global do perfil;
- associação ativa ao workspace;
- relação professor–aluno;
- consentimento vigente;
- acesso profissional vigente.

Leituras simples acontecem sob RLS. Mutações de domínio usam RPCs `security definer` com `search_path` fixo e concessões explícitas. Cada RPC revalida identidade e escopo; `security definer` não significa autorização irrestrita.

Controles recorrentes:

- chave de idempotência por intenção;
- locks para serializar transições concorrentes;
- orçamento de mutação e limites de payload;
- enumerações e allowlists;
- eventos append-only para decisões e mudanças relevantes;
- rejeição de DML direto quando ele contornaria o ciclo de vida.

Texto exibido passa por validação contra controles invisíveis e caracteres bidirecionais. Payloads JSONB possuem medição determinística e limites aplicados por constraints. Esses controles reduzem abuso e ambiguidade, mas não dispensam escaping do React, revisão de conteúdo ou limites na borda.

## Copiloto e Edge Function

`assistant-triage` medeia dois casos:

1. triagem de um relato de dor já persistido pelo aluno;
2. proposta de Copiloto para revisão do professor.

Fluxo simplificado:

```text
Requisição autenticada
  → validar método, origem, corpo e idempotência
  → criar cliente Supabase com JWT do chamador
  → reservar execução e cota no banco
  → carregar contexto autorizado/minimizado
  → chamar provedor de modelo
  → validar resposta estruturada
  → persistir proposta inerte
  → concluir ou falhar a execução com auditoria
```

A função não usa `service_role`. O cliente Supabase da função usa chave publicável e JWT do chamador, preservando RLS. RPCs internos do ciclo de IA também exigem `AI_EXECUTOR_SECRET`, cujo hash é atestado no banco; isso impede que um navegador conclua uma execução forjada.

O modelo recebe somente o contexto necessário e não recebe identificadores de autorização como autoridade. Respostas recusadas, incompletas, grandes ou fora do schema falham sem publicar mudança. `decide_ai_proposal` registra decisão humana separadamente; publicação de treino ocorre em outro RPC.

Contrato e rotação estão em [Assistant triage](../supabase/functions/assistant-triage/README.md).

## Consentimento, privacidade e auditoria

O desenho diferencia:

- identidade e autorização;
- consentimento para uma finalidade;
- acesso técnico ao registro;
- decisão profissional sobre o conteúdo.

Consentimento é evento versionado, não apenas checkbox local. Retirada afeta novas leituras e operações conforme o domínio, sem apagar silenciosamente o histórico necessário à auditoria. Exclusão ou anonimização exige processo próprio e revisão legal; não deve ser improvisada por edição de tabelas.

Logs e evidências não devem conter bearer token, senha, e-mail completo, convite, relato de dor, mensagem, payload de IA ou resposta do modelo. O produto usa IDs de correlação e categorias genéricas quando possível.

## Migrations

As 17 migrations são forward-only e ordenadas pelo timestamp:

| Faixa | Responsabilidade |
|---|---|
| `193000` | identidade, perfis, workspaces e base de RLS |
| `203000` | consentimento e relatos de dor |
| `210000` | execução, propostas, decisões e cotas de IA |
| `220000`–`221600` | convite, red flags e consentimento idempotente |
| `230000` | treino, anamnese e notas profissionais |
| `240000` | agenda, sessões, eventos e mensagens |
| `245000`–`250000` | consentimento e integração nutricional |
| `252000` | feed de notificações |
| `253000` | ciclo profissional do relato de dor |
| `254000` | verificação CREF e acesso temporário |
| `255000`–`261000` | texto seguro, limites JSONB e permissão mínima de validação |

Não altere uma migration já aplicada para “corrigir” homologação. Crie uma nova migration revisada. O runbook exige correspondência entre histórico remoto e checkout antes da liberação.

## Testes e critérios de aceite

### Verificação local

`npm run verify` encadeia:

- integridade da documentação;
- contratos estáticos de fonte;
- verificações SQL/RLS;
- TypeScript;
- testes unitários e de componentes;
- CSS, build e limites do artefato.

O CI acrescenta auditoria de dependências de produção, `deno check`, testes Deno e Playwright público.

### Deno

Os testes da Edge cobrem autenticação, origem, limites, validação estruturada, idempotência, recusa do provedor, segredo do executor e falha fechada.

### Aceite remoto

`scripts/remote-acceptance.mjs` usa chave publicável e contas `authenticated`, nunca autoridade administrativa. Ele confirma identidade, papel, acesso esperado e isolamento com IDs reais de um segundo workspace sintético. Qualquer leitura, update ou RPC estrangeiro aceito reprova o teste.

### E2E

Playwright separa fluxo público e interface autenticada remota. A matriz inclui professor/aluno, 390/768 px, navegação, ausência de overflow, foco por teclado e preferência por redução de movimento.

Contagens de testes mudam com o projeto. Registre números e resultados do commit liberado em [Evidência de liberação](./PILOT-EVIDENCE.md), em vez de tratá-los como propriedade permanente da arquitetura.

## Deploy e observabilidade

### Frontend

Vercel executa o build Vite e publica `dist/`. `vercel.json` reescreve rotas para `index.html` e configura CSP, `frame-ancestors`, `nosniff`, política de referência e política de permissões. O cache imutável é aplicado somente aos assets com hash.

Somente duas variáveis podem entrar no build:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY` com prefixo `sb_publishable_`.

### Supabase

Auth precisa conhecer a Site URL e os redirects HTTPS da release. A Edge Function precisa listar a origem exata em `ALLOWED_ORIGINS`. `verify_jwt` permanece habilitado. Alterar apenas o frontend não atualiza essas duas fronteiras.

### Monitoramento

A liberação requer visibilidade mínima de:

- falhas de build e deploy;
- erros de Auth e entrega de e-mail;
- `401`, `403`, `42501`, `429`, `5xx` e timeout da Edge;
- divergência de migrations;
- concessões temporárias próximas do vencimento;
- decisões CREF sem referência e eventos de isolamento.

Alertas devem usar métricas agregadas e logs redigidos. O plano de resposta, rollback e responsáveis está em [Operação do piloto](./PILOT-OPERATIONS.md).

## Decisões e limitações

- SPA estática reduz superfície operacional, mas depende de configuração coerente em Vercel e Supabase.
- Hash routing simplifica fallback da hospedagem; URLs são menos convencionais.
- RLS e RPCs aumentam defesa no servidor, mas migrations exigem revisão cuidadosa e testes em banco descartável.
- IA proposal-only reduz risco de ação autônoma; não elimina erro, viés ou necessidade de revisão.
- Acesso temporário viabiliza homologação sem falsificar CREF; precisa expirar e ser auditado.
- Envio transacional de convites, vídeos licenciados, produção com dados reais e processo formal de exclusão permanecem fora do candidato atual.
