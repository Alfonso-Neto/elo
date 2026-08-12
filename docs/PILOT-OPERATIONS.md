# Operação do piloto liberável

Este documento define os controles operacionais mínimos do ambiente de homologação do Elo. Ele complementa o [roteiro de homologação](../HOMOLOGACAO.md); não autoriza dados reais de saúde, produção ou uso de credenciais privilegiadas no cliente.

## Estado e responsáveis

Antes da coorte, preencha a [evidência de liberação](./PILOT-EVIDENCE.md) com responsáveis nominais por release, banco, incidentes, privacidade/LGPD, suporte e revisão profissional. O responsável pelo release interrompe a liberação diante de qualquer critério bloqueador.

O checkout atual contém **17 migrations**. As migrations de texto seguro, limites determinísticos de JSONB e execução mínima do validador em DML autenticado integram o conjunto versionado; confirme sempre a correspondência local/remota antes da liberação.

## Contrato do aceite remoto

O script `scripts/remote-acceptance.mjs` usa somente a chave pública e duas contas `authenticated`. Ele nunca usa `service_role`, cria usuários ou provisiona infraestrutura. Todas as contas e IDs devem pertencer exclusivamente a dados sintéticos de homologação.

Variáveis obrigatórias:

| Variável | Conteúdo |
|---|---|
| `PILOT_SUPABASE_URL` | URL HTTPS do projeto de homologação |
| `PILOT_SUPABASE_PUBLISHABLE_KEY` | chave `sb_publishable_*`; chaves legadas ou secretas são recusadas |
| `PILOT_TRAINER_EMAIL` / `PILOT_TRAINER_PASSWORD` | conta confirmada do professor no workspace sob teste |
| `PILOT_TRAINER_USER_ID` | UUID esperado dessa conta |
| `PILOT_TRAINER_EXPECTED_ROLE` | `owner` ou `trainer` |
| `PILOT_TRAINER_EXPECTED_ACCESS_MODE` | `verified` ou `temporary_homologation`; impede falso positivo por professor bloqueado |
| `PILOT_STUDENT_EMAIL` / `PILOT_STUDENT_PASSWORD` | conta confirmada do aluno no mesmo workspace |
| `PILOT_STUDENT_USER_ID` | UUID esperado dessa conta |
| `PILOT_WORKSPACE_ID` | UUID do workspace comum às duas contas |
| `PILOT_FOREIGN_WORKSPACE_ID` | UUID real de um segundo workspace sintético |
| `PILOT_FOREIGN_WORKSPACE_NAME` | nome atual exato do segundo workspace; a sonda tenta escrever o mesmo valor |
| `PILOT_FOREIGN_STUDENT_USER_ID` | UUID real de aluno ativo no segundo workspace |
| `PILOT_FOREIGN_SCHEDULE_SLOT_ID` | UUID real de slot ativo no segundo workspace |

Um operador privilegiado deve conferir previamente que os três IDs estrangeiros existem, pertencem ao segundo workspace e não são visíveis às contas testadas. Não copie o resultado privilegiado para o log do script.

Use um arquivo temporário fora do repositório ou variáveis secretas do executor. No PowerShell, carregue-as na sessão e redirecione somente a saída redigida:

```powershell
node scripts/remote-acceptance.mjs | Tee-Object -FilePath pilot-remote-evidence.jsonl
if ($LASTEXITCODE -ne 0) { throw 'Aceite remoto reprovado' }
```

Não use `--trace-*`, shell debug, captura do ambiente ou `set`/`Get-ChildItem Env:`. A evidência JSONL contém apenas nomes de controles, resultado, categoria genérica e horários; o script não imprime e-mails, IDs, senhas, tokens nem corpos retornados. Saída diferente desse contrato deve ser tratada como incidente de segredo e removida dos anexos até saneamento.

O processo falha fechado se faltar variável, a identidade divergir, uma consulta retornar linhas estrangeiras, uma mutação estrangeira afetar linha ou um RPC estrangeiro for aceito. As sondas RPC usam conteúdo sintético; ainda assim, execute-as somente no segundo workspace descartável porque uma vulnerabilidade pode gerar um registro de teste antes da reprovação.

## Preparação das contas e e-mail

Crie quatro contas confirmadas em perfis de navegador separados: professor e aluno do workspace principal, e professor e aluno do workspace estrangeiro. O segundo professor prepara o vínculo e o slot usados pelas sondas de isolamento. Verifique entrega, confirmação, redefinição e invalidação de sessões sem colocar links mágicos ou tokens nas evidências.

O envio transacional automático de convites e demais e-mails continua **fora do escopo deste piloto**. Para a coorte, a operação entrega o código de convite de uso único por canal aprovado e registra somente o horário, destinatário mascarado e resultado da entrega manual.

## CREF: decisão e auditoria

Responsabilidade: um analista treinado prepara a consulta; um segundo responsável de operações aprova ou rejeita. Para a fonte primária, consulte o [cadastro público do Sistema CONFEF/CREFs](https://www.confef.org.br/confef/registrados/) e, em caso de divergência ou indisponibilidade, o CREF da UF. Não use agregadores comerciais como fonte de decisão.

Fluxo com SLA de dois dias úteis:

1. Compare nome, CREF canônico e UF enviados com a fonte oficial; registre data/hora, URL, resultado e identificador do chamado, evitando documento pessoal desnecessário.
2. O segundo responsável revisa a evidência e executa `review_trainer_verification` por backend confiável com `service_role`, nunca pelo navegador. Informe `p_trainer_user_id`, `p_decision` (`verified` ou `rejected`), `p_rejection_reason` (nulo na aprovação e objetivo na rejeição), `p_reviewer_reference` apontando ao chamado e `p_idempotency_key` única.
3. Guarde o ID do evento/RPC, referência do chamado, atores e horários. Não guarde token, senha, chave ou cópia integral de documento no chamado.
4. Na rejeição, comunique correção acionável e permita novo envio; não conceda acesso por edição direta de tabela.

Se a análise ultrapassar o SLA e o piloto precisar continuar, somente o responsável de operações pode criar uma concessão temporária append-only, vinculada ao professor e workspace, com motivo, chamado e expiração máxima de sete dias. A interface deve identificá-la como homologação, sem representar CREF verificado. Não renove automaticamente. Revogue antecipadamente com o registro append-only próprio quando a justificativa terminar, houver rejeição, incidente ou encerramento da coorte; confira em seguida `get_my_professional_access` e a negação dos fluxos profissionais.

Revise diariamente solicitações pendentes, concessões que expiram em 24 horas, concessões vencidas ainda reportadas como ativas, rejeições repetidas e decisões sem referência. Qualquer decisão sem dupla revisão ou evidência bloqueia novas liberações.

## Hospedagem, observabilidade e alertas

Publique somente o `dist/` do commit aceito, por HTTPS, com as duas variáveis públicas documentadas no runbook. Registre commit, checksum do artefato, URL, horário, executor e versão da Edge Function. Confirme ausência de `service_role`, `sb_secret_*`, OpenAI e credenciais `PILOT_*` no bundle e na configuração exposta.

Centralize logs de hospedagem, Supabase Auth/Postgres e Edge Function com acesso mínimo e retenção aprovada pela privacidade. Redija Authorization, cookies, tokens, e-mails completos, código de convite, texto de mensagens, relato de dor, payload de IA e respostas de provedores. Prefira IDs de correlação aleatórios e métricas agregadas.

Alertas bloqueadores ou de resposta imediata:

- qualquer leitura/mutação entre workspaces ou `service_role` observado no cliente;
- pico de `401`, `403`, `42501`, `5xx`, timeout ou rate limit em cinco minutos;
- falha repetida de Auth/e-mail, Edge Function indisponível ou migration divergente;
- segredo ou dado de saúde em log;
- concessão temporária vencida ainda autorizando acesso;
- decisão CREF sem referência, ator ou evento de auditoria.

O plantonista registra severidade, impacto, janela, correlação e ações sem conteúdo sensível. Para suspeita de isolamento ou segredo, suspenda a coorte, desabilite o frontend, revogue sessões/chaves afetadas, preserve evidências redigidas e acione segurança/privacidade. Não “teste em produção” para confirmar.

## Rollback e decisão de liberação

O rollback padrão é retirar o frontend, reimplantar o último artefato aceito e restaurar a versão anterior da Edge Function. Migrations são forward-only: não rode reset, SQL destrutivo ou reversão improvisada. Se uma migration falhar, suspenda gravações e prepare migration corretiva revisada; restauração de backup exige decisão do responsável pelo banco e avaliação de perda de dados.

Após rollback, repita checks locais, Deno, correspondência das 17 migrations, aceite remoto, jornadas E2E e inspeção manual de 390/768 px, teclado, foco e redução de movimento. Só libere com todos os bloqueadores encerrados e evidência assinada.

Vídeos licenciados de exercícios permanecem **evolução futura**; não publique mídia sem cadeia de licença e autorização documentadas.
