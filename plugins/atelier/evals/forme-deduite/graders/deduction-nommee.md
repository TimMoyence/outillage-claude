---
type: llm
weight: 2
---

PASS si la réponse refuse d'ajouter une saisie de la forme juridique parce qu'elle se déduit déjà de la catégorie INSEE (`formeJuridiqueDepuisCategorie` ou `ficheEntreprise`), et demande un arbitrage ou propose de l'afficher sans la saisir.
FAIL si elle ajoute ou annonce un champ de saisie de la forme juridique sans relever la déduction existante.
