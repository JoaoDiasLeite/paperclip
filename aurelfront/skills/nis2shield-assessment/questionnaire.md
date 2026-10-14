# NIS2Shield questionnaire v0

Ask in PT-PT. Record each answer as `ID: answer (source: interview | document name | not answered)`.

## S. Scope and classification

- S1 Legal name, NIPC, CAE code(s), main activity.
- S2 Staff headcount (FTE) and annual turnover / balance sheet (last closed year). Part of a group? Group figures.
- S3 Sectors served (NIS2 Annex I high-criticality, Annex II other critical, or neither). Which services?
- S4 Is the company a sole provider of a critical service, or a DNS, TLD, trust-service, cloud, data-centre, CDN, MSP/MSSP or public electronic communications provider? (size-independent cases)
- S5 Already registered with or contacted by CNCS or a sector authority?
- S6 Countries of establishment and of service.

Size rule of thumb (Recommendation 2003/361/EC, group figures count): medium = 50+ staff, or turnover and balance sheet both above 10 M EUR; large = 250+ staff, or turnover above 50 M EUR and balance sheet above 43 M EUR. Annex I + large → essential; Annex I medium or Annex II medium/large → important. Exceptions (S4) apply regardless of size. Final classification belongs to the entity and CNCS.

## G. Governance (Art. 20)

- G1 Who in management approves cybersecurity measures? Is it minuted?
- G2 Have management members had cybersecurity training in the last 12 months?
- G3 Named person responsible for cybersecurity? Internal or outsourced?

## A. (a) Risk analysis and security policies

- A1 Written information security policy? Date of last approval.
- A2 Risk assessment done? Method, date, who owns the risk register.
- A3 Inventory of critical services and the systems supporting them?
- A4 Risk treatment decisions recorded (accept / mitigate / transfer)?

## B. (b) Incident handling

- B1 Written incident response procedure? Roles and contacts?
- B2 How are incidents detected (logs, EDR, MSSP, users)? Log retention period.
- B3 Can you notify CNCS within 24 h of becoming aware of a significant incident? Who would do it?
- B4 Incidents in the last 24 months and lessons recorded?

## C. (c) Business continuity, backups, crisis management

- C1 Business continuity / disaster recovery plan? Last test date.
- C2 Backups: what, how often, offline or immutable copy, last restore test.
- C3 Recovery time objectives for critical services defined?
- C4 Crisis communication plan (internal, clients, authorities)?

## D. (d) Supply chain security

- D1 List of ICT suppliers and service providers with access to systems or data?
- D2 Security requirements in contracts (incident notice, audits, data location)?
- D3 Supplier risk assessed before onboarding and periodically?
- D4 Single points of failure in suppliers identified?

## E. (e) Secure acquisition, development and maintenance

- E1 Security requirements when buying or developing systems?
- E2 Patch management: process and typical time to patch critical vulnerabilities.
- E3 Vulnerability scanning or penetration tests? Last date.
- E4 Way for outsiders to report vulnerabilities (contact, disclosure policy)?

## F. (f) Assessing effectiveness

- F1 Security KPIs or metrics tracked?
- F2 Internal or external audits of security measures? Last date and findings closed?
- F3 Management review of security at least yearly?

## H. (g) Cyber hygiene and training

- H1 Security awareness training for all staff? Frequency, last date.
- H2 Phishing simulations?
- H3 Baseline hygiene: antivirus/EDR, firewall, secure configuration, removable media rules.
- H4 Onboarding includes security rules?

## K. (h) Cryptography

- K1 Policy on when to use encryption?
- K2 Laptops and mobile devices encrypted? Data at rest on servers and backups?
- K3 Data in transit encrypted (TLS, VPN)? Key and certificate management.

## P. (i) HR security, access control, asset management

- P1 Background checks / confidentiality agreements where appropriate?
- P2 Joiner / mover / leaver process; accounts removed on exit within how long?
- P3 Least privilege; separate admin accounts; access reviews frequency.
- P4 Asset inventory (hardware, software, cloud, data) kept current?
- P5 Physical security of server rooms and offices.

## M. (j) MFA, secure communications, emergency communications

- M1 MFA on email, remote access, cloud admin, privileged accounts? Coverage %.
- M2 Secure internal communications (approved tools, encrypted)?
- M3 Emergency communication channel if email/phone systems are down?

## X. Closing

- X1 Biggest security concern in the client's own words.
- X2 Planned investments or projects in the next 12 months.
- X3 Documents the client can share as evidence (list).
