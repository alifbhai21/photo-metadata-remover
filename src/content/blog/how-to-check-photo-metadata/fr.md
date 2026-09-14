---
lang: fr
slug: how-to-check-photo-metadata
title: "Comment vérifier les métadonnées d'une photo (EXIF, GPS et plus)"
description: "Vérifiez les métadonnées photo sur iPhone, Android, Windows et macOS – outils gratuits, propriétés du fichier et un vérificateur navigateur qui révèle EXIF, GPS, appareil et champs cachés instantanément."
published: 2026-08-29
faq:
  - question: "Comment voir les métadonnées d'une photo sur mon téléphone ?"
    answer: "L'iPhone et certaines galeries Android affichent les infos de base de l'appareil et de position dans le panneau de détails de la photo. Pour la vue complète champ par champ, utilisez un vérificateur basé navigateur."
  - question: "Puis-je vérifier les données EXIF en ligne gratuitement ?"
    answer: "Oui. Les vérificateurs en ligne gratuits analysent EXIF, GPS, IPTC et XMP sans téléverser votre fichier – tout est lu depuis les octets que vous chargez dans la page."
  - question: "Pourquoi une photo n'a-t-elle aucune métadonnée ?"
    answer: "Le fichier a pu être ré-encodé par une app ou une plateforme, dépouillé intentionnellement, ou créé par un logiciel qui n'écrit pas d'EXIF. Un résultat vide est courant pour les captures d'écran, les téléchargements web et les exports modifiés."
---

Avant de partager une photo, il est utile de savoir ce qui se cache dedans. Les métadonnées peuvent révéler l'appareil utilisé, quand et où une prise de vue a eu lieu, et le logiciel qui l'a touchée. Ce guide montre comment vérifier les métadonnées photo sur chaque grande plateforme et appareil – et comment lire ce que vous trouvez, afin de décider quoi garder et quoi supprimer.

## Le moyen le plus rapide : un vérificateur basé navigateur

Aucune installation, aucun téléversement – le [vérificateur de métadonnées photo gratuit](/fr/view-photo-metadata) de ce site lit le fichier dans votre navigateur et liste chaque champ détectable en quelques secondes :

- **Appareil** – marque, modèle, objectif, identifiants dérivés du numéro de série.
- **Réglages de prise de vue** – ouverture, vitesse, ISO, focale.
- **Horodatages** – date et heure de prise de vue d'origine.
- **Position** – latitude et longitude GPS ainsi que l'altitude, si présentes.
- **Historique du logiciel** – éditeurs et processeurs ayant touché le fichier.
- **Autres champs** – orientation, blocs de vignettes et balises spécifiques au format.

Comme le fichier est analysé localement, vous pouvez inspecter des images que vous ne voudriez jamais téléverser chez un tiers.

## Vérifier les métadonnées sous Windows

1. Clic droit sur le fichier → **Propriétés**.
2. Ouvrez l'onglet **Détails** – les champs appareil, horodatage et (avec les fichiers plus anciens ou activés pour la position) GPS s'affichent ici.
3. Pour la lecture complète champ par champ, utilisez un vérificateur navigateur ; le panneau Propriétés est un résumé, pas un dump complet.

## Vérifier les métadonnées sous macOS

1. Ouvrez l'image dans **Aperçu**.
2. Utilisez **Outils → Montrer l'inspecteur** et sélectionnez l'onglet **Tous** pour voir les valeurs EXIF, appareil et GPS.
3. Pour une couverture complète des formats inhabituels, reportez-vous à un vérificateur dédié.

## Vérifier les métadonnées sur iPhone et iPad

- Ouvrez la photo ; sur certaines versions d'iOS, balayez vers le panneau d'infos ou touchez l'icône d'infos pour voir appareil, résolution et position.
- Pour la liste complète, envoyez le fichier à un vérificateur basé navigateur – la vue intégrée résume mais ne détaille pas chaque champ.
- Rappelez-vous : le « où » des photos iOS peut apparaître via l'icône de position même lorsque le fichier a déjà été dépouillé.

## Vérifier les métadonnées sous Android

- **Google Photos** – ouvrez une image et balayez vers le haut ou touchez les infos pour voir appareil, résolution et entrées de position.
- **Galerie Samsung** – utilisez l'élément de menu infos/détails d'une photo.
- **Android stock** – la plupart des galeries exposent les propriétés du fichier ; pour la lecture EXIF complète, utilisez un vérificateur navigateur.

Les apps de galerie montrent des résumés conviviaux ; les champs sous-jacents et les coordonnées GPS se confirment au mieux avec le vérificateur complet.

## Lire les résultats comme un pro

Une fois les champs à l'écran, voici ceux qui méritent votre attention :

- **Coordonnées GPS** – le champ au plus haut risque. Les spectateurs savent exactement où vous étiez. S'il est présent, le fichier fuit votre position.
- **Marque/modèle d'appareil + logiciel** – précise qui vous êtes (matériel et historique d'édition) et nourrit l'ingénierie sociale.
- **Champs dérivés du numéro de série** – des identifiants uniques liés à votre appareil précis.
- **Horodatages** – de la précision sur quand vous étiez quelque part, efficace combinée à la position.
- **Vignettes** – certains fichiers intègrent un aperçu qui survit au retrait du bloc principal, à vérifier après nettoyage.

## Pourquoi « aucune métadonnée » reste utile

Un résultat vide n'est pas un échec. Cela signifie que le fichier ne porte pas d'EXIF détectable par l'analyseur – courant pour les captures d'écran, les téléchargements de plateformes et les exports très modifiés. C'est un bon résultat pour la confidentialité. Le contrôle compte quand même, car il vous dit qu'un fichier est déjà propre – exactement ce que vous voulez savoir avant de partager.

## Du contrôle à l'action

Tout ce que vous apprenez du contrôle vous dit quoi faire ensuite :

- **Nettoyez** – si des champs appareil, GPS ou logiciel apparaissent, utilisez le [suppresseur de métadonnées photo](/fr/photo-metadata-remover#tool) pour produire une copie propre.
- **Vérifiez** – après le retrait, relancez le vérificateur sur la sortie et confirmez la disparition des champs.
- **Répétez avant chaque partage** – un contrôle de 10 secondes élimine les conjectures sur tous vos canaux.

## L'essentiel

Vérifier les métadonnées photo est rapide et gratuit : propriétés du fichier sous Windows, inspecteur d'Aperçu sous macOS, panneaux de détails sur téléphone et lecture complète champ par champ avec un vérificateur basé navigateur. Lisez les champs GPS, appareil et logiciel de façon critique, supprimez ce qui ne doit pas être partagé et vérifiez le fichier nettoyé avant de l'envoyer où que ce soit.

Commencez par un scan : [vérifiez les métadonnées photo en ligne](/fr/view-photo-metadata) ou [supprimez EXIF et GPS maintenant](/fr/photo-metadata-remover#tool).