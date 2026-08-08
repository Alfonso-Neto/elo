# Elo — implantação e aceite de homologação

Este roteiro prepara um ambiente separado para validar o produto com contas reais. Ele não autoriza aplicar as migrations em produção nem usar dados reais de saúde antes da revisão jurídica/LGPD.

## 1. O que precisa existir

- Node.js 22 ou superior.
- Um projeto Supabase exclusivo para homologação.
- Supabase CLI instalada e autenticada, ou acesso equivalente pelo painel.
- Hospedagem HTTPS para o frontend.
- Um projeto OpenAI separado para a Edge Function.
- Dois e-mails de teste: um para professor e outro para aluno.

Use dados fictícios ou sintéticos durante o aceite técnico. Não reutilize chaves, banco ou usuários de produção.

## 2. Verificar o frontend antes de implantar

```bash
npm ci
npm run typecheck
npm test
npm run build
```

O artefato estático fica em `dist/`. A aplicação usa rotas por hash, então login, confirmação e redefinição continuam partindo do mesmo documento HTML.

## 3. Preparar o Supabase

Vincule a raiz deste repositório ao projeto correto e aplique apenas migrations pendentes:

```bash
supabase login
supabase link --project-ref <project-ref-homologacao>
supabase db push --linked
```

Não use `db reset --linked` em um projeto compartilhado: esse comando recria o schema remoto. Antes de qualquer alteração posterior, confirme o `project-ref` e mantenha backup do ambiente.

As 13 migrations devem aparecer, em ordem, no histórico remoto. Elas cobrem:

| Domínio | Persistência e fronteira |
|---|---|
| Identidade | perfis, CREF, workspaces, membros e convites |
| Saúde | consentimentos versionados, relatos de dor, eventos append-only e ciclo profissional serializado |
| IA | execuções, propostas, decisões, cotas e auditoria |
| Treino | versões imutáveis, conclusões, anamneses e notas profissionais |
| Operação | agenda, solicitações, eventos e conversa privada |
| Nutrição | planos do parceiro, consentimento, refeições e hidratação |
| Notificações | feed derivado dos domínios e recibos de leitura |

O SQL versionado possui testes estáticos, mas este checkout não teve acesso a um Postgres/Supabase vivo. Execute o aceite contra o projeto recém-criado antes de liberar a coorte.

## 4. Configurar Auth

No painel do Supabase, em **Authentication → URL Configuration**:

- defina **Site URL** como a origem HTTPS exata da homologação;
- adicione somente as origens/URLs de redirecionamento realmente usadas;
- mantenha confirmação de e-mail habilitada;
- não use curingas amplos no ambiente público.

O cliente constrói os redirects a partir da origem atual para `#/confirmar-email` e `#/redefinir-senha`. O `supabase/config.toml` já permite `5173` para `npm run dev` e `4173` para `npm run preview` no stack local.

Referência oficial: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 5. Configurar e implantar a IA

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

Professores cadastrados começam não verificados. Para a coorte, escolha uma destas opções:

1. concluir a verificação profissional; ou
2. criar a exceção temporária e auditável de workspace descrita no README da função, com motivo e expiração curta.

Sem uma dessas condições, a IA deve falhar fechada enquanto o restante do acompanhamento continua funcional.

## 6. Implantar o frontend

Configure na plataforma de hospedagem apenas:

```text
VITE_SUPABASE_URL=https://<projeto-homologacao>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key-do-projeto>
```

Gere `dist/` no pipeline e publique seu conteúdo na raiz do site. Valide no bundle e nas variáveis da plataforma que nenhuma chave `service_role`, `sb_secret_*` ou segredo da OpenAI foi exposto.

## 7. Preparar o vínculo real

1. Cadastre e confirme a conta **Professor**.
2. Entre nessa conta e gere um convite em **Alunos → Convidar aluno**.
3. Cadastre e confirme a conta **Aluno** com o mesmo e-mail informado no convite.
4. Na entrada do aluno, cole o código de uso único.
5. Confirme que a conta de professor abre o perfil diretamente pela base de alunos.

Use perfis de navegador separados. Uma conta autenticada não pode alternar para o papel oposto e rotas incompatíveis são redirecionadas para a área permitida.

## 8. Preparar nutrição sem ultrapassar o escopo profissional

1. O aluno abre **Nutrição** e registra o consentimento específico.
2. Uma integração de servidor confiável chama `ingest_partner_nutrition_plan` com `service_role`, nutricionista/CRN, validade, refeições e chave de idempotência.
3. O aluno registra refeições e hidratação.
4. O professor visualiza somente o resumo permitido pelo consentimento; ele não cria nem altera o plano.

Nunca faça a ingestão pelo navegador e nunca exponha `service_role` para facilitar a demonstração.

## 9. Matriz mínima de aceite

| Jornada | Resultado esperado |
|---|---|
| Cadastro professor/aluno | confirmação por e-mail, papel imutável e sessão restaurada |
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

Faça também testes em 390 px, 768 px e desktop, por teclado e com redução de movimento ativada.

## 10. Evidências e decisão

Registre para cada rodada:

- commit e data do build;
- URLs do frontend e do projeto Supabase;
- migrations aplicadas;
- versão implantada da Edge Function;
- contas sintéticas usadas e papel de cada uma;
- jornada, resultado, captura e identificador do defeito;
- confirmação de que financeiro não apareceu;
- confirmação de que nenhum segredo entrou no frontend ou nos logs.

Só libere a coorte quando todas as jornadas críticas passarem, o isolamento entre workspaces for verificado no banco remoto e existir responsável definido para incidentes, exclusão de dados e retirada de consentimento.
