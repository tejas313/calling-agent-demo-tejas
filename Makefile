.PHONY: dev build test lint seed migrate docker-up docker-down

dev:
	npm run start:dev

build:
	npm run build

test:
	npm run test

test-e2e:
	npm run test:e2e

lint:
	npm run lint

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

migrate:
	npm run migration:run

seed:
	npm run seed

setup: docker-up
	@echo 'Waiting for PostgreSQL...'
	@sleep 3
	$(MAKE) migrate
	$(MAKE) seed
	@echo 'Setup complete!'
