// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package exitcode defines the process exit codes sdash guarantees.
//
// The codes are part of the command line contract: scripts and service
// managers branch on them, so they may be added to but never renumbered.
//
// Adapted from GSI-HPC/clusterctl internal/exitcode.
package exitcode

import "errors"

const (
	// OK means sdash did what it was asked. A server that SIGINT or SIGTERM
	// stopped exits OK after a clean shutdown: a signal is the normal way to
	// stop it, where a command that runs to an end would report 130.
	OK = 0
	// Failure means the command line was accepted and sdash then could not
	// do its work: the listener could not be opened, or the shutdown had to
	// cut requests off.
	Failure = 1
	// Usage means the command line or the configuration was rejected before
	// anything was started.
	Usage = 2
)

// Error carries an exit code alongside an error. A command returns it to
// select an exit code other than Failure.
type Error struct {
	// Code is the exit code the error asks for.
	Code int
	// Err is the error itself, which Unwrap returns.
	Err error
}

// Wrap attaches an exit code to an error, returning nil for nil.
func Wrap(code int, err error) error {
	if err == nil {
		return nil
	}
	return &Error{Code: code, Err: err}
}

// Error returns the message of the wrapped error; the code adds nothing to
// what the user reads.
func (e *Error) Error() string { return e.Err.Error() }

// Unwrap returns the wrapped error, so that errors.Is and errors.As see
// through the code.
func (e *Error) Unwrap() error { return e.Err }

// From reports the exit code an error should produce. An error that carries
// no code of its own counts as a Failure.
func From(err error) int {
	if err == nil {
		return OK
	}
	if coded, ok := errors.AsType[*Error](err); ok {
		return coded.Code
	}
	return Failure
}
