# Elo — implantação e aceite de homologação

Este é o runbook operacional para validar, em um ambiente separado, as fronteiras centrais do Elo: vínculo entre professor e aluno, consentimento, verificação profissional, isolamento por papel e workspace, ciclo dor → proposta → decisão → publicação, idempotência e falha fechada.

Para entender a proposta antes de executar o aceite, leia a [visão geral](./README.md) e a [documentação do produto](./elo-documentacao.md). Este roteiro não autoriza aplicar migrations em produção nem usar dados reais de saúde antes da revisão jurídica/LGPD.

## 1. O que precisa existir

- Node.js 22.12 ou superior.
- Deno 2 para validar a Edge Function localmente.
- Um projeto Supabase exclusivo para homologação.
- Supabase CLI instalada e autenticada, ou acesso equivalente pelo painel.
- Hospedagem HTTPS para o frontend.
- Um projeto OpenAI separado para a Edge Function.
- Dois e-mails de teste: um para professor e outro para aluno.

Use dados fictícios ou sintéticos durante o aceite técnico. Não reutilize chaves, banco ou usuários de produção.

## 2. Verificar o frontend antes de implantar

```bash
npm ci
npm run verify
deno check supabase/functions/assistant-triage/index.ts
deno test --allow-read supabase/functions/assistant-triage
```

`npm run verify` valida documentação, contratos do código-fonte, SQL/RLS, TypeScript, testes web, estilos, HTML, build e limites de bundle. O artefato estático fica em `dist/`. A aplicação usa rotas por hash, então login, confirmação e redefinição continuam partindo do mesmo documento HTML. A automação do repositório executa a mesma verificação web e também os testes da Edge Function com Deno 2.

### Estado técnico registrado em 11/08/2026

- `npm run verify`: aprovado;
- 59 arquivos de produção verificados pelo contrato estático de código-fonte;
- 57 arquivos e 303 testes web: aprovados;
- build de 29 arquivos e contratos de tamanho/tema/HTML: aprovados;
- Deno `2.9.5`: `deno check` aprovado e 21 testes aprovados;
- Supabase CLI `2.113.0`: projeto Elo Homolog vinculado, 17 migrations em paridade e Edge Function ativa;
- `db reset` local e `db lint`: aprovados com as 17 migrations;
- aceite remoto não privilegiado: 18 controles aprovados, incluindo IDs reais do segundo workspace;
- E2E conectado à homologação: 5 cenários aprovados em 390/768 px, teclado e redução de movimento;
- chaves legadas `anon/service_role`: desativadas após migração e smoke test com `sb_publishable_*`.

Não interprete esses resultados como aceite de produção. A interface de homologação está publicada por HTTPS em `https://elo-homolog.vercel.app` e a matriz autenticada hospedada passou com professor e aluno. A autorização dessa origem no Supabase Auth e no secret `ALLOWED_ORIGINS` da Edge Function, além de monitoramento/alertas, e-mail de confirmação e recuperação, rollback operacional e responsáveis humanos, ainda são gates abertos.

## 3. Preparar o Supabase

Vincule a raiz deste repositório ao projeto correto e aplique apenas migrations pendentes:

```bash
supabase login
supabase link --project-ref <project-ref-homologacao>
supabase db push --linked
```

Não use `db reset --linked` em um projeto compartilhado: esse comando recria o schema remoto. Antes de qualquer alteração posterior, confirme o `project-ref` e mantenha backup do ambiente.

As 17 migrations devem aparecer, em ordem, no histórico remoto. Elas cobrem:

| Domínio | Persistência e fronteira |
|---|---|
| Identidade | perfis, ciclo auditável de verificação do CREF, workspaces, membros e convites |
| Saúde | consentimentos versionados, relatos de dor, eventos append-only e ciclo profissional serializado |
| IA | execuções, propostas, decisões, cotas e auditoria |
| Treino | versões imutáveis, conclusões, anamneses e notas profissionais |
| Operação | agenda, solicitações, eventos e conversa privada |
| Nutrição | planos do parceiro, consentimento, refeições e hidratação |
| Notificações | feed derivado dos domínios e recibos de leitura |
| Texto exibido | rejeição de caracteres invisíveis, bidirecionais e de controle em campos visíveis e varredura recursiva dos payloads JSONB persistidos |
| Limites JSONB | medição determinística dos payloads pelo texto canônico e revalidação transacional das constraints afetadas |
| DML autenticado seguro | permissão mínima para que constraints de texto sejam avaliadas em updates autorizados sem expor o validador JSON |

O SQL versionado possui testes estáticos e deve passar por `db reset` e `db lint` locais antes do envio. O aceite remoto ainda é obrigatório antes de liberar a coorte.

Antes de `db push`, registre o `project-ref`, confirme visualmente que é o projeto de homologação e exporte um backup se o ambiente já contiver dados. Depois do push, confira as 17 versões na tabela de histórico e pare se houver migration ausente, fora de ordem ou aplicada manualmente.

## 4. Configurar Auth

No painel do Supabase, em **Authentication → URL Configuration**:

- defina **Site URL** como a origem HTTPS exata da homologação;
- adicione somente as origens/URLs de redirecionamento realmente usadas;
- mantenha confirmação de e-mail habilitada;
- não use curingas amplos no ambiente público.

O cliente constrói os redirects a partir da origem atual para `#/confirmar-email` e `#/redefinir-senha`. O `supabase/config.toml` já permite `5173` para `npm run dev` e `4173` para `npm run preview` no stack local.

Referência oficial: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 5. Verificar o acesso profissional

Professores novos entram com estado `unverified`. Depois de confirmar o e-mail, a própria tela do Elo permite revisar CREF, UF e nome do espaço e enviar a solicitação. Esse envio muda o estado para `pending`; ele **não** aprova o profissional.

Para cada solicitação da coorte:

1. confirme a identidade do titular e consulte o registro em fonte pública oficial do sistema CONFEF/CREF;
2. registre a evidência e o responsável em um chamado interno;
3. em um processo confiável de operações com `service_role`, chame `review_trainer_verification` com `p_trainer_user_id`, decisão `verified` ou `rejected`, motivo público quando rejeitada, `p_reviewer_reference` e uma chave de idempotência nova;
4. peça ao professor para usar **Atualizar situação** e confirme o estado derivado pelo servidor.

O RPC de decisão não é executável por `authenticated`. Nunca coloque `service_role` no navegador, no console do frontend, em `VITE_*` ou neste repositório. A referência do revisor deve apontar para um chamado ou identificador operacional, sem incluir segredo. O motivo de rejeição aparece ao próprio professor e deve ser objetivo, acionável e livre de dados desnecessários.

Antes de aprovar a primeira conta, execute uma consulta de preflight para CREFs verificados duplicados ou fora do formato esperado. A migration falha diante de duplicidade em vez de escolher silenciosamente um titular.

Para uma janela curta de homologação, uma exceção explícita de workspace pode ser usada enquanto a revisão está pendente. Essa exceção:

- precisa ter motivo, responsável e expiração curta;
- usa um novo registro append-only em `private.temporary_professional_access_grants`, vinculado ao workspace **e ao professor**, limitado a sete dias, e uma revogação append-only quando precisar terminar antes do prazo;
- é mostrada como **acesso temporário de homologação**, nunca como CREF verificado;
- libera os domínios profissionais protegidos daquele workspace, não somente a IA;
- não substitui a revisão do registro e não deve ser renovada automaticamente.

Registros antigos de `private.ai_workspace_access` ficam inertes após esta migration: não autorizam IA nem qualquer outro fluxo profissional. Use os comandos de concessão e revogação documentados no README da função; não edite um grant existente para estender sua validade.

Sem CREF verificado ou exceção vigente, convites, base de alunos, dados de saúde, treinos, agenda, mensagens, nutrição, notificações e IA profissionais devem falhar fechados. O cadastro e a tela de verificação continuam acessíveis.

## 6. Configurar e implantar a IA

A função usa o JWT do usuário e RLS; ela não usa `service_role`. Configure no cofre de secrets da Edge Function:

- `OPENAI_API_KEY`
- `AI_EXECUTOR_SECRET`
- `SAFETY_ID_SALT`
- `ALLOWED_ORIGINS` com a origem HTTPS exata da homologação
- opcionais: `OPENAI_MODEL` e `OPENAI_REASONING_EFFORT`

Depois de vincular o projeto, os secrets podem ser definidos pelo painel ou por `supabase secrets set`. Nunca versione o arquivo que contém esses valores.

`AI_EXECUTOR_SECRET` também exige a atestação do hash no banco. Siga integralmente [supabase/functions/assistant-triage/README.md](./supabase/functions/assistant-triage/README.md) antes do deploy:

```bash
supabase functions deploy assistant-triage --project-ref <project-ref-homologacao>
```

Mantenha `verify_jwt = true`. A configuração de secrets e a função são descritas nas referências oficiais [Environment Variables](https://supabase.com/docs/guides/functions/secrets) e [Edge Functions](https://supabase.com/docs/guides/functions).

Para executar a IA na coorte, o professor também precisa de uma destas condições já descritas:

1. concluir a verificação profissional; ou
2. criar a exceção temporária e auditável de workspace descrita no README da função, com motivo e expiração curta.

Sem uma dessas condições, a IA e os demais fluxos profissionais protegidos devem falhar fechados.

## 7. Implantar o frontend

Configure na plataforma de hospedagem apenas:

```text
VITE_SUPABASE_URL=https://<projeto-homologacao>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key-do-projeto>
```

Gere `dist/` no pipeline e publique seu conteúdo na raiz do site. Valide no bundle e nas variáveis da plataforma que nenhuma chave `service_role`, `sb_secret_*` ou segredo da OpenAI foi exposto.

O HTML inclui `noindex,nofollow,noarchive` porque este artefato é uma aplicação autenticada de homologação. Mantenha a origem fora de catálogos públicos e proteja também a plataforma de hospedagem; a diretiva para robôs não é um controle de segurança.

## 8. Preparar o vínculo real

1. Cadastre e confirme a conta **Professor**.
2. Envie o CREF para revisão e conclua a verificação, ou registre uma exceção temporária de homologação com expiração curta.
3. Entre nessa conta e gere um convite em **Alunos → Convidar aluno**.
4. Cadastre e confirme a conta **Aluno** com o mesmo e-mail informado no convite.
5. Na entrada do aluno, cole o código de uso único.
6. Confirme que a conta de professor abre o perfil diretamente pela base de alunos.

Use perfis de navegador separados. Uma conta autenticada não pode alternar para o papel oposto e rotas incompatíveis são redirecionadas para a área permitida.

## 9. Preparar nutrição sem ultrapassar o escopo profissional

1. O aluno abre **Nutrição** e registra o consentimento específico.
2. Uma integração de servidor confiável chama `ingest_partner_nutrition_plan` com `service_role`, nutricionista/CRN, validade, refeições e chave de idempotência.
3. O aluno registra refeições e hidratação.
4. O professor visualiza somente o resumo permitido pelo consentimento; ele não cria nem altera o plano.

Nunca faça a ingestão pelo navegador e nunca exponha `service_role` para facilitar testes de homologação.

## 10. Matriz mínima de aceite

| Jornada | Resultado esperado |
|---|---|
| Cadastro professor/aluno | confirmação por e-mail, papel imutável e sessão restaurada |
| Verificação profissional | envio não aprova, revisão somente por serviço confiável, rejeição corrigível e exceção temporária claramente identificada |
| Convite | código de uso único, e-mail correspondente e vínculo no workspace correto |
| Dor | consentimento, checagem de segurança, registro imutável e sinal para o professor |
| Copiloto | proposta estruturada, incertezas, decisão auditada e nenhum autopublish |
| Treino | rascunho, publicação versionada, execução e feedback do aluno |
| Anamnese | versão atribuída, consentimento, resposta imutável e leitura restrita |
| Agenda | slot, solicitação, aprovação/recusa/cancelamento e estado consistente |
| Conversa | canal privado, paginação, retry e mensagem sem conteúdo na notificação |
| Nutrição | ingestão parceira, consentimento específico e professor somente leitura |
| Notificações | feed por papel, alvo correto e recibo de leitura |
| Isolamento | usuário de outro workspace não lê nem altera os registros |
| Recuperação | senha redefinida e sessões anteriores encerradas |
| Falha fechada | sem chave pública, com chave proibida ou com backend indisponível, nenhuma área autenticada é simulada |
| Conectividade | perda de rede é anunciada e nenhuma ação é mostrada como concluída sem recibo do servidor |

Faça também testes em 390 px, 768 px e desktop, por teclado e com redução de movimento ativada.

Para o teste de isolamento, use pelo menos dois workspaces sintéticos. Tente acessar identificadores válidos do outro workspace por consultas, RPCs e navegação direta; uma tela vazia sozinha não é evidência suficiente de RLS.

Depois de preparar as contas e os IDs sintéticos descritos em [Operação do piloto](./docs/PILOT-OPERATIONS.md), execute o aceite não privilegiado:

```bash
node scripts/remote-acceptance.mjs
```

O processo deve terminar com código zero e uma linha-resumo com `failed: 0`. Não execute com `service_role`; não publique as variáveis `PILOT_*` no frontend nem anexe dump do ambiente. Use o [modelo de evidência](./docs/PILOT-EVIDENCE.md) para a decisão de liberação.

## 11. Evidências e decisão

Registre para cada rodada:

- commit e data do build;
- URLs do frontend e do projeto Supabase;
- migrations aplicadas;
- referência operacional e resultado da revisão profissional, sem copiar segredo ou documento pessoal;
- versão implantada da Edge Function;
- contas sintéticas usadas e papel de cada uma;
- jornada, resultado, captura e identificador do defeito;
- confirmação de que financeiro não apareceu;
- confirmação de que nenhum segredo entrou no frontend ou nos logs.

Só libere a coorte quando todas as jornadas críticas passarem, o isolamento entre workspaces for verificado no banco remoto e existir responsável definido para incidentes, exclusão de dados e retirada de consentimento.

Hospedagem, observabilidade, redaction de logs, alertas, rollback e o processo operacional de revisão do CREF estão definidos em [Operação do piloto](./docs/PILOT-OPERATIONS.md). Envio transacional de convites/e-mails e vídeos licenciados de exercícios permanecem evoluções futuras, fora deste piloto.

## 12. Critério de saída

A homologação técnica termina somente quando:

1. `npm run verify`, `deno check` e `deno test` passam no mesmo commit implantado;
2. as 17 migrations e a função publicada correspondem ao repositório;
3. professor, aluno e segundo workspace completam a matriz sem quebra de isolamento;
4. nenhum segredo aparece no frontend, artefato, captura ou log;
5. falhas encontradas possuem decisão registrada — corrigida, aceita explicitamente ou bloqueadora da coorte;
6. existe um plano de rollback e responsáveis por suporte, incidente e retirada de consentimento.
