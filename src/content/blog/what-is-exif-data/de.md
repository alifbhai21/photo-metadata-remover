---
lang: de
slug: what-is-exif-data
title: "Was sind EXIF-Daten? Fotos tragen einen versteckten Kamera-Bericht"
description: "EXIF ist der versteckte Bericht in jedem Foto: exakte Kamera, Objektiv, Einstellungen, Uhrzeit und GPS-Standort. Erfahren Sie, was EXIF speichert und warum es Ihre Privatsphäre gefährden kann."
published: 2026-08-18
faq:
  - question: "Wofür steht EXIF?"
    answer: "EXIF steht für Exchangeable Image File Format, ein Standard, den Kameras und Smartphones nutzen, um technische Informationen direkt in eine Bilddatei einzubetten."
  - question: "Wo werden EXIF-Daten gespeichert?"
    answer: "EXIF wird innerhalb der Bilddatei selbst als strukturierter Block aus Schlüssel-Wert-Feldern gespeichert, getrennt von den Pixeldaten. Es reist mit der Datei, wohin immer sie kopiert oder gesendet wird."
  - question: "Kann man EXIF-Daten bearbeiten oder entfernen?"
    answer: "Ja. EXIF kann entfernt werden, indem die Datei ohne den Metadaten-Block neu geschrieben wird – genau das macht ein Metadaten-Entferner. Bearbeitet werden kann es mit vielen Foto-Programmen."
---

Jedes Foto, das Sie aufnehmen, trägt einen geheimen Bericht über sich selbst. Neben den Pixeln speichert die Datei einen Datenblock namens **EXIF** – und er enthält weit mehr, als die meisten Menschen erwarten: das exakte Kameramodell, das Objektiv, Blende und Verschlusszeit, die Sekunde der Aufnahme und oft den genauen GPS-Standort. Dieser Leitfaden erklärt, was EXIF-Daten sind, was sie enthalten, wie Sie sie lesen und wie Sie sie aus Ihren Bildern entfernen.

## Was bedeutet EXIF?

EXIF steht für **Exchangeable Image File Format**. Es ist eine Spezifikation, mit der Kamerahersteller, Smartphone-Produzenten und Foto-Software technische und beschreibende Informationen in einer Bilddatei – meist JPEG oder TIFF – speichern.

Das Format wurde in den 1990er-Jahren eingeführt, damit Kameras und Drucker Informationen automatisch austauschen können. Heute ist es der Grund dafür, dass Ihre Foto-App Tausende von Bildern nach Datum, Kamera, Objektiv oder sogar GPS-Standort sortieren kann, ohne dass Sie auch nur ein Detail von Hand eingeben.

## Welche Informationen speichert EXIF wirklich?

EXIF ist eine Sammlung getaggter Felder. Ein typisches Foto moderner Kameras enthält viele der folgenden:

- **Kamera-Marke und -Modell** – die Marke und das exakte Gerät, etwa ein bestimmtes Smartphone-Modell oder ein Kameragehäuse.
- **Objektiv- und Brennweitendaten** – das Objektivmodell, die Brennweite und die Blende.
- **Belichtungsinformationen** – Verschlusszeit, ISO-Empfindlichkeit, Belichtungskorrektur und Messmethode.
- **Blitzdaten** – ob der Blitz ausgelöst wurde und in welchem Modus.
- **Datum und Uhrzeit** – die Aufnahmezeit, oft sekundengenau und manchmal inklusive Zeitzone.
- **GPS-Koordinaten** – Längen- und Breitengrad, bei aktivierter Ortung zusätzlich Höhe und Richtung.
- **Ausrichtung und Abmessungen** – wie die Kamera gehalten wurde sowie Bildbreite und -höhe.
- **Software-Tag** – die Anwendung, die die Datei erstellt oder zuletzt bearbeitet hat.
- **Vorschaubild** – eine kleine eingebettete Vorschau.

Einige Kameras ergänzen noch speziellere Felder wie Seriennummern von Objektiven, Fokusentfernung oder die Anzahl der Auslösungen.

## Warum EXIF für die Privatsphäre wichtig ist

Die beiden Felder, die die meisten Datenschutzbedenken auslösen, sind **GPS-Koordinaten** und **Zeitstempel**:

- Ein Foto aus Ihrem Wohnzimmer kann die Koordinaten Ihres Zuhauses enthalten – jeder mit Zugriff auf die Datei sieht, wo Sie wohnen.
- Zeitstempel ergänzen das „Wo" um ein „Wann", sodass jemand Gewohnheiten, Termine oder Reiseverhalten rekonstruieren kann.

Das ist kein theoretisches Risiko. Geteilte Fotobibliotheken, Online-Marktplätze und Foren entfernen EXIF aus genau diesem Grund routinemäßig, und Journalisten oder Aktivisten in sensiblen Situationen bemühen sich sehr, Standortdaten vor der Veröffentlichung zu löschen. Das Risiko ist real, aber verhältnismäßig: EXIF-Entfernung beseitigt eine bestimmte Offenlegungsebene und sollte mit sinnvollem Verhalten kombiniert werden (etwa keine Bilder zu veröffentlichen, deren Inhalt selbst auf Ihre Adresse schließen lässt).

## So sehen Sie EXIF-Daten

Sie brauchen kein Fachwissen, um EXIF zu lesen. Am schnellsten laden Sie das Foto in eine Ansicht, die alle Tags offenlegt. Auf dieser Seite listet die [kostenlose Foto-Metadaten-Prüfung](/de/view-photo-metadata) jedes erkennbare Feld in Sekunden auf – vollständig in Ihrem Browser.

Auf dem Smartphone versteckt die integrierte Galerie die meisten Tags, und auf dem Desktop zeigt das Betriebssystem nur Basisfelder wie Datum und Abmessungen. Eine eigene Ansicht ist der Unterschied zwischen einer Zusammenfassung und dem vollständigen Bericht.

## Warum EXIF Bearbeitungen übersteht

Viele gehen davon aus, dass die Bearbeitung eines Fotos dessen EXIF entfernt. Meistens stimmt das nicht. Zuschneiden, Drehen, Farbkorrektur und die Konvertierung zwischen gängigen Formaten wie JPEG und WebP bewahren die meisten ursprünglichen Tags, und der Editor fügt oft ein neues Software-Tag hinzu. Nur Vorgänge, die die Datei explizit ohne Metadaten neu aufbauen – etwa ein Metadaten-Entferner oder ein „bereinigter" Export – entfernen sie zuverlässig.

## So entfernen Sie EXIF-Daten

Das Entfernen ist einfach: Die Datei wird ohne den Metadaten-Block neu geschrieben. Der [kostenlose Foto-Metadaten-Entferner](/de/photo-metadata-remover#tool) erledigt das in wenigen Sekunden:

1. Öffnen Sie das Tool und laden Sie Ihr Foto – alles läuft lokal in Ihrem Browser.
2. Prüfen Sie die erkannten Felder, damit Sie wissen, was entfernt wird.
3. Laden Sie eine saubere Kopie ohne EXIF-, GPS- oder IPTC/XMP-Daten herunter.

Da die Verarbeitung auf Ihrem eigenen Gerät stattfindet, verlässt das Original Ihren Computer oder Ihr Smartphone nie – ganz ohne Upload.

## EXIF ist nur ein Teil der Geschichte

EXIF ist der bekannteste Metadaten-Block, aber nicht der einzige. **IPTC** enthält beschreibende Felder wie Schlagwörter und Urheberrechte, und **XMP** ist der moderne XML-Standard, in den viele Anwendungen heute schreiben – oft werden EXIF-Werte darin dupliziert. Ein gründlicher Entferner löscht alle drei, nicht nur den EXIF-Teil. Wie sich [IPTC von XMP unterscheidet](/de/blog/iptc-vs-xmp-metadata-explained), erklären wir ausführlich in unserem Leitfaden.

## Das Fazit

EXIF ist der versteckte Bericht, den Ihre Kamera zu jedem Foto schreibt – und er reist mit der Datei, wohin immer sie geht. Das meiste davon ist nützlich zum Sortieren, aber die GPS- und Zeitstempelfelder können Details preisgeben, die Sie nie teilen wollten. Vor dem Versenden zu prüfen, was ein Foto enthält, und bei sensiblen Inhalten die Metadaten zu entfernen, dauert Sekunden und gehört zu den wirksamsten Datenschutz-Gewohnheiten überhaupt.

Neugierig, was Ihre Fotos verbergen? [Jetzt ein Foto prüfen](/de/view-photo-metadata) oder direkt mit dem [Foto-Metadaten-Entferner](/de/photo-metadata-remover#tool) bereinigen.