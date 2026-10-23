import settings from './settings-pt-BR.js';
import type { SystemResource } from './en-US.js';
import deviceApprovalPtBR from '#extensions/nocobase-device-approval/locales/pt-BR';
import inboxPtBR from '#extensions/nocobase-inbox/locales/pt-BR';

/** The Brazilian Portuguese copy of what the template ships; see `./en-US.ts`. */
const systemPtBR: SystemResource = {
  flowDiagram: {
    controls: 'Controles do diagrama',
    fitView: 'Ajustar à tela',
    fullscreen: 'Tela cheia',
    exitFullscreen: 'Sair da tela cheia',
    escapeHint: 'Pressione Esc para sair',
    leavesTo: 'Segue para',
    arrivesFrom: 'Chega de',
    otherRoutes: 'Outras transições',
    minimap: 'Visão geral do diagrama',

    configure: 'Configurar',
    overview: 'Visão geral do diagrama',
    actualSize: 'Tamanho real',
    states: 'Estados',
    transitions: 'Transições',
    configurable: 'Parâmetros',
    current: 'Atual',
    visited: 'Percorrido',
    initial: 'Inicial',
    final: 'Final',
    state: 'Estado',
    zoomOut: 'Diminuir zoom',
    zoomIn: 'Aumentar zoom',
    fit: 'Ajustar à tela',

    empty: 'Nenhum estado para exibir.',
    loading: 'Organizando o diagrama…',
    failed: 'Não foi possível organizar este diagrama.',
    nodeHelp: 'Pressione Enter ou Espaço para selecionar um estado.',
    edgeHelp: 'Pressione Enter ou Espaço para selecionar uma transição.',
  },
  settings,
  'auth.preparingSession': 'Preparando sua sessão…',
  'auth.connectionFailed': 'Não foi possível conectar',
  'auth.connectionFailedDescription':
    'Não foi possível preparar a conexão em tempo real. Tente novamente para entrar no aplicativo ou saia.',

  'auth.passwordResetSuccess':
    'Sua senha foi redefinida. Entre com a nova senha.',
  'auth.requestNewResetLink': 'Solicitar um novo link de redefinição',

  // The UI Library block of the `/device` page; the keys below may reword it.
  ...deviceApprovalPtBR,
  // The UI Library block of the `/inbox` page; the keys below may reword it.
  ...inboxPtBR,
  // The UI Library component of the header's inbox button.
  'inboxButton.title': 'Caixa de entrada',
  'inboxButton.pending': 'Caixa de entrada, {{count}} aguardando',
  'inboxButton.unread': 'Caixa de entrada, {{count}} não lidas',
  'inboxButton.pendingHint':
    '{{count}} aguardando você; o número diminui quando forem tratadas.',
  'inboxButton.unreadHint':
    '{{count}} não lidas; o número diminui conforme você as lê.',
  'auth.welcome': 'Bem-vindo de volta',
  'auth.loginDescription':
    'Entre com seu nome de usuário ou e-mail e sua senha.',
  'auth.registerTitle': 'Criar uma conta',
  'auth.registerDescription': 'Crie uma conta para começar.',
  'auth.forgotTitle': 'Esqueci a senha',
  'auth.forgotDescription':
    'Informe seu e-mail e enviaremos um link de redefinição se a conta existir.',
  'auth.passwordResetUnavailable':
    'A redefinição de senha por conta própria não está ativada. Contate um administrador para redefinir sua senha.',
  'auth.capabilityLoadFailed':
    'Não foi possível verificar se a redefinição de senha está disponível.',
  'auth.retry': 'Tentar novamente',
  'auth.loading': 'Carregando',
  'auth.resetDescription': 'Escolha uma nova senha para sua conta.',
  'auth.resetTitle': 'Redefinir senha',
  'auth.identifier': 'Nome de usuário ou e-mail',
  'auth.password': 'Senha',
  'auth.signIn': 'Entrar',
  'auth.signingIn': 'Entrando…',
  'auth.hidePassword': 'Ocultar senha',
  'auth.showPassword': 'Mostrar senha',
  'auth.forgotLink': 'Esqueceu a senha?',
  'auth.noAccount': 'Não tem uma conta?',
  'auth.signUp': 'Cadastrar-se',
  'auth.createAccount': 'Criar conta',
  'auth.creatingAccount': 'Criando conta…',
  'auth.name': 'Nome',
  'auth.username': 'Nome de usuário',
  'auth.email': 'E-mail',
  'auth.confirmPassword': 'Confirmar senha',
  'auth.existingAccount': 'Já tem uma conta?',
  'auth.passwordMismatch': 'As senhas não coincidem.',
  'auth.resetting': 'Redefinindo…',
  'auth.newPassword': 'Nova senha',
  'auth.confirmNewPassword': 'Confirmar nova senha',
  'auth.invalidResetLink':
    'Este link de redefinição de senha é inválido ou expirou.',
  'auth.backToSignIn': 'Voltar para entrar',
  'auth.sendResetLink': 'Enviar link de redefinição',
  'auth.sending': 'Enviando…',
  'auth.resetSent': 'Se a conta existir, um link de redefinição foi enviado.',
  'auth.rememberPassword': 'Lembrou a senha?',
  'auth.methods': 'Formas de entrar',
  'auth.or': 'Ou continue com',
  'auth.continueWith': 'Continuar com {provider}',
  'auth.about': 'Sobre este aplicativo',
  'auth.platform': 'Plataforma de aplicativos nativa em IA',
  'auth.marketingTitleFirst': 'Deixe a IA construir livremente.',
  'auth.marketingTitleSecond': 'O NocoBase mantém tudo',
  'auth.marketingTitleThird': 'confiável.',
  'auth.marketingDescription':
    'Dê à IA um framework de frontend flexível para moldar cada experiência, enquanto o NocoBase protege os dados, as permissões e a governança por baixo.',
  'auth.frontend': 'Frontend nativo em IA',
  'auth.frontendDescription':
    'Componha interfaces livremente sobre um framework flexível.',
  'auth.foundation': 'Base NocoBase',
  'auth.foundationDescription':
    'Dados, controle de acesso e governança confiáveis.',
  'auth.marketingFooter': 'Liberdade em cima. Confiança embaixo.',
  'status.loading': 'Carregando',
  'status.loadingPage': 'Carregando página',
  'status.denied': 'Acesso negado',
  'status.pageFailed': 'Não foi possível carregar a página',
  'status.retry': 'Tentar novamente',
  'navigation.brandHome': 'Início do NocoBase',
  'navigation.brandApps': 'Aplicativos NocoBase',
  'routeOverlay.close': 'Fechar',
  'status.deniedDescription': 'Você não tem permissão para acessar {{label}}.',
  'status.routeFailedDescription':
    'Não foi possível carregar a rota {{label}} de {{packageName}}.',
  shell: {
    buildFreely: 'A IA constrói livremente.',
    reliability: 'O <brand>NocoBase</brand> mantém tudo confiável.',
  },
  home: {
    platform: 'NocoBase · Plataforma de aplicativos nativa em IA',
    title: 'Descreva, e o seu agente constrói',
    description:
      'Este aplicativo é desenvolvido conversando com o seu agente de programação. Diga a ele, em palavras simples, do que o negócio precisa, e ele escreve as páginas, os modelos de dados, as APIs e os processos de negócio neste projeto.',
    steps: {
      describe: {
        title: 'Descreva a necessidade',
        description:
          'Diga quem usa, quais dados guarda e o que deve acontecer.',
      },
      build: {
        title: 'Deixe o agente construir',
        description:
          'Ele lê este projeto e seus recursos integrados e depois escreve o código.',
      },
      review: {
        title: 'Confira e ajuste',
        description:
          'Atualize a página para testar e peça alterações da mesma forma.',
      },
    },
    example: {
      title: 'Experimente um pedido como este',
      text: 'Crie um aplicativo de pedidos de compra.\n\nUm pedido tem número, item, solicitante, valor e status de aprovação. Os solicitantes criam pedidos e veem apenas os seus; os revisores veem todos os pedidos pendentes e os aprovam ou rejeitam.\nDepois de uma decisão, notifique o solicitante na caixa de entrada com um link para o pedido.',
      hint: 'Cole no Claude Code, Codex, Cursor ou em qualquer agente de programação aberto neste projeto.',
    },
    capabilitiesTitle: 'Recursos integrados',
    capabilitiesDescription:
      'O seu agente usa estes recursos diretamente em vez de construí-los do zero. Abra um para obter um prompt que você pode editar e copiar.',
    viewPrompts: 'Ver prompts ({{count}})',
    prompt: {
      label: 'Prompt',
      hint: 'Edite o prompt para adequá-lo ao seu negócio antes de copiar. As alterações não são salvas depois que a caixa de diálogo é fechada.',
      copy: 'Copiar',
      copiedShort: 'Copiado',
      copied: 'Prompt copiado',
      copyFailed:
        'Não foi possível copiar. Selecione o texto e copie manualmente.',
      reset: 'Restaurar padrão',
    },
    capabilities: {
      auth: {
        title: 'Autenticação',
        description:
          'Entrada, cadastro, redefinição de senha e login único da empresa.',
        prompts: {
          disableSignUp: {
            label: 'Fechar cadastro',
            text: 'Este aplicativo é apenas para funcionários da empresa. Os administradores criam todas as contas.\nDesative o cadastro por conta própria e remova o link de cadastro da página de entrada.\nOs funcionários existentes ainda devem poder entrar com suas contas e senhas.\nMantenha o link de esqueci a senha.',
          },
          companySso: {
            label: 'SSO da empresa',
            text: 'Permita que os funcionários entrem com a plataforma de identidade da empresa usando OIDC.\n\nMantenha a entrada com conta e senha e adicione um botão Conta da empresa.\nO botão abre a plataforma de identidade da empresa. Depois de entrar com sucesso, volte à página inicial do aplicativo.\n\nPermita que a primeira entrada crie uma conta no aplicativo, identificada pelo identificador de usuário estável da plataforma.\nNão vincule contas automaticamente comparando nomes ou e-mails. As novas contas usam as permissões padrão do aplicativo.\n\nListe as informações que o administrador da plataforma de identidade deve fornecer e a URL de retorno que ele precisa registrar.',
          },
          apiKeys: {
            label: 'Chaves de API',
            text: 'Adicione uma entrada Chaves de integração ao menu do usuário, usando o recurso integrado de chaves de API do aplicativo.\nOs funcionários gerenciam apenas as chaves que criaram, informando uma finalidade e um prazo de validade em dias.\nMostre a chave completa apenas uma vez após a criação, com um aviso para copiá-la e guardá-la imediatamente.\nListe o nome de cada chave, um fragmento identificável, o status, a expiração e o último uso, e permita revogá-la após confirmação.\nNunca mostre a chave completa na lista, nos logs ou nos detalhes.',
          },
        },
      },
      dataSources: {
        title: 'Fontes de dados',
        description:
          'Escolha o banco de dados do aplicativo e use dados de negócio de bancos de dados externos existentes.',
        prompts: {
          postgres: {
            label: 'Trocar banco de dados',
            text: 'Troque o banco de dados do aplicativo de SQLite para PostgreSQL.\nLeia os dados de conexão da configuração de execução do servidor, não do código-fonte.\nExplique qual driver de banco de dados instalar e quais configurações preencher, e lembre-me de que os dados existentes não são migrados automaticamente.',
          },
          externalDatabase: {
            label: 'Banco de dados externo',
            text: 'Conecte o banco de dados financeiro existente da empresa como fonte de dados externa somente leitura; não modifique suas tabelas.\nRelacione os registros pelo número do fornecedor e adicione uma seção Liquidação aos detalhes do fornecedor mostrando o ciclo de liquidação, o limite de crédito e o status da liquidação, identificada com a sua origem.\nContinue lendo os contatos do fornecedor no banco de dados do aplicativo e leia os dados de liquidação diretamente do banco de dados externo, sem importá-los.\nLeia as credenciais de conexão da configuração de execução do servidor.',
          },
        },
      },
      authorization: {
        title: 'Permissões',
        description:
          'Controle quem pode abrir quais páginas, executar quais ações e ver quais registros.',
        prompts: {
          jobs: {
            label: 'Cargos',
            text: 'Crie os cargos Solicitante de compras e Revisor de pedidos para o aplicativo.\nOs solicitantes de compras podem entrar na página de pedidos e ver os pedidos que solicitaram.\nOs revisores de pedidos podem entrar na página de pedidos, ver os pedidos e aprovar ou rejeitar os pedidos pendentes.\nSomente os administradores do aplicativo podem alterar permissões e atribuições.\nUse o recurso de autorização existente do aplicativo para que os administradores possam ajustar as permissões e atribuir pessoas depois.',
          },
          dataScopes: {
            label: 'Escopos de dados',
            text: 'Permita que os solicitantes de compras vejam apenas os próprios pedidos, usando o campo de solicitante do pedido para determinar a quem pertence.\nOs revisores de pedidos podem ver todos os pedidos e tratar as aprovações pendentes.\nOs administradores podem ajustar o escopo de visualização de pedidos de cada cargo no seu conjunto de permissões.',
          },
          restrictions: {
            label: 'Restrições',
            text: 'Bob está ajudando temporariamente a revisar pedidos de compra e pode ver apenas pedidos de até 2.000.\nAdicione um limite de valor à ação Ver pedidos dele, mantendo o cargo e os escopos de dados existentes.\nAplique o limite aos pedidos dele e aos pedidos compartilhados com ele.\nOs administradores podem alterar o valor ou remover a regra; antes da remoção, explique que o escopo visível dele pode aumentar.',
          },
        },
      },
      workflow: {
        title: 'Fluxos de trabalho',
        description:
          'Leve os registros de negócio por etapas, com espera, prazos, novas tentativas e um histórico de quem fez o quê.',
        prompts: {
          stages: {
            label: 'Etapas',
            text: 'Adicione um processo aos pedidos de compra: Aguardando aprovação → Aguardando compra → Recebido → Concluído.\nOs revisores aprovam ou rejeitam; uma rejeição exige um motivo e devolve o pedido ao solicitante para revisar e reenviar.\nDepois que o comprador faz a compra, o pedido fica aguardando compra; confirmar a entrega com um recibo assinado o leva a Recebido, e a confirmação do solicitante o conclui.\nOs detalhes do pedido oferecem apenas as ações da etapa atual, e as edições comuns não podem alterar a etapa.\nVerifique as etapas e as informações obrigatórias no servidor e nunca sobrescreva um resultado que outra pessoa já enviou.',
          },
          backgroundExport: {
            label: 'Exportação em segundo plano',
            text: 'Adicione uma página de relatório de pedidos que exporta os pedidos existentes para CSV.\nDepois do envio, a exportação aguarda processamento, é gerada em segundo plano e termina com um link para download.\nMostre a etapa atual, o nome do arquivo, o número de pedidos exportados e os registros de envio e de processamento do sistema.\nTente novamente as gerações que falharem conforme as regras e mantenha uma falha definitiva para o responsável tratar; executar de novo não pode criar arquivos de relatório duplicados.\nMantenha o progresso e o resultado visíveis depois de atualizar a página e permita que apenas pessoas autorizadas exportem pedidos.',
          },
          history: {
            label: 'Histórico',
            text: 'Mostre a etapa atual e o histórico de processamento nos detalhes do pedido.\nCada entrada mostra quem agiu, quando, a ação, a etapa antes e depois e qualquer motivo de rejeição ou recibo assinado.\nMarque as ações executadas automaticamente como feitas pelo sistema.\nMantenha o progresso e o histórico depois de atualizar a página, para que todo o processo possa ser revisado depois de concluído.',
          },
        },
      },
      scheduler: {
        title: 'Tarefas agendadas',
        description:
          'Execute trabalhos de negócio em horários definidos e veja a próxima execução e seus resultados.',
        prompts: {
          reminder: {
            label: 'Lembrete diário',
            text: 'Adicione um lembrete de Pedidos pendentes ao aplicativo de pedidos existente.\n\nÀs 09:00, horário de Pequim, em todos os dias úteis, encontre os pedidos aguardando aprovação, agrupe-os por revisor e envie a cada revisor uma notificação no aplicativo.\nInclua a contagem de pedidos pendentes e um link para a lista de pedidos pendentes. Não envie nada quando não houver pedidos pendentes.\nOs administradores podem ver o agendamento e os registros de execução e pausar ou retomar os lembretes.',
          },
          weeklyReport: {
            label: 'Relatório semanal',
            text: 'Às 08:00, horário de Pequim, toda segunda-feira, gere o resumo de vendas da semana anterior e notifique o gerente de vendas.\nInclua a receita de vendas, a contagem de pedidos e os totais por região. Os administradores podem ver a tarefa e os registros de execução.',
          },
        },
      },
      notification: {
        title: 'Notificações',
        description:
          'Envie mensagens no aplicativo, e-mails ou mensagens de bots de grupo quando algo acontecer.',
        prompts: {
          inApp: {
            label: 'Mensagem no aplicativo',
            text: 'Adicione a aprovação de pedidos ao aplicativo atual e notifique os solicitantes sobre os resultados por meio de mensagens no aplicativo.\n\nOs pedidos incluem número, nome, solicitante, valor e status de aprovação.\nOs solicitantes podem ver os próprios pedidos. Os revisores podem ver os pedidos pendentes e aprová-los ou rejeitá-los. Reutilize os recursos de pedidos e aprovações existentes, se houver.\n\nDepois da aprovação ou rejeição, envie uma mensagem no aplicativo apenas ao solicitante do pedido.\nO título indica se o pedido foi aprovado ou rejeitado. O corpo inclui o número do pedido, o nome e o resultado da aprovação.\nClicar na mensagem abre os detalhes do pedido correspondente.\nNão envie enquanto a aprovação estiver pendente. Notifique apenas uma vez para o mesmo resultado de aprovação.\nUma falha na notificação não afeta o resultado de aprovação salvo.',
          },
          email: {
            label: 'E-mail',
            text: 'Adicione e-mail às notificações de aprovação de pedidos existentes, usando o canal de e-mail configurado do aplicativo.\n\nDepois que um pedido for aprovado ou rejeitado, envie o resultado ao e-mail da conta do solicitante.\nInclua o número do pedido no assunto e o nome do pedido e o resultado no corpo.\nMantenha as mensagens no aplicativo existentes. Se o solicitante não tiver endereço de e-mail, envie apenas a mensagem no aplicativo.\nUma falha no e-mail não pode afetar o resultado da aprovação nem a mensagem no aplicativo.',
          },
        },
      },
      mail: {
        title: 'Correio',
        description:
          'Conecte caixas de correio pessoais e depois leia, responda e envie e-mails de negócio.',
        prompts: {
          providers: {
            label: 'Provedor de e-mail',
            text: 'Configure o mailbox.org para o aplicativo em mail.providers da configuração do servidor:\n- Servidor de entrada IMAP: imap.mailbox.org, porta 993, SSL/TLS.\n- Servidor de saída SMTP: smtp.mailbox.org, porta 465, SSL/TLS.\nOs usuários informam o próprio endereço de e-mail, nome de usuário e senha na página de contas de correio e escolhem a data a partir da qual a primeira sincronização começa; nunca grave senhas de correio na configuração ou no código-fonte.',
          },
          mailCenter: {
            label: 'Central de correio',
            text: 'O correio está integrado a este aplicativo; reutilize-o em vez de construí-lo novamente ou instalar outro plugin.\nAdicione as páginas Central de correio e Contas de correio à navegação, usando as páginas de espaço de trabalho de correio e de contas de correio que o recurso de correio oferece.\nOs usuários podem conectar as próprias caixas de correio, sincronizar as mensagens recebidas, ler mensagens e anexos e responder, mantendo o assunto original e o contexto da conversa e endereçando a resposta ao remetente original.\nCada usuário trabalha com as próprias caixas de correio conectadas.',
          },
          correspondence: {
            label: 'E-mails de clientes',
            text: 'Adicione uma seção de correspondência aos detalhes do cliente, reutilizando os componentes integrados de leitura e composição de e-mail do aplicativo.\nMostre as mensagens cujo remetente ou destinatário corresponda aos endereços de e-mail de contato do cliente atual. Os representantes de vendas podem ler mensagens, ver anexos e responder usando as próprias caixas de correio conectadas.',
          },
        },
      },
      file: {
        title: 'Arquivos',
        description:
          'Envie arquivos, anexe-os a registros e visualize-os ou baixe-os.',
        prompts: {
          attachments: {
            label: 'Anexos',
            text: 'Adicione anexos de compra ao meu aplicativo de gestão de pedidos existente.\n\nAdicione uma área de anexos aos detalhes do pedido. Cada pedido pode ter vários arquivos, incluindo PDF, imagens e DOCX.\nMostre os nomes e tamanhos dos arquivos, com ações para visualizar, baixar e remover anexos.\nDepois do envio, permita que os usuários salvem os anexos no pedido atual. Mantenha-os disponíveis quando o pedido for reaberto.\nQualquer pessoa com acesso a um pedido pode ver e baixar seus anexos. Solicitantes e revisores podem adicionar ou remover anexos.\nRemover um anexo apenas o desvincula do pedido atual; mantenha o arquivo.',
          },
          avatar: {
            label: 'Avatar',
            text: 'Adicione um avatar a cada funcionário, com uma imagem por funcionário.\nPermita enviar e substituir o avatar e mostre-o nas listas e nos detalhes de funcionários.\nUse o novo avatar após a substituição e mantenha-o visível depois de atualizar a página.',
          },
        },
      },
      i18n: {
        title: 'Idiomas',
        description:
          'Troque o idioma da interface, adicione idiomas e defina o padrão.',
        prompts: {
          addLanguage: {
            label: 'Adicionar um idioma',
            text: 'Adicione espanhol ao meu aplicativo. Traduza a interface e as mensagens do servidor e adicione espanhol ao menu de idiomas.',
          },
          defaultLanguage: {
            label: 'Idioma padrão',
            text: 'Torne o chinês simplificado o idioma padrão do aplicativo para quem ainda não escolheu um. Mantenha o inglês disponível no menu de idiomas.',
          },
        },
      },
      theme: {
        title: 'Temas',
        description:
          'Ajuste cores, fontes e densidade, e alterne entre claro e escuro.',
        prompts: {
          changeTheme: {
            label: 'Alterar um tema',
            text: 'Atualize o tema Compacto: use azul como cor principal e aumente levemente o raio dos cantos. Mantenha as fontes, os tamanhos de texto e o espaçamento compacto atuais.',
          },
          newTheme: {
            label: 'Novo tema',
            text: 'Crie um tema Floresta com verde como cor principal, fundos suaves, cantos moderadamente arredondados e sombras sutis.',
          },
        },
      },
    },
  },

  appearance: {
    title: 'Aparência',
    mode: 'Modo de cor',
    preset: 'Tema',
    light: 'Claro',
    dark: 'Escuro',
    system: 'Sistema',
    themes: { default: 'Espaçoso', compact: 'Compacto' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: 'Fechar',
    save: 'Salvar',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    language: 'Idioma',
  },
  notices: {
    serverLocaleFallback:
      'O servidor não oferece este idioma, então as mensagens do servidor usarão o inglês.',
    languageChangeFailed:
      'Não foi possível concluir a troca de idioma. Tente novamente.',
  },
  account: {
    signOutFailed: 'Não foi possível sair. Tente novamente.',
    openMenu: 'Abrir menu da conta',
    fallback: 'Conta',
    signOut: 'Sair',
    signingOut: 'Saindo…',
  },
  navigation: {
    home: 'Início',
    open: 'Abrir navegação',
    close: 'Fechar navegação',
    expand: 'Expandir navegação',
    collapse: 'Recolher navegação',
    toggle: 'Expandir ou recolher navegação',
    label: 'Navegação do aplicativo',
    description: 'Vá para uma página deste aplicativo.',
    breadcrumb: 'Trilha de navegação',
    breadcrumbMore: 'Mostrar os níveis intermediários',
    back: 'Voltar',
  },
  dataTable: {
    noResults: 'Nenhum resultado.',
    sortAscending: 'Crescente',
    sortDescending: 'Decrescente',
    hideColumn: 'Ocultar',
    view: 'Exibição',
    toggleColumns: 'Mostrar colunas',
    selectedCount: '{{selected}} de {{total}} linha(s) selecionada(s).',
    rowsPerPage: 'Linhas por página',
    pageOf: 'Página {{page}} de {{pageCount}}',
    firstPage: 'Ir para a primeira página',
    previousPage: 'Ir para a página anterior',
    nextPage: 'Ir para a próxima página',
    lastPage: 'Ir para a última página',
  },
  datePicker: {
    placeholder: 'Escolher uma data',
    rangePlaceholder: 'Escolher um intervalo de datas',
  },
};

export default systemPtBR;
