import type { AgentChatLocale } from './en-US.js';

const agentChatFrFR: AgentChatLocale = {
  chat: {
    retrySaving: 'Réessayer l’enregistrement',
    contextFailed:
      'Impossible de lire le contexte sélectionné ou d’envoyer le message. Vérifiez la page actuelle et réessayez.',
    approval: {
      request: 'Cet outil nécessite votre approbation avant de s’exécuter.',
      approve: 'Approuver',
      deny: 'Refuser',
      denied: 'L’exécution de l’outil a été refusée.',
      failed:
        'L’approbation n’a pas été confirmée. Actualisez le message enregistré avant de réessayer.',
    },
    feedback: {
      sending: 'Envoi…',
      waiting: 'En attente de l’agent…',
      thinking: 'Réflexion…',
      stopping: 'Arrêt demandé. En attente de la fin de l’agent…',
      completed: 'Terminé.',
      cancelled:
        'Annulé. Vérifiez les actions éventuellement effectuées avant de les répéter.',
      failed:
        'La réponse a échoué. Consultez l’historique avant de décider de renvoyer.',
      unknown:
        'Le résultat ou son historique enregistré n’est pas confirmé. Actualisez l’historique avant de décider de renvoyer.',
      effectReview:
        'Certaines actions ont pu être effectuées. Vérifiez leurs résultats avant de les répéter.',
    },

    executionFailed:
      'L’exécution a échoué. Consultez l’historique enregistré et les actions éventuellement effectuées avant de les répéter.',
    historicalReadOnly:
      'Cette conversation passée est en lecture seule. Commencez une nouvelle conversation pour continuer.',
    connectionUnknown:
      'Connexion interrompue. Le résultat est inconnu. Actualisez l’historique enregistré avant de décider de renvoyer.',
    allowAnother: 'Autoriser un nouvel envoi (risque de doublon)',
    creationUnknown:
      'Une conversation a peut-être été créée, mais son identifiant n’a pas été reçu. En créer une autre peut laisser un doublon vide. Aucun message n’est renvoyé automatiquement.',
    retryCreation: 'Créer une autre conversation et envoyer',
    refreshHistory: 'Actualiser l’historique',
    signIn: 'Se connecter',
    title: 'Conversation avec l’agent',
    ask: 'Demander à l’agent',
    close: 'Fermer',
    expand: 'Pleine largeur',
    restoreSize: 'Revenir au panneau latéral',
    openPage: 'Ouvrir en plein écran',
    openInPanel: 'Ouvrir dans le panneau latéral',
    more: 'Plus',
    newConversation: 'Nouvelle conversation',
    rename: 'Renommer',
    renameHint: '{{title}} (cliquer pour renommer)',
    archive: 'Archiver',
    unarchive: 'Désarchiver',
    archivedNote: 'Cette conversation est archivée.',
    renamed: 'Conversation renommée',
    archivedNamed: '« {{title}} » archivée',
    unarchived: 'Conversation désarchivée',
    undo: 'Annuler',
    you: 'Vous',
    agentGone: 'Agent supprimé',
    anyAgent: 'Agent',
    loadFailed: 'Impossible de charger la conversation',
    notFound: 'Impossible d’ouvrir cette conversation',
    notFoundDescription:
      'Elle a peut-être été supprimée, ou elle appartient à quelqu’un d’autre.',
    emptyTitle: 'Que peut faire {{name}} pour vous ?',
    emptyDescription:
      'Posez n’importe quelle question, ou décrivez le travail à organiser. Ce qu’affiche cette page est transmis comme contexte.',
    noAgent:
      'Aucun agent n’est disponible pour converser. Demandez à un administrateur d’en activer un, ou connectez un exécuteur.',
    chooseAgent:
      'Choisissez ci-dessous avec qui converser. Pour toujours commencer avec un agent, définissez votre agent par défaut dans votre profil.',
    messages: 'Messages',
    olderMessages: 'Messages précédents',
    availability: {
      online: 'En ligne',
      agentMissing: 'Supprimé',
      agentArchived: 'Non activé',
      forbidden: 'Non disponible pour vous',
      noModel: 'Configurez d’abord un modèle de conversation',
      noRunner: 'Aucun exécuteur en ligne, ne peut pas être choisi',
      othersPersonal:
        'Seuls les exécuteurs personnels d’autres personnes en disposent',
      // The reason earlier versions wrote on a notice that their online fallback could not answer.
      modelUnavailable: 'Modèle indisponible',
    },
    reply: {
      writing: 'Rédaction…',
      interrupted: 'La réponse s’est arrêtée ici.',
    },
    offline: {
      agentMissing: '{{name}} n’existe plus',
      agentArchived: '{{name}} n’est pas activé',
      forbidden: 'Vous ne pouvez plus utiliser {{name}}',
      noModel: 'Configurez d’abord un modèle de conversation',
      noRunner: '{{name}} n’a aucun exécuteur en ligne pour le moment',
      othersPersonal:
        'Seuls les exécuteurs personnels d’autres personnes disposent de {{name}} ; connectez votre propre exécuteur',
      modelUnavailable:
        'Le modèle de {{name}} n’est pas disponible ; demandez à un administrateur',
      kept: 'Vos messages sont conservés et recevront une réponse dès que possible.',
      fallback: 'Utiliser un autre agent ici',
      usingDefault:
        'Cette conversation utilise temporairement {{name}} à la place de {{own}}.',
      restore: 'Revenir à {{own}}',
    },
    notice: {
      switchedToDefault:
        'Passage à {{name}}, l’agent par défaut du système, jusqu’au retour de {{own}}.',
      switchedToOnline:
        '{{own}} n’a pas d’exécuteur pour vous en ce moment ; {{name}} répond donc jusqu’au retour de {{own}}.',
      onlineFallbackUnavailable:
        'L’agent de secours en ligne ne peut pas répondre ({{reason}}). Cette conversation reste avec {{own}} en attendant un exécuteur.',
      switchedBack: 'De retour avec {{name}}.',
      runFailed: 'L’agent s’est arrêté avant de répondre.',
      runFailedReason: 'L’agent s’est arrêté avant de répondre : {{reason}}',
      runCancelled: 'Annulation demandée.',
    },
    consultation: {
      title: '{{name}} consulté',
      question: 'Question',
      answer: 'Réponse',
      steps: 'Ses étapes',
      usage:
        '{{input}} jetons en entrée et {{output}} jetons en sortie utilisés.',
      state: {
        running: 'Réponse en cours…',
        completed: 'Répondu',
        failed: 'Échec',
        refused: 'Refusé',
      },
    },
    steps: {
      title: 'Étapes',
      waiting: 'En attente qu’un exécuteur prenne la demande en charge…',
      starting: 'Démarrage…',
      thinking: 'Réflexion…',
      reading: 'Consultation de {{subject}}',
      working: 'Travail sur {{subject}}',
      count_one: '{{count}} étape',
      count_other: '{{count}} étapes',
      started: 'L’agent répond.',
      finished: 'L’agent a fini de répondre.',
    },
    pending: {
      sending: 'Envoi…',
      failed: 'Non envoyé',
      retry: 'Renvoyer',
      discard: 'Abandonner',
    },
    composer: {
      label: 'Message à l’agent',
      placeholder: 'Posez une question, ou décrivez le travail à organiser…',
      hint: 'Entrée pour envoyer, Maj+Entrée pour aller à la ligne',
      runningHint: 'En cours. Vous pouvez arrêter cette exécution.',
      tooLong: 'Au maximum {{max}} caractères.',
      send: 'Envoyer',
      stop: 'Arrêter',
      stopping: 'Arrêt…',
    },
    attachments: {
      attach: 'Joindre des fichiers',
      label: 'Fichiers joints au prochain message',
      sent: 'Fichiers envoyés avec ce message',
      images: 'Images',
      files: 'Fichiers',
      remove: 'Retirer {{name}}',
      uploading: 'Téléversement…',
      tooLarge: 'Plus de {{max}}',
      failed: 'Téléversement impossible',
      tooMany: 'Au maximum {{max}} fichiers par message.',
      blocked:
        'Retirez les fichiers qui n’ont pas pu être téléversés pour envoyer.',
      waiting: 'Envoi dès que les fichiers seront téléversés…',
      drop: 'Déposez des fichiers pour les joindre',
      preview: 'Aperçu de {{name}}',
      download: 'Télécharger {{name}}',
      previous: 'Image précédente',
      next: 'Image suivante',
    },
    context: {
      label: 'Contexte joint au prochain message',
      sent: 'Contexte joint à ce message',
      filter: 'Filtre : {{filter}}',
      selection: 'Texte sélectionné : « {{text}} »',
      remove: 'Retirer le contexte : {{label}}',
    },
    agents: {
      models: 'Modèles',
      defaultModel: 'Modèle par défaut',
      runnerAgents: 'Agents',
      modelPlaceholder: 'Choisir un modèle',
      modelSwitch:
        'Modèle : {{name}} · {{service}} ; choisir un modèle ou un agent',
      modelHint: 'Choisissez un modèle en ligne avec qui converser.',
      mixedHint:
        'Choisissez un modèle en ligne ou un agent sur un exécuteur avec qui converser.',
      search: 'Rechercher des modèles ou des agents',
      noResults: 'Aucun modèle ni agent correspondant',
      switch: 'Agent : {{name}} ; en choisir un autre',
      withStatus: '{{name}}, {{status}}',
      chooseFor: 'Converser avec',
      startWith: 'Commencer une nouvelle conversation avec',
      boundHint:
        'Une conversation reste liée à son agent ; en choisir un autre commence une nouvelle conversation.',
      empty: 'Aucun agent disponible pour converser',
      none: 'Aucun agent',
      field: 'Agent : {{name}}',
      unknown: 'Agent inconnu',
      placeholder: 'Choisir un agent',
      myDefault: 'Mon agent par défaut',
      systemDefault: 'Agent par défaut du système',
      personal: 'Exécuteurs personnels uniquement',
      temporary: 'Temporaire',
      hint: 'Choisissez un agent activé. L’agent en ligne répond directement à l’aide du modèle de conversation configuré.',
    },
    history: {
      title: 'Conversations',
    },
    loading: 'Chargement',
    retry: 'Réessayer',
    errors: {
      forbidden: 'Vous n’êtes pas autorisé à effectuer cette action.',
      notFound: 'Cet élément n’existe plus.',
      requestFailed: 'La requête a échoué. Réessayez.',
      signInRequired: 'Votre session a expiré. Connectez-vous pour continuer.',
    },
    transcript: {
      waiting: 'En attente du démarrage de l’agent…',
      empty: 'Cette exécution n’a enregistré aucun événement.',
      fetchFailed:
        'Impossible de récupérer les nouveaux événements. Nouvelle tentative…',
      expand: 'Tout afficher',
      truncated:
        'Tronqué : le texte complet était trop long pour être conservé.',
      events: 'Journal d’exécution',
      inputDelivered: '{{count}} entrée(s) transmise(s) à l’agent',
      tokens: '{{input}} jetons en entrée, {{output}} en sortie',
      kinds: {
        text: 'Agent',
        thinking: 'Réflexion',
        toolUse: 'Outil',
        toolResult: 'Résultat',
        allowed: 'Autorisé',
        denied: 'Refusé',
        input: 'Entrée',
        checkout: 'Préparation',
        status: 'Statut',
        error: 'Erreur',
        usage: 'Consommation',
      },
    },
  },
};

export default agentChatFrFR;
