# Third-party content

This game incorporates the complete `data/` directory and a JavaScript adaptation of the six `lib/` modules from **1 in 8 Billion — PowerShell edition**, supplied locally as `D:\1in8B-PowerShell-edition-main`.

Copyright (c) 2026 carina. Licensed under the MIT License; the full original notice is retained in `vendor/powershell-edition/LICENSE`. All original data and PowerShell libraries are preserved under that same directory for attribution and port auditing. Runtime data lives under `data/edition/`; browser JavaScript adaptations live under `js/edition/`.

The PowerShell edition's demographic dataset is a fixed game baseline around 2024. Its era calibration factors are model parameters, not observed annual statistics. Where the pre-existing Random Life historical dataset supplies observations, the browser port uses those observations with source-year metadata. The supplied content's factual statements and estimated cultural/demographic parameters retain their original provenance; importing them does not independently verify each claim.

The browser adaptation requires no PowerShell runtime, external API or network service. Terminal rendering and key-input loops are represented by browser controls, accessible dialogs, life logs and localStorage saves. Existing pixel rendering and the local Node.js launcher remain available.
