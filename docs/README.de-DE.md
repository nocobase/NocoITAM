<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/nocoitam-logo-dark.svg">
    <img src="images/nocoitam-logo.svg" width="240" alt="NocoITAM">
  </picture>
</h1>

<p align="center"><strong>Agenten bleiben dran. IT-Assets in Ordnung.</strong></p>

<p align="center">Open-Source-IT-Asset-Management · Gebaut auf NocoBase</p>

<p align="center">
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://github.com/nocobase/NocoITAM/tags"><img src="https://img.shields.io/github/v/tag/nocobase/NocoITAM?label=version&sort=semver&include_prereleases" alt="version"></a>
  <a href="https://www.nocobase.com"><img src="https://img.shields.io/badge/built%20on-NocoBase-1f6feb" alt="Built on NocoBase"></a>
</p>

<p align="center">
  <a href="https://solutions.nocobase.com/itam/"><strong>Online testen</strong></a> · <a href="https://www.nocobase.com/de-DE/solution-itam/">Website</a>
</p>

<p align="center">
  <a href="../README.MD">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ko-KR.md">한국어</a> · <strong>Deutsch</strong> · <a href="README.fr-FR.md">Français</a> · <a href="README.es-ES.md">Español</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.ru-RU.md">Русский</a> · <a href="README.id-ID.md">Bahasa Indonesia</a> · <a href="README.vi-VN.md">Tiếng Việt</a>
</p>

NocoITAM ist ein Open-Source-System für das IT-Asset-Management, gebaut auf [NocoBase](https://www.nocobase.com). Klassische ITAM-Tools sind Listen, die von Hand gepflegt werden. In NocoITAM klären Agenten MDM-Abweichungen, statten neue Mitarbeitende aus und prüfen vor jedem Kauf Lagerbestand und ungenutzte Assets. Jedes Gerät, jeder Lizenzplatz und jede Ausgabe ist belegt.

https://github.com/user-attachments/assets/01c34106-906e-4e81-8288-f7b707778fce

## Funktionen

- **Vor jedem Kauf zuerst ins Lager schauen.** Geht eine Bestellung zur Freigabe, prüft der Freigabeassistent, ob Lagerbestand oder ungenutzte Geräte reichen, vergleicht frühere Preise und ähnliche Anfragen und entwirft eine Entscheidung und einen Kommentar für die freigebende Person.
- **Neue am ersten Tag ausgestattet.** Jede Abteilung und jede Position hat ein Onboarding-Paket. Der Plan für eine neue Person greift auf Lager, ungenutzte Lizenzplätze, unterwegs befindliche Bestellungen und Rückgaben Ausscheidender zurück; die KI wählt die Geräte mit Begründung aus, und fehlende Bestellungen entstehen mit einem Klick.
- **Ausscheidende geben alles zurück.** Geräte, Zubehör und Lizenzplätze Ausscheidender werden verfolgt, bis alles zurück ist, ihre Datensätze werden übergeben, und ihre Anmeldung wird am letzten Arbeitstag gesperrt.
- **Aus MDM-Abweichungen wird ein Plan.** Microsoft Intune und Jamf Pro werden jede Nacht synchronisiert und über die Seriennummer zugeordnet. Der Agent sortiert, was nicht passt: ein falscher Benutzer geht an die verantwortliche Person des Geräts, ein nicht erfasstes Gerät an die Asset-Verwaltung, die unklaren Fälle an einen Menschen.
- **Intelligente Erfassung.** Fügen Sie ein Angebot, eine Rechnung oder einen Lieferschein ein oder ziehen Sie sie hinein: Die KI füllt die Bestellung und ordnet die Positionen Ihren Modellen zu, prüft eine Lieferung gegen die Bestellung (Mengen, Seriennummern, Garantie) und liest Reparaturberichte und Entsorgungsnachweise. Die Daten eines neuen Modells ergänzt sie aus dem Web.
- **3 Agenten und KI dort, wo die Arbeit anfällt.** Asset Steward ist auf jeder Seite ansprechbar: er antwortet aus den Datensätzen, die Sie lesen dürfen, und schlägt Pläne vor, die Sie auf einer Karte bestätigen. Freigabeassistent und MDM-Nachverfolgung arbeiten im Hintergrund, und an 11 Stellen hilft die KI, vom Wareneingang bis zur Abwägung eines Reparaturangebots gegen den Ersatz des Geräts. Agenten schlagen vor, Menschen entscheiden.
- **Lizenzen und Abonnements im Griff.** Pro Benutzer, pro Gerät, als Standortlizenz oder kostenlos, mit Lizenzplätzen, Schlüsseln und Verlängerungsdaten. Die Compliance wird bei jeder Änderung neu berechnet, überbelegte oder ungenutzte Plätze werden vor der Verlängerung gemeldet.
- **Nichts geht unter.** Die Aufgaben beginnen mit 14 Risikoprüfungen (endende Garantien und Abonnements, ungenutzte Plätze, Bestand unter Minimum, seit einem Jahr nicht inventarisierte Geräte), danach folgt die Arbeit des Teams in Spalten: Freigaben, Ein- und Austritte, Bestellungen, Reparaturen, Entsorgungen und Inventuren.
- **Ein Verzeichnis für alles, was die IT besitzt.** Geräte, Zubehör, Verbrauchsmaterial, Komponenten und Softwarelizenzen, von Kauf, Wareneingang, Zuweisung und Ausleihe über Reparatur und Inventur bis zur Entsorgung, jeder Datensatz mit seiner Historie. 10 Berichte, CSV-Import und -Export und eine Suche über alle Datensätze (⌘K / Strg+K).
- **Anpassbar.** Schreiben Sie Standardausstattung, Budgets und Freigaberegeln als fachliche Anleitung in Klartext, und jeder Agent hält sich daran; die Arbeitsweise jedes Agenten ist ein bearbeitbarer Skill. Der Quellcode ist offen, den Rest kann ein Coding-Agent ändern.
- **Selbst gehostet.** Ihre Daten bleiben auf Ihren Servern, mit den Modellen Ihrer Wahl: DeepSeek, OpenAI, Claude, Gemini, Qwen und weitere. 12 Oberflächensprachen. Apache-2.0.

## Schnellstart

Nur mal ansehen? [Online testen](https://solutions.nocobase.com/itam/): Sie sind mit einem Demokonto angemeldet, und alle Daten sind erfunden.

### 1. Installieren

**Mit einem Coding-Agenten.** Der einfachste Weg. Öffnen Sie Claude Code, Codex oder Cursor im Ordner, in den NocoITAM soll, und geben Sie ihm dies:

```text
Installiere NocoITAM von https://github.com/nocobase/NocoITAM und starte es; folge dabei der AGENTS.md und der README des Repositorys.
```

**Von Hand.** Sie brauchen Node.js 24 oder neuer und pnpm 10 (`corepack enable`). Die Daten liegen standardmäßig in einer SQLite-Datei; PostgreSQL und MySQL funktionieren ebenfalls.

```bash
git clone https://github.com/nocobase/NocoITAM.git
cd NocoITAM
pnpm install
pnpm nocobase config init --dialect sqlite
pnpm dev
```

### 2. Anmelden

Öffnen Sie die `Local:`-Adresse, die `pnpm dev` ausgibt, normalerweise `http://127.0.0.1:13000/main/`, und melden Sie sich als `nocobase` mit dem Passwort `admin123` an.

### 3. Demodaten importieren

Das Banner oben bietet sie an, oder öffnen Sie **Einstellungen → Demodaten**. Sie bringen ein Unternehmen mit rund vierzig Personen samt Geräten, Lager und Lizenzen, Bestellungen, Reparaturen, Inventuren und Entsorgungen sowie Demo-Plattformen für Intune und Jamf; entfernen Sie sie dort, wenn Sie richtig starten.

### 4. Ein KI-Modell einrichten

Fügen Sie unter **Agententeam → Modelle** einen Modelldienst mit seinem Schlüssel hinzu, etwa DeepSeek, OpenAI, Claude, Gemini oder Qwen. Asset Steward und die Agenten brauchen ihn; alles andere funktioniert ohne.

Der [Leitfaden](guide.md) (Englisch) beschreibt die nächsten Schritte, die Demokonten, Rollen, die Agenten, die Konfiguration (KI, MDM, Datenbanken), das Deployment und die Entwicklung.

Für den Produktivbetrieb siehe [Deployment](guide.md#deployment); für PostgreSQL und MySQL siehe [Konfiguration](guide.md#configuration).

## Lizenz

NocoITAM ist auf NocoBase gebaut und unter der Lizenz [Apache-2.0](../LICENSE) veröffentlicht.
