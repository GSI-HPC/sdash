# SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
# SPDX-License-Identifier: Apache-2.0

GO       ?= go
NPM      ?= npm
BIN      ?= bin/sdash
COVER    ?= coverage.out
FUZZTIME ?= 60s
# The fuzz targets, as package:target, which make fuzz runs one after the
# other; FUZZ=internal/x:FuzzY runs one of them. The list is empty for now:
# the parsers of what slurmrestd sends will be the first targets, and they
# wait, with everything that speaks to Slurm, for
# doc/adr/0016-e2e-and-fixtures-on-sind.md.
FUZZ     ?=
# The exact release of markdownlint-cli2 that make lint-docs fetches with
# npx, so that a new release of the linter, with rules of its own, fails no
# change that did not cause it; raised by hand.
MARKDOWNLINT ?= 0.23.3
# The exact release of oapi-codegen that make generate runs, so that the
# committed internal/api/api.gen.go changes only with api/openapi.yaml or
# with this line (doc/adr/0011-openapi-first-browser-api.md); raised by hand,
# together with the copy of the generator's header template in
# api/oapi-codegen.yaml. The generator of the TypeScript side is pinned in
# web/package-lock.json.
OAPI_CODEGEN ?= v2.8.0

# The directory the binary embeds (internal/static), and the one file in it
# that is tracked.
EMBED := internal/static/dist
KEEP  := placeholder.txt
# The static build every release target gets
# (doc/adr/0001-local-first-binary-with-embedded-ui.md): no cgo, so that the
# binary runs on any Linux whatever its C library, and no local paths in it.
GOBUILD = CGO_ENABLED=0 $(GO) build -trimpath -o $(BIN) ./cmd/sdash

## all: the default goal, the same as build
.PHONY: all
all: build

## build: build the UI, copy it into the embed directory and compile bin/sdash
.PHONY: build
build: ui
	find $(EMBED) -mindepth 1 ! -name $(KEEP) -delete
	cp -R web/dist/. $(EMBED)/
	$(GOBUILD)

## build-go: compile bin/sdash with whatever the embed directory holds; needs no Node
.PHONY: build-go
build-go:
	$(GOBUILD)

# The frontend's dependencies, installed from the lockfile when they are
# missing. After a change to web/package-lock.json, run "npm ci" in web/.
web/node_modules:
	cd web && $(NPM) ci

## ui: build the frontend into web/dist
.PHONY: ui
ui: web/node_modules
	cd web && $(NPM) run build

## generate: regenerate the Go and TypeScript code from api/openapi.yaml
.PHONY: generate
generate: web/node_modules
	$(GO) run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@$(OAPI_CODEGEN) -config api/oapi-codegen.yaml api/openapi.yaml
	cd web && $(NPM) run generate

## test: run the Go tests under the race detector
.PHONY: test
test:
	$(GO) test -race ./...

## floor: vet and test with the oldest Go release go.mod allows
.PHONY: floor
floor:
	GOTOOLCHAIN=go$$($(GO) list -m -f '{{.GoVersion}}') $(GO) vet ./...
	GOTOOLCHAIN=go$$($(GO) list -m -f '{{.GoVersion}}') $(GO) test ./...

## cover: run the Go tests and report total statement coverage; it is reported, not gated
.PHONY: cover
cover:
	$(GO) test -race -coverprofile=$(COVER) -covermode=atomic ./...
	$(GO) tool cover -func=$(COVER) | tail -n 1

## fuzz: run each fuzz target for FUZZTIME (60s); a failing input lands in its package's testdata/fuzz/
.PHONY: fuzz
fuzz:
	set -e; for t in $(FUZZ); do \
		$(GO) test "./$${t%%:*}" -run '^$$' -fuzz "^$${t#*:}$$" -fuzztime $(FUZZTIME); \
	done

## lint: golangci-lint (.golangci.yml), gofmt and goimports included
.PHONY: lint
lint:
	golangci-lint run

## lint-ui: lint and check the formatting of the frontend
.PHONY: lint-ui
lint-ui: web/node_modules
	cd web && $(NPM) run lint

## test-ui: run the frontend's unit tests (Vitest)
.PHONY: test-ui
test-ui: web/node_modules
	cd web && $(NPM) run test

## test-components: run the frontend's component tests in a real browser (Vitest browser mode)
.PHONY: test-components
test-components: web/node_modules
	cd web && $(NPM) run test:components

## test-browser: build bin/sdash and run the browser tests (Playwright) against it
.PHONY: test-browser
test-browser: build
	cd web && $(NPM) run test:browser

## tidy: prune and verify the module requirements
.PHONY: tidy
tidy:
	$(GO) mod tidy
	$(GO) mod verify

## vuln: report known vulnerabilities in the Go code and the toolchain
.PHONY: vuln
vuln:
	$(GO) run golang.org/x/vuln/cmd/govulncheck@latest ./...

## reuse: check that every file states its copyright and licence
.PHONY: reuse
reuse:
	reuse lint

# The output of the browser tests is left out: Playwright writes an
# error-context.md for a test that failed, which is no document of this
# repository and would fail the lint after any failed run.
## lint-docs: lint the Markdown files (.markdownlint.yaml)
.PHONY: lint-docs
lint-docs:
	npx --yes markdownlint-cli2@$(MARKDOWNLINT) "**/*.md" ".agents/**/*.md" "#node_modules" "#.claude" "#web/node_modules" "#web/test-results" "#web/playwright-report" "#doc/design"

## notices: write the third-party licence listing of a release into dist/
.PHONY: notices
notices: web/node_modules
	GO="$(GO)" node .github/scripts/third-party-notices.mjs dist/THIRD-PARTY-NOTICES.txt

## test-release: test the release tag verification against scratch tags
.PHONY: test-release
test-release:
	.github/scripts/verify-release-tag_test.sh

## dev: print the two-terminal development loop
.PHONY: dev
dev:
	@echo 'Terminal 1: the server on port 7374 of 127.0.0.1 and ::1, which reads the UI'
	@echo 'from web/dist and accepts the requests the Vite dev server proxies:'
	@echo
	@echo '    $(GO) run ./cmd/sdash --dev --no-browser'
	@echo
	@echo 'Terminal 2: the Vite dev server on port 5173, which reloads the UI as you edit'
	@echo 'and proxies /api to the server:'
	@echo
	@echo '    cd web && $(NPM) run dev'
	@echo
	@echo 'Open the address the server prints once. It signs the browser in with a'
	@echo 'cookie that is valid for that host name on every port, so then work at'
	@echo 'http://127.0.0.1:5173/, the same host name on the Vite port.'

## clean: remove build and test output, and empty the embed directory
.PHONY: clean
clean:
	rm -rf bin dist web/dist $(COVER) coverage.html
	rm -rf web/coverage web/test-results web/playwright-report
	find $(EMBED) -mindepth 1 ! -name $(KEEP) -delete

## help: list the available targets
.PHONY: help
help:
	@sed -n 's/^## //p' $(MAKEFILE_LIST)
