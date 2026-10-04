// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

module github.com/GSI-HPC/sdash

// The oldest Go release the code compiles with: a .0 release, and no
// toolchain line. The release line sdash is built with is named in mise.toml
// (doc/adr/0020-go-lines-tools-and-libraries.md).
go 1.26.0

// npm packages may carry Go sources: flatted, which ESLint depends on, does.
// Without this the patterns ./... and all would take them for packages of
// sdash, and the Go tools would vet, lint and scan them wherever the
// frontend's dependencies are installed.
ignore node_modules

require (
	github.com/go-chi/chi/v5 v5.3.2
	github.com/spf13/cobra v1.10.2
	github.com/stretchr/testify v1.12.1
)

require (
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/spf13/pflag v1.0.9 // indirect
	go.yaml.in/yaml/v3 v3.0.5 // indirect
)
