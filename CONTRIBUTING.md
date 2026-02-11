# Contributing to Quasrr

Thanks for contributing.

## Ground Rules

- Keep changes focused and PR-sized.
- Do not include secrets in commits.
- Update docs when behavior or setup changes.
- Follow the project's Code of Conduct.

## Development Setup

1. Fork and clone the repository.
2. Copy `.env.example` to `.env` and fill required values.
3. Copy `config/settings.example.yaml` to `config/settings.yaml`.
4. Start the stack:

```bash
docker network create net-media 2>/dev/null || true
docker compose up -d --build
```

## Pull Request Process

1. Create a branch from `release/v26.02-oss`.
2. Make small, reviewable commits with clear messages.
3. Verify the app starts and health endpoints respond.
4. Open a PR using the provided PR template.

## Reporting Issues

- Use the issue templates for bugs and feature requests.
- Include reproducible steps and environment details.
