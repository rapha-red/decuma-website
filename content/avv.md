---
translationKey: avv
layout: recht
stand: 2026-11-28
---
Zwischen dir als Kunde des gehosteten Decuma ("Verantwortlicher") und der Zapiens GmbH, Hostertstraße 16, 53332 Bornheim ("wir", "Auftragsverarbeiter"). Dieser Vertrag erfüllt Art. 28 DSGVO. Er gilt, wenn du Decuma für ein Unternehmen nutzt und darin personenbezogene Daten anderer Personen speicherst. Du nimmst ihn bei der Registrierung oder bei der Buchung eines Tarifs an.

## Gegenstand und Dauer

1. Gegenstand ist der Betrieb des gehosteten Decuma nach den AGB (Hauptvertrag) für deine Buchhaltung, Rechnungen und Meldungen.
2. Der Vertrag läuft so lange wie der Hauptvertrag und darüber hinaus, bis wir deine Daten gelöscht haben (Abschnitt "Löschung und Rückgabe").

## Art und Zweck

Wir speichern, ordnen, lesen und werten deine Daten aus, damit Decuma die vereinbarten Funktionen erbringt: Belege erfassen und lesen, buchen, Rechnungen und E-Mails versenden, Auswertungen und Meldungen erstellen, exportieren. Für das Lesen von Belegen, für Hinweise und für Antworten setzen wir KI-Modelle ein. Mit deinen Daten wird kein Modell trainiert. Für eigene Zwecke nutzen wir nur die Zählung, in welchem Feld gelesene Werte korrigiert wurden, ohne Inhalte.

## Art der Daten und Kreis der Betroffenen

- **Daten:** Name, Anschrift und Kontaktdaten, Steuernummer und USt-IdNr., Bankverbindungen und Bankumsätze, Inhalte von Belegen, Rechnungen und E-Mails, Buchungen und Beträge, Vertrags- und Zahlungsdaten.
- **Betroffene:** deine Kunden, Lieferanten und anderen Geschäftspartner, deren Ansprechpartner, deine Beschäftigten und Gesellschafter, Personen, denen du Zugriff gibst.

## Pflichten des Auftragsverarbeiters

Wir

1. verarbeiten die Daten nur auf deine dokumentierte Weisung, auch bei einer Übermittlung in ein Drittland, außer das Recht der EU oder Deutschlands verpflichtet uns zu etwas anderem; dann sagen wir dir das vorher, soweit das Recht es erlaubt. Deine Weisungen sind dieser Vertrag, die AGB und deine Einstellungen und Aufträge in Decuma. Halten wir eine Weisung für rechtswidrig, sagen wir dir das unverzüglich;
2. lassen nur Personen an die Daten, die zur Vertraulichkeit verpflichtet sind;
3. treffen die Maßnahmen nach Art. 32 DSGVO (Abschnitt "Technische und organisatorische Maßnahmen");
4. halten die Regeln für Unterauftragnehmer ein (Abschnitt "Unterauftragnehmer");
5. unterstützen dich bei Anfragen Betroffener und bei deinen Pflichten nach Art. 32 bis 36 DSGVO, soweit es die Art der Verarbeitung zulässt;
6. melden dir eine Verletzung des Schutzes personenbezogener Daten unverzüglich, nachdem wir von ihr erfahren, mit den Angaben, die wir haben;
7. löschen die Daten nach Ende des Vertrags oder geben sie zurück (Abschnitt "Löschung und Rückgabe");
8. geben dir alle Informationen, die du zum Nachweis dieser Pflichten brauchst, und ermöglichen Überprüfungen (Abschnitt "Kontrollrechte").

## Unterauftragnehmer

1. Du erlaubst uns allgemein, weitere Auftragsverarbeiter einzusetzen. Wir verpflichten jeden auf dieselben Datenschutzpflichten wie in diesem Vertrag und haften für ihn wie für uns selbst.
2. Wir setzen Unterauftragnehmer für diese Leistungen ein: Hosting, Speicher und Datensicherung (in Deutschland), Versand von E-Mails, Zahlungsabwicklung, KI-Modelle. Die Liste mit Namen und Standorten bekommst du auf Anfrage an kontakt@decuma.de.
3. Ein Anbieter von KI-Modellen sitzt in den USA. Die Übermittlung dorthin stützt sich auf die Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 Buchstabe c DSGVO).
4. Wollen wir einen Unterauftragnehmer hinzunehmen oder ersetzen, informieren wir dich mindestens vier Wochen vorher per E-Mail. Du kannst in dieser Zeit aus einem sachlichen Grund des Datenschutzes widersprechen. Finden wir keine Lösung, kannst du den Vertrag zum Zeitpunkt der Änderung kündigen.

## Technische und organisatorische Maßnahmen

- **Standort:** Server, Datenbank, Belege und Datensicherungen liegen in Rechenzentren in Deutschland.
- **Zugang zum Server:** nur über eine persönliche Anmeldung mit SSH-Schlüssel; die Anmeldung als root ist abgeschaltet. Eine Firewall lässt nur die nötigen Ports zu. Sicherheitsupdates spielt der Server automatisch ein.
- **Verschlüsselung in der Übertragung:** Alle Verbindungen zu Decuma laufen über TLS.
- **Trennung der Kunden:** Jede Zeile der Datenbank trägt die Kennung ihres Unternehmens. Die Datenbank erzwingt die Trennung selbst (Row-Level Security); die Anwendung kann sie nicht umgehen. Eine Testreihe prüft die Trennung.
- **Geheimnisse:** Schlüssel und Zugangsdaten liegen in einer Datei, die nur root lesen kann, nie im Quellcode und nie in der Datenbank.
- **Protokolle:** Die Server-Protokolle enthalten nur Kennungen, Befehle, Fehlercodes und Dauer. Nie protokolliert werden Passwörter, Schlüssel, Codes, Inhalte von Belegen, Buchungstexte, E-Mails, Steuernummern, IBAN, Namen und Anschriften. Wir löschen die Protokolle nach 30 Tagen.
- **Nachvollziehbarkeit:** Jede Änderung an deinen Daten steht im Verlauf (Command-Log), dessen Einträge mit einer Prüfkette verbunden sind.
- **Datensicherung:** Die Datenbank wird laufend und jede Nacht verschlüsselt an einen anderen Standort gesichert. Belege werden jede Nacht in einen zweiten Speicher an einem anderen Standort kopiert und dabei auf Unverändertheit geprüft. Backups werden versioniert und 35 Tage aufbewahrt. Eine fehlgeschlagene Sicherung löst eine Warnung aus. Die Wiederherstellung aus der Sicherung ist erprobt.
- **Onlinebanking:** Die Zugangsdaten zu deinem Onlinebanking erreichen den Server von Decuma nie.
- **Zugriff durch uns:** Auf Daten im Betrieb greifen nur die Geschäftsführung der Zapiens GmbH und von ihr schriftlich beauftragte Administratoren zu, und nur, soweit es für Betrieb, Sicherheit oder deinen Auftrag nötig ist. Für Done-for-you arbeiten wir mit einem Zugriff, den du uns in Decuma gibst.

## Rechte der Betroffenen

Wendet sich eine betroffene Person an uns, leiten wir die Anfrage an dich weiter. Decuma gibt dir die Mittel, sie zu beantworten: Auskunft und Export, Berichtigung (mit Verlauf) und Löschung.

## Löschung und Rückgabe

1. Du kannst deine Daten jederzeit exportieren, in offenen Formaten.
2. Löschst du ein Unternehmen oder dein Konto, oder endet der Vertrag, löschen wir die Daten. Vorher bieten wir dir den Export an.
3. Aus den Datensicherungen verschwinden gelöschte Daten, wenn diese ablaufen, spätestens nach 40 Tagen. Eine Wiederherstellung bringt gelöschte Daten nicht zurück.
4. Daten, die wir nach dem Recht der EU oder Deutschlands aufbewahren müssen, löschen wir erst nach Ablauf dieser Pflicht.

## Kontrollrechte

1. Auf Anfrage geben wir dir die Informationen, die du zum Nachweis brauchst, insbesondere die Beschreibung der Maßnahmen oben und die Liste der Unterauftragnehmer.
2. Reicht das nicht, kannst du oder ein von dir beauftragter, zur Verschwiegenheit verpflichteter Prüfer uns nach Ankündigung mit angemessener Frist prüfen, ohne den Betrieb zu stören. Jede Seite trägt ihre eigenen Kosten.
3. Für die Haftung gilt Art. 82 DSGVO, im Übrigen der Abschnitt "Haftung" der AGB. Bei Widersprüchen geht dieser Vertrag den AGB vor.
