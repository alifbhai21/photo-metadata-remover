---
lang: de
slug: how-to-check-photo-metadata
title: "Foto-Metadaten prüfen (EXIF, GPS und mehr)"
description: "Foto-Metadaten auf iPhone, Android, Windows und macOS prüfen – kostenlose Tools, Dateieigenschaften und ein Browser-Checker, der EXIF, GPS, Kamera und versteckte Felder sofort anzeigt."
published: 2026-08-29
faq:
  - question: "Wie sehe ich die Metadaten eines Fotos auf meinem Handy?"
    answer: "Das iPhone und einige Android-Galerien zeigen grundlegende Kamera- und Standortinformationen unter den Details des Fotos an. Für die vollständige EXIF-Ansicht Feld für Feld nutzen Sie einen browserbasierten Metadaten-Checker."
  - question: "Kann ich EXIF-Daten kostenlos online prüfen?"
    answer: "Ja. Kostenlose Online-Checker parsen EXIF, GPS, IPTC und XMP ohne Upload – alles wird aus den Bytes gelesen, die Sie in die Seite laden."
  - question: "Warum hat ein Foto gar keine Metadaten?"
    answer: "Die Datei wurde möglicherweise von einer App oder Plattform neu kodiert, bewusst entfernt oder von einer Software erzeugt, die kein EXIF schreibt. Ein leeres Ergebnis ist bei Screenshots, Web-Downloads und bearbeiteten Exporten üblich."
---

Bevor Sie ein Foto teilen, hilft es zu wissen, was darin versteckt ist. Metadaten können die Kamera, den Zeitpunkt und den Ort einer Aufnahme sowie die Software verraten, die die Datei berührt hat. Dieser Leitfaden zeigt, wie Sie Foto-Metadaten auf jedem wichtigen Gerät und jeder Plattform prüfen – und wie Sie das Gefundene lesen, damit Sie entscheiden können, was Sie behalten und was Sie entfernen.

## Der schnellste Weg: ein browserbasiertes Metadaten-Checker-Tool

Keine Installation, kein Upload – der [kostenlose Foto-Metadaten-Checker](/de/view-photo-metadata) auf dieser Seite liest die Datei in Ihrem Browser und listet jedes erkennbare Feld in Sekunden auf:

- **Kamera** – Hersteller, Modell, Objektiv, seriennummernabgeleitete Kennungen.
- **Aufnahme-Einstellungen** – Blende, Belichtungszeit, ISO, Brennweite.
- **Zeitstempel** – ursprüngliches Aufnahmedatum und -uhrzeit.
- **Standort** – GPS-Breitengrad und -Längengrad sowie Höhe, falls vorhanden.
- **Software-Historie** – Editoren und Prozessoren, die die Datei berührt haben.
- **Weitere Felder** – Ausrichtung, Thumbnail-Blöcke und formatspezifische Tags.

Da die Datei lokal geparst wird, können Sie Bilder prüfen, die Sie niemals an einen Dritten hochladen möchten.

## Metadaten unter Windows prüfen

1. Rechtsklick auf die Datei → **Eigenschaften**.
2. Tab **Details** öffnen – Kamera, Zeitstempel und (bei älteren oder standortaktivierten Dateien) GPS-Felder erscheinen hier.
3. Für die vollständige Feld-für-Feld-Ausgabe einen Browser-Checker nutzen; der Eigenschaften-Bereich ist eine Zusammenfassung, kein kompletter Dump.

## Metadaten unter macOS prüfen

1. Das Bild in **Vorschau** öffnen.
2. **Werkzeuge → Inspektor zeigen** und den Tab **Alle** wählen, um EXIF, Kamera und GPS-Werte zu sehen.
3. Für eine vollständige Abdeckung ungewöhnlicher Formate auf einen speziellen Checker zurückgreifen.

## Metadaten auf iPhone und iPad prüfen

- Öffnen Sie das Foto; in einigen iOS-Versionen über das Info-Bedienfeld oder das Info-Symbol Kamera, Auflösung und Standort anzeigen.
- Für die vollständige Liste die Datei an einen browserbasierten Checker senden – die eingebaute Ansicht fasst zusammen, gibt aber nicht jedes Feld aus.
- Denken Sie daran: Der „Ort" bei iOS-Fotos kann über das Standort-Symbol erscheinen, selbst wenn die Datei bereits bereinigt wurde.

## Metadaten unter Android prüfen

- **Google Fotos** – öffnen Sie ein Bild und wischen Sie nach oben oder tippen Sie auf Infos, um Kamera, Auflösung und Standorteinträge zu sehen.
- **Samsung Galerie** – nutzen Sie den Info/Details-Menüpunkt eines Fotos.
- **Stock-Android** – die meisten Galerien zeigen Dateieigenschaften; für die vollständige EXIF-Ausgabe einen Browser-Checker verwenden.

Galerie-Apps zeigen freundliche Zusammenfassungen; die zugrunde liegenden Felder und GPS-Koordinaten bestätigt am besten der vollständige Checker.

## Ergebnisse wie ein Profi lesen

Sobald die Felder auf dem Bildschirm sind, verdienen diese Ihre Aufmerksamkeit:

- **GPS-Koordinaten** – das Feld mit dem höchsten Risiko. Betrachter wissen exakt, wo Sie waren. Ist es vorhanden, leakt die Datei Ihre Position.
- **Kameramodell/-hersteller + Software** – grenzt ein, wer Sie sind (Ausrüstung und Bearbeitungs-Historie) und nährt Social Engineering.
- **Seriennummernabgeleitete Felder** – eindeutige IDs, die mit Ihrem konkreten Gerät verbunden sind.
- **Zeitstempel** – Präzision darüber, wann Sie wo waren, wirksam in Kombination mit dem Standort.
- **Thumbnails** – manche Dateien betten eine Vorschau ein, die den bereinigten Haupt-Block übersteht; nach dem Entfernen prüfen.

## Warum „keine Metadaten" trotzdem nützlich ist

Ein leeres Ergebnis ist kein Fehler. Es bedeutet, dass die Datei kein für den Parser erkennbares EXIF trägt – üblich bei Screenshots, Plattform-Downloads und stark bearbeiteten Exports. Das ist für die Privatheit ein gutes Ergebnis. Die Prüfung zählt trotzdem, weil sie sagt, dass eine Datei bereits sauber ist – genau das wollen Sie vor dem Teilen wissen.

## Vom Prüfen zum Handeln

Alles, was Sie aus der Prüfung lernen, sagt Ihnen, was als Nächstes zu tun ist:

- **Bereinigen** – wenn Kamera-, GPS- oder Software-Felder erscheinen, den [Foto-Metadaten-Entferner](/de/photo-metadata-remover#tool) nutzen, um eine saubere Kopie zu erzeugen.
- **Verifizieren** – nach dem Entfernen den Checker erneut über die Ausgabe laufen lassen und bestätigen, dass die Felder verschwunden sind.
- **Vor jeder Freigabe wiederholen** – eine 10-Sekunden-Prüfung nimmt das Rätseln über sämtliche Kanäle hinweg.

## Das Fazit

Foto-Metadaten zu prüfen ist schnell und kostenlos: Dateieigenschaften unter Windows, der Inspektor in Preview unter macOS, Detailfenster am Handy und eine vollständige Feld-für-Feld-Ausgabe durch einen browserbasierten Checker. Lesen Sie GPS-, Kamera- und Software-Felder kritisch, entfernen Sie, was nicht geteilt werden soll, und verifizieren Sie die bereinigte Datei vor dem Versand.

Beginnen Sie mit einem Scan: [Foto-Metadaten online prüfen](/de/view-photo-metadata) oder [EXIF und GPS jetzt entfernen](/de/photo-metadata-remover#tool).