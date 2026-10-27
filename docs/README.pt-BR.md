# NocoITAM

[English](../README.MD) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Deutsch](README.de-DE.md) | [Français](README.fr-FR.md) | [Español](README.es-ES.md) | Português | [Русский](README.ru-RU.md) | [Bahasa Indonesia](README.id-ID.md) | [Tiếng Việt](README.vi-VN.md)

O NocoITAM é um sistema de gestão de ativos de TI de código aberto, construído sobre o [NocoBase 3](https://www.nocobase.com). As ferramentas tradicionais de ITAM são cadastros mantidos à mão. No NocoITAM, os agentes resolvem as divergências do MDM, preparam o kit dos novos colaboradores e verificam estoque e ativos ociosos antes de cada compra. Cada dispositivo, direito de uso e centavo fica registrado.

https://github.com/user-attachments/assets/0152da07-4882-4ca2-be7b-5bfc8730952d

[Experimente online](https://solutions.nocobase.com/itam/) · [Site](https://www.nocobase.com/pt-BR/solution-itam/)

## O que ele faz

- **Toda compra olha o estoque primeiro.** Quando um pedido vai para aprovação, o assistente de aprovação verifica se o estoque ou dispositivos ociosos podem atendê-lo, compara preços anteriores e pedidos parecidos, e redige uma decisão e um comentário para quem aprova.
- **Quem chega está pronto no primeiro dia; quem sai devolve tudo.** O kit de integração de um novo colaborador é conferido de uma vez com o estoque e os direitos de uso ociosos, e os pedidos que faltam são criados com um clique. Os dispositivos, acessórios e direitos de uso de quem sai são acompanhados até tudo voltar, e os registros dele são transferidos.
- **As divergências do MDM viram um plano.** Depois de cada sincronização com o Intune ou o Jamf Pro, o agente separa o que não bate: um usuário diferente vai para o responsável pelo dispositivo, um dispositivo não cadastrado para os gestores de ativos e os casos duvidosos para uma pessoa.
- **Um só cadastro para tudo o que a TI tem.** Dispositivos, acessórios, consumíveis, componentes e direitos de uso de software, da compra, recebimento, atribuição e empréstimo ao reparo, inventário e descarte, cada registro com seu histórico.
- **Um assistente em cada página.** O Guardião de Ativos responde com base nos registros que você pode ver e propõe planos que você confirma. Quando uma tarefa chega com um orçamento, uma nota fiscal ou um comprovante de entrega, a IA lê o documento e preenche o formulário para você conferir. Os agentes sugerem; as pessoas decidem.
- **Suas regras, seu código.** Escreva seus kits padrão, orçamentos e regras de aprovação nas orientações de negócio, e todos os agentes as seguem. Peça a um agente de programação para alterar o próprio código do ITAM. Código aberto, auto-hospedado e seu.

## Início rápido

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

## Licença

[Apache License 2.0](../LICENSE)
