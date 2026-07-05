# Better English V10.8F — Connexion et sauvegarde corrigées

## Corrigé
- La connexion reste active quand on rouvre le site.
- Les statistiques ne reviennent plus à 0 après reconnexion.
- Si Supabase est vide, la progression locale est conservée puis envoyée en ligne.
- Si Supabase contient déjà une progression, elle est fusionnée avec la progression locale.
- Ajout de la meilleure série (`bestStreak`).

## Installation
Garde ton fichier `.env`, puis :
```bash
npm install
npm run dev
```
