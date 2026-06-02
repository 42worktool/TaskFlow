# 프로젝트 이름 설정
NAME = workspace_system

# 사용할 도커 컴포즈 파일 지정
COMPOSE = docker compose

.PHONY: all up down start stop logs clean fclean re init check_init

# 기본 실행
all: up

# ----------------------------------------------------
# 1. 초기 환경 구축 스크립트 (기존 폴더 보존)
# ----------------------------------------------------
init:
	@echo "프로젝트 기초 환경 설정을 시작합니다..."
	@docker run --rm \
	  -e npm_config_cache=/tmp/.npm \
	  -v $(CURDIR):/workspace \
	  -w /workspace \
	  node:20-slim /bin/bash -c "\
	    if [ ! -d 'backend' ]; then \
	      echo '1. 백엔드 환경 생성 중...' && \
	      mkdir -p backend && cd backend && \
	      npm init -y && npm install express && \
	      npm install -D typescript ts-node-dev @types/node @types/express && \
	      printf 'FROM node:20-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nEXPOSE 3000\nCMD [\"npx\", \"ts-node-dev\", \"--respawn\", \"--transpile-only\", \"index.ts\"]\n' > Dockerfile && \
	      printf 'node_modules\nDockerfile\n.dockerignore\n' > .dockerignore && \
	      printf 'import express from \"express\";\nconst app = express();\napp.listen(3000, () => console.log(\"Backend server is running on port 3000\"));\n' > index.ts && \
	      cd ..; \
	    fi && \
	    if [ ! -d 'frontend' ]; then \
	      echo '2. 프론트엔드 환경 생성 중...' && \
	      npm create vite@latest frontend -- --template vue-ts && \
	      cd frontend && npm install && \
	      printf 'FROM node:20-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nEXPOSE 5173\nCMD [\"npm\", \"run\", \"dev\", \"--\", \"--host\", \"0.0.0.0\"]\n' > Dockerfile && \
	      printf 'node_modules\nDockerfile\n.dockerignore\n' > .dockerignore && \
	      cd ..; \
	    fi && \
	    echo '3. 환경 설정 점검이 완료되었습니다.' \
	  "

# ----------------------------------------------------
# 2. 폴더 존재 여부 확인
# ----------------------------------------------------
check_init:
	@if [ ! -d "backend" ] || [ ! -d "frontend" ]; then \
		echo "필요한 소스 폴더가 없습니다. 자동 생성을 진행합니다."; \
		$(MAKE) init; \
	fi

# ----------------------------------------------------
# 3. 메인 구동 명령어
# ----------------------------------------------------
up: check_init
	@echo "시스템을 빌드하고 구동합니다..."
	$(COMPOSE) up -d --build

# 컨테이너 종료 및 네트워크 삭제
down:
	@echo "시스템을 종료합니다..."
	$(COMPOSE) down

# 전체 컨테이너 실시간 로그 확인
logs:
	$(COMPOSE) logs -f

# 컨테이너, 네트워크 및 볼륨(데이터) 삭제
clean:
	@echo "데이터 볼륨과 컨테이너를 삭제합니다..."
	$(COMPOSE) down -v

# 프로젝트와 관련된 모든 도커 리소스 완전 삭제
fclean: clean
	@echo "시스템 리소스를 완전히 초기화합니다..."
	docker system prune -a --force

# 완전 초기화 후 시스템 재구동
re: fclean all
