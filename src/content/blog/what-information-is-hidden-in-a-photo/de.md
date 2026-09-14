---
lang: de
slug: what-information-is-hidden-in-a-photo
title: "Welche Informationen stecken versteckt in einem Foto? Der komplette Überblick"
description: "Fotos verbergen mehr als Pixel – EXIF, GPS, IPTC, XMP, Thumbnails und Software-Spuren. Jedes Feld, was es über Sie verrät und was Sie vor dem Teilen entfernen sollten."
published: 2026-08-31
faq:
  - question: "Welche Daten in einem Foto sind am sensibelsten?"
    answer: "GPS-Koordinaten sind das Feld mit dem höchsten Risiko, weil sie festnageln, wo Sie zum Zeitpunkt der Aufnahme waren. Seriennummernabgeleitete Kamera-Kennungen und der ursprüngliche Zeitstempel folgen dicht dahinter."
  - question: "Tragen bearbeitete Fotos noch versteckte Daten?"
    answer: "Oft ja. Editoren behalten meist EXIF- und GPS-Blöcke, schreiben Software-Felder neu und können neue Thumbnails einbetten. Nur ein vollständiges Entfernen mit anschließender Gegenprüfung garantiert eine saubere Datei."
  - question: "Welche Metadaten bleiben nach dem Entfernen von EXIF?"
    answer: "Andere Container wie XMP, IPTC, PNG-Textabschnitte und eingebettete Thumbnails können überleben. Ein gründlicher Checker und ein vollständiges Entfernen decken diese ab und nicht nur den Haupt-EXIF-Block."
---

Jedes Foto besteht aus zwei Dateien: den sichtbaren Pixeln und den unsichtbaren Metadaten. In den Bytes verstecken sich die Kamera, die die Aufnahme gemacht hat, der exakte Moment der Aufnahme, die Koordinaten des Ortes, an dem Sie standen, und die Kette von Software, die das Ergebnis bearbeitet hat. Dieser Leitfaden schlüsselt jede Kategorie versteckter Daten auf – was jedes Feld ist, was es verrät und was es für Ihre Privatsphäre bedeutet.

## EXIF: die technische Aufzeichnung

EXIF (Exchangeable Image File) ist der größte Block versteckter Daten und wird von der Kamera im Moment der Aufnahme geschrieben.

- **Kamera-Identität** – Hersteller, Modell und (in manchen Dateien) seriennummernabgeleitete Kennungen, die für Ihr Gerät einzigartig sind.
- **Aufnahme-Einstellungen** – Blende, Belichtungszeit, ISO, Belichtungskorrektur, Brennweite und Messmodus.
- **Zeitstempel** – das exakte Datum und die Uhrzeit der Aufnahme.
- **Objektiv- und Blitzdaten** – welches Glas Sie nutzten und ob der Blitz auslöste.
- **Ausrichtung und Farbinformationen** – wie das Bild angezeigt werden soll und seine Farbmatrix.

Wer EXIF liest, kann oft Ihre exakte Kamera, Ihre Bearbeitungs-Historie und den genauen Zeitpunkt des Auslösens erkennen.

## GPS: wo Sie waren

GPS-Felder speichern die Koordinaten, die Ihr Telefon oder der Kamera-Auslöser aufgezeichnet hat.

- **Breitengrad und Längengrad** – präzise bis auf wenige Meter zu dem Ort, an dem Sie standen.
- **Höhe und Kurs** – wie hoch Sie waren und in welche Richtung Sie sich bewegten.
- **Geotags in Plattform-Kopien** – manche Apps fügen „Wo waren Sie"-Label wieder hinzu, die neben den Rohfeldern stehen.

Koordinaten allein sind ein Punkt. Kombiniert mit dem Zeitstempel platzieren Sie Sie zu einem bestimmten Zeitpunkt an einem bestimmten Ort.

## IPTC und XMP: redaktionelle und Workflow-Daten

IPTC und XMP sind zweite Container, die von Fotografen, Editoren und Content-Plattformen genutzt werden.

- **IPTC** – Überschrift, Bildunterschrift, Urheber, Copyright, Schlüsselwörter und Ortsfelder, die von Menschen eingetragen wurden.
- **XMP** – der moderne Standard, der äquivalente Felder plus Workflow-Status, Bearbeitungs-Historie und Bewertung trägt.
- **Urheberrechte** – Namen, E-Mails und Agentur-Kontaktdaten sind hier üblich.

Bei privaten Fotos sind diese Felder meist leer, aber eine kopierte Vorlage oder eine Bearbeitungs-Suite kann sie ohne Ihr Wissen füllen.

## Software-Spuren und Thumbnails

Die versteckten Daten enden nicht bei den registrierten Feldern.

- **Software-Tags** – jeder Editor schreibt Namen und Version; der neueste gewinnt meist, aber die Historie bleibt oft lesbar.
- **Eingebettete Thumbnails** – eine kleine Vorschau im Dateiinneren (etwa in EXIF-Unterblöcken), die in manchen Werkzeugen überlebt, wenn das Hauptbild bereinigt wird.
- **Versteckte Vorschauen in proprietären Formaten** – RAW, HEIC und PNG können zusätzliche Strukturen jenseits des sichtbaren Rahmens tragen.

Diese Spuren verraten einem Betrachter, welche Programme Sie nutzten, und können eine Teilbereinigung überleben.

## Warum versteckte Daten für Sie wichtig sind

Jede Kategorie ist nützlich – und jede ist in falschen Händen ein Risiko:

- **Identität** – seriennummernabgeleitete Kamera-Felder und Software-Tags grenzen ein, wer Sie sind.
- **Körperliche Sicherheit** – GPS plus Zeitstempel verraten Routinen, Wohnorte und Arbeitsplätze.
- **Social Engineering** – die Bearbeitungs-Historie ist perfektes Material für gezielte Manipulation.
- **Unerwartete Offenlegung** – Metadaten reisen still in jeder E-Mail, jedem Forenbeitrag und jeder Marktplatz-Anzeige mit.

Das Risiko ist nicht, dass ein einzelnes Feld gefährlich ist; es ist die Kombination aus Ort, Zeit, Identität und Verhalten in einer einzigen kleinen Datei.

## So finden Sie heraus, was in einem Foto steckt

1. **Scannen** – den [Foto-Metadaten-Checker](/de/view-photo-metadata) ausführen und die Feld-für-Feld-Ausgabe lesen.
2. **Entscheiden** – trennen, was Sie behalten wollen (üblicherweise nichts) von dem, was weg muss.
3. **Entfernen** – den [Foto-Metadaten-Entferner](/de/photo-metadata-remover#tool) nutzen, um EXIF, GPS, IPTC, XMP und eingebettete Vorschauen zu entfernen.
4. **Erneut scannen** – die bereinigte Kopie verifizieren, bevor sie irgendwohin geht.

Alles läuft lokal in Ihrem Browser; Ihre Originale verlassen Ihr Gerät nie.

## Das Fazit

In einem Foto verstecken sich die Kamera und ihr Einstellungsprofil, der exakte Aufnahmezeitpunkt, Ihre Koordinaten, redaktionelle Namen, Software-Historie und eingebettete Vorschauen. Techniker nutzen diese Felder, um Dateien zu organisieren und zu verifizieren; Fremde nutzen sie, um herauszufinden, wer Sie sind und wo Sie wohnen. Scannen Sie Ihre Dateien, entfernen Sie die Felder und verifizieren Sie das Ergebnis – genauso, wie Sie ein Tor vor dem Verlassen prüfen würden.

Sehen Sie exakt, was Ihre Dateien tragen: [Foto-Metadaten prüfen](/de/view-photo-metadata), dann [EXIF, GPS und versteckte Daten entfernen](/de/photo-metadata-remover#tool).