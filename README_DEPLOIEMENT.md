# Pilote Mobile — guide de déploiement et d'utilisation

Application financière personnelle (PWA) pour iPhone. 100 % locale : vos relevés et
transactions ne quittent jamais votre appareil — le site n'héberge que le code.

## Mise en ligne sur GitHub Pages (une fois, ~15 min)

1. Créez un compte sur github.com (gratuit).
2. En haut à droite : **+** → **New repository** → nom : `pilote` → **Create repository**.
3. Cliquez **uploading an existing file** → glissez TOUT le contenu de ce dossier
   (index.html, app.js, parsers.js, sw.js, manifest.webmanifest, les dossiers vendor/ et icons/)
   → **Commit changes**.
4. **Settings** → **Pages** → Source : *Deploy from a branch* → Branch : `main`, dossier `/ (root)` → **Save**.
5. Après ~2 minutes, votre app est en ligne à : `https://VOTRE-NOM.github.io/pilote/`

## Installation sur l'iPhone

1. Ouvrez l'adresse dans **Safari**.
2. Bouton **Partager** (carré avec flèche) → **Sur l'écran d'accueil** → **Ajouter**.
3. Lancez « Pilote » depuis l'écran d'accueil : plein écran, hors ligne, comme une vraie app.

## Utilisation mensuelle (~2 minutes)

1. Téléchargez votre relevé PDF (AMEX / CIBC) sur l'iPhone (app Fichiers).
2. Pilote → **Plus** → **Importer un relevé PDF** (détection automatique du format,
   doublons ignorés — vous pouvez réimporter sans risque).
3. Confirmez l'aperçu, puis acceptez la **sauvegarde .json** proposée → enregistrez-la
   dans Fichiers / iCloud Drive.
4. (Optionnel, 90 s) **Plus** → **Patrimoine** : vos soldes CELI/REER/dettes pour la
   valeur nette et le score.

## Sauvegarde, restauration, migration — À LIRE

L'iPhone est le poste de pilotage, PAS le coffre-fort : iOS peut purger le stockage
local d'une app web longtemps inutilisée. Votre coffre-fort = le fichier .json dans
iCloud Drive.
- **Sauvegarder** : Plus → Sauvegarder (.json) — proposé automatiquement après chaque import.
- **Restaurer / changer d'appareil** : installez l'app sur le nouvel appareil →
  Plus → Restaurer une sauvegarde → choisissez votre .json. Tout revient (transactions,
  règles, soldes).
- **Ceinture et bretelles** : conservez aussi vos PDF sources dans un dossier iCloud —
  ils permettent de tout reconstruire, pour toujours.
- **Exports** : CSV (archive éternelle) et Excel (compatible avec votre système
  Finances_Maitre.xlsx sur PC).

## Mise à jour de l'app

Remplacez les fichiers modifiés dans le dépôt GitHub (glisser-déposer). L'app installée
se mettra à jour à sa prochaine ouverture en ligne.
