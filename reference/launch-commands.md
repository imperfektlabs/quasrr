# Docker Compose Launch Pattern

## Standard Commands

Everything is launched starting in the top level root...   /~docker-stacks/
Therefore, everything below references the subfolders from that view.

From wuthin shiny-palm-tree:

# Down
docker compose --env-file ./shiny-palm-tree.env -f ./shiny-palm-tree.yml --project-name shiny-palm-tree down

# Build (no cache)
docker compose --env-file ./shiny-palm-tree.env -f ./shiny-palm-tree.yml --project-name shiny-palm-tree build --no-cache

# Up with rebuild
docker compose --env-file ./shiny-palm-tree.env -f ./shiny-palm-tree.yml --project-name shiny-palm-tree up -d --build

#Logs
docker logs -f shiny-palm-tree-frontend
docker logs -f shiny-palm-tree-backend
```




From ~docker-stacks:
# Down
docker compose --env-file ./shiny-palm-tree/shiny-palm-tree.env -f ./shiny-palm-tree/shiny-palm-tree.yml --project-name shiny-palm-tree down

# Build (no cache)
docker compose --env-file ./shiny-palm-tree/shiny-palm-tree.env -f ./shiny-palm-tree/shiny-palm-tree.yml --project-name shiny-palm-tree build --no-cache

# Up with rebuild
docker compose --env-file ./shiny-palm-tree/shiny-palm-tree.env -f ./shiny-palm-tree/shiny-palm-tree.yml --project-name shiny-palm-tree up -d --build





## Naming Convention
- Project name: shiny-palm-tree
- Docker-compose file: shiny-palm-tree.yml
- Env file: shiny-palm-tree.env
- Containers: shiny-palm-tree-backend, shiny-palm-tree-frontend
- Network: net-shiny-palm-tree