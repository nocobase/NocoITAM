# NocoITAM

[English](../README.MD) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | Deutsch | [Français](README.fr-FR.md) | [Español](README.es-ES.md) | [Português](README.pt-BR.md) | [Русский](README.ru-RU.md) | [Bahasa Indonesia](README.id-ID.md) | [Tiếng Việt](README.vi-VN.md)

NocoITAM ist ein Open-Source-System für das IT-Asset-Management, gebaut auf [NocoBase 3](https://www.nocobase.com). Klassische ITAM-Tools sind Listen, die von Hand gepflegt werden. In NocoITAM klären Agenten MDM-Abweichungen, statten neue Mitarbeitende aus und prüfen vor jedem Kauf Lagerbestand und ungenutzte Assets. Jedes Gerät, jeder Lizenzplatz und jede Ausgabe ist belegt.

https://github.com/user-attachments/assets/01c34106-906e-4e81-8288-f7b707778fce

[Online testen](https://solutions.nocobase.com/itam/) · [Website](https://www.nocobase.com/de-DE/solution-itam/)

## Was es kann

- **Vor jedem Kauf zuerst ins Lager schauen.** Geht eine Bestellung zur Freigabe, prüft der Freigabeassistent, ob Lagerbestand oder ungenutzte Geräte reichen, vergleicht frühere Preise und ähnliche Anfragen und entwirft eine Entscheidung und einen Kommentar für die freigebende Person.
- **Neue am ersten Tag ausgestattet, Ausscheidende geben alles zurück.** Das Onboarding-Paket einer neuen Person wird in einem Schritt gegen Lager und ungenutzte Lizenzplätze abgeglichen, fehlende Bestellungen entstehen mit einem Klick. Geräte, Zubehör und Lizenzplätze Ausscheidender werden verfolgt, bis alles zurück ist, und ihre Datensätze werden übergeben.
- **Aus MDM-Abweichungen wird ein Plan.** Nach jeder Synchronisation mit Intune oder Jamf Pro sortiert der Agent, was nicht passt: ein falscher Benutzer geht an die verantwortliche Person des Geräts, ein nicht erfasstes Gerät an die Asset-Verwaltung, die unklaren Fälle an einen Menschen.
- **Ein Verzeichnis für alles, was die IT besitzt.** Geräte, Zubehör, Verbrauchsmaterial, Komponenten und Softwarelizenzen, von Kauf, Wareneingang, Zuweisung und Ausleihe über Reparatur und Inventur bis zur Entsorgung, jeder Datensatz mit seiner Historie.
- **Ein Assistent auf jeder Seite.** Asset Steward antwortet aus den Datensätzen, die Sie lesen dürfen, und schlägt Pläne vor, die Sie bestätigen. Kommt eine Aufgabe mit Angebot, Rechnung oder Lieferschein, liest die KI das Dokument und füllt das Formular zum Prüfen aus. Agenten schlagen vor, Menschen entscheiden.
- **Ihre Regeln, Ihr Code.** Schreiben Sie Standardausstattung, Budgets und Freigaberegeln als fachliche Anleitung auf, und jeder Agent hält sich daran. Lassen Sie einen Coding-Agenten den Quellcode von ITAM selbst ändern. Open Source, selbst gehostet und Ihr Eigentum.

## Schnellstart

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

## Lizenz

[Apache License 2.0](../LICENSE)
