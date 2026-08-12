# Elo

**Acompanhamento contínuo entre personal trainer e aluno, com contexto, consentimento e decisão humana.**

Elo é uma aplicação web mobile-first para organizar o que acontece entre os treinos. Relatos de dor, execução, esforço percebido, agenda, anamneses e conversas deixam de ficar dispersos; o professor recebe esse contexto no workspace correto e decide como conduzir o acompanhamento.

A inteligência artificial atua como copiloto. Ela pode estruturar um relato e sugerir perguntas ou alternativas, mas não diagnostica, não prescreve, não altera treinos e não publica nada sozinha.

> Homologação pública: [elo-homolog.vercel.app](https://elo-homolog.vercel.app)
>
> Estado: candidato de piloto em validação; não aprovado para produção nem para dados reais de saúde.

## O produto

```text
Aluno registra execução, feedback ou dor
                    ↓
        Elo preserva origem e consentimento
                    ↓
     Copiloto produz uma proposta estruturada
                    ↓
       Professor revisa, edita e decide
                    ↓
       Treino versionado é publicado
                    ↓
       Novo feedback alimenta o ciclo
```

### Para o professor

- painel com alunos vinculados e sinais que pedem atenção;
- perfil longitudinal do aluno, relatos de dor e notas profissionais privadas;
- criação e publicação versionada de treinos;
- Copiloto com propostas, incertezas e limites explícitos;
- criação e atribuição de anamneses;
- agenda, solicitações e conversa privada;
- leitura de plano nutricional enviado por parceiro habilitado, condicionada ao consentimento do aluno.

### Para o aluno

- visão do dia e acesso ao treino publicado;
- registro de conclusão, esforço percebido e comentário;
- relato estruturado de dor com checagem de segurança e consentimento;
- agenda e solicitação de horários;
- conversa com o professor e notificações;
- resposta de anamnese;
- consulta e acompanhamento de plano nutricional parceiro, com controle do consentimento.

## Limites deliberados

Elo não substitui avaliação clínica ou julgamento profissional. No escopo atual, o produto não:

- diagnostica, trata ou recomenda conduta médica;
- publica ou modifica prescrição automaticamente;
- permite ao personal trainer prescrever dieta;
- envia convites transacionais automaticamente;
- opera pagamentos ou gestão financeira;
- fornece vídeos de exercícios sem cadeia de licença documentada.

## Confiança por arquitetura

- **Isolamento no servidor:** RLS e RPCs limitam leitura e mutação ao papel, usuário e workspace autorizados.
- **Papel imutável:** uma conta é professor ou aluno; a interface não oferece troca local de papel.
- **Consentimento específico:** saúde e nutrição usam finalidades e eventos de consentimento próprios.
- **Verificação profissional:** acesso de professor depende de CREF revisado ou de concessão temporária de homologação, explícita e auditável.
- **IA inerte:** uma proposta só ganha efeito após decisão humana registrada e uma publicação separada.
- **Falha fechada:** configuração ausente, vínculo inválido ou autorização inconclusiva não libera dados nem funcionalidades.
- **Segredos fora do cliente:** o navegador recebe apenas a URL do Supabase e uma chave `sb_publishable_*`.

Leia a explicação detalhada em [Arquitetura e segurança](./docs/ARQUITETURA.md).

## Estado da homologação

O frontend está publicado por HTTPS na Vercel e o backend usa um projeto Supabase exclusivo de homologação. O repositório contém 17 migrations e a Edge Function `assistant-triage`. O aceite já exercitado registrou:

- 303 testes web e 21 testes Deno aprovados no candidato registrado;
- 18 controles remotos de identidade/RLS/isolamento aprovados com dois workspaces sintéticos;
- 9 cenários E2E hospedados de professor e aluno, incluindo abertura das 14 áreas em 390, 768 e 1280 px, teclado, restauração de foco e redução de movimento;
- chaves legadas `anon`/`service_role` desativadas no ambiente de homologação.

O Supabase Auth está configurado com a Site URL e a allowlist de redirect da Vercel. A Edge Function também autoriza essa origem: o preflight e uma chamada autenticada alcançaram a função. Os dois professores sintéticos têm acesso temporário de homologação; nenhum CREF foi marcado como verificado.

Esses resultados são evidência de um candidato específico, não uma promessa permanente. Antes de cada apresentação ou coorte, o responsável deve registrar novamente os resultados em [Evidência de liberação](./docs/PILOT-EVIDENCE.md). Entrega e abertura do e-mail de recuperação, monitoramento, alertas, ensaio de rollback e a operação humana do CREF ainda são gates abertos.

## Arquitetura resumida

| Camada | Responsabilidade |
|---|---|
| React 19 + TypeScript + Vite | experiência responsiva e navegação por papel |
| Supabase Auth | identidade, sessão, confirmação e recuperação |
| Postgres + RLS | fonte de verdade, isolamento e leitura autorizada |
| RPCs `security definer` | mutações validadas, idempotentes e auditáveis |
| Edge Function `assistant-triage` | autorização, cota, minimização e validação das propostas de IA |
| Vercel | entrega HTTPS do artefato estático e cabeçalhos de segurança |

## Documentação

| Documento | Para quem | Conteúdo |
|---|---|---|
| [Guia do usuário](./docs/GUIA-USUARIO.md) | professores, alunos e suporte | login, navegação, fluxos, privacidade e solução de problemas |
| [Visão do produto](./elo-documentacao.md) | produto, design e negócio | problema, proposta de valor, escopo, jornadas e hipóteses |
| [Arquitetura e segurança](./docs/ARQUITETURA.md) | engenharia e revisão técnica | componentes, domínios, Auth/RLS, IA, dados, testes e deploy |
| [Homologação](./HOMOLOGACAO.md) | engenharia e release | implantação, configuração e matriz de aceite |
| [Operação do piloto](./docs/PILOT-OPERATIONS.md) | operações e segurança | CREF, observabilidade, incidentes e rollback |
| [Evidência de liberação](./docs/PILOT-EVIDENCE.md) | responsável pelo release | checklist assinável sem dados sensíveis |
| [Edge Function](./supabase/functions/assistant-triage/README.md) | backend/IA | contrato e operação de `assistant-triage` |

## Desenvolvimento

Requer Node.js 22.12 ou superior.

```bash
npm install
npm run dev
```

Verificação local completa:

```bash
npm run verify
```

Os comandos de banco, deploy e aceite remoto ficam deliberadamente no [runbook de homologação](./HOMOLOGACAO.md), onde seus pré-requisitos e riscos podem ser lidos em contexto.

## Licença

Este repositório não declara uma licença de código aberto. Ausência de licença não concede permissão de uso, cópia, modificação ou redistribuição.
