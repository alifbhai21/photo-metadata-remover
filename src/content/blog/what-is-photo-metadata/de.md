---
lang: de
slug: what-is-photo-metadata
title: "Was sind Foto-Metadaten? Der vollständige Leitfaden zu versteckten Bilddaten"
description: "Foto-Metadaten sind die versteckten Daten in jedem Bild: Kameraeinstellungen, Zeitstempel, Software und oft GPS-Koordinaten. Erfahren Sie, was sie sind, wie sie leaken und wie Sie sie entfernen."
published: 2026-08-15
faq:
  - question: "Welche drei Hauptarten von Foto-Metadaten gibt es?"
    answer: "Die drei Hauptarten sind EXIF (Kamera-, Objektiv- und Einstellungsdaten), IPTC (beschreibende Daten wie Schlagwörter und Bildunterschriften) und XMP (der neuere Adobe-XML-Standard, der oft beides kombiniert). Ein guter Metadaten-Entferner bereinigt alle drei Blöcke auf einmal."
  - question: "Sind Foto-Metadaten im Bild selbst sichtbar?"
    answer: "Nein. Metadaten werden als Block versteckter Daten im Dateiformat gespeichert, getrennt von den Pixeln. Im Bild selbst sind sie nicht sichtbar – genau deshalb wissen viele Menschen nicht, dass sie existieren."
  - question: "Verändert das Entfernen von Metadaten die Bildqualität?"
    answer: "Nein. Beim Entfernen werden nur die versteckten Datenblöcke gelöscht. Pixel, Auflösung und Farben Ihres Fotos bleiben exakt erhalten."
---

Jedes digitale Foto ist eigentlich zwei Dateien in einer. Die erste ist das Bild, das Sie sehen: Pixel, Farben und Komposition. Die zweite ist ein Block versteckter Daten – die sogenannten **Foto-Metadaten** –, der technische Informationen darüber speichert, wie, wann und oft auch wo das Bild aufgenommen wurde. Diese Daten sind im Bild selbst unsichtbar, stecken aber in jedem Foto, das Sie aufnehmen – und oft auch in jedem Foto, das Sie erhalten.

Dieser Leitfaden erklärt, was Foto-Metadaten sind, welche Arten es gibt, welche Informationen sie preisgeben können und wie Sie Ihre Bilder vor dem Teilen bereinigen.

## Was sind Foto-Metadaten?

Foto-Metadaten sind strukturierte Informationen, die in eine Bilddatei eingebettet sind. Wenn eine Kamera oder ein Smartphone ein Bild aufnimmt, schreibt sie eine Reihe von Feldern neben die Pixeldaten: Hersteller und Modell der Kamera, Belichtungseinstellungen, Datum und Uhrzeit sowie in vielen Fällen die GPS-Koordinaten der Aufnahme.

Da diese Daten in der Datei gespeichert sind, reisen sie mit dem Bild, wohin es auch geht. Eine Datei umzubenennen, in einen neuen Ordner zu verschieben oder als Anhang zu versenden, entfernt diese Daten nicht.

## Die drei Hauptarten von Foto-Metadaten

Drei Standards decken den Großteil der Metadaten ab, die in modernen Fotos zu finden sind:

- **EXIF** – das Exchangeable Image File Format. Dieser Block enthält Kamera- und technische Daten: Hersteller, Modell, Objektiv, Blende, Verschlusszeit, ISO, Brennweite, Ausrichtung, Blitz und Zeitstempel.
- **IPTC** – ursprünglich für Nachrichtenagenturen entwickelt, speichert dieser Standard beschreibende Informationen wie Bildunterschriften, Schlagwörter, Autoren und Urheberrechte.
- **XMP** – die Extensible Metadata Platform, ein von Adobe geschaffener XML-Standard, der heute in vielen Anwendungen verwendet wird. Er kann technische und beschreibende Felder vereinen und ist häufig der Container, in den moderne Editoren Daten schreiben.

Mit „Foto-Metadaten" ist üblicherweise die Kombination aller drei gemeint.

## Welche Informationen stecken in einem Foto?

Die genauen Felder hängen von Gerät und Software ab, aber ein typisches Foto enthält einige oder alle der folgenden:

- **Kamera-Marke und -Modell** – das konkrete Gerät der Aufnahme.
- **Objektivdetails** – Brennweite, Blende und bei Wechselobjektiven das Objektivmodell.
- **Belichtungseinstellungen** – Verschlusszeit, ISO und Messmethode.
- **Datum und Uhrzeit** – oft sekundengenau.
- **GPS-Koordinaten** – Längen- und Breitengrad, gespeichert wenn Ortungsdienste aktiv sind.
- **Ausrichtung** – wie die Kamera gehalten wurde, damit das Bild richtig angezeigt wird.
- **Software und Bearbeitungshistorie** – die Anwendung, die die Datei erstellt oder verändert hat, manchmal inklusive Profil oder Benutzername.
- **Eingebettetes Vorschaubild** – eine kleine Vorschau in der Datei, die bestimmte Bearbeitungen übersteht.

Nichts davon ist auf dem Bildschirm sichtbar – deshalb merken die meisten Menschen nicht, dass es existiert.

## Wie gelangen Metadaten in ein Foto?

Kameras und Smartphones fügen Metadaten automatisch im Moment der Aufnahme hinzu. Ortsdaten erscheinen nur, wenn die Kamera-App Zugriff auf GPS hat; der Rest – Modell, Einstellungen, Zeitstempel – wird bei jeder Aufnahme von selbst geschrieben.

Bildbearbeitungssoftware kann diese Blöcke anschließend neu schreiben oder erweitern. Zuschneiden, Farbkorrektur und Formatkonvertierung bewahren typischerweise den Großteil der ursprünglichen Metadaten und fügen einen eigenen Eintrag für die verwendete Software hinzu. Manche Anwendungen hinterlegen sogar eine Kopie des Besitzernamens in den Metadaten bearbeiteter Dateien.

## Warum Foto-Metadaten für die Privatsphäre wichtig sind

Die meisten Metadaten sind harmlos, aber zwei Felder verdienen besondere Aufmerksamkeit: **GPS-Koordinaten** und **Zeitstempel**.

Wenn Sie zu Hause ein Foto aufnehmen und die unbearbeitete Datei teilen, können die eingebetteten Koordinaten direkt auf Ihre Adresse zeigen. Zeitstempel verraten, *wann* Sie dort waren. Zusammen offenbaren sie viel über Ihren Tagesablauf und erleichtern gezielte Social-Engineering-Angriffe. Genau deshalb empfehlen sicherheitsbewusste Fotografen und Datenschutzleitfäden fast immer, Metadaten vor der Veröffentlichung zu bereinigen.

Wichtig ist eine präzise Einordnung des Risikos: Das Entfernen reduziert Offenlegung, macht Sie aber allein noch nicht anonym. Plattformen, auf die Sie hochladen, können eigene Metadaten ergänzen, und andere Hinweise im Bild selbst können dennoch auf den Ort schließen lassen. Behandeln Sie Metadaten-Entfernung als eine Schicht der Datenschutz-Hygiene, nicht als magische Garantie.

## Wann werden Metadaten automatisch entfernt?

Manche Kanäle entfernen Metadaten für Sie, viele tun es nicht:

- **Messenger-Apps** – das Verhalten variiert. Manche löschen EXIF, andere behalten es, bis Sie eine „komprimierte" Kopie verschicken. Gehen Sie niemals davon aus.
- **Soziale Plattformen** – die meisten kodieren Uploads neu und verwerfen dabei meist den EXIF-/GPS-Block, aber die sichere Annahme ist, dass nichts garantiert ist.
- **E-Mail und Dateiübertragung** – das Versenden der Originaldatei bewahrt alles.
- **Screenshots** – ein Screenshot enthält keine Kamera-Metadaten der Quelle, nur die Daten des eigenen Bildschirms.

Da das Verhalten so stark variiert, ist der zuverlässige Weg, die Metadaten selbst zu entfernen, bevor Sie die Datei irgendwohin senden.

## So prüfen Sie, was Ihr Foto enthält

Bevor Sie teilen, dauert es nur Sekunden, um zu sehen, was in der Datei steckt:

1. Öffnen Sie die Datei in einer Metadaten-Ansicht – die [kostenlose Metadaten-Prüfung](/de/view-photo-metadata) erreichen Sie direkt von dieser Seite aus.
2. Prüfen Sie die erkannten Felder: Kamera, Software, Zeitstempel und etwaige GPS-Koordinaten.
3. Entscheiden Sie, ob Sie die Datei unverändert teilen oder zuerst bereinigen.

## So entfernen Sie Foto-Metadaten

Die zuverlässigste Methode ist, die Datei ohne die versteckten Blöcke neu zu schreiben. Der kostenlose [Foto-Metadaten-Entferner](/de/photo-metadata-remover#tool) erledigt genau das – vollständig in Ihrem Browser:

1. Laden Sie Ihr Foto in das Tool.
2. Prüfen Sie die Scan-Ergebnisse, um zu bestätigen, was entfernt wird.
3. Laden Sie eine saubere Kopie ohne EXIF-, GPS- oder XMP-Daten herunter.

Ihre Bilder werden lokal auf Ihrem Gerät verarbeitet und nie an einen Server übertragen – das Original verlässt Ihren Computer oder Ihr Smartphone nie.

## Das Fazit

Foto-Metadaten sind ein verstecktes Protokoll darüber, wie, wann und wo jedes Bild entstanden ist. Das meiste davon ist nützlich, doch die Orts- und Zeitstempelfelder können lautlos mehr preisgeben, als Sie beabsichtigen. Zu wissen, was in Ihren Fotos steckt – und sie vor dem Teilen zu bereinigen – ist eine der einfachsten und wirksamsten Datenschutz-Gewohnheiten überhaupt.

Bereit, ein Bild zu bereinigen? [Öffnen Sie den kostenlosen Foto-Metadaten-Entferner](/de/photo-metadata-remover#tool).