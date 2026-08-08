# 프로젝트 표시 이름
NAME = TaskFlow

# 환경별 Compose 파일과 env 파일을 한 명령으로 고정해 실행 실수를 줄인다.
COMPOSE_DEV = docker compose -p taskflow-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_PROD = docker compose -p taskflow-prod --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml

.PHONY: all up down logs dev-up dev-down dev-logs dev-seed dev-reset prod-up prod-down prod-logs prod-renew clean fclean re init check_init

# 인자 없이 make를 실행하면 개발 환경을 시작한다.
all: up

# ----------------------------------------------------
# 1. 누락된 프로젝트 디렉터리 초기화
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
# 2. 필수 디렉터리 확인
# ----------------------------------------------------
check_init:
	@if [ ! -d "backend" ] || [ ! -d "frontend" ]; then \
		echo "Required source directories are missing. Creating them now."; \
		$(MAKE) init; \
	fi

# ----------------------------------------------------
# 3. 애플리케이션 실행 주기 명령
# ----------------------------------------------------
up: dev-up

dev-up: check_init
	@echo "Building and starting the development environment..."
	$(COMPOSE_DEV) up -d --build

# 개발 컨테이너와 네트워크만 내리고 이름 있는 데이터 볼륨은 보존한다.
down: dev-down

dev-down:
	@echo "Stopping the development environment..."
	$(COMPOSE_DEV) down

# 개발 서비스 전체 로그를 실시간으로 확인한다.
logs: dev-logs

dev-logs:
	$(COMPOSE_DEV) logs -f

dev-seed:
	$(COMPOSE_DEV) exec backend npm run db:seed

# PostgreSQL뿐 아니라 개발용 Redis, 업로드, TLS 볼륨까지 모두 삭제한다.
# migration baseline을 새로 적용하거나 개발 데이터를 완전히 버릴 때만 사용한다.
dev-reset:
	$(COMPOSE_DEV) down -v

# 인증서 발급을 먼저 시도하되 실패 시 nginx의 self-signed fallback으로 계속 시작한다.
# 서비스가 준비된 뒤에만 지속형 VPS:443 reverse tunnel을 열어 외부 트래픽을 연결한다.
prod-up: check_init
	@mkdir -p .taskflow/tls
	@set -a; . ./.env.prod; set +a; ./scripts/certbot-issue.sh
	@echo "Building and starting the production environment..."
	$(COMPOSE_PROD) up -d --build
	@set -a; . ./.env.prod; set +a; ./scripts/app-tunnel.sh start

# 먼저 지속형 터널을 닫아 새 연결을 차단한 뒤 운영 컨테이너를 종료한다.
prod-down:
	@set -a; . ./.env.prod; set +a; ./scripts/app-tunnel.sh stop
	$(COMPOSE_PROD) down

prod-logs:
	$(COMPOSE_PROD) logs -f

# HTTP-01 standalone 갱신이 포트를 사용할 수 있게 nginx를 먼저 멈춘 뒤,
# 인증서 갱신이 끝나면 운영 서비스를 다시 시작한다.
prod-renew:
	@echo "Stopping nginx for certificate renewal..."
	$(COMPOSE_PROD) stop nginx
	@set -a; . ./.env.prod; set +a; ./scripts/certbot-renew.sh
	@echo "Starting all production services..."
	$(COMPOSE_PROD) up -d

# 개발 컨테이너·네트워크·볼륨을 제거한 뒤 시스템 전역의 미사용 이미지를 정리한다.
# DB와 업로드가 삭제되고 `docker system prune -a`는 다른 프로젝트의 미사용 Docker
# 리소스에도 영향을 주므로, 일반 종료에는 dev-down을 사용한다.
clean:
	@echo "Removing development containers, networks, and data volumes..."
	$(COMPOSE_DEV) down -v
	@echo "Pruning unused Docker resources..."
	docker system prune -a --force

# 기존 호출과 호환되는 전체 정리 별칭
fclean: clean

# 개발 데이터를 포함한 Docker 상태를 비운 뒤 이미지를 다시 빌드한다.
re:
	$(MAKE) fclean
	$(MAKE)
