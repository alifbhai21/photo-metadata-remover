---
lang: en
slug: iptc-vs-xmp-metadata-explained
title: "IPTC vs XMP Metadata Explained: What's in Your Photo?"
description: "IPTC and XMP are two metadata standards hiding inside photos. Learn what each stores, how they overlap and differ, and why your remover should clear both."
published: 2026-09-04
faq:
  - question: "What is the difference between IPTC and XMP metadata?"
    answer: "IPTC started as press-photo captioning from the 1990s and stores fields like title, author, and rights. XMP is a newer XML-based standard that covers IPTC fields plus camera, software, and color data. Modern files can carry both, often duplicated."
  - question: "Do IPTC and XMP contain the same information in a photo?"
    answer: "They often overlap because XMP was designed to include IPTC fields, but files may hold them in different places with different values. A good remover clears both so nothing is left behind."
  - question: "Which metadata kind matters more for privacy removing?"
    answer: "EXIF matters most for privacy because it holds GPS, camera, and capture data. But IPTC and XMP can carry author credits, keywords, and software traces, so privacy cleaning should clear all three."
---

Scan any photo and you find multiple metadata standards bundled inside one file. Two of the most common are IPTC and XMP — and people routinely mix them up. This guide explains what each standard is, where they overlap, where they differ, and why your metadata cleaning should always cover both.

## Where metadata standards came from

Digital photos began carrying metadata in the 1990s, when newspapers needed to bundle captions and credit lines with press photos. The **IPTC** standard (Information Interchange Model from the International Press Telecommunications Council) shipped precisely for that: title, caption, author, byline, keywords, and copyright.

Later, **XMP** (Extensible Metadata Platform, designed by Adobe) arrived as an XML-based, more flexible successor. XMP can hold the same IPTC fields and much more — camera settings, software history, color profiles, and namespaces of any vendor.

## IPTC: the press-photo standard in fields

IPTC lives in a structured block inside the file and is organized into two main sections:

- **IIM (Information Interchange Model)** — the classic binary format with numeric tags.
- **IPTC Core** — the modern XML representation mapped onto the new standard.

Typical IPTC fields:

- **Title / headline** — the photo's label.
- **Caption / description** — editorial text about the image.
- **Creator / byline** — who photographed it.
- **Credit / source** — who holds the rights.
- **Keywords** — editorial search terms.
- **Copyright notice** — the rights statement.

Press agencies depend on IPTC for ingestion and caption workflows, and even phone-taken JPEGs can quietly receive IPTC data when edited on many platforms.

## XMP: the flexible XML-based standard

XMP stores metadata as XML in a packet inside the file, and it became the backbone of other ecosystems:

- **Camera:** NEF, CR2/CR3 (RAW) use XMP sidecars and embedded packets.
- **Adobe apps:** Photoshop, Lightroom, and others write XMP constantly.
- **Video and web:** XMP appears across MP4, PDF, and many other containers.

XMP covers vendor namespaces, so software like an editor or a "remover" records its version and history there — meaning screenshots and exports can carry the very tool that saved them.

## The overlap, and why both matter

The practical problem is duplication:

- A file can hold the **same** IPTC field in its classic IIM block **and** in the XMP block, with different values.
- A viewer may read one and ignore the other, so half of the "clean" data stays behind.
- IPTC Core was designed to map onto XMP, which makes the two standards overlap by design.

For a photo viewer, either source can be authoritative depending on the app. For a cleaner, that ambiguity means the safe move is to clear both standards rather than guessing which one the receiving service will read.

## IPTC vs XMP at a glance

| Aspect | IPTC | XMP |
| --- | --- | --- |
| Origin | Press photo captioning, 1990s | Adobe's XML successor, 2000s |
| Format | Binary IIM + IPTC Core | XML packet, extensible namespaces |
| Typical fields | Title, caption, byline, credit, rights | IPTC fields + camera, software, color |
| Who reads it | Newspapers, stock libraries | Adobe apps, RAW, video, PDF |
| Privacy relevance | Author, keywords, contact | Software history, vendor traces |

## Why EXIF still matters more than IPTC and XMP

All three standards sit in every modern photo, but they are not equally sensitive:

- **EXIF** holds GPS, camera model, timestamps, and lens data — the top privacy risk.
- **IPTC** can carry contact and author info for press workflows.
- **XMP** can record which tool saved the file and its processing history.

Privacy-wise, prioritize EXIF; for total cleaning, clear all three. The visual quality of the photo never changes when metadata is stripped.

## How to clear IPTC and XMP from your photos

You do not need to pick between standards when you clean. The [photo metadata remover](/en/photo-metadata-remover#tool) strips EXIF, IPTC, and XMP in a single local pass:

1. Load the photo — it is processed entirely in your browser.
2. Confirm the removed fields with the [photo metadata checker](/en/view-photo-metadata) before and after.
3. Download the clean copy and share it anywhere.

Everything runs on your device, so even rights-bearing press files stay where they belong.

## The bottom line

IPTC is the press-photo standard that stores captions, bylines, and rights; XMP is Adobe's XML successor that covers IPTC fields plus camera, software, and color data. Modern photos carry both — often duplicated — so a cleaner that touches only one standard leaves the other behind. Clear EXIF, IPTC, and XMP together, and your photos carry exactly what you want them to carry: nothing.

Clean every metadata standard at once: [remove EXIF, GPS, IPTC, and XMP](/en/photo-metadata-remover#tool).