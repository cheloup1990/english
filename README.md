# Better English V10.4 — Smart Correction

Version basée sur V10.3b.

## Ajouts
- Nouveau moteur de correction avec score.
- Résultats : Excellent, Très bien, Presque, À revoir.
- Majuscules ignorées.
- Ponctuation finale ignorée.
- Espaces en trop ignorés.
- Apostrophes normalisées.
- Nombres acceptés : 100 = cent, cents = cent, 1 = un / une.
- Détection de petites erreurs :
  - accord singulier/pluriel
  - mots manquants
  - traduction incomplète
- Consignes claires :
  - Traduis la phrase entière en français.
  - Traduis la phrase entière en anglais.
  - Traduis ce mot ou cette expression.
  - Écris la forme demandée du verbe.
- Nettoyage des phrases parasites : Tu peux dire, On dit, En anglais, Exemple.

Occurrences nettoyées dans la base : 30

## Déployer
```bash
npm run build
```
Puis commit + push.
