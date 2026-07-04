# StudioApp — Deployment (TrueNAS / Dockge)

## GitHub repo (source of truth for compose build contexts)
- `https://github.com/valianktni1/studioapp.ukv1` (branch `main`)
- Push via Emergent "Save to GitHub" button.

## Stack location on TrueNAS
- Compose file: `/mnt/apps/dockge/data/studioappukuse/compose.yaml`
- Stack folder: `/mnt/apps/dockge/data/studioappukuse`

## EXACT redeploy commands (user-provided — DO NOT change/guess)
```bash
docker compose -f /mnt/apps/dockge/data/studioappukuse/compose.yaml down
docker compose -f /mnt/apps/dockge/data/studioappukuse/compose.yaml build --no-cache backend frontend nginx-video
docker compose -f /mnt/apps/dockge/data/studioappukuse/compose.yaml up -d
```

## Notes
- `--no-cache` is required because services build from the GitHub git context; without it Docker reuses the cached clone and old code ships.
- Services rebuilt: `backend`, `frontend`, `nginx-video` (mongodb is not rebuilt).
- Deploy flow: Save to GitHub (studioapp.ukv1 main) -> run the 3 commands above.
