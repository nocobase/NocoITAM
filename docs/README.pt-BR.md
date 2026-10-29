<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/nocoitam-logo-dark.svg">
    <img src="images/nocoitam-logo.svg" width="240" alt="NocoITAM">
  </picture>
</h1>

<p align="center"><strong>Agentes em ação. Ativos de TI em ordem.</strong></p>

<p align="center">Gestão de ativos de TI de código aberto · Construído sobre o NocoBase</p>

<p align="center">
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://github.com/nocobase/NocoITAM/tags"><img src="https://img.shields.io/github/v/tag/nocobase/NocoITAM?label=version&sort=semver&include_prereleases" alt="version"></a>
  <a href="https://www.nocobase.com"><img src="https://img.shields.io/badge/built%20on-NocoBase-1f6feb" alt="Built on NocoBase"></a>
</p>

<p align="center">
  <a href="https://solutions.nocobase.com/itam/"><strong>Experimente online</strong></a> · <a href="https://www.nocobase.com/pt-BR/solution-itam/">Site</a>
</p>

<p align="center">
  <a href="../README.MD">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ko-KR.md">한국어</a> · <a href="README.de-DE.md">Deutsch</a> · <a href="README.fr-FR.md">Français</a> · <a href="README.es-ES.md">Español</a> · <strong>Português</strong> · <a href="README.ru-RU.md">Русский</a> · <a href="README.id-ID.md">Bahasa Indonesia</a> · <a href="README.vi-VN.md">Tiếng Việt</a>
</p>

O NocoITAM é um sistema de gestão de ativos de TI de código aberto, construído sobre o [NocoBase](https://www.nocobase.com). As ferramentas tradicionais de ITAM são cadastros mantidos à mão. No NocoITAM, os agentes resolvem as divergências do MDM, preparam o kit dos novos colaboradores e verificam estoque e ativos ociosos antes de cada compra. Cada dispositivo, direito de uso e centavo fica registrado.

https://github.com/user-attachments/assets/0152da07-4882-4ca2-be7b-5bfc8730952d

## Funcionalidades

- **Toda compra olha o estoque primeiro.** Quando um pedido vai para aprovação, o assistente de aprovação verifica se o estoque ou dispositivos ociosos podem atendê-lo, compara preços anteriores e pedidos parecidos, e redige uma decisão e um comentário para quem aprova.
- **Quem chega está pronto no primeiro dia.** Cada departamento e cada cargo tem seu kit de integração. O plano de quem chega usa o estoque, os direitos de uso ociosos, os pedidos a caminho e as devoluções de quem sai; a IA escolhe os dispositivos e explica por quê, e os pedidos que faltam são criados com um clique.
- **Quem sai devolve tudo.** Os dispositivos, acessórios e direitos de uso de quem sai são acompanhados até tudo voltar, os registros dele são transferidos e o acesso é desativado no último dia.
- **As divergências do MDM viram um plano.** O Microsoft Intune e o Jamf Pro são sincronizados toda noite e conferidos pelo número de série. O agente separa o que não bate: um usuário diferente vai para o responsável pelo dispositivo, um dispositivo não cadastrado para os gestores de ativos e os casos duvidosos para uma pessoa.
- **Cadastro inteligente.** Cole ou arraste um orçamento, uma nota fiscal ou um comprovante de entrega: a IA preenche o pedido com os itens associados aos seus modelos, confere uma entrega com o pedido (quantidades, números de série, garantia) e lê relatórios de reparo e certificados de descarte. As especificações de um modelo novo são completadas pela web.
- **3 agentes, e IA onde o trabalho acontece.** O Guardião de Ativos responde em cada página com base nos registros que você pode ver e propõe planos que você confirma num cartão. O assistente de aprovação e o acompanhamento do MDM trabalham em segundo plano, e a IA ajuda em 11 pontos, do recebimento à comparação de um orçamento de reparo com a troca do dispositivo. Agentes sugerem; pessoas decidem.
- **Licenças e assinaturas sob controle.** Por usuário, por dispositivo, de site ou gratuitas, com assentos, chaves e datas de renovação. A conformidade é recalculada a cada mudança, e assentos em excesso ou ociosos são sinalizados antes da renovação.
- **Nada escapa.** As tarefas começam com 14 verificações de risco (garantias e assinaturas vencendo, assentos ociosos, estoque abaixo do mínimo, dispositivos sem inventário há um ano) e seguem com o trabalho da equipe em colunas: aprovações, admissões e desligamentos, pedidos, reparos, descartes e inventários.
- **Um só cadastro para tudo o que a TI tem.** Dispositivos, acessórios, consumíveis, componentes e direitos de uso de software, da compra, recebimento, atribuição e empréstimo ao reparo, inventário e descarte, cada registro com seu histórico. 10 relatórios, importação e exportação CSV e busca em todos os registros (⌘K / Ctrl+K).
- **Personalizável.** Escreva seus kits padrão, orçamentos e regras de aprovação em texto simples nas orientações de negócio, e todos os agentes as seguem; o método de cada agente é uma habilidade que você pode editar. O código é aberto, então um agente de programação pode mudar o resto.
- **Auto-hospedado.** Seus dados ficam nos seus servidores, com os modelos que você escolher: DeepSeek, OpenAI, Claude, Gemini, Qwen e outros. 12 idiomas na interface. Apache-2.0.

## Início rápido

Só quer dar uma olhada? [Experimente online](https://solutions.nocobase.com/itam/): você entra com uma conta de demonstração, e todos os dados são fictícios.

### 1. Instalar

**Com um agente de programação.** O jeito mais fácil. Abra o Claude Code, o Codex ou o Cursor na pasta onde o NocoITAM vai ficar e diga:

```text
Instale o NocoITAM a partir de https://github.com/nocobase/NocoITAM e inicie-o, seguindo o AGENTS.md e o README do repositório.
```

**Manualmente.** Você precisa do Node.js 24 ou mais recente e do pnpm 10 (`corepack enable`). Os dados ficam por padrão em um arquivo SQLite; PostgreSQL e MySQL também funcionam.

```bash
git clone https://github.com/nocobase/NocoITAM.git
cd NocoITAM
pnpm install
pnpm nocobase config init --dialect sqlite
pnpm dev
```

### 2. Entrar

Abra o endereço `Local:` que o `pnpm dev` exibe, normalmente `http://127.0.0.1:13000/main/`, e entre como `nocobase` com a senha `admin123`.

### 3. Importar os dados de demonstração

O banner no topo oferece a importação, ou abra **Configurações → Dados de demonstração**. Eles trazem uma empresa de umas quarenta pessoas com seus dispositivos, estoque e licenças, pedidos, reparos, inventários e descartes, além de plataformas Intune e Jamf de demonstração; remova-os ali quando começar para valer.

### 4. Configurar um modelo de IA

Adicione um serviço de modelo com sua chave em **Equipe de agentes → Modelos**, como DeepSeek, OpenAI, Claude, Gemini ou Qwen. O Guardião de Ativos e os agentes precisam dele; todo o resto funciona sem ele.

O [guia](guide.md) (em inglês) cobre os próximos passos, as contas de demonstração, os papéis, os agentes, a configuração (IA, MDM, bancos de dados), a implantação e o desenvolvimento.

Para produção, veja [Implantação](guide.md#deployment); para PostgreSQL e MySQL, veja [Configuração](guide.md#configuration).

## Licença

O NocoITAM é construído sobre o NocoBase e publicado sob a licença [Apache-2.0](../LICENSE).
