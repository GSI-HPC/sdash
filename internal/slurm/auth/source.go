// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package auth

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// Source gives a token whenever it is asked for one.
type Source interface {
	Token(ctx context.Context) (Token, error)
}

// SourceFunc is a function that serves as a Source.
type SourceFunc func(ctx context.Context) (Token, error)

// Token calls f.
func (f SourceFunc) Token(ctx context.Context) (Token, error) {
	return f(ctx)
}

// Fixed is a token handed over once, as from an environment variable. It is
// never renewed: when it expires the user supplies a new one.
func Fixed(token string) Source {
	t := Parse(token)
	return SourceFunc(func(context.Context) (Token, error) {
		if t.Empty() {
			return Token{}, errors.New("the token is empty")
		}
		return t, nil
	})
}

// File is a token in a file, read again each time it is asked for, so that
// a user who writes a new token into the file renews it.
func File(path string) Source {
	return SourceFunc(func(context.Context) (Token, error) {
		body, err := os.ReadFile(path)
		if err != nil {
			return Token{}, fmt.Errorf("read the token: %w", err)
		}
		t := Parse(strings.TrimPrefix(strings.TrimSpace(string(body)), jwtPrefix))
		if t.Empty() {
			return Token{}, fmt.Errorf("the token file %s is empty", path)
		}
		return t, nil
	})
}

// jwtPrefix is what scontrol token writes before the token.
const jwtPrefix = "SLURM_JWT="

// stderrLimit bounds how much of a failed command's standard error goes into
// the error it is reported with.
const stderrLimit = 1024

// Command is a token that a command prints, run anew each time it is asked
// for one: scontrol token itself, or ssh to a host that runs it. argv is run
// as it is, without a shell. The last line the command prints is the token,
// with or without the SLURM_JWT= that scontrol token writes before it.
//
// The command is as trusted as a script of the user's, so it comes only from
// the profile file (doc/adr/0012-local-listener-security.md).
func Command(argv ...string) Source {
	return SourceFunc(func(ctx context.Context) (Token, error) {
		if len(argv) == 0 {
			return Token{}, errors.New("the token command is empty")
		}
		cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
		var stdout, stderr bytes.Buffer
		cmd.Stdout, cmd.Stderr = &stdout, &stderr
		if err := cmd.Run(); err != nil {
			msg := strings.TrimSpace(stderr.String())
			if len(msg) > stderrLimit {
				msg = msg[:stderrLimit] + "…"
			}
			if msg != "" {
				return Token{}, fmt.Errorf("run the token command %s: %w: %s", argv[0], err, msg)
			}
			return Token{}, fmt.Errorf("run the token command %s: %w", argv[0], err)
		}
		lines := strings.Split(strings.TrimSpace(stdout.String()), "\n")
		t := Parse(strings.TrimPrefix(strings.TrimSpace(lines[len(lines)-1]), jwtPrefix))
		if t.Empty() {
			return Token{}, fmt.Errorf("the token command %s printed no token", argv[0])
		}
		return t, nil
	})
}
