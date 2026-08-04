# Project name
NAME = TaskFlow

# Environment-specific Docker Compose commands
COMPOSE_DEV = docker compose -p taskflow-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_PROD = docker compose -p taskflow-prod --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml

.PHONY: all up down logs dev-up dev-down dev-logs dev-seed dev-reset prod-up prod-down prod-logs clean fclean re init check_init

# Default target
all: up

# ----------------------------------------------------
# 1. Initialize missing project directories
# ----------------------------------------------------
init:
	@echo "Initializing the project environment..."
	@docker run --rm \
	  -e npm_config_cache=/tmp/.npm \
	  -v $(CURDIR):/workspace \
	  -w /workspace \
	  node:20-slim /bin/bash -c "\
	    if [ ! -d 'backend' ]; then \
	      echo '1. Creating the backend environment...' && \
	      mkdir -p backend && cd backend && \
	      npm init -y && npm install express && \
	      npm install -D typescript ts-node-dev @types/node @types/express && \
	      printf 'FROM node:20-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nEXPOSE 3000\nCMD [\"npx\", \"ts-node-dev\", \"--respawn\", \"--transpile-only\", \"index.ts\"]\n' > Dockerfile && \
	      printf 'node_modules\nDockerfile\n.dockerignore\n' > .dockerignore && \
	      printf 'import express from \"express\";\nconst app = express();\napp.listen(3000, () => console.log(\"Backend server is running on port 3000\"));\n' > index.ts && \
	      cd ..; \
	    fi && \
	    if [ ! -d 'frontend' ]; then \
	      echo '2. Creating the frontend environment...' && \
	      npm create vite@latest frontend -- --template vue-ts && \
	      cd frontend && npm install && \
	      printf 'FROM node:20-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nEXPOSE 5173\nCMD [\"npm\", \"run\", \"dev\", \"--\", \"--host\", \"0.0.0.0\"]\n' > Dockerfile && \
	      printf 'node_modules\nDockerfile\n.dockerignore\n' > .dockerignore && \
	      cd ..; \
	    fi && \
	    echo '3. Environment setup is complete.' \
	  "

# ----------------------------------------------------
# 2. Check required directories
# ----------------------------------------------------
check_init:
	@if [ ! -d "backend" ] || [ ! -d "frontend" ]; then \
		echo "Required source directories are missing. Creating them now."; \
		$(MAKE) init; \
	fi

# ----------------------------------------------------
# 3. Application lifecycle commands
# ----------------------------------------------------
up: dev-up

dev-up: check_init
	@echo "Building and starting the development environment..."
	$(COMPOSE_DEV) up -d --build

# Stop containers and remove the development network
down: dev-down

dev-down:
	@echo "Stopping the development environment..."
	$(COMPOSE_DEV) down

# Follow all development container logs
logs: dev-logs

dev-logs:
	$(COMPOSE_DEV) logs -f

dev-seed:
	$(COMPOSE_DEV) exec backend npm run db:seed

dev-reset:
	$(COMPOSE_DEV) down -v

prod-up: check_init
	@mkdir -p .taskflow/tls
	@echo "Building and starting the production environment..."
	$(COMPOSE_PROD) up -d --build

prod-down:
	$(COMPOSE_PROD) down

prod-logs:
	$(COMPOSE_PROD) logs -f

# Remove development containers, networks, volumes, and unused Docker resources
clean:
	@echo "Removing development containers, networks, and data volumes..."
	$(COMPOSE_DEV) down -v
	@echo "Pruning unused Docker resources..."
	docker system prune -a --force

# Backward-compatible full clean target
fclean: clean

# Rebuild the development environment from a clean Docker state
re:
	$(MAKE) fclean
	$(MAKE)
