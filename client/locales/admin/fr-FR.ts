import type { AdminResource } from './index.js';

/** The French copy of the settings pages; see `./index.ts`. */
const adminFrFR: AdminResource = {
  common: {
    loading: 'Chargement',
    retry: 'Réessayer',
    signInAgain: 'Se reconnecter',
    loadFailed: 'Impossible de charger {{what}}.',
    forbidden: 'Vous n’avez pas accès à {{what}}.',
    sessionEnded: 'Votre session a pris fin.',
    notFound: 'Cette fiche n’existe pas ou a été supprimée.',
    backToList: 'Retour à la liste',
    cancel: 'Annuler',
    save: 'Enregistrer',
    create: 'Créer',
    done: 'Terminé',
    actions: 'Actions',
    actionsFor: 'Actions pour « {{name}} »',
    refresh: 'Actualiser',
    loadMore: 'Charger plus',
    copy: 'Copier',
    copied: 'Copié',
    failed: 'Une erreur est survenue. Réessayez.',
    network: 'Le serveur est injoignable. Vérifiez la connexion et réessayez.',
  },
  users: {
    what: 'les utilisateurs',
    invite: 'Inviter des utilisateurs',
    managedRole: 'Géré par l’application',
    actions: {
      password: 'Réinitialiser le mot de passe',
      delete: 'Supprimer',
    },
    dialogs: {
      passwordTitle: 'Réinitialiser le mot de passe',
      passwordDescription:
        'Un nouveau mot de passe pour « {{name}} ». Ses autres sessions restent connectées ; déconnectez-le aussi partout si l’ancien mot de passe a fuité.',
      inviteTitle: 'Inviter des utilisateurs',
      inviteDescription:
        'Chaque adresse reçoit un lien pour créer un compte, valable sept jours.',
    },
    fields: {
      newPassword: 'Nouveau mot de passe',
      confirmPassword: 'Confirmer le mot de passe',
      roles: 'Rôles',
      emails: 'Adresses e-mail',
    },
    hints: {
      password: 'Au moins 8 caractères.',
      emails:
        'Une par ligne, ou séparées par des virgules, des points-virgules ou des espaces.',
      rolesDefault:
        'Chaque utilisateur connecté reçoit aussi l’accès par défaut, quels que soient ses rôles.',
    },
    errors: {
      name: 'Saisissez un nom',
      emailFormat: 'L’adresse e-mail n’est pas valide',
      username:
        'Un identifiant utilise des lettres, des chiffres, des points, des traits d’union et des tirets bas',
      password: 'Le mot de passe doit comporter au moins 8 caractères',
      mismatch: 'Les mots de passe ne correspondent pas',
      roles: 'Choisissez au moins un rôle',
      emailTaken: 'Cette adresse e-mail est déjà utilisée',
      usernameTaken: 'Cet identifiant est déjà utilisé',
      lastAdministrator:
        'Le dernier administrateur ne peut pas perdre ce rôle.',
      self: 'Vous ne pouvez pas vous supprimer vous-même.',
      holdsRecords:
        'Cet utilisateur est encore responsable de fiches ; désactivez-le plutôt.',
      emailsRequired: 'Saisissez au moins une adresse',
      emailsInvalid: 'Ces adresses ne sont pas valides : {{list}}',
      emailsTooMany: 'Invitez au plus {{max}} adresses à la fois',
    },
    toasts: {
      password: 'Mot de passe de « {{name}} » réinitialisé',
      deleted: 'Utilisateur « {{name}} » supprimé',
    },
    confirm: {
      deleteTitle: 'Supprimer l’utilisateur « {{name}} » ?',
      deleteBody:
        'Cette action est irréversible. Une personne encore responsable de fiches ne peut pas être supprimée ; désactivez-la plutôt.',
    },
  },
  invitations: {
    title: 'Invitations en attente',
    description:
      'Invitations pas encore acceptées ; un lien ne sert qu’une fois, pendant sept jours.',
    invitedBy: 'Invité par {{name}} · expire le {{date}}',
    pending: 'En attente',
    expired: 'Expirée',
    resend: 'Renvoyer',
    copyLink: 'Copier le lien',
    revoke: 'Révoquer',
    send: 'Envoyer',
    sent: 'Invitation envoyée',
    linkOnly: 'Invitation créée ; copiez le lien pour l’envoyer vous-même',
    existing: 'A déjà un compte',
    resultsTitle: 'Invitations',
    revokeTitle: 'Révoquer l’invitation envoyée à {{email}} ?',
    revokeBody: 'Le lien d’invitation cesse de fonctionner.',
    revoked: 'Invitation envoyée à {{email}} révoquée',
    resent: 'Invitation renvoyée à {{email}}',
    resentLink:
      'Un nouveau lien a été créé ; copiez-le pour l’envoyer vous-même',
    what: 'les invitations',
  },
  keys: {
    headings: {
      business: 'Opérations métier',
      administration: 'Administration',
    },
    levelFor: 'Portée de « {{name}} »',
    title: 'Clés API',
    what: 'vos clés API',
    description:
      'Des clés qui permettent à des scripts et des agents d’appeler l’application en votre nom.',
    new: 'Nouvelle clé API',
    columns: {
      name: 'Nom',
      access: 'Accès',
      created: 'Créée le',
      expires: 'Expire le',
      lastUsed: 'Dernière utilisation',
    },
    full: 'Tout ce que je peux faire',
    limited: 'Uniquement ce que je choisis',
    limitedCount: 'Limité ({{count}})',
    neverUsed: 'Jamais utilisée',
    neverExpires: 'Jamais',
    days: '{{count}} jours',
    expired: 'Expirée',
    fields: {
      name: 'Nom',
      description: 'Description',
      expires: 'Expiration',
      access: 'Accès',
    },
    levels: {
      read: 'Lecture',
      write: 'Lecture et écriture',
      admin: 'Administration',
    },
    emptyTitle: 'Aucune clé API pour l’instant',
    emptyBody:
      'Créez-en une pour permettre à un script ou à un agent d’appeler l’application en votre nom.',
    emptyNoCreate:
      'Vous ne pouvez pas créer de clés API ; demandez à un administrateur.',
    secretTitle: 'Copiez votre nouvelle clé',
    secretWarning: 'Copiez-la maintenant : elle ne sera plus affichée.',
    secretLabel: 'Clé API',
    rotatedTitle: 'Nouveau secret pour « {{name}} »',
    rotate: 'Renouveler',
    delete: 'Supprimer',
    errors: {
      name: 'Saisissez un nom',
      tooLong: 'Utilisez au plus {{max}} caractères',
      access: 'Choisissez au moins une permission',
      creation: 'Vous ne pouvez pas créer de clés API.',
    },
    toasts: {
      created: 'Clé API « {{name}} » créée',
      rotated: '« {{name}} » renouvelée',
      deleted: 'Clé API « {{name}} » supprimée',
    },
    confirm: {
      rotateTitle: 'Renouveler « {{name}} » ?',
      rotateBody:
        'Un nouveau secret remplace l’actuel, qui cesse immédiatement de fonctionner.',
      deleteTitle: 'Supprimer la clé API « {{name}} » ?',
      deleteBody:
        'Tout ce qui l’utilise cesse immédiatement de fonctionner. Cette action est irréversible.',
    },
  },
  pages: {
    itamSettings:
      'Paramètres : général, MDM, processus, réception d’après les bons de livraison, données de démonstration ; repères métier',
    scheduledTasks: 'Paramètres : tâches planifiées',
    runnerAgents: 'Agents (des exécuteurs)',
  },
  authz: {
    settings: 'Paramètres ITAM',
    settingsActions: { read: 'Voir', update: 'Modifier' },
    collections: {
      manufacturers: 'Fabricants',
      vendors: 'Fournisseurs',
      categories: 'Catégories',
      models: 'Modèles',
      softwareProducts: 'Produits logiciels',
      locations: 'Emplacements',
      departments: 'Services',
      onboardingKits: 'Kits d’arrivée',
      people: 'Personnes',
      devices: 'Appareils',
      stockItems: 'Articles en stock',
      entitlements: 'Droits d’utilisation',
      purchaseOrders: 'Bons de commande',
      approvals: 'Approbations',
      attachmentLinks: 'Pièces jointes',
      repairs: 'Réparations',
      auditTasks: 'Inventaires',
      disposals: 'Mises au rebut',
      purchaseOrderLines: 'Lignes de bons de commande',
      purchaseReceipts: 'Réceptions d’achat',
      stockHoldings: 'Détentions de stock',
      stockMovements: 'Mouvements de stock',
      entitlementSeats: 'Sièges de droits d’utilisation',
      auditItems: 'Éléments d’inventaire',
      disposalDevices: 'Appareils mis au rebut',
      historyEvents: 'Historique',
      changeLogs: 'Journaux des modifications',
      allocations: 'Attributions',
      reminders: 'Rappels',
    },
    operations: {
      people: { markLeft: 'Marquer comme parti' },
      devices: {
        assign: 'Attribuer',
        return: 'Restituer',
        transfer: 'Transférer',
        loan: 'Prêter',
        reserve: 'Réserver',
        correctStatus: 'Corriger le statut',
        export: 'Exporter',
      },
      stockItems: {
        issue: 'Remettre et récupérer',
        stockIn: 'Entrée en stock',
        export: 'Exporter',
      },
      entitlements: {
        assignSeat: 'Attribuer et récupérer des sièges',
        viewKey: 'Afficher la clé',
        export: 'Exporter',
      },
      purchaseOrders: {
        submit: 'Soumettre pour approbation',
        approve: 'Approuver ou rejeter',
        order: 'Marquer comme commandé',
        receive: 'Réceptionner',
        export: 'Exporter',
      },
      approvals: { decide: 'Approuver ou rejeter' },
      repairs: { complete: 'Terminer la réparation' },
      auditTasks: {
        start: 'Commencer l’inventaire',
        count: 'Enregistrer les résultats du comptage',
        finish: 'Terminer le comptage',
        resolve: 'Traiter les écarts',
        cancel: 'Annuler le comptage',
        export: 'Exporter',
      },
      disposals: {
        submit: 'Soumettre pour approbation',
        approve: 'Approuver ou rejeter',
        execute: 'Exécuter la mise au rebut',
        export: 'Exporter',
      },
    },
  },
  schedules: {
    title: 'Tâches planifiées',
    what: 'les tâches planifiées',
    whatOne: 'cette tâche planifiée',
    description:
      'Les tâches récurrentes de l’application et le déroulement de leurs exécutions.',
    columns: {
      task: 'Tâche',
      schedule: 'Planification',
      status: 'Statut',
      lastRun: 'Dernière exécution',
      nextRun: 'Prochaine exécution',
      runs: 'Exécutions',
      on: 'Active',
    },
    switchFor: 'Exécuter « {{title}} »',
    status: {
      active: 'Active',
      paused: 'Suspendue',
      inactive: 'Inactive',
    },
    target: {
      disabled: 'Cible désactivée',
      missing: 'Cible manquante',
      invalid: 'Cible invalide',
    },
    resumed: '« {{title}} » reprise',
    paused: '« {{title}} » suspendue',
    inactiveHint: 'L’application ne définit plus cette tâche.',
    fields: {
      key: 'Clé',
      schedule: 'Planification',
      timezone: 'Fuseau horaire',
      target: 'Cible',
      status: 'Statut',
      runs: 'Exécutions',
      succeeded: 'Réussies',
      lastRun: 'Dernière exécution',
      nextRun: 'Prochaine exécution',
    },
    history: 'Historique des exécutions',
    historyEmpty: 'Cette tâche ne s’est pas encore exécutée.',
    started: 'Début',
    finished: 'Fin',
    reason: 'Motif',
    cap: 'Seules les {{count}} premières tâches sont affichées.',
    emptyTitle: 'Aucune tâche planifiée',
    emptyBody: 'L’application et ses extensions n’en définissent aucune.',
    occurrence: {
      pending: 'En attente',
      running: 'En cours',
      waiting: 'En attente du résultat',
      succeeded: 'Réussie',
      failed: 'Échouée',
      skipped: 'Ignorée',
      cancelled: 'Annulée',
      timed_out: 'Délai dépassé',
      triggered: 'Déclenchée',
    },
  },
  notificationTemplates: {
    intro:
      'Notifications que le système envoie de lui-même : quand chacune est envoyée, qui la reçoit et ce qu’elle dit dans chaque langue. Rien ne peut être modifié ici.',
    search: 'Rechercher',
    searchPlaceholder: 'Nom ou description',
    category: 'Catégorie',
    channel: 'Canal',
    all: 'Toutes',
    empty: "Aucune notification n'est enregistrée.",
    whatOne: 'ce modèle de notification',
    when: 'Quand elle est envoyée',
    who: 'Qui la reçoit',
    conditions: 'Conditions',
    language: 'Langue',
    source: 'Fourni par',
    channels: 'Canaux',
    channelsHint:
      'Configuré et activé ne garantit pas que la connexion fonctionne.',
    channelState: {
      configured: 'Configuré',
      unconfigured: 'Non configuré',
      enabled: 'Activé',
      disabled: 'Désactivé',
      unknown: 'Inconnu',
    },
    variables: 'Variables',
    preview: 'Aperçu',
    previewLanguage: "Langue de l'aperçu",
    previewAllLanguages:
      'Cet e-mail contient toutes les langues à la fois ; chaque destinataire reçoit le même message.',
    example: 'Exemple',
    definition: 'Modèle',
    synthetic:
      "Données d'exemple fictives. L'aperçu n'envoie rien et ne modifie rien.",
    html: 'Version HTML',
    channelTypes: {
      'in-app': "Dans l'application",
      email: 'E-mail',
    },
    contributors: {
      itam: 'NocoITAM',
      users: 'Utilisateurs',
    },
    categories: {
      accounts: 'Comptes',
      devices: 'Appareils',
      people: 'Personnes',
      comments: 'Commentaires',
    },
    always:
      'Jamais envoyée à la personne dont l’action l’a déclenchée, et chaque destinataire ne la reçoit qu’une fois.',
    itamLanguage:
      'Dans la langue par défaut de l’application, quelle que soit la langue d’interface du destinataire ; le texte d’un commentaire apparaît tel qu’il a été écrit.',
    items: {
      loanOverdue: {
        name: 'Prêt en retard',
        trigger:
          'La vérification nocturne trouve un appareil prêté dont la date de retour prévue est dépassée.',
        recipients: 'Le responsable de l’appareil.',
        rule: 'Une fois par appareil et par date de retour prévue ; un prêt qui reste en retard n’est pas signalé à nouveau.',
        variables: {
          deviceNo: 'Le numéro de l’appareil.',
          date: 'La date de retour prévue.',
        },
      },
      leaverRecovery: {
        name: 'Récupération au départ',
        trigger:
          'La tâche nocturne prépare la récupération pour une personne marquée comme partie qui détient encore des appareils, du stock ou des licences.',
        recipients:
          'Chaque responsable d’une partie de ces biens, informé de sa seule part.',
        rule: 'Une fois par personne partie et par responsable.',
        variables: {
          name: 'Le nom de la personne partie.',
          count: 'Combien de ses biens le destinataire doit régler.',
        },
      },
      commentMentioned: {
        name: 'Mentionné dans un commentaire',
        trigger:
          'Un commentaire sur un enregistrement mentionne un collègue avec @.',
        recipients: 'Chaque collègue mentionné.',
        rule: 'Une fois par commentaire et par personne.',
        variables: {
          actor: 'L’auteur du commentaire.',
          title: 'L’enregistrement commenté.',
          text: 'Le commentaire, abrégé, dans les mots de son auteur.',
        },
      },
      commentReplied: {
        name: 'Réponse dans un fil de commentaires',
        trigger:
          'Quelqu’un commente un enregistrement que d’autres ont déjà commenté.',
        recipients:
          'Toutes les personnes ayant écrit dans le fil ; celles que la réponse mentionne avec @ sont plutôt prévenues de la mention.',
        rule: 'Une fois par commentaire et par personne.',
        variables: {
          actor: 'L’auteur du commentaire.',
          title: 'L’enregistrement commenté.',
          text: 'Le commentaire, abrégé, dans les mots de son auteur.',
        },
      },
      usersInvitation: {
        name: "Invitation d'utilisateur",
        trigger:
          "Un administrateur invite quelqu'un, ou renvoie une invitation, en choisissant l'envoi par e-mail.",
        recipients: "L'adresse e-mail de la personne invitée.",
        rule: 'Envoyée avec chaque invitation envoyée par e-mail ; aucun interrupteur ne permet de la désactiver.',
        language:
          "Un seul e-mail dans toutes les langues prises en charge, avec l'objet en anglais ; la langue de l'aperçu n'y change rien.",
        variables: {
          app: "Le nom de l'application.",
          inviter: "La personne qui a envoyé l'invitation.",
          items: 'Les rôles ou accès accordés.',
          date: "La date d'expiration de l'invitation.",
          url: "Le lien d'invitation à usage unique ; l'aperçu en utilise un fictif.",
        },
      },
    },
  },
};

export default adminFrFR;
