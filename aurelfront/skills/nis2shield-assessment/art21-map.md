# NIS2 Art. 21(2) map v0

Columns: measure · questions · score 3 looks like · typical evidence · ISO/IEC 27001:2022 Annex A · IR 2024/2690 Annex section.
Rubric for every row: 0 absent · 1 informal · 2 documented and mostly applied · 3 applied, evidenced, reviewed yearly.

| Art. 21(2) | Questions | Score 3 looks like | Evidence | ISO 27001 A. | IR 2024/2690 |
|---|---|---|---|---|---|
| (a) Risk analysis and information system security policies | G1-G3, A1-A4 | Management-approved policy; yearly risk assessment with register and treatment plan | Policy with approval date, risk register | 5.1, 5.2, 5.31 (+ clauses 6.1, 8.2) | 1, 2 |
| (b) Incident handling | B1-B4 | Written procedure, roles, detection and logging, tested; CNCS notification path | IR procedure, log retention config, incident log | 5.24-5.28, 8.15, 8.16 | 3 |
| (c) Business continuity, backup, disaster recovery, crisis management | C1-C4 | BCP/DRP with RTOs, tested yearly; offline/immutable backups; restore tested | BCP, restore test record | 5.29, 5.30, 8.13, 8.14 | 4 |
| (d) Supply chain security | D1-D4 | Supplier register with risk rating; security clauses; periodic review | Supplier list, contract clauses | 5.19-5.23 | 5 |
| (e) Secure acquisition, development, maintenance; vulnerability handling and disclosure | E1-E4 | Security requirements in purchasing; patch SLAs met; regular scans; disclosure contact | Patch reports, scan reports, security.txt | 8.8, 8.25-8.29, 8.32 | 6 |
| (f) Assessing effectiveness of measures | F1-F3 | KPIs tracked; yearly audit or review; findings closed | KPI report, audit report, review minutes | 5.35, 5.36 (+ clauses 9, 10) | 7 |
| (g) Basic cyber hygiene and training | H1-H4, G2 | Yearly training for all + management; phishing tests; hardened endpoints | Training records, EDR coverage | 6.3, 8.1, 8.7, 8.9 | 8 |
| (h) Cryptography and encryption | K1-K3 | Policy; full-disk encryption; TLS everywhere; key management | Policy, MDM/encryption report | 8.24 | 9 |
| (i) HR security, access control, asset management | P1-P5 | JML process with same-day leaver removal; least privilege; access reviews; current asset inventory | JML records, access review, inventory | 5.9-5.18, 6.1-6.6, 7.1-7.4 | 10, 11, 12, 13 |
| (j) MFA, secured communications, emergency communications | M1-M3 | MFA on all remote, email and admin access; approved secure tools; out-of-band emergency channel | MFA coverage report, comms plan | 5.14, 8.5 | 11 (authentication) |

## Facts you may quote (Directive 2022/2555)

- Art. 20: management bodies approve the measures, oversee them, can be held liable, and must follow training.
- Art. 23 significant incidents: early warning within 24 h of becoming aware; incident notification within 72 h; final report within one month of the notification. Portuguese procedure and platform: CNCS (Regulamento n.º 756/2026). For PT-specific deadlines write "confirmar com o CNCS".
- Art. 34 maximum fines: essential entities at least up to 10 M EUR or 2% of worldwide annual turnover, whichever is higher; important entities at least up to 7 M EUR or 1.4%.

Anything else legal: do not state it; flag it for counsel.

## Risk rating of a gap

- High: score 0 on any measure, or below 2 on (b), (c), (i), (j).
- High, whatever the score: an exposed system that cannot be defended, i.e. unsupported or unpatched systems (including OT/production PCs) reachable from the internet or by a third party (vendor remote access, flat network with office PCs). Name the systems in the gap.
- Medium: below target but at least 1, not covered by High.
- Low: at target but with missing evidence or overdue review.

## Priority order (action plan and executive summary)

Sort the action plan by:
1. Risk: High, then Medium, then Low.
2. Within the same risk, by measure criticality: (j), (c), (b), (i), (e), (d), (a), governance, (h), (g), (f). Rationale: account takeover, loss of data/production and undetected incidents cause the most damage to an SME; documentation and metrics follow.
3. Then by effort: S before M before L.

The executive summary's three priorities are the first three rows of the sorted plan.
