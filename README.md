# Aurora Personal

Sistema web pessoal criado como projeto independente com React, TypeScript, Vite,
Tailwind CSS e React Router. A aplicação possui autenticação visual mockada e um
dashboard inicial responsivo, sem conexão com backend.

## Funcionalidades

- Página inicial pública com carrossel, banners animados e footer institucional.
- Autenticação Supabase com login por e-mail/senha, confirmação de e-mail e recuperação de senha.
- Catálogo protegido de aplicativos em blocos quadrados, preparado para novos módulos.
- Apps premium `Crie seu site` e `Psicóloga IA` com liberação após compra simulada.
- Configurações de pagamentos do usuário com abas `Cartão de crédito` e `Pix`.
- Cadastro com validação de campos, conferência de senhas e confirmação simulada.
- Recuperação de senha com confirmação simulada de envio.
- Dashboard protegido, indicadores demonstrativos e logout.
- Dashboard contábil com clientes, receita, inadimplência, obrigações fiscais e filtro por período.
- Gestão de Clientes com cadastro, consulta de CEP, foto/logotipo e importação/exportação CSV.
- Gestão de pagamentos mensais com importação CSV e baixa manual como pago.
- Configurações contábeis com abas Empresa, Funcionários e Pagamento.
- Área GOV/SEFAZ demonstrativa com consulta de NF-e e status de serviços.
- Sessão autenticada gerenciada pelo Supabase Auth.
- Serviço `api.ts` preparado para futura integração HTTP.

## Como executar

Pré-requisito recomendado: Node.js `22.13+` LTS ou `24+`.

```bash
cd sistema-web-pessoal
npm install
npm run dev
```

O terminal exibirá a URL local do Vite, normalmente `http://localhost:5173`.

Para gerar a versão de produção:

```bash
npm run build
```

## Autenticação

O usuário deve criar sua conta e confirmar o e-mail recebido antes de fazer login.
A recuperação de senha utiliza a rota `/redefinir-senha`.
As rotas internas validam a autenticação Supabase antes de renderizar conteúdo e
redirecionam usuários sem sessão para `/login`.

## Estrutura principal

```text
src/
  components/
    apps/         Cards do catálogo de aplicativos
    forms/        Componentes compartilhados dos formulários
    home/         Componentes da página inicial pública
    layout/       Layouts de autenticação e dashboard
    ui/           Inputs, botões, alertas e cards
  contexts/       Contexto global de autenticação
  hooks/          Hook de acesso à autenticação
  pages/
    apps/         Home de Aplicativos protegida
    accounting/   Dashboard e gestão operacional contábil
    auth/         Login, cadastro e recuperação de senha
    dashboard/    Dashboard protegido
    home/         Landing page pública
    settings/     Configurações e pagamento dos aplicativos premium
  routes/         Rotas da aplicação e proteção de acesso
  services/       Conteúdo mockado, catálogo, autenticação e cliente HTTP futuro
  types/          Tipos de autenticação
  utils/          Validadores reutilizáveis
```

## Integração futura

O fluxo atual usa conteúdo local em `homeContent.ts` e `appCatalog.ts`, além de
Supabase Auth em `authService.ts` e compras simuladas em `paymentService.ts`. Isso deixa slides,
banners, footer, aplicativos e assinaturas preparados para futuramente serem
gerenciados na área Admin "home".

As compras simuladas armazenam o cliente, o escritório associado, o aplicativo
adquirido e o status ativo. Esses registros foram estruturados para a futura área
administrativa consultar escritórios clientes, compras realizadas e situação de
acesso, sem expor recursos de Admin na experiência atual do usuário comum.

Para conectar um backend, configure `VITE_API_BASE_URL` e substitua as operações
mockadas por chamadas ao cliente presente em `src/services/api.ts`.

No módulo contábil, os botões de modelo geram arquivos `.csv` compatíveis com
Excel para cadastro de clientes e pagamentos. A consulta de endereço usa a API
pública ViaCEP quando o usuário clica em `Buscar CEP`.

A tela SEFAZ nesta etapa é visual e mockada: nenhuma consulta fiscal real ou
certificado digital é processado no frontend. A conexão real deve ser criada em
backend seguro, com certificado e credenciais protegidos.
