# ONE Platform — One Platform for Smarter Operations · by Ort-Tech

> **מיתוג:** שם המוצר = **ONE Platform** / **ONE — One Platform for Smarter Operations**.
> מפתח: **Ort-Tech**. שם-הקוד הפנימי/ענף: `one-platform`.

---

## 1. מה זו המערכת

**ONE** — פלטפורמה ארגונית מודולרית, Multi-Tenant, גמישה וניתנת להרחבה.
על גביה ניתן להפעיל מודולים עסקיים ורפואיים (Patient, Appointment, Surgery, Hospitalization ועוד).

הפלטפורמה מספקת שכבות Core משותפות:
Identity, Tenant, Organization, Authorization, Commercial, Configuration, Workflow, Rules, Documents, Events, Audit, Notifications, Search, Integrations, Analytics, AI.

**המשתמש (בעל המוצר):** דובר עברית, לא מתכנת. כל התקשורת — בעברית.

---

## 2. ארכיטקטורה וסטאק

- **API:** Cloudflare Workers + Hono (TypeScript)
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2
- **Cache/Config:** Cloudflare KV
- **Frontend:** SPA — Vanilla JS + HTML + CSS (Cloudflare Pages)
- **Monorepo:** npm workspaces

**עקרונות ארכיטקטוניים (מהאפיון):**
- **Source of Truth:** לכל תחום מקור אמת מוגדר
- **Separation of Concerns:** Auth ≠ Authorization ≠ Entitlement ≠ Config ≠ Workflow ≠ Rules ≠ Domain
- **Multi-Tenant:** כל מידע מבודד לפי Tenant; כל פעולה עוברת Identity → Tenant → Authorization → Entitlement → Rules → Execution
- **Modular:** מודול חדש משתמש ב-Core הקיים, לא יוצר מנגנון מקביל
- **Engine Boundaries:** כל Engine בעל API/Contract מוגדר, לא ניגש ישירות לטבלאות של Engine אחר

---

## 3. מבנה הקבצים

```
├── .claude/skills/         # סקילים (מועתקים מאורטק + מותאמים)
├── assets/
│   └── logo.png            # לוגו ONE
├── packages/
│   ├── api/                # Cloudflare Worker (Hono)
│   │   ├── src/
│   │   │   ├── index.ts          # Entry point + pipeline
│   │   │   ├── middleware/       # auth, tenant, audit
│   │   │   ├── engines/          # Core Engines
│   │   │   │   ├── identity/
│   │   │   │   ├── tenant/
│   │   │   │   ├── authorization/
│   │   │   │   ├── configuration/
│   │   │   │   ├── audit/
│   │   │   │   ├── events/
│   │   │   │   ├── notifications/
│   │   │   │   ├── documents/
│   │   │   │   ├── commercial/
│   │   │   │   └── workflow/
│   │   │   ├── modules/          # Business Modules
│   │   │   └── lib/              # Shared utilities
│   │   ├── wrangler.toml
│   │   └── package.json
│   ├── web/                # Frontend (Cloudflare Pages)
│   │   ├── index.html
│   │   ├── css/style.css
│   │   ├── js/app.js
│   │   └── pages/
│   └── shared/             # Shared types/contracts
│       └── src/types.ts
├── db/
│   └── migrations/         # D1 migrations
│       └── 0001_foundation.sql
├── docs/adr/               # Architecture Decision Records
├── CLAUDE.md               # קובץ זה
└── package.json            # Root workspace
```

---

## 4. Request Lifecycle (Pipeline)

כל Request משמעותי עובר:
```
Request → Authentication → Tenant Resolution → Authorization → Entitlement → Validation → Domain Logic → Transaction → Audit → Event → Notification
```
ממומש כ-middleware chain ב-Hono.

---

## 5. Core Engines

| Engine | אחריות |
|---|---|
| Identity | ניהול משתמשים, פרופילים, MFA |
| Tenant | בידוד נתונים, הגדרות tenant |
| Organization | מבנה ארגוני היררכי |
| Authorization | Subject + Action + Resource + Context + Policy = Decision |
| Commercial | Packages, Subscriptions, Entitlements, Usage |
| Configuration | הגדרות היררכיות: Platform > Tenant > Org > Module > User |
| Workflow | תהליכים versioned, states + transitions |
| Rules | DSL מוגדר לתנאים והחלטות (לא שפת תכנות מלאה) |
| Events | Versioned, Idempotent, Correlated, Retryable |
| Audit | Who/What/When/Where/Before/After/Result |
| Notifications | Email, SMS, Push, In-App, Webhook עם retry/dedup/rate-limit |
| Documents | Document ≠ File; versions, metadata, shares, signatures |
| Search | Derived data — ניתן לבנייה מחדש |
| Integrations | כל ספק חיצוני עטוף ב-Adapter |
| Analytics | מופרד מ-Transactional workload |
| AI | Capability אופציונלי; output אינו Source of Truth אוטומטי |

---

## 6. Authorization Model

```
Subject + Action + Resource + Context + Policy = Decision
```
- אין `if role == admin` — גם משתמש בעל הרשאות גבוהות עובר Policy Evaluation
- Deny-first: explicit deny > allow > default deny
- Role-based + Resource-based permissions

---

## 7. מודל נתונים (טבלאות ליבה)

- **tenants** — Multi-tenant isolation
- **organizations** — מבנה ארגוני היררכי
- **users** — Identity + role + tenant binding
- **permissions** — Authorization policies (subject/action/resource/effect)
- **packages / subscriptions / entitlements** — Commercial model
- **config_entries** — Hierarchical configuration
- **workflow_definitions / workflow_instances** — Workflow engine
- **domain_events** — Event bus (transactional outbox)
- **audit_log** — Immutable audit trail
- **notifications / notification_templates** — Notification engine
- **documents / files** — Document management
- **rule_definitions** — Business rules DSL
- **integration_adapters** — External provider adapters

---

## 8. מוסכמות לעבודה

- **עברית בלבד** בכל טקסט משתמש, קומיטים והסברים
- **TypeScript** ב-API; **Vanilla JS** בפרונטאנד
- **Engine Boundaries:** engine לא ניגש ישירות לטבלאות של engine אחר
- **D1 Migrations:** ממוספרות ב-`db/migrations/NNNN_name.sql`, אידמפוטנטיות
- **Cloudflare:** `wrangler dev` לפיתוח מקומי, `wrangler deploy` לפרודקשן
- **RTL:** `dir="rtl"` + תכונות CSS לוגיות
- קומיטים בעברית עם `Co-Authored-By`

---

## 9. Claude Code Governance (מהאפיון)

Claude Code רשאי: לממש, לשפר Implementation, להציע Refactoring, להוסיף Tests.

**אינו רשאי לשנות ללא אישור:**
- Domain Boundaries
- Authorization Model
- Tenant Isolation
- Source of Truth
- Core Engine Responsibilities
- Data Ownership
- Security Architecture

שינוי ארכיטקטוני מחייב: Problem → Proposal → Impact → Decision → ADR → Implementation.

---

## 10. Definition of Done

Feature אינו Complete רק כאשר "המסך עובד". נדרשים:
Code, API, Database, Authorization, Tenant Isolation, Validation, Tests, Audit, Events, Error Handling, Logging, Monitoring, Documentation, Security, Migration.

---

## 11. Red-Team Rules

- **RT-A:** Core Engines חייבים להיות Loosely Coupled
- **RT-B:** Configuration ו-Rules אינם תחליף ל-Domain Code
- **RT-C:** Architecture רחבה אינה מחייבת Implementation רחב
