# Security policy

## Supported versions

The latest `0.x` release receives security fixes. This is a local desktop tool
without a server component.

## Reporting

Please report vulnerabilities privately to the maintainers rather than opening
a public issue. Include:

- affected version/commit
- Windows version
- a minimal reproduction
- impact (for example: arbitrary file write, credential disclosure, IPC
  boundary bypass)

## Threat model

DSH Hub runs with the user's privileges and manages local files that DSH also
uses. It assumes:

- the user's DSH profile and `node_modules` are trusted;
- the renderer only loads local application files;
- the model endpoint is configured by the user or by DSH and may be
  untrusted/remote, so responses are validated before being stored.

Security controls:

- renderer sandbox + context isolation, no Node integration;
- explicit IPC allowlist and sender URL check;
- path allowlist for `shell.openPath`, and sessions/skills path containment;
- no HTML rendering of unsanitized user or model content (Markdown output is
  escaped and links are limited to HTTP(S));
- API keys are read in the main process and masked before crossing IPC;
- log redaction of keys, tokens, and authorization headers;
- writes are atomic and backed up; core DSH bundles are protected.

## Out of scope

- Attacks that require local user-level code execution already.
- DSH itself, third-party plugins, or plugins' own vulnerabilities.
- Token usage or billing for model requests initiated by the user.
- Unsigned-build SmartScreen warnings.
