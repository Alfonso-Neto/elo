# Elo — protótipo web

Protótipo navegável para validar o loop central do Elo entre treinador e aluna. A aplicação roda inteiramente no navegador e persiste as ações em `localStorage`.

## Executar

```bash
npm install
npm run dev
```

O projeto web está diretamente na raiz de `projeto-pobre/`.

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

Este é um protótipo de validação sem backend, autenticação ou persistência remota. Dados exibidos são fictícios e permanecem apenas no navegador atual.

Os testes automatizados cobrem nove jornadas críticas, incluindo privacidade da conversa, Copiloto, publicação de treino, feedback pós-treino, relato de dor, anamnese e entrada direta como aluna.
