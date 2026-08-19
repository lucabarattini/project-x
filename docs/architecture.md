# Repository Architecture

This project is a small modular Next.js monolith. The directory boundaries keep route code, business features, shared UI, source configuration, and maintenance tooling distinct without adding framework abstractions.

## Source Layout

```text
src/
├── app/                    # Next.js routes, layouts, and page composition
├── components/
│   └── ui/                 # Feature-agnostic UI primitives
└── features/
    ├── companies/          # Company branding and logos
    ├── insights/           # Publishing analytics and charts
    ├── jobs/               # Job dashboard, rules, filters, and providers
    │   └── providers/      # ATS and careers-page adapters
    └── network/            # Local contact import, storage, and matching

data/                       # Auditable board, branding, and provenance config
docs/                       # Product and engineering documentation
public/                     # Static assets only
scripts/                    # Offline verification and maintenance commands
```

## Dependency Direction

1. `src/app` composes features and exposes routes.
2. Feature modules may use feature-agnostic primitives from `src/components/ui`.
3. Cross-feature imports must be explicit and limited to a real domain dependency, such as insights using company logos.
4. Provider modules normalize external responses into the shared job shape in `jobs/providers/greenhouse.ts`.
5. `data/` contains configuration and evidence; it must not import application code.
6. Tests live beside the implementation they protect and are discovered recursively by `npm test`.

## Design Rules

- Keep Next.js-specific routing concerns inside `src/app`.
- Put new ATS adapters in `src/features/jobs/providers`.
- Keep deterministic parsing and filtering outside React components.
- Keep browser-only CRM data inside the `network` feature.
- Avoid generic `utils.ts` files; name modules after the behavior they own.
- Prefer direct imports over broad barrel files so client/server boundaries stay visible.
- Add a new architectural layer only when the codebase demonstrates a concrete need for it.
