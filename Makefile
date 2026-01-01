# Plexus - AI Agent Observability Platform
# Makefile for common development tasks

.PHONY: help dev build clean lint format typecheck test compile release install

# Default target
help:
	@echo "Plexus Development Commands"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Development:"
	@echo "  dev            Start development server"
	@echo "  build          Production build (app + CLI + hooks)"
	@echo "  clean          Clean dev artifacts"
	@echo ""
	@echo "Code Quality:"
	@echo "  lint           Run Biome linter"
	@echo "  lint-fix       Run Biome linter with auto-fix"
	@echo "  format         Format code with Biome"
	@echo "  typecheck      Run TypeScript type checking"
	@echo "  check          Run all checks (lint + typecheck)"
	@echo ""
	@echo "Testing:"
	@echo "  test           Run tests"
	@echo "  test-watch     Run tests in watch mode"
	@echo "  test-coverage  Run tests with coverage"
	@echo ""
	@echo "Compile:"
	@echo "  compile-app    Compile Electron app"
	@echo "  compile-cli    Compile CLI"
	@echo "  compile-hooks  Compile agent hooks"
	@echo ""
	@echo "Release:"
	@echo "  release        Build and publish release"
	@echo "  make-release   Prepare release"
	@echo ""
	@echo "Setup:"
	@echo "  install        Install dependencies"
	@echo "  setup          Full setup (install + build)"

# Development
dev:
	pnpm dev

build:
	pnpm prebuild && pnpm build

clean:
	pnpm clean:dev

# Code Quality
lint:
	pnpm lint

lint-fix:
	pnpm lint:fix

format:
	pnpm format

typecheck:
	pnpm typecheck

check: lint typecheck

# Testing
test:
	pnpm test

test-watch:
	pnpm test:watch

test-coverage:
	pnpm test:coverage

# Compile
compile-app:
	pnpm compile:app

compile-cli:
	pnpm compile:cli

compile-hooks:
	pnpm compile:hooks

compile-all: compile-app compile-cli compile-hooks

# Release
release:
	pnpm release

make-release:
	pnpm make:release

# Setup
install:
	pnpm install

setup: install build
