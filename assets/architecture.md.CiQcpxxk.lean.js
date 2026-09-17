import{_ as a,C as o,o as i,c as s,ag as t,E as n}from"./chunks/framework.CAfGEm1x.js";const h=JSON.parse('{"title":"kundol Architecture","description":"","frontmatter":{},"headers":[],"relativePath":"architecture.md","filePath":"architecture.md"}'),c={name:"architecture.md"};function l(d,e,p,u,g,m){const r=o("MermaidDiagram");return i(),s("div",null,[e[0]||(e[0]=t("",4)),n(r,{code:`flowchart TD
    Entry["cli/index.ts"] --> CLI["cli/program.ts · Commander"]
    JSON["registry/optimisations.json"] --> Schema["core/optimisation-registry/schema.ts · Zod"]
    Schema --> CLI
    CLI --> Catalogue["commands/tools.ts · catalogue and requests"]
    CLI --> Routes["commands/optimise.ts"]
    Routes --> Actions["cli/actions.ts · scopes, selection, reporting"]
    Actions --> Scope["Project discovery / pinned Docker context"]
    Actions --> Engine["Registry engine · probe / review / apply"]
    Scope --> Engine
    Schema --> Engine
    Engine --> Handlers["Approved selectors, validators and actions"]
    Handlers --> Files["Scoped paths · safe-removal.ts"]
    Handlers --> Owners["Owner-tool commands / resource adapters"]
    Engine --> Sink["Injected audit sink"]
    Actions --> Sink
    Sink --> DB["SQLite actions · ~/.kundol/kundol.db"]
    Sink --> Sessions["Best-effort text logs · ~/.kundol/sessions"]
`}),e[1]||(e[1]=t("",2)),n(r,{code:`sequenceDiagram
    actor User
    participant CLI as CLI actions
    participant Engine as Registry engine
    participant Handler as Approved handlers
    participant Audit as Audit sink
    User->>CLI: optimise scope + options
    CLI->>Engine: probe eligible rules
    Engine->>Handler: Discover and validate targets
    Handler-->>Engine: Identities, evidence, sizes / unavailable reasons
    Engine-->>CLI: Probe plan
    CLI-->>User: Print plan
    User->>CLI: Select targets (or force-safe selection)
    CLI->>Engine: review original plan + selection
    Engine-->>CLI: Single-use review plan
    CLI->>Engine: apply review plan
    loop Each selected target, sequentially
        Engine->>Handler: Re-probe identity and validate
        Engine->>Audit: Record attempt before action
        Engine->>Handler: Validate again, execute only if valid
        Engine->>Audit: Record applied / skipped / failed
    end
    Engine-->>CLI: Results and audit warnings
    CLI->>Audit: Record run outcome
    CLI-->>User: Report + exit status
`}),e[2]||(e[2]=t("",4))])}const k=a(c,[["render",l]]);export{h as __pageData,k as default};
