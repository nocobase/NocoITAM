import settings from './settings-de-DE.js';
import type { SystemResource } from './en-US.js';
import deviceApprovalDeDE from '#extensions/nocobase-device-approval/locales/de-DE';
import inboxDeDE from '#extensions/nocobase-inbox/locales/de-DE';

/** The German copy of what the template ships; see `./en-US.ts`. */
const systemDeDE: SystemResource = {
  flowDiagram: {
    controls: 'Diagrammsteuerung',
    fitView: 'An Ansicht anpassen',
    fullscreen: 'Vollbild',
    exitFullscreen: 'Vollbild beenden',
    escapeHint: 'Zum Beenden Escape drücken',
    leavesTo: 'Führt zu',
    arrivesFrom: 'Kommt von',
    otherRoutes: 'Weitere Übergänge',
    minimap: 'Diagrammübersicht',

    configure: 'Konfigurieren',
    overview: 'Diagrammübersicht',
    actualSize: 'Originalgröße',
    states: 'Zustände',
    transitions: 'Übergänge',
    configurable: 'Parameter',
    current: 'Aktuell',
    visited: 'Durchlaufen',
    initial: 'Anfangszustand',
    final: 'Endzustand',
    state: 'Zustand',
    zoomOut: 'Verkleinern',
    zoomIn: 'Vergrößern',
    fit: 'An Ansicht anpassen',

    empty: 'Keine Zustände zum Anzeigen.',
    loading: 'Diagramm wird angeordnet…',
    failed: 'Dieses Diagramm kann nicht angeordnet werden.',
    nodeHelp:
      'Drücken Sie Enter oder die Leertaste, um einen Zustand auszuwählen.',
    edgeHelp:
      'Drücken Sie Enter oder die Leertaste, um einen Übergang auszuwählen.',
  },
  settings,
  'auth.preparingSession': 'Ihre Sitzung wird vorbereitet…',
  'auth.connectionFailed': 'Verbindung nicht möglich',
  'auth.connectionFailedDescription':
    'Die Echtzeitverbindung konnte nicht hergestellt werden. Versuchen Sie es erneut, um die Anwendung zu öffnen, oder melden Sie sich ab.',

  'auth.passwordResetSuccess':
    'Ihr Passwort wurde zurückgesetzt. Melden Sie sich mit Ihrem neuen Passwort an.',
  'auth.requestNewResetLink': 'Neuen Link zum Zurücksetzen anfordern',

  // The UI Library block of the `/device` page; the keys below may reword it.
  ...deviceApprovalDeDE,
  // The UI Library block of the `/inbox` page; the keys below may reword it.
  ...inboxDeDE,
  // The UI Library component of the header's inbox button.
  'inboxButton.title': 'Posteingang',
  'inboxButton.pending': 'Posteingang, {{count}} warten',
  'inboxButton.unread': 'Posteingang, {{count}} ungelesen',
  'inboxButton.pendingHint':
    '{{count}} warten auf Sie; die Zahl sinkt, sobald sie erledigt sind.',
  'inboxButton.unreadHint':
    '{{count}} ungelesen; die Zahl sinkt, während Sie sie lesen.',
  'auth.welcome': 'Willkommen zurück',
  'auth.loginDescription':
    'Melden Sie sich mit Benutzername oder E-Mail-Adresse und Passwort an.',
  'auth.registerTitle': 'Konto erstellen',
  'auth.registerDescription': 'Erstellen Sie ein Konto, um loszulegen.',
  'auth.forgotTitle': 'Passwort vergessen',
  'auth.forgotDescription':
    'Geben Sie Ihre E-Mail-Adresse ein; wenn das Konto existiert, senden wir Ihnen einen Link zum Zurücksetzen.',
  'auth.passwordResetUnavailable':
    'Das Zurücksetzen des Passworts per Selbstbedienung ist nicht aktiviert. Wenden Sie sich an eine Administratorin oder einen Administrator.',
  'auth.capabilityLoadFailed':
    'Die Verfügbarkeit des Zurücksetzens konnte nicht geprüft werden.',
  'auth.retry': 'Erneut versuchen',
  'auth.loading': 'Wird geladen',
  'auth.resetDescription': 'Wählen Sie ein neues Passwort für Ihr Konto.',
  'auth.resetTitle': 'Passwort zurücksetzen',
  'auth.identifier': 'Benutzername oder E-Mail-Adresse',
  'auth.password': 'Passwort',
  'auth.signIn': 'Anmelden',
  'auth.signingIn': 'Anmeldung läuft…',
  'auth.hidePassword': 'Passwort verbergen',
  'auth.showPassword': 'Passwort anzeigen',
  'auth.forgotLink': 'Passwort vergessen?',
  'auth.noAccount': 'Noch kein Konto?',
  'auth.signUp': 'Registrieren',
  'auth.createAccount': 'Konto erstellen',
  'auth.creatingAccount': 'Konto wird erstellt…',
  'auth.name': 'Name',
  'auth.username': 'Benutzername',
  'auth.email': 'E-Mail-Adresse',
  'auth.confirmPassword': 'Passwort bestätigen',
  'auth.existingAccount': 'Sie haben bereits ein Konto?',
  'auth.passwordMismatch': 'Die Passwörter stimmen nicht überein.',
  'auth.resetting': 'Wird zurückgesetzt…',
  'auth.newPassword': 'Neues Passwort',
  'auth.confirmNewPassword': 'Neues Passwort bestätigen',
  'auth.invalidResetLink':
    'Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.',
  'auth.backToSignIn': 'Zurück zur Anmeldung',
  'auth.sendResetLink': 'Link zum Zurücksetzen senden',
  'auth.sending': 'Wird gesendet…',
  'auth.resetSent':
    'Wenn das Konto existiert, wurde ein Link zum Zurücksetzen gesendet.',
  'auth.rememberPassword': 'Passwort wieder eingefallen?',
  'auth.methods': 'Anmeldemethoden',
  'auth.or': 'Oder weiter mit',
  'auth.continueWith': 'Weiter mit {provider}',
  'auth.about': 'Über diese Anwendung',
  'auth.platform': 'KI-native Anwendungsplattform',
  'auth.marketingTitleFirst': 'Die KI baut frei.',
  'auth.marketingTitleSecond': 'NocoBase macht es',
  'auth.marketingTitleThird': 'verlässlich.',
  'auth.marketingDescription':
    'Geben Sie der KI ein flexibles Frontend-Framework, um jede Oberfläche zu gestalten, während NocoBase darunter Daten, Berechtigungen und Governance absichert.',
  'auth.frontend': 'KI-natives Frontend',
  'auth.frontendDescription':
    'Oberflächen frei auf einem flexiblen Framework zusammenstellen.',
  'auth.foundation': 'NocoBase-Fundament',
  'auth.foundationDescription':
    'Verlässliche Daten, Zugriffskontrolle und Governance.',
  'auth.marketingFooter': 'Oben Freiheit. Unten Verlässlichkeit.',
  'status.loading': 'Wird geladen',
  'status.loadingPage': 'Seite wird geladen',
  'status.denied': 'Zugriff verweigert',
  'status.pageFailed': 'Seite kann nicht geladen werden',
  'status.retry': 'Erneut versuchen',
  'navigation.brandHome': 'NocoBase-Startseite',
  'navigation.brandApps': 'NocoBase-Anwendungen',
  'routeOverlay.close': 'Schließen',
  'status.deniedDescription':
    'Sie haben keine Berechtigung für den Zugriff auf {{label}}.',
  'status.routeFailedDescription':
    'Die Route {{label}} aus {{packageName}} konnte nicht geladen werden.',
  shell: {
    buildFreely: 'Die KI baut frei.',
    reliability: '<brand>NocoBase</brand> macht es verlässlich.',
  },
  home: {
    platform: 'NocoBase · KI-native Anwendungsplattform',
    title: 'Beschreiben Sie es, und Ihr Agent baut es',
    description:
      'Diese Anwendung entsteht im Gespräch mit Ihrem Coding-Agenten. Sagen Sie ihm in einfachen Worten, was das Geschäft braucht, und er schreibt die Seiten, Datenmodelle, APIs und Geschäftsabläufe in diesem Projekt.',
    steps: {
      describe: {
        title: 'Bedarf beschreiben',
        description:
          'Sagen Sie, wer es nutzt, welche Daten es speichert und was passieren soll.',
      },
      build: {
        title: 'Den Agenten bauen lassen',
        description:
          'Er liest dieses Projekt und seine integrierten Funktionen und schreibt dann den Code.',
      },
      review: {
        title: 'Prüfen und verfeinern',
        description:
          'Laden Sie die Seite neu, um es auszuprobieren, und bitten Sie auf dieselbe Weise um Änderungen.',
      },
    },
    example: {
      title: 'Probieren Sie eine Anfrage wie diese',
      text: 'Baue eine Anwendung für Bestellungen.\n\nEine Bestellung hat eine Nummer, einen Artikel, eine antragstellende Person, einen Betrag und einen Freigabestatus. Antragstellende legen Bestellungen an und sehen nur ihre eigenen; Prüfende sehen alle offenen Bestellungen und geben sie frei oder lehnen sie ab.\nBenachrichtige die antragstellende Person nach der Entscheidung im Posteingang mit einem Link zur Bestellung.',
      hint: 'Fügen Sie es in Claude Code, Codex, Cursor oder einen anderen Coding-Agenten ein, der in diesem Projekt geöffnet ist.',
    },
    capabilitiesTitle: 'Integrierte Funktionen',
    capabilitiesDescription:
      'Ihr Agent nutzt diese direkt, statt sie von Grund auf zu bauen. Öffnen Sie eine, um einen Prompt zu erhalten, den Sie bearbeiten und kopieren können.',
    viewPrompts: 'Prompts ansehen ({{count}})',
    prompt: {
      label: 'Prompt',
      hint: 'Passen Sie den Prompt vor dem Kopieren an Ihr Geschäft an. Änderungen werden nach dem Schließen des Dialogs nicht gespeichert.',
      copy: 'Kopieren',
      copiedShort: 'Kopiert',
      copied: 'Prompt kopiert',
      copyFailed:
        'Kopieren nicht möglich. Markieren Sie den Text und kopieren Sie ihn manuell.',
      reset: 'Standard wiederherstellen',
    },
    capabilities: {
      auth: {
        title: 'Authentifizierung',
        description:
          'Anmeldung, Registrierung, Zurücksetzen des Passworts und Single Sign-on des Unternehmens.',
        prompts: {
          disableSignUp: {
            label: 'Registrierung schließen',
            text: 'Diese Anwendung ist nur für Mitarbeitende des Unternehmens. Alle Konten werden von Administratoren angelegt.\nDeaktiviere die Selbstregistrierung und entferne den Registrierungslink von der Anmeldeseite.\nBestehende Mitarbeitende müssen sich weiterhin mit ihrem Konto und Passwort anmelden können.\nBehalte den Link „Passwort vergessen“ bei.',
          },
          companySso: {
            label: 'Unternehmens-SSO',
            text: 'Lass Mitarbeitende sich per OIDC über unsere Identitätsplattform des Unternehmens anmelden.\n\nBehalte die Anmeldung mit Konto und Passwort bei und füge eine Schaltfläche „Unternehmenskonto“ hinzu.\nDie Schaltfläche öffnet die Identitätsplattform des Unternehmens. Nach erfolgreicher Anmeldung geht es zurück zur Startseite der Anwendung.\n\nErlaube, dass bei der ersten Anmeldung ein Anwendungskonto angelegt wird, identifiziert über die stabile Benutzerkennung der Plattform.\nVerknüpfe Konten nicht automatisch über übereinstimmende Namen oder E-Mail-Adressen. Neue Konten erhalten die Standardberechtigungen der Anwendung.\n\nListe die Angaben auf, die die Administration der Identitätsplattform liefern muss, und die Callback-URL, die dort registriert werden muss.',
          },
          apiKeys: {
            label: 'API-Schlüssel',
            text: 'Füge dem Benutzermenü einen Eintrag „Integrationsschlüssel“ hinzu und nutze dafür die integrierte API-Schlüssel-Funktion der Anwendung.\nMitarbeitende verwalten nur die Schlüssel, die sie selbst erstellt haben, und geben dabei einen Zweck und eine Gültigkeit in Tagen an.\nZeige den vollständigen Schlüssel nur einmal nach dem Erstellen an, mit dem Hinweis, ihn sofort zu kopieren und sicher aufzubewahren.\nListe für jeden Schlüssel Name, ein erkennbares Fragment, Status, Ablauf und letzte Nutzung auf und erlaube das Widerrufen nach einer Bestätigung.\nZeige den vollständigen Schlüssel niemals in der Liste, in Protokollen oder in Details an.',
          },
        },
      },
      dataSources: {
        title: 'Datenquellen',
        description:
          'Die Datenbank der Anwendung wählen und Geschäftsdaten aus bestehenden externen Datenbanken nutzen.',
        prompts: {
          postgres: {
            label: 'Datenbank wechseln',
            text: 'Stelle die Datenbank der Anwendung von SQLite auf PostgreSQL um.\nLies die Verbindungsdaten aus der Laufzeitkonfiguration des Servers, nicht aus dem Quellcode.\nErkläre, welcher Datenbanktreiber zu installieren ist und welche Einstellungen auszufüllen sind, und weise mich darauf hin, dass vorhandene Daten nicht automatisch migriert werden.',
          },
          externalDatabase: {
            label: 'Externe Datenbank',
            text: 'Binde die bestehende Finanzdatenbank des Unternehmens als schreibgeschützte externe Datenquelle an; ändere ihre Tabellen nicht.\nOrdne Datensätze über die Lieferantennummer zu und füge den Lieferantendetails einen Abschnitt „Abrechnung“ hinzu, der Abrechnungszyklus, Kreditlimit und Abrechnungsstatus zeigt und mit seiner Quelle beschriftet ist.\nLies die Kontaktdaten der Lieferanten weiterhin aus der Datenbank der Anwendung und die Abrechnungsdaten direkt aus der externen Datenbank, ohne sie zu importieren.\nLies die Zugangsdaten der Verbindung aus der Laufzeitkonfiguration des Servers.',
          },
        },
      },
      authorization: {
        title: 'Berechtigungen',
        description:
          'Steuern, wer welche Seiten öffnen, welche Aktionen ausführen und welche Datensätze sehen darf.',
        prompts: {
          jobs: {
            label: 'Funktionen',
            text: 'Lege für die Anwendung die Funktionen „Bestellanforderer“ und „Bestellprüfer“ an.\nBestellanforderer können die Bestellseite öffnen und die von ihnen angeforderten Bestellungen ansehen.\nBestellprüfer können die Bestellseite öffnen, Bestellungen ansehen und offene Bestellungen freigeben oder ablehnen.\nNur Administratoren der Anwendung dürfen Berechtigungen und Zuweisungen ändern.\nNutze die vorhandene Berechtigungsfunktion der Anwendung, damit Administratoren Berechtigungen später anpassen und Personen zuweisen können.',
          },
          dataScopes: {
            label: 'Datenbereiche',
            text: 'Lass Bestellanforderer nur ihre eigenen Bestellungen sehen; die Zugehörigkeit ergibt sich aus dem Anforderer-Feld der Bestellung.\nBestellprüfer können alle Bestellungen sehen und offene Freigaben bearbeiten.\nAdministratoren können im Berechtigungssatz jeder Funktion festlegen, welche Bestellungen sie sieht.',
          },
          restrictions: {
            label: 'Einschränkungen',
            text: 'Bob hilft vorübergehend bei der Prüfung von Bestellungen und darf nur Bestellungen bis 2.000 sehen.\nFüge seiner Aktion „Bestellungen ansehen“ eine Betragsgrenze hinzu und behalte seine bestehende Funktion und seine Datenbereiche bei.\nWende die Grenze auf seine eigenen und auf mit ihm geteilte Bestellungen an.\nAdministratoren können den Betrag ändern oder die Regel entfernen; erkläre vor dem Entfernen, dass sein sichtbarer Bereich dadurch größer werden kann.',
          },
        },
      },
      workflow: {
        title: 'Workflows',
        description:
          'Geschäftsdatensätze durch Phasen führen, mit Warten, Zeitlimits, Wiederholungen und einem Verlauf, wer was getan hat.',
        prompts: {
          stages: {
            label: 'Phasen',
            text: 'Füge Bestellungen einen Ablauf hinzu: Freigabe ausstehend → Einkauf ausstehend → Eingegangen → Abgeschlossen.\nPrüfende geben frei oder lehnen ab; eine Ablehnung erfordert einen Grund und gibt die Bestellung zur Überarbeitung und erneuten Einreichung an die antragstellende Person zurück.\nNachdem der Einkauf bestellt hat, ist die Bestellung „Einkauf ausstehend“; die Bestätigung der Lieferung mit unterschriebenem Empfangsbeleg setzt sie auf „Eingegangen“, und die Bestätigung der antragstellenden Person schließt sie ab.\nDie Bestelldetails bieten nur die Aktionen der aktuellen Phase an, und normale Bearbeitungen können die Phase nicht ändern.\nPrüfe Phasen und Pflichtangaben auf dem Server und überschreibe nie ein Ergebnis, das jemand anderes bereits eingereicht hat.',
          },
          backgroundExport: {
            label: 'Export im Hintergrund',
            text: 'Füge eine Seite „Bestellbericht“ hinzu, die vorhandene Bestellungen als CSV exportiert.\nNach dem Absenden wartet der Export auf die Verarbeitung, wird im Hintergrund erzeugt und endet mit einem Download-Link.\nZeige die aktuelle Phase, den Dateinamen, die Anzahl exportierter Bestellungen sowie die Einreichungs- und Verarbeitungsprotokolle des Systems.\nWiederhole eine fehlgeschlagene Erzeugung nach festen Regeln und belasse einen endgültigen Fehlschlag zur Bearbeitung durch die verantwortliche Person; ein erneuter Lauf darf keine doppelten Berichtsdateien erzeugen.\nFortschritt und Ergebnis bleiben nach dem Neuladen der Seite sichtbar, und nur berechtigte Personen dürfen Bestellungen exportieren.',
          },
          history: {
            label: 'Verlauf',
            text: 'Zeige in den Bestelldetails die aktuelle Phase und den Bearbeitungsverlauf.\nJeder Eintrag zeigt, wer wann gehandelt hat, die Aktion, die Phase davor und danach sowie einen etwaigen Ablehnungsgrund oder unterschriebenen Empfangsbeleg.\nKennzeichne automatisch ausgeführte Aktionen als vom System erledigt.\nFortschritt und Verlauf bleiben nach dem Neuladen der Seite erhalten, sodass der gesamte Ablauf nach Abschluss nachvollzogen werden kann.',
          },
        },
      },
      scheduler: {
        title: 'Geplante Aufgaben',
        description:
          'Geschäftsarbeit zu festen Zeiten ausführen und den nächsten Lauf und seine Ergebnisse sehen.',
        prompts: {
          reminder: {
            label: 'Tägliche Erinnerung',
            text: 'Füge der bestehenden Bestellanwendung eine Erinnerung an offene Bestellungen hinzu.\n\nSuche an jedem Werktag um 09:00 Uhr Pekinger Zeit die Bestellungen, die auf Freigabe warten, gruppiere sie nach prüfender Person und sende jeder prüfenden Person eine In-App-Benachrichtigung.\nNenne die Anzahl offener Bestellungen und verlinke auf die Liste der offenen Bestellungen. Sende nichts, wenn keine Bestellungen offen sind.\nAdministratoren können den Zeitplan und die Ausführungsprotokolle ansehen und Erinnerungen pausieren oder fortsetzen.',
          },
          weeklyReport: {
            label: 'Wochenbericht',
            text: 'Erstelle jeden Montag um 08:00 Uhr Pekinger Zeit eine Umsatzübersicht der Vorwoche und benachrichtige die Vertriebsleitung.\nNenne Umsatz, Anzahl der Bestellungen und Summen je Region. Administratoren können die Aufgabe und die Ausführungsprotokolle ansehen.',
          },
        },
      },
      notification: {
        title: 'Benachrichtigungen',
        description:
          'In-App-Nachrichten, E-Mails oder Nachrichten von Gruppen-Bots senden, wenn etwas passiert.',
        prompts: {
          inApp: {
            label: 'In-App-Nachricht',
            text: 'Füge der aktuellen Anwendung eine Freigabe von Bestellungen hinzu und benachrichtige Antragstellende per In-App-Nachricht über das Ergebnis.\n\nBestellungen haben eine Nummer, einen Namen, eine antragstellende Person, einen Betrag und einen Freigabestatus.\nAntragstellende können ihre eigenen Bestellungen sehen. Prüfende können offene Bestellungen sehen und sie freigeben oder ablehnen. Nutze vorhandene Bestell- und Freigabefunktionen, falls es sie gibt.\n\nSende nach Freigabe oder Ablehnung genau eine In-App-Nachricht, nur an die antragstellende Person der Bestellung.\nDer Titel sagt, ob die Bestellung freigegeben oder abgelehnt wurde. Der Text enthält Bestellnummer, Namen und Ergebnis der Freigabe.\nEin Klick auf die Nachricht öffnet die zugehörigen Bestelldetails.\nSende nichts, solange die Freigabe aussteht. Benachrichtige für dasselbe Ergebnis nur einmal.\nEin Fehler beim Benachrichtigen beeinträchtigt das gespeicherte Freigabeergebnis nicht.',
          },
          email: {
            label: 'E-Mail',
            text: 'Ergänze die bestehenden Benachrichtigungen zur Freigabe von Bestellungen um E-Mails und nutze dafür den konfigurierten E-Mail-Kanal der Anwendung.\n\nSende nach Freigabe oder Ablehnung einer Bestellung das Ergebnis an die Konto-E-Mail-Adresse der antragstellenden Person.\nNenne die Bestellnummer im Betreff sowie Namen und Ergebnis der Bestellung im Text.\nBehalte die bestehenden In-App-Nachrichten bei. Hat die antragstellende Person keine E-Mail-Adresse, sende nur die In-App-Nachricht.\nEin E-Mail-Fehler darf weder das Freigabeergebnis noch die In-App-Nachricht beeinträchtigen.',
          },
        },
      },
      mail: {
        title: 'E-Mail',
        description:
          'Persönliche Postfächer verbinden und dann geschäftliche E-Mails lesen, beantworten und senden.',
        prompts: {
          providers: {
            label: 'E-Mail-Anbieter',
            text: 'Konfiguriere mailbox.org für die Anwendung in mail.providers der Serverkonfiguration:\n- IMAP-Posteingangsserver: imap.mailbox.org, Port 993, SSL/TLS.\n- SMTP-Postausgangsserver: smtp.mailbox.org, Port 465, SSL/TLS.\nBenutzer geben ihre eigene E-Mail-Adresse, ihren Benutzernamen und ihr Passwort auf der Seite der Postfachkonten ein und wählen das Datum, ab dem die erste Synchronisierung beginnt; schreibe Postfachpasswörter niemals in Konfiguration oder Quellcode.',
          },
          mailCenter: {
            label: 'E-Mail-Zentrale',
            text: 'E-Mail ist in diese Anwendung integriert; nutze sie, statt sie neu zu bauen oder ein weiteres Plugin zu installieren.\nFüge der Navigation die Seiten „E-Mail-Zentrale“ und „Postfachkonten“ hinzu und nutze dafür den E-Mail-Arbeitsbereich und die Seite der Postfachkonten, die die E-Mail-Funktion bereitstellt.\nBenutzer können ihre eigenen Postfächer verbinden, eingehende Nachrichten synchronisieren, Nachrichten und Anhänge lesen und antworten, wobei der ursprüngliche Betreff und der Gesprächszusammenhang erhalten bleiben und die Antwort an den ursprünglichen Absender geht.\nJeder Benutzer arbeitet mit seinen eigenen verbundenen Postfächern.',
          },
          correspondence: {
            label: 'Kunden-E-Mails',
            text: 'Füge den Kundendetails einen Abschnitt „Korrespondenz“ hinzu und nutze dafür die integrierten Komponenten der Anwendung zum Lesen und Verfassen von E-Mails.\nZeige Nachrichten, deren Absender oder Empfänger einer der Kontakt-E-Mail-Adressen des aktuellen Kunden entspricht. Vertriebsmitarbeitende können Nachrichten lesen, Anhänge ansehen und mit ihren eigenen verbundenen Postfächern antworten.',
          },
        },
      },
      file: {
        title: 'Dateien',
        description:
          'Dateien hochladen, an Datensätze anhängen und in der Vorschau ansehen oder herunterladen.',
        prompts: {
          attachments: {
            label: 'Anhänge',
            text: 'Füge meiner bestehenden Anwendung zur Bestellverwaltung Einkaufsanhänge hinzu.\n\nFüge den Bestelldetails einen Bereich für Anhänge hinzu. Jede Bestellung kann mehrere Dateien haben, darunter PDF, Bilder und DOCX.\nZeige Dateinamen und Größen mit Aktionen zum Ansehen, Herunterladen und Entfernen von Anhängen.\nLass Benutzer die Anhänge nach dem Hochladen in der aktuellen Bestellung speichern. Sie bleiben verfügbar, wenn die Bestellung erneut geöffnet wird.\nJeder mit Zugriff auf eine Bestellung kann ihre Anhänge ansehen und herunterladen. Antragstellende und Prüfende können Anhänge hinzufügen oder entfernen.\nDas Entfernen eines Anhangs löst ihn nur von der aktuellen Bestellung; die Datei bleibt erhalten.',
          },
          avatar: {
            label: 'Avatar',
            text: 'Gib jedem Mitarbeitenden einen Avatar, mit einem Bild pro Person.\nUnterstütze das Hochladen und Ersetzen des Avatars und zeige ihn in Mitarbeiterlisten und -details.\nVerwende nach dem Ersetzen den neuen Avatar und lass ihn nach dem Neuladen der Seite sichtbar.',
          },
        },
      },
      i18n: {
        title: 'Sprachen',
        description:
          'Die Sprache der Oberfläche wechseln, Sprachen hinzufügen und die Standardsprache festlegen.',
        prompts: {
          addLanguage: {
            label: 'Sprache hinzufügen',
            text: 'Füge meiner Anwendung Spanisch hinzu. Übersetze die Oberfläche und die Servermeldungen und füge Spanisch dem Sprachmenü hinzu.',
          },
          defaultLanguage: {
            label: 'Standardsprache',
            text: 'Mache vereinfachtes Chinesisch zur Standardsprache der Anwendung für alle, die keine Sprache gewählt haben. Englisch bleibt im Sprachmenü verfügbar.',
          },
        },
      },
      theme: {
        title: 'Designs',
        description:
          'Farben, Schriften und Dichte anpassen und zwischen hell und dunkel wechseln.',
        prompts: {
          changeTheme: {
            label: 'Design ändern',
            text: 'Aktualisiere das Design „Kompakt“: Verwende Blau als Primärfarbe und vergrößere den Eckenradius leicht. Behalte die aktuellen Schriften, Schriftgrößen und den kompakten Abstand bei.',
          },
          newTheme: {
            label: 'Neues Design',
            text: 'Erstelle ein Design „Wald“ mit Grün als Primärfarbe, sanften Hintergründen, mäßig abgerundeten Ecken und dezenten Schatten.',
          },
        },
      },
    },
  },

  appearance: {
    title: 'Darstellung',
    mode: 'Farbmodus',
    preset: 'Design',
    light: 'Hell',
    dark: 'Dunkel',
    system: 'System',
    themes: { default: 'Großzügig', compact: 'Kompakt' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: 'Schließen',
    save: 'Speichern',
    cancel: 'Abbrechen',
    confirm: 'Bestätigen',
    language: 'Sprache',
  },
  notices: {
    serverLocaleFallback:
      'Der Server unterstützt diese Sprache nicht, daher erscheinen Servermeldungen auf Englisch.',
    languageChangeFailed:
      'Die Sprache konnte nicht gewechselt werden. Bitte versuchen Sie es erneut.',
  },
  account: {
    signOutFailed: 'Abmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.',
    openMenu: 'Kontomenü öffnen',
    fallback: 'Konto',
    signOut: 'Abmelden',
    signingOut: 'Abmeldung läuft…',
  },
  navigation: {
    home: 'Startseite',
    open: 'Navigation öffnen',
    close: 'Navigation schließen',
    expand: 'Navigation ausklappen',
    collapse: 'Navigation einklappen',
    toggle: 'Navigation aus- oder einklappen',
    label: 'Anwendungsnavigation',
    description: 'Zu einer Seite dieser Anwendung wechseln.',
    breadcrumb: 'Brotkrümelnavigation',
    breadcrumbMore: 'Zwischenebenen anzeigen',
    back: 'Zurück',
  },
  dataTable: {
    noResults: 'Keine Ergebnisse.',
    sortAscending: 'Aufst.',
    sortDescending: 'Abst.',
    hideColumn: 'Ausblenden',
    view: 'Ansicht',
    toggleColumns: 'Spalten ein-/ausblenden',
    selectedCount: '{{selected}} von {{total}} Zeile(n) ausgewählt.',
    rowsPerPage: 'Zeilen pro Seite',
    pageOf: 'Seite {{page}} von {{pageCount}}',
    firstPage: 'Zur ersten Seite',
    previousPage: 'Zur vorherigen Seite',
    nextPage: 'Zur nächsten Seite',
    lastPage: 'Zur letzten Seite',
  },
  datePicker: {
    placeholder: 'Datum wählen',
    rangePlaceholder: 'Zeitraum wählen',
  },
};

export default systemDeDE;
