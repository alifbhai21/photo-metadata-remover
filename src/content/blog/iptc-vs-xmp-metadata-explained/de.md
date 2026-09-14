---
lang: de
slug: iptc-vs-xmp-metadata-explained
title: "IPTC vs XMP-Metadaten erklärt: Was steckt in Ihrem Foto?"
description: "IPTC und XMP sind zwei Metadaten-Standards in Fotos. Erfahren Sie, was jeder speichert, wie sie sich überlappen und unterscheiden und warum Ihr Entferner beide bereinigen sollte."
published: 2026-09-04
faq:
  - question: "Was ist der Unterschied zwischen IPTC- und XMP-Metadaten?"
    answer: "IPTC begann als Bildunterschriften-Standard für Pressefotos aus den 1990ern und speichert Felder wie Titel, Autor und Rechte. XMP ist ein neuerer XML-basierter Standard, der IPTC-Felder plus Kamera-, Software- und Farbdaten abdeckt. Moderne Dateien können beide tragen, oft dupliziert."
  - question: "Enthalten IPTC und XMP dieselben Informationen in einem Foto?"
    answer: "Sie überlappen sich oft, weil XMP dafür entworfen wurde, IPTC-Felder zu enthalten, aber Dateien können sie an unterschiedlichen Stellen mit unterschiedlichen Werten halten. Ein guter Entferner bereinigt beide, damit nichts zurückbleibt."
  - question: "Welche Metadaten-Art ist für den Datenschutz beim Entfernen wichtiger?"
    answer: "EXIF ist für den Datenschutz am wichtigsten, weil es GPS, Kamera und Aufnahmedaten hält. Aber IPTC und XMP können Autor-Credits, Stichwörter und Software-Spuren tragen, daher sollte die Datenschutz-Bereinigung alle drei abdecken."
---

Wenn Sie ein Foto scannen, finden Sie mehrere Metadaten-Standards in einer einzigen Datei. Zwei der häufigsten sind IPTC und XMP – und Menschen verwechseln sie regelmäßig. Dieser Leitfaden erklärt, was jeder Standard ist, wo sie sich überlappen, wo sie sich unterscheiden und warum Ihre Metadaten-Bereinigung immer beide abdecken sollte.

## Woher Metadaten-Standards kommen

Digitale Fotos begannen in den 1990ern, Metadaten zu tragen, als Zeitungen Bildunterschriften und Credits mit Pressefotos bündeln mussten. Der **IPTC**-Standard (Information Interchange Model des International Press Telecommunications Council) diente genau dafür: Titel, Bildunterschrift, Autor, Bylines, Stichwörter und Urheberrecht.

Später kam **XMP** (Extensible Metadata Platform, von Adobe entworfen) als XML-basierter, flexiblerer Nachfolger. XMP kann dieselben IPTC-Felder und viel mehr halten – Kamera-Einstellungen, Software-Historie, Farbprofile und Namespaces beliebiger Hersteller.

## IPTC: der Pressefoto-Standard in Feldern

IPTC lebt in einem strukturierten Block in der Datei und ist in zwei Hauptabschnitte organisiert:

- **IIM (Information Interchange Model)** – das klassische Binärformat mit numerischen Tags.
- **IPTC Core** – die moderne XML-Darstellung, auf den neuen Standard abgebildet.

Typische IPTC-Felder:

- **Titel / Überschrift** – das Label des Fotos.
- **Bildunterschrift / Beschreibung** – redaktioneller Text zum Bild.
- **Ersteller / Byline** – wer fotografiert hat.
- **Credit / Quelle** – wer die Rechte hält.
- **Stichwörter** – redaktionelle Suchbegriffe.
- **Urheberrechtshinweis** – die Rechte-Aussage.

Presseagenturen hängen an IPTC für Ingestion und Bildunterschriften-Workflows, und selbst mit dem Handy aufgenommene JPEGs können bei Bearbeitung auf vielen Plattformen still IPTC-Daten erhalten.

## XMP: der flexible XML-basierte Standard

XMP speichert Metadaten als XML in einem Paket innerhalb der Datei und wurde zum Rückgrat anderer Ökosysteme:

- **Kamera:** NEF, CR2/CR3 (RAW) nutzen XMP-Sidecars und eingebettete Pakete.
- **Adobe-Apps:** Photoshop, Lightroom und andere schreiben ständig XMP.
- **Video und Web:** XMP erscheint in MP4, PDF und vielen anderen Containern.

XMP deckt Hersteller-Namespaces ab, sodass Software wie ein Editor oder ein „Entferner" dort seine Version und Historie aufzeichnet – Screenshots und Exporte können also genau das Werkzeug tragen, das sie gespeichert hat.

## Die Überlappung und warum beide wichtig sind

Das praktische Problem ist Duplikation:

- Eine Datei kann dasselbe **IPTC**-Feld im klassischen IIM-Block **und** im XMP-Block mit unterschiedlichen Werten halten.
- Ein Betrachter kann das eine lesen und das andere ignorieren, sodass die Hälfte der „sauberen" Daten zurückbleibt.
- IPTC Core wurde entworfen, um auf XMP abgebildet zu werden, wodurch sich beide Standards von Design her überlappen.

Für einen Foto-Betrachter kann je nach App jede Quelle maßgeblich sein. Für einen Bereiniger bedeutet diese Mehrdeutigkeit, dass der sichere Weg darin besteht, beide Standards zu bereinigen, statt zu raten, welche der empfangende Dienst liest.

## IPTC vs XMP im Überblick

| Aspekt | IPTC | XMP |
| --- | --- | --- |
| Herkunft | Pressefoto-Bildunterschriften, 1990er | Adobes XML-Nachfolger, 2000er |
| Format | Binäres IIM + IPTC Core | XML-Paket, erweiterbare Namespaces |
| Typische Felder | Titel, Bildunterschrift, Byline, Credit, Rechte | IPTC-Felder + Kamera, Software, Farbe |
| Wer liest es | Zeitungen, Bildarchive | Adobe-Apps, RAW, Video, PDF |
| Datenschutz-Relevanz | Autor, Stichwörter, Kontakt | Software-Historie, Hersteller-Spuren |

## Warum EXIF weiterhin wichtiger ist als IPTC und XMP

Alle drei Standards sitzen in jedem modernen Foto, aber sie sind nicht gleich sensibel:

- **EXIF** hält GPS, Kameramodell, Zeitstempel und Objektivdaten – das größte Datenschutzrisiko.
- **IPTC** kann Kontakt- und Autoreninformationen für Presse-Workflows tragen.
- **XMP** kann aufzeichnen, welches Tool die Datei gespeichert hat, und ihre Verarbeitungshistorie.

Datenschutzlich: EXIF priorisieren. Für totale Bereinigung: alle drei löschen. Die visuelle Qualität des Fotos ändert sich beim Entfernen von Metadaten nie.

## Wie Sie IPTC und XMP aus Ihren Fotos entfernen

Sie müssen beim Bereinigen nicht zwischen Standards wählen. Der [Foto-Metadaten-Entferner](/de/photo-metadata-remover#tool) entfernt EXIF, IPTC und XMP in einem einzigen lokalen Durchgang:

1. Das Foto laden – es wird vollständig in Ihrem Browser verarbeitet.
2. Die entfernten Felder vorher und nachher mit dem [Foto-Metadaten-Checker](/de/view-photo-metadata) bestätigen.
3. Die saubere Kopie herunterladen und überall teilen.

Alles läuft auf Ihrem Gerät, sodass selbst rechtebelastete Presse-Dateien bleiben, wo sie hingehören.

## Das Fazit

IPTC ist der Pressefoto-Standard, der Bildunterschriften, Bylines und Rechte speichert; XMP ist Adobes XML-Nachfolger, der IPTC-Felder plus Kamera-, Software- und Farbdaten abdeckt. Moderne Fotos tragen beide – oft dupliziert – sodass ein Bereiniger, der nur einen Standard anfasst, den anderen zurücklässt. EXIF, IPTC und XMP zusammen bereinigen, und Ihre Fotos tragen genau das, was sie tragen sollen: nichts.

Alle Metadaten-Standards auf einmal bereinigen: [EXIF, GPS, IPTC und XMP entfernen](/de/photo-metadata-remover#tool).