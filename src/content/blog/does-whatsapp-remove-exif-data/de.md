---
lang: de
slug: does-whatsapp-remove-exif-data
title: "Entfernt WhatsApp EXIF-Daten aus Fotos? Ja – aber mit einem Haken"
description: "WhatsApp entfernt EXIF und GPS beim Senden von Fotos, komprimiert Dateien aber auch und fügt eigene Spuren hinzu. Was WhatsApp behält, ändert und entfernt – und warum Sie vor dem Senden trotzdem bereinigen sollten."
published: 2026-09-01
faq:
  - question: "Entfernt WhatsApp GPS-Daten aus Fotos?"
    answer: "Beim normalen Senden komprimiert und kodiert WhatsApp Fotos neu und verwirft dabei die ursprünglichen EXIF- und GPS-Felder. Manche Formate und Kanäle verhalten sich anders – verifizieren Sie daher Ihre eigene Datei danach."
  - question: "Verändert WhatsApp die Qualität meiner Fotos?"
    answer: "Ja. Standard-Sendungen komprimieren Bilder und reduzieren Auflösung und Qualität. Das Senden als Dokument umgeht diese Komprimierung, umgeht aber auch die meiste Metadaten-Bereinigung."
  - question: "Sollte ich EXIF vor dem Senden eines Fotos bei WhatsApp entfernen?"
    answer: "Ja. Bereinigen vor dem Senden schützt die Kopien der Empfänger, die Datei in Ihrem eigenen Speicher und alle späteren Weiterleitungen. Es kostet nichts und deckt alle Empfänger auf einmal ab."
---

WhatsApp ist der Ort, an dem die meisten privaten Fotos reisen, und der Mythos lautet, dass es still und leise jede Spur von Metadaten entfernt. Die Wahrheit liegt näher an: WhatsApp entfernt beim Komprimieren einen Großteil des EXIF, aber es desinfiziert nicht wie ein Metadaten-Entferner, und manche Sendemodi tragen mehr als andere. Dieser Leitfaden erklärt genau, was WhatsApp behält, was es entfernt und was Sie vor dem Tippen auf „Senden" tun sollten.

## Was mit Ihrem Foto beim Senden passiert

Wenn Sie ein Foto auf dem normalen Weg senden, passieren mehrere Dinge gleichzeitig:

- **Komprimierung** – WhatsApp rekomprimiert Ihr Bild und verkleinert Auflösung und Dateigröße.
- **Neu-Kodierung** – das Bild wird neu aufgebaut, wobei die meisten Metadaten-Blöcke des Originals verworfen werden.
- **Server-Relay** – die Datei durchläuft WhatsApps Server auch bei privaten Chats (der Standardfall).

Das praktische Ergebnis: Der Empfänger kann das ursprüngliche EXIF oder GPS aus dem empfangenen Bild nicht lesen. Im üblichen Fall entfernt WhatsApp sie.

## Der Haken: nicht alles wird entfernt

WhatsApp ist kein Metadaten-Reiniger. Je nach Format und Sendemodus entstehen Lücken:

- **Als Dokument gesendet** – „Als Dokument senden" umgeht die Komprimierung, um die Qualität zu erhalten, und dieser direkte Weg kann die Originaldatei praktisch vollständig samt Metadaten übertragen.
- **Medien auf manchen Geräten** – ältere Android- und iOS-Speicherpfade haben historisch Dateien mit ihren ursprünglichen Metadaten in lokalen Speicher-Datenbanken und Cloud-Backups gespiegelt.
- **Plattform-Spuren** – WhatsApps eigener Container und Kontodaten betreffen Nachrichten-Metadaten (Absender, Zeit, Lesestatus), getrennt vom EXIF des Bildes, aber dennoch Teil der Reise der Datei.
- **Weitergeleitete Kopien** – jede Weiterleitung serviert erneut, was die Zwischenkopie trägt, sodass ein metadatenreicher Upload sich verbreiten kann.

„WhatsApp entfernt EXIF" ist also für den üblichen komprimierten Fall wahr und keine Garantie für jeden Pfad.

## Was der Empfänger tatsächlich erhält

Bei Standard-Sendungen erhält der Empfänger ein neu kodiertes Bild: reduzierte Auflösung, kein Original-EXIF, kein GPS. Er sieht die Pixel, die Bildunterschrift und den Plattform-Zeitstempel – nicht Ihre Kamera-Seriennummer oder Koordinaten. Bei Dokumenten erhält er näher an Ihrer Originaldatei, einschließlich der gesendeten Metadaten.

## Warum vor dem Senden trotzdem bereinigen

Die Abhängigkeit von WhatsApps Komprimierung hinterlässt fünf Lücken:

- **Ihre eigene Kopie** – die Datei im Medien-Speicher und in Backups Ihres Chats ist weiterhin das geotaggte Original.
- **Dokument-Sendungen** – in dem Moment, in dem Sie Qualität brauchen und „als Dokument senden" nutzen, reisen die Metadaten vollständig mit.
- **Weiterleitungen** – spätere Empfänger können reichhaltigere Kopien erhalten als der erste.
- **Andere Übertragungen** – dasselbe Foto reist wahrscheinlich irgendwo anders per E-Mail oder Cloud-Link.
- **Die Gewohnheit** – ein lokaler Bereinigungsschritt deckt alle Pfade gleichzeitig ab, ohne pro Sendung raten zu müssen.

Bereinigen dient nicht dazu, WhatsApp auszutricksen; es stellt sicher, dass jede Kopie eines Fotos, die Ihr Gerät verlässt, bereits sicher ist.

## So senden Sie ein Foto bei WhatsApp ohne Metadaten-Leak

1. **Datei prüfen** – mit dem [Foto-Metadaten-Checker](/de/view-photo-metadata) scannen und sehen, was sie trägt.
2. **Entfernen** – den [Foto-Metadaten-Entferner](/de/photo-metadata-remover#tool) ausführen, um eine saubere Kopie zu erzeugen. Alles läuft lokal; Ihr Original verlässt Ihr Gerät nie.
3. **Verifizieren** – die bereinigte Ausgabe erneut scannen und bestätigen, dass GPS-, Kamera- und Software-Felder verschwunden sind.
4. **Dann senden** – die saubere Kopie über jeden beliebigen Kanal teilen, auch im Dokument-Modus.

Sie verlieren nichts: Die Qualität steuert ohnehin WhatsApps Komprimierung, und eine saubere Datei lässt sich überall weiterleiten, per E-Mail versenden und hochladen.

## Das Fazit

WhatsApp komprimiert und kodiert Standard-Foto-Sendungen neu, wodurch im üblichen Fall das ursprüngliche EXIF und GPS entfernt werden – aber es ist kein Sanitizer. Dokument-Sendungen können die vollständigen Metadaten tragen, zwischengespeicherte Kopien bleiben auf Ihrem Gerät, und jede Weiterleitung hängt davon ab, was die Zwischendatei enthielt. Prüfen, im Browser entfernen, verifizieren, dann senden. Diese eine Gewohnheit schützt jedes Foto auf jeder Plattform, nicht nur in WhatsApp-Chats.

Bereit für sicheres Senden? [Metadaten Ihres Fotos prüfen](/de/view-photo-metadata) und [EXIF, GPS und versteckte Daten entfernen](/de/photo-metadata-remover#tool) in einem Durchgang.