# Elo — web app

Aplicação web mobile-first para validar e homologar o loop central do Elo entre professor e aluno. O modo de demonstração ainda usa dados fictícios no navegador; a base de autenticação e autorização remota usa Supabase.

## Executar

```bash
npm install
npm run dev
```

O projeto web está diretamente na raiz de `projeto-pobre/`.

## Configurar autenticação

1. Crie um projeto Supabase separado para homologação.
2. Copie `.env.example` para `.env.local`.
3. Preencha somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com valores públicos.
4. Aplique as migrations em `supabase/migrations/` no projeto de homologação.
5. Configure no Supabase a URL do site e apenas os redirects usados pelo ambiente.

Chaves `service_role`, segredos de IA e credenciais SMTP nunca devem ser colocados em variáveis `VITE_*`.

## Roteiro principal

1. Entre como **Aluna** e abra **Assistente → Senti uma dor**.
2. Registre local, momento e intensidade.
3. Troque para **Treinador**: o relato aparece em **Visão geral**, **Alunos** e **Copiloto**.
4. No Copiloto, escolha um caminho e ajuste o volume.
5. Abra o **Construtor**, edite/adicione exercícios, resolva os lembretes e envie.
6. Volte para **Aluna → Treino**: a versão publicada aparece para execução e feedback.

Também estão disponíveis agenda compartilhada, conversas, anamnese dinâmica com consentimento, respostas estruturadas e plano nutricional atribuído à nutricionista responsável.

## O que funciona

- Treinador: painel de sinais, busca/filtros de alunos, histórico e notas privadas, Copiloto com três estratégias realmente diferentes, construtor de treino, oito anamneses específicas, agenda, aprovações e conversas.
- Aluna: treino com progresso/cronômetro/demonstração/feedback, relato guiado de dor, aviso de ausência, agenda, anamnese com consentimento, conversa privada, refeições e hidratação.
- Entre papéis: dor, prescrição publicada, anamnese, feedback, agenda e mensagens compartilham o mesmo estado. Abas abertas em paralelo sincronizam por `localStorage`.
- Ações persistem após recarregar. Rascunhos de treino e formulário ficam separados das versões publicadas.

Pagamento/financeiro foi deliberadamente excluído desta versão, conforme o escopo da validação.

Use **Reiniciar demonstração** no menu lateral para restaurar o cenário inicial.

## Verificação

```bash
npm run typecheck
npm test
npm run build
```

O modo de demonstração continua isolado em `localStorage` e contém apenas dados fictícios. Em homologação, identidade, papéis e acesso passam pela configuração Supabase; os próximos domínios migram para tabelas protegidas por RLS em fatias verticais.

Os testes automatizados cobrem nove jornadas críticas, incluindo privacidade da conversa, Copiloto, publicação de treino, feedback pós-treino, relato de dor, anamnese e entrada direta como aluna.
