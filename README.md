# Elo — web app

Aplicação web mobile-first para validar o Elo entre professor e aluno. O visual segue o protótipo de referência; o produto implementa o loop de sinais, decisão humana e acompanhamento sem incluir financeiro/pagamento.

## Estado atual

- **Demonstração:** cenário fictício completo no navegador, persistido em `localStorage` e isolado das contas reais.
- **Homologação:** autenticação, papéis, vínculos, consentimentos, dor, Copiloto, treinos, anamneses, agenda, mensagens, nutrição e notificações usam Supabase, RLS e registros versionados/imutáveis conforme o domínio.
- **IA:** a Edge Function `assistant-triage` gera propostas estruturadas e auditáveis; nenhuma sugestão publica ou altera uma prescrição sem decisão humana.
- **Fora do escopo:** pagamento e financeiro.

As migrations e a Edge Function estão versionadas, mas não foram aplicadas a um projeto Supabase vivo neste checkout. O roteiro seguro de implantação e validação está em [HOMOLOGACAO.md](./HOMOLOGACAO.md).

## Executar

Requer Node.js 22 ou superior.

```bash
npm install
npm run dev
```

O projeto web está diretamente na raiz de `projeto-pobre/`. Sem variáveis de ambiente, a entrada real falha de forma segura e a demonstração continua disponível por ação explícita.

## Configuração pública

Copie `.env.example` para `.env.local` e preencha somente:

```text
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<chave-publicavel>
```

Nunca coloque `service_role`, chave secreta do Supabase, segredo da IA ou credenciais SMTP em `VITE_*`: tudo que começa com `VITE_` é entregue ao navegador.

## Roteiro de demonstração

1. Entre na demonstração como **Aluna** e abra **Assistente → Senti uma dor**.
2. Registre local, momento, intensidade e a checagem de segurança.
3. Alterne para **Treinador**: o relato aparece em **Visão geral**, **Alunos** e **Copiloto**.
4. No Copiloto, revise a proposta, aceite apenas o que fizer sentido e abra o **Construtor**.
5. Edite a prescrição e publique explicitamente.
6. Volte para **Aluna → Treino**, conclua exercícios e envie o feedback.

Agenda, conversa, anamnese dinâmica, ausência, plano nutricional, hidratação e notificações também fecham o ciclo no modo correspondente.

Na homologação real não existe troca de papel: use uma conta de professor e outra de aluno, preferencialmente em perfis de navegador separados.

## Verificação

```bash
npm run typecheck
npm test
npm run build
```

Estado validado deste commit: mais de 160 testes automatizados e build de produção dividido em bundles menores que 250 kB.

## Limites conscientes da homologação

- Convites são exibidos para compartilhamento manual; envio transacional de e-mail ainda não faz parte deste repositório.
- O plano nutricional só pode entrar por uma integração confiável com `service_role` e consentimento vigente; professor e navegador permanecem em leitura.
- As demonstrações de exercício são vetoriais. Vídeos próprios/licenciados são uma decisão posterior de conteúdo.
- Professores novos começam sem verificação profissional. A IA exige verificação ou uma exceção temporária e auditável para a coorte de homologação.
