---
lang: en
slug: how-to-check-photo-metadata
title: "How to Check Photo Metadata (EXIF, GPS, and More)"
description: "Check photo metadata on iPhone, Android, Windows, and macOS — free tools, file properties, and a browser checker that reveals EXIF, GPS, camera, and hidden fields instantly."
published: 2026-08-29
faq:
  - question: "How can I see the metadata of a photo on my phone?"
    answer: "iPhone and some Android galleries show basic camera and location info under the photo's details or info pane. For the full EXIF field-by-field view, use a browser-based metadata checker."
  - question: "Can I check EXIF data online for free?"
    answer: "Yes. Free online checkers parse EXIF, GPS, IPTC, and XMP without uploading your file — everything is read from the bytes you load into the page."
  - question: "Why does a photo have no metadata at all?"
    answer: "The file may have been re-encoded by an app or platform, stripped on purpose, or created by software that writes no EXIF. An empty result is common for screenshots, web downloads, and edited exports."
---

Before you share a photo, it helps to know what is hidden inside it. Metadata can reveal the camera you used, when and where a shot was taken, and the software that touched it. This guide shows how to check photo metadata on every major device and platform — and how to read what you find, so you can decide what to keep and what to strip.

## The fastest way: a browser-based metadata checker

No install, no upload — the free [photo metadata checker](/en/view-photo-metadata) on this site reads the file in your browser and lists every detectable field in seconds:

- **Camera** — make, model, lens, serial-derived identifiers.
- **Capture settings** — aperture, shutter speed, ISO, focal length.
- **Timestamps** — original capture date and time.
- **Location** — GPS latitude and longitude plus altitude, when present.
- **Software history** — editors and processors that touched the file.
- **Other fields** — orientation, thumbnail blocks, and format-specific tags.

Because the file is parsed locally, you can inspect images you would never want to upload to a third party.

## Checking metadata on Windows

1. Right-click the file → **Properties**.
2. Open the **Details** tab — camera, timestamp, and (with older or location-enabled files) GPS fields show here.
3. For the full field-by-field readout, use a browser checker; the Properties pane is a summary, not a complete dump.

## Checking metadata on macOS

1. Open the image in **Preview**.
2. Use **Tools → Show Inspector** and select the **All** tab to see EXIF, camera, and GPS values.
3. For complete coverage of unusual formats, fall back to a dedicated checker.

## Checking metadata on iPhone and iPad

- Open the photo, and on some iOS versions swipe to the info panel or tap the info icon to see camera, resolution, and location.
- For the complete list, send the file to a browser-based checker — the built-in view summarizes but does not dump every field.
- Remember the "where" on iOS photos can appear via the location icon even when the file itself was already stripped.

## Checking metadata on Android

- **Google Photos** — open an image and swipe up or tap info to see camera, resolution, and location entries.
- **Samsung Gallery** — use the info/details menu item on a photo.
- **Stock Android** — most galleries expose file properties; for the full EXIF readout, use a browser checker.

Gallery apps show friendly summaries; the underlying fields and GPS coordinates are best confirmed with the full checker.

## Reading the results like a pro

Once the fields are on screen, these are the ones worth your attention:

- **GPS coordinates** — the highest-risk field. Viewers know exactly where you were. If present, the file leaks your position.
- **Camera make/model + software** — narrows who you are (your gear and editing history) and feeds social engineering.
- **Serial-derived fields** — unique identifiers tied to your specific device.
- **Timestamps** — precision about when you were somewhere, useful in combination with location.
- **Thumbnails** — some files embed a preview that follows clearing the main block, worth verifying after stripping.

## Why 'no metadata' can still be useful

An empty result is not a failure. It means the file carries no EXIF the parser can see — common for screenshots, platform downloads, and heavily processed edits. That is a good outcome for privacy. The check still matters because it tells you a file is already clean, which is exactly what you want to know before sharing.

## From checking to acting

Everything you learn from the check tells you what to do next:

- **Clean** — if camera, GPS, or software fields appear, run the [photo metadata remover](/en/photo-metadata-remover#tool) to produce a clean copy.
- **Verify** — after stripping, re-run the checker on the output and confirm the fields are gone.
- **Repeat before every share** — a 10-second check removes the guesswork across all your channels.

## The bottom line

Checking photo metadata is quick and free: file properties on Windows, Preview's inspector on macOS, detail panels on phones, and a full field-by-field readout from a browser-based checker. Read the GPS, camera, and software fields critically, strip what should not be shared, and verify the cleaned file before you send it anywhere.

Start with a scan: [check photo metadata online](/en/view-photo-metadata) or [remove EXIF and GPS now](/en/photo-metadata-remover#tool).