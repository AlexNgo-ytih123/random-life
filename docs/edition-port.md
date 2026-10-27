# PowerShell edition → browser JavaScript

The complete local source data and six libraries from `D:\1in8B-PowerShell-edition-main` are integrated into the existing browser game. Runtime uses ordinary ES modules, same-origin static JSON files and localStorage; PowerShell is not required to play or deploy the web game. The local `启动游戏.cmd` entry continues to start the Node.js static server.

## Source-to-runtime mapping

| Source | Browser implementation and reachable features |
|---|---|
| `Core.ps1` | `js/edition/core.js`, `data.js`: seeded random sampling, serialisable RNG, math and three-language labels, complete 14-file catalogue |
| `LifeTable.ps1` | `life-table.js`: age mortality/survival/remaining lifetime, income distribution and inverse percentiles |
| `Demographics.ps1` | `demographics.js`, `identity-labels.js`: birth weights, historical calibration, city, family quintile, religion, ethnic identity, names, family and culture, four peer babies |
| `Decisions.ps1` | `decisions.js`, `decision-content.js`: all 18 decisions and 41 effects with original multilingual labels, facts and outcomes |
| `Simulation.ps1` | `simulation.js`, `simulation-content.js`, `storage.js`: annual mortality/focus/career/family/history/event/peer progression, 12 achievements, reflections, shop, archetypes, current save and last-50 archive |
| `UI.ps1` | `ui.js`, `app.js`, `index.html`, `css/edition.css`: birth/reroll, yearly or milestone advancement, automatic play/pause, focus, decisions/reflections, shop, logs, save/resume, archives, achievements, ending/peers/share; console input loops become browser actions |

Terminal-specific character widths, coloured text, screen clearing and blocking key input are represented by HTML layout, text styles, screen switching and browser event handlers.

## Fourteen datasets

| File | Runtime use |
|---|---|
| `countries.json` | All 172 countries: birth weighting and demographic/risk/income fields |
| `names.json` | Personal, peer, spouse and child names; Chinese name-pool correction described below |
| `cities_en.json` | Urban birth locations |
| `country_en.json`, `country_ja.json`, `country_zh.json` | Country display names in all three UI languages |
| `eras.json` | Per-country era model factors |
| `ethnicities.json` | Cultural and ethnic identity pools/parameters |
| `dishes.json`, `festivals.json`, `hobbies.json` | Birth culture, celebrations and leisure identity |
| `events.json` | All 60 weighted events, eligibility rules, effects, facts and localized narrative |
| `reflections.json` | All five age checkpoints and their choices/effects |
| `shop.json` | All seven activities/items, costs, minimum ages and effects |

Original bytes, including all six PowerShell libraries and all fourteen datasets, are retained under `vendor/powershell-edition/` with the original MIT license. Runtime copies are namespaced under `data/edition/`, avoiding overwrite of the previous world's countries/history data.

## Historical provenance

The source edition uses a fixed demographic baseline around 2024 and model-based era adjustments. These are labelled as calibration. Existing observed annual history for life expectancy, population and fertility takes precedence when available, retaining actual source years and marking interpolation/nearest-observation use. Other source fields retain baseline or model status; no observations are invented.

## Intentional corrections and browser adaptations

- The source `zh` name cluster contained Korean phonetic transcriptions. Runtime male/female/surname lists now use Chinese Han characters, retaining their counts, order and repeated surname weights. Chinese names use surname + given name without a separating space. Korean names and every other original cluster are unchanged.
- Generic Vietnamese spouse/child placeholders become actual names from the same country-aware generator. All other decision effects remain covered by source-oracle comparisons.
- The inverse-normal tail coefficient uses the canonical value; the source typo is not propagated. Mortality cache keys cover all model inputs; a small hobby pool cannot cause an infinite selection loop.
- Saves contain data plus canonical decision/reflection identifiers and RNG state, never executable functions. Nested corrupt records are rejected. Browser storage failures do not halt gameplay. Completed records are deduplicated and limited to fifty.
- Source text and decision effects remain multilingual. The browser port uses a serialisable seeded Mulberry32 generator, so repeatability is within the JavaScript version; identical seeds need not reproduce the PowerShell runtime's random sequence.

## Verification

Regressions cover source content preservation, all 172 countries, 800 Chinese name samples, weighted sampling, life-table/income maths, 492 localized choice-effect comparisons against original PowerShell results, all 60 event effects, all 18 decisions/five reflections, complete lives, all seven shop items, achievements, peers, save/restore/RNG/malformed storage, browser formatting and controller entry paths. Final test counts and browser verification are recorded in the task's delivery notes after integration.
