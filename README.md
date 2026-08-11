# Elo

**Decisões profissionais melhores começam com sinais que não se perdem.**

Elo é uma aplicação web mobile-first que aproxima personal trainers e alunos em um ciclo contínuo de acompanhamento. O aluno registra como está, o sistema organiza os sinais relevantes e o professor usa esse contexto para decidir, prescrever e acompanhar — sempre com responsabilidade humana.

O produto nasce de um problema simples: dor, esforço percebido, faltas e feedbacks costumam ficar espalhados entre mensagens, planilhas e memória. Quando esses sinais não chegam no momento certo, a individualização do treino fica mais difícil. Elo transforma esse ruído em um fluxo de trabalho compartilhado, sem transformar inteligência artificial em autoridade clínica ou profissional.

## O ciclo central

```text
Aluno registra dor ou feedback
          ↓
Elo estrutura e protege o sinal
          ↓
Copiloto propõe perguntas e caminhos
          ↓
Professor avalia, edita e decide
          ↓
Nova versão do treino é publicada
          ↓
Execução e feedback alimentam o próximo ciclo
```

O Copiloto não é um piloto automático. Suas propostas são inertes: não salvam, alteram ou publicam uma prescrição. O profissional mantém a decisão final, e a publicação acontece em uma etapa separada, versionada e idempotente.

## Experiência do professor

O professor encontra em um único workspace os alunos vinculados, sinais que pedem atenção e o contexto necessário para acompanhar cada pessoa. A experiência inclui:

- painel do dia e histórico por aluno;
- Copiloto com propostas estruturadas, justificativas, incertezas e limites explícitos;
- construção e publicação versionada de treinos;
- anamneses, agenda, conversas e notificações;
- leitura de nutrição fornecida por parceiro habilitado, quando houver consentimento.

O objetivo não é retirar trabalho intelectual do profissional, mas reduzir a perda de contexto e apoiar decisões mais conscientes.

## Experiência do aluno

O aluno acompanha o treino publicado, consulta orientações de exercício e registra execução, esforço e feedback. Também pode relatar dor por um fluxo estruturado, responder anamneses, conversar com o professor, solicitar horários e acompanhar um plano nutricional disponibilizado por integração autorizada.

O Assistente ajuda a organizar o relato e encaminhá-lo ao professor. Ele não diagnostica, prescreve, substitui atendimento nem toma decisões sobre o treino.

## Princípios de confiança

- **Copiloto, não autopilot:** IA oferece contexto e alternativas; o profissional decide.
- **Consentimento antes do acesso:** sinais de saúde dependem de consentimento vigente e finalidade delimitada.
- **Isolamento por papel e workspace:** RLS e RPCs impõem as fronteiras no servidor; a interface não é a barreira de segurança.
- **Falha fechada:** ausência de configuração, autorização ou contexto válido não cria atalhos nem dados simulados.
- **Rastreabilidade:** relatos relevantes são preservados, decisões são auditáveis e publicações geram versões imutáveis.
- **Minimização:** somente o contexto necessário é enviado ao provedor de IA.
- **Verificação profissional real:** acesso profissional requer CREF verificado; uma concessão temporária de homologação é explícita, auditável, limitada e nunca se apresenta como verificação.

## Maturidade atual

O MVP técnico está implementado e versionado neste repositório. A aplicação web, os contratos de fonte e SQL e a Edge Function passam pelas verificações locais do projeto. Um ambiente Supabase exclusivo de homologação recebeu as migrations e a função, e o aceite com dois pares sintéticos comprovou autenticação, RLS e negação entre workspaces.

Isso ainda não significa disponibilidade pública ou prontidão para produção. Hospedagem HTTPS pública, monitoramento e alertas operacionais, entrega e recuperação de e-mail e o processo humano de verificação profissional ainda precisam ser exercitados antes de uma coorte. O processo seguro está em [HOMOLOGACAO.md](./HOMOLOGACAO.md).

## Arquitetura em resumo

| Camada | Papel |
|---|---|
| React + TypeScript + Vite | interface web responsiva e navegação por papel |
| Supabase Auth | identidade, confirmação, recuperação e sessão |
| Postgres + RLS/RPC | consentimento, isolamento, auditoria, idempotência e regras profissionais |
| Edge Function `assistant-triage` | mediação do modelo, cotas, contexto minimizado e validação de propostas |

O navegador recebe apenas configuração publicável. Segredos operacionais e autoridade privilegiada permanecem fora do frontend.

## Executar e verificar

Requer Node.js 22.12 ou superior.

```bash
npm install
npm run dev
```

Para executar a verificação local completa:

```bash
npm run verify
```

Configuração do ambiente, implantação e matriz de aceite pertencem ao runbook de homologação, não a esta visão do produto.

## Documentação

- [Documentação do produto](./elo-documentacao.md) — identidade, jornadas, escopo, princípios, hipóteses e decisões abertas.
- [Homologação](./HOMOLOGACAO.md) — preparação do ambiente, implantação, segurança e aceite remoto.
- [Assistant triage](./supabase/functions/assistant-triage/README.md) — contrato técnico e operação segura da Edge Function.

## Não objetivos atuais

- automatizar a decisão ou a prescrição do professor;
- diagnosticar, tratar ou substituir atendimento de saúde;
- permitir que o personal prescreva ou altere plano nutricional;
- operar pagamentos, cobranças ou gestão financeira;
- oferecer modo de demonstração, usuários fictícios ou troca local de papel;
- declarar produção pronta antes da implantação e do aceite remoto.
