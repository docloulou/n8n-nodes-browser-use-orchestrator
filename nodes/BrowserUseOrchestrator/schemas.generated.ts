// AUTO-GÉNÉRÉ par scripts/generate-schemas.ts — NE PAS ÉDITER À LA MAIN.
// Source : nodes/BrowserUseOrchestrator/orchestrator/config.ts (schémas Zod).
// Régénérer : npm run generate (ou npm run build).

export type JsonSchemaObject = Record<string, unknown>;

export const SCHEMAS: Record<string, JsonSchemaObject> = {
	"run_task_agent": {
		"$schema": "http://json-schema.org/draft-07/schema#",
		"type": "object",
		"properties": {
			"task": {
				"type": "string",
				"minLength": 1,
				"description": "Instruction en langage naturel, idéalement avec l'URL de départ et le résultat attendu. Ex: \"Va sur news.ycombinator.com et donne les 3 premiers posts (titre + url)\". Précise le résultat attendu pour éviter les étapes de vérification inutiles."
			},
			"vision": {
				"description": "Active la vision par step (screenshots envoyés au LLM). Plus lent et plus coûteux : à activer seulement si la tâche dépend d'éléments visuels (mise en page, images). Par défaut l'agent travaille sur le DOM seul. (défaut: false)",
				"type": "boolean"
			},
			"screenshot": {
				"description": "Capture la page FINALE du run (JPEG full-page, servie par /screenshots) et ajoute son URL http dans result.screenshot_url — feedback visuel du résultat. (défaut: false)",
				"type": "boolean"
			},
			"model": {
				"description": "Id du modèle LLM à utiliser pour CE job (ex: \"gpt-4o-mini\"), servi par le même endpoint/clé que le .env. Omis ou vide : OPENAI_MODEL du .env (et OPENAI_VISION_MODEL pour la description d'image). Ne renseigner que pour changer délibérément de modèle.",
				"type": "string"
			},
			"fields": {
				"description": "Schéma dynamique des résultats : { nom_du_champ: description }. Impose la structure de `results` : un objet par élément extrait avec exactement ces clés. Noms = identifiants ([a-zA-Z_][a-zA-Z0-9_]*), max 12 champs. Type optionnel en préfixe de la description : \"number: prix en euros\", \"bool: en stock\", \"int: nombre d'avis\" (défaut string ; valeurs nullables dans tous les cas). Omis : results est un texte libre. Ex: {\"titre\": \"titre du post\", \"prix\": \"number: prix en euros\"}",
				"type": "object",
				"propertyNames": {
					"type": "string"
				},
				"additionalProperties": {
					"type": "string"
				}
			},
			"secrets": {
				"description": "Noms de secrets (configurés côté serveur, cf list_secrets) mis à disposition de l'agent pour CE job. Les VALEURS ne transitent jamais par le LLM : l'agent les insère via des placeholders sécurisés. Dans `task`, référence le secret par son NOM (ex: \"connecte-toi avec l'identifiant mon_login et le mot de passe mon_password\"). Recommandé : restreindre allowed_domains quand des secrets sont fournis.",
				"type": "array",
				"items": {
					"type": "string"
				}
			},
			"allowed_domains": {
				"description": "Liste de domaines autorisés pour la navigation (ex: [\"example.com\", \"*.google.com\"]). Toute navigation hors liste est bloquée. Omis : aucun filtrage. Fortement recommandé quand des secrets sont fournis.",
				"type": "array",
				"items": {
					"type": "string"
				}
			},
			"profile_id": {
				"description": "Id d'un profil navigateur browser-use à charger dans la session (cookies, localStorage et connexions conservés d'un navigateur à l'autre). Créer/retrouver les profils via create_profile / list_profiles. Omis : navigateur vierge.",
				"type": "string"
			},
			"proxy_country": {
				"description": "Code pays du proxy du navigateur pour CE job (ex: \"fr\", \"us\", \"de\") — utile pour le contenu géo-restreint. Omis : BROWSER_PROXY_COUNTRY du .env.",
				"type": "string",
				"pattern": "^[a-zA-Z]{2}$"
			},
			"wait_seconds": {
				"description": "Attente synchrone max (défaut 90s, max 600s). Si l'agent finit à temps, le résultat est renvoyé directement. Sinon tu reçois un job_id : reviens dessus avec await_job (PAS de polling en boucle). 0 = lancer sans attendre.",
				"type": "integer",
				"minimum": 0,
				"maximum": 600
			}
		},
		"required": [
			"task"
		],
		"additionalProperties": false
	},
	"run_vision_agent": {
		"$schema": "http://json-schema.org/draft-07/schema#",
		"type": "object",
		"properties": {
			"task": {
				"type": "string",
				"minLength": 1,
				"description": "URL à décrire (mode direct, défaut) — ex: \"https://news.ycombinator.com\". Si direct=false : instruction en langage naturel exécutée par l'agent avant la capture."
			},
			"direct": {
				"description": "Navigue directement vers l'URL puis capture full-page + description, SANS boucle d'agent (rapide, ~10-30s). Si false : un agent browser-use exécute la tâche pas à pas avant la capture (lent mais peut interagir). (défaut: true)",
				"type": "boolean"
			},
			"screenshot": {
				"description": "Enregistre la capture full-page (JPEG) dans screenshots/ et renvoie son URL http dans le champ `url` du résultat. (défaut: true)",
				"type": "boolean"
			},
			"model": {
				"description": "Id du modèle LLM à utiliser pour CE job (ex: \"gpt-4o-mini\"), servi par le même endpoint/clé que le .env. Omis ou vide : OPENAI_MODEL du .env (et OPENAI_VISION_MODEL pour la description d'image). Ne renseigner que pour changer délibérément de modèle.",
				"type": "string"
			},
			"profile_id": {
				"description": "Id d'un profil navigateur browser-use à charger dans la session (cookies, localStorage et connexions conservés d'un navigateur à l'autre). Créer/retrouver les profils via create_profile / list_profiles. Omis : navigateur vierge.",
				"type": "string"
			},
			"proxy_country": {
				"description": "Code pays du proxy du navigateur pour CE job (ex: \"fr\", \"us\", \"de\") — utile pour le contenu géo-restreint. Omis : BROWSER_PROXY_COUNTRY du .env.",
				"type": "string",
				"pattern": "^[a-zA-Z]{2}$"
			},
			"wait_seconds": {
				"description": "Attente synchrone max (défaut 90s, max 600s). Si l'agent finit à temps, le résultat est renvoyé directement. Sinon tu reçois un job_id : reviens dessus avec await_job (PAS de polling en boucle). 0 = lancer sans attendre.",
				"type": "integer",
				"minimum": 0,
				"maximum": 600
			}
		},
		"required": [
			"task"
		],
		"additionalProperties": false
	},
	"fetch_page": {
		"$schema": "http://json-schema.org/draft-07/schema#",
		"type": "object",
		"properties": {
			"url": {
				"type": "string",
				"minLength": 1,
				"description": "URL de la page à lire (ex: \"https://news.ycombinator.com\")."
			},
			"links": {
				"description": "Inclut les liens (hrefs) dans le markdown extrait (défaut: false).",
				"type": "boolean"
			},
			"profile_id": {
				"description": "Id d'un profil navigateur browser-use à charger dans la session (cookies, localStorage et connexions conservés d'un navigateur à l'autre). Créer/retrouver les profils via create_profile / list_profiles. Omis : navigateur vierge.",
				"type": "string"
			},
			"proxy_country": {
				"description": "Code pays du proxy du navigateur pour CE job (ex: \"fr\", \"us\", \"de\") — utile pour le contenu géo-restreint. Omis : BROWSER_PROXY_COUNTRY du .env.",
				"type": "string",
				"pattern": "^[a-zA-Z]{2}$"
			},
			"wait_seconds": {
				"description": "Attente synchrone max (défaut 60s, max 600s). Si l'agent finit à temps, le résultat est renvoyé directement. Sinon tu reçois un job_id : reviens dessus avec await_job (PAS de polling en boucle). 0 = lancer sans attendre.",
				"type": "integer",
				"minimum": 0,
				"maximum": 600
			}
		},
		"required": [
			"url"
		],
		"additionalProperties": false
	},
	"run_session_step": {
		"$schema": "http://json-schema.org/draft-07/schema#",
		"type": "object",
		"properties": {
			"task": {
				"type": "string",
				"minLength": 1,
				"description": "L'étape à exécuter, en langage naturel, avec le résultat attendu. L'agent garde sa MÉMOIRE entre les étapes de la session (historique, contexte) et le navigateur son état (page courante, cookies, connexions) : tu peux enchaîner naturellement en référant aux étapes précédentes (ex: \"Maintenant ouvre le deuxième résultat et donne son prix\"). Donne une URL à la première étape ou pour changer de site."
			},
			"session_id": {
				"description": "Session navigateur à réutiliser (valeur renvoyée par l'étape précédente). OMIS = ouvre une NOUVELLE session persistante (premier appel d'une boucle).",
				"type": "string"
			},
			"vision": {
				"description": "Active la vision par step (screenshots envoyés au LLM). Plus lent et plus coûteux : à activer seulement si la tâche dépend d'éléments visuels (mise en page, images). Par défaut l'agent travaille sur le DOM seul. (défaut: false ; figé au PREMIER step de la session, ignoré ensuite)",
				"type": "boolean"
			},
			"screenshot": {
				"description": "Capture la page en FIN D'ÉTAPE (JPEG full-page) et ajoute son URL http dans result.screenshot_url. Peut changer à chaque étape — get_session_screenshot reste disponible pour capturer entre deux étapes. (défaut: false)",
				"type": "boolean"
			},
			"model": {
				"description": "Id du modèle LLM pour la session (même endpoint/clé que le .env). Figé au PREMIER step de la session, ignoré ensuite. Omis : OPENAI_MODEL du .env.",
				"type": "string"
			},
			"fields": {
				"description": "Schéma dynamique des résultats de CETTE étape : { nom_du_champ: description } (identifiants, max 12 champs ; type optionnel en préfixe : \"number: prix\"). Omis : results en texte libre.",
				"type": "object",
				"propertyNames": {
					"type": "string"
				},
				"additionalProperties": {
					"type": "string"
				}
			},
			"secrets": {
				"description": "Noms de secrets (cf list_secrets) mis à disposition de l'agent de la session. FIGÉS au PREMIER step de la session, ignorés ensuite. Les valeurs ne transitent jamais par le LLM.",
				"type": "array",
				"items": {
					"type": "string"
				}
			},
			"allowed_domains": {
				"description": "Domaines autorisés pour la navigation (ex: [\"example.com\"]). FIGÉS au PREMIER step de la session (le navigateur est créé à ce moment-là).",
				"type": "array",
				"items": {
					"type": "string"
				}
			},
			"profile_id": {
				"description": "Id d'un profil navigateur browser-use à charger (cookies/connexions persistants). FIGÉ au PREMIER step de la session, ignoré ensuite.",
				"type": "string"
			},
			"proxy_country": {
				"description": "Code pays du proxy (ex: \"fr\"). FIGÉ au PREMIER step de la session, ignoré ensuite.",
				"type": "string",
				"pattern": "^[a-zA-Z]{2}$"
			},
			"wait_seconds": {
				"description": "Attente synchrone max (défaut 90s, max 600s). Si l'agent finit à temps, le résultat est renvoyé directement. Sinon tu reçois un job_id : reviens dessus avec await_job (PAS de polling en boucle). 0 = lancer sans attendre.",
				"type": "integer",
				"minimum": 0,
				"maximum": 600
			}
		},
		"required": [
			"task"
		],
		"additionalProperties": false
	},
	"run_stagehand_agent": {
		"$schema": "http://json-schema.org/draft-07/schema#",
		"type": "object",
		"properties": {
			"agent": {
				"type": "string",
				"minLength": 1,
				"description": "Nom de l'agent Stagehand à lancer (cf list_stagehand_agents). Les agents sont écrits en TypeScript dans stagehand/agents/ et découverts automatiquement."
			},
			"input": {
				"description": "Paramètres de l'agent, selon SON schéma (cf input_schema de list_stagehand_agents). Souvent vide : la plupart des agents ne demandent rien d'autre que d'être choisis.",
				"type": "object",
				"propertyNames": {
					"type": "string"
				},
				"additionalProperties": {}
			},
			"model": {
				"description": "Id du modèle LLM pour cet agent (même endpoint/clé que le .env). Omis : STAGEHAND_MODEL puis OPENAI_MODEL du .env.",
				"type": "string"
			},
			"profile_id": {
				"description": "Id d'un profil navigateur browser-use à charger dans la session (cookies, localStorage et connexions conservés d'un navigateur à l'autre). Créer/retrouver les profils via create_profile / list_profiles. Omis : navigateur vierge.",
				"type": "string"
			},
			"proxy_country": {
				"description": "Code pays du proxy du navigateur pour CE job (ex: \"fr\", \"us\", \"de\") — utile pour le contenu géo-restreint. Omis : BROWSER_PROXY_COUNTRY du .env.",
				"type": "string",
				"pattern": "^[a-zA-Z]{2}$"
			},
			"wait_seconds": {
				"description": "Attente synchrone max (défaut 90s, max 600s). Si l'agent finit à temps, le résultat est renvoyé directement. Sinon tu reçois un job_id : reviens dessus avec await_job (PAS de polling en boucle). 0 = lancer sans attendre.",
				"type": "integer",
				"minimum": 0,
				"maximum": 600
			}
		},
		"required": [
			"agent"
		],
		"additionalProperties": false
	},
	"await_job": {
		"$schema": "http://json-schema.org/draft-07/schema#",
		"type": "object",
		"properties": {
			"job_id": {
				"type": "string",
				"description": "Identifiant renvoyé par run_task_agent / run_vision_agent / fetch_page"
			},
			"wait_seconds": {
				"description": "Attente synchrone max (défaut 120s, max 600s). Bloque jusqu'à la fin du job ou l'expiration. 0 = état instantané sans attendre.",
				"type": "integer",
				"minimum": 0,
				"maximum": 600
			}
		},
		"required": [
			"job_id"
		],
		"additionalProperties": false
	},
	"cancel_job": {
		"$schema": "http://json-schema.org/draft-07/schema#",
		"type": "object",
		"properties": {
			"job_id": {
				"type": "string",
				"description": "Identifiant du job à annuler (cf list_jobs)"
			}
		},
		"required": [
			"job_id"
		],
		"additionalProperties": false
	},
	"close_session": {
		"$schema": "http://json-schema.org/draft-07/schema#",
		"type": "object",
		"properties": {
			"session_id": {
				"type": "string",
				"description": "Session à fermer (renvoyée par run_session_step)"
			}
		},
		"required": [
			"session_id"
		],
		"additionalProperties": false
	},
	"get_session_screenshot": {
		"$schema": "http://json-schema.org/draft-07/schema#",
		"type": "object",
		"properties": {
			"session_id": {
				"type": "string",
				"description": "Session dont il faut capturer la page courante (cf run_session_step)"
			},
			"full_page": {
				"description": "Capture toute la hauteur de la page (défaut: true) ; false = viewport seul.",
				"type": "boolean"
			}
		},
		"required": [
			"session_id"
		],
		"additionalProperties": false
	},
	"create_profile": {
		"$schema": "http://json-schema.org/draft-07/schema#",
		"type": "object",
		"properties": {
			"name": {
				"description": "Nom lisible du profil (optionnel)",
				"type": "string"
			}
		},
		"additionalProperties": false
	}
};
