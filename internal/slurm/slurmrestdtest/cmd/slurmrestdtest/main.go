// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Command slurmrestdtest runs the fake slurmrestd of package slurmrestdtest
// as a process of its own, for tests that start sdash as a process and
// cannot hand it a server of a Go test: the browser tests of the user
// interface (web/playwright.config.ts).
//
// It serves the captures of the newest data_parser version sdash speaks,
// writes a profile file that names it as the cluster "virgo", with a token
// that names alice, and prints one line with its address and the path of
// that file. It serves until it is interrupted or terminated, and then
// removes the file. It is built from the checkout and run there: the
// captures are read from the sources.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/GSI-HPC/sdash/internal/slurm/slurmrestdtest"
	"github.com/GSI-HPC/sdash/internal/slurm/versions"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "slurmrestdtest: %v\n", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	known := versions.Known()
	s, err := slurmrestdtest.Start(known[len(known)-1])
	if err != nil {
		return err
	}
	defer s.Close()

	dir, err := os.MkdirTemp("", "slurmrestdtest-")
	if err != nil {
		return err
	}
	defer func() { _ = os.RemoveAll(dir) }() // a temporary directory left behind harms nothing
	if err := os.WriteFile(filepath.Join(dir, "alice.token"), []byte(slurmrestdtest.TokenFor("alice")), 0o600); err != nil {
		return err
	}
	profile := filepath.Join(dir, "clusters.toml")
	body := fmt.Sprintf("[[cluster]]\nname = \"virgo\"\nendpoint = %q\ntoken = { file = \"alice.token\" }\n", s.URL)
	if err := os.WriteFile(profile, []byte(body), 0o600); err != nil {
		return err
	}

	fmt.Printf("slurmrestdtest is serving at %s with the profile file %s\n", s.URL, profile)
	<-ctx.Done()
	return nil
}
