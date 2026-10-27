// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package errs owns the failures of a request to slurmrestd: the few kinds
// sdash tells apart, and the Error that carries one with what slurmrestd
// said.
//
// slurmrestd says what went wrong in two ways that do not agree across
// releases. The Slurm error number of an answer's errors is stable, and the
// HTTP status is not: the same refusal is 500 on one release line and 422 on
// the next (doc/research/slurmrestd.md, section 4). A failure is therefore
// classified by its error number first and by the status second
// (doc/adr/0009-one-tolerant-wire-model.md), and the status is read through
// the profile of the server's release line, in package releases.
package errs

import (
	"errors"
	"fmt"
	"strings"
)

// Kind is what a failure means to sdash: what it tells the user, and whether
// trying again can help.
type Kind int

const (
	// Protocol is an answer sdash cannot read: not JSON where JSON was due,
	// or JSON of another shape.
	Protocol Kind = iota
	// Unauthenticated is a token that is missing, malformed or expired. A
	// new token can help.
	Unauthenticated
	// Forbidden is a request Slurm refused to the user of the token.
	Forbidden
	// NotFound is a job, a node or another entity that does not exist.
	NotFound
	// Rejected is a request slurmctld or slurmdbd refused for another
	// reason, which the error says.
	Rejected
	// Unavailable is a slurmrestd, a slurmctld or a slurmdbd that cannot
	// be reached. Trying again later can help.
	Unavailable
	// Unsupported is an operation the server does not offer: it has no
	// such path, or binds no such method to it.
	Unsupported
)

var kindNames = [...]string{
	Protocol:        "protocol",
	Unauthenticated: "unauthenticated",
	Forbidden:       "forbidden",
	NotFound:        "not found",
	Rejected:        "rejected",
	Unavailable:     "unavailable",
	Unsupported:     "unsupported",
}

// String names the kind in the words of an error message.
func (k Kind) String() string {
	if k >= 0 && int(k) < len(kindNames) {
		return kindNames[k]
	}
	return fmt.Sprintf("kind %d", int(k))
}

// Slurm error numbers that say more than any HTTP status, from Slurm's
// slurm_errno.h. They are stable across releases.
const (
	// NumberPermission is EPERM, which slurmctld sends for a request the
	// user may not make.
	NumberPermission = 1
	// NumberAuthentication is SLURM_PROTOCOL_AUTHENTICATION_ERROR: the token
	// did not authenticate the user to slurmctld.
	NumberAuthentication = 1007
	// NumberAccessDenied is ESLURM_ACCESS_DENIED.
	NumberAccessDenied = 2002
	// NumberInvalidJobID is ESLURM_INVALID_JOB_ID, the answer for a job
	// slurmctld does not know.
	NumberInvalidJobID = 2017
	// NumberDBConnection is ESLURM_DB_CONNECTION: slurmrestd could not open
	// a connection to slurmdbd. It is also all that slurmrestd says of a
	// token slurmdbd does not accept, so on its own it cannot tell a
	// slurmdbd that is down from a token that has expired.
	NumberDBConnection = 7000
)

// AuthenticationFailure is how slurmctld words NumberAuthentication, which
// is all a ping reports of a token it did not accept.
const AuthenticationFailure = "Protocol authentication error"

// byNumber maps a Slurm error number to its kind.
var byNumber = map[int]Kind{
	NumberPermission:     Forbidden,
	NumberAuthentication: Unauthenticated,
	NumberAccessDenied:   Forbidden,
	NumberInvalidJobID:   NotFound,
	NumberDBConnection:   Unavailable,
}

// OfNumber returns the kind a Slurm error number stands for, and false for a
// number that says nothing sdash tells apart, 0 among them.
func OfNumber(n int) (Kind, bool) {
	k, ok := byNumber[n]
	return k, ok
}

// Error is a failed request to slurmrestd.
type Error struct {
	// Kind is what the failure means to sdash.
	Kind Kind
	// Op is the method and the path of the request.
	Op string
	// Status is the HTTP status of the answer, 0 when there was none.
	Status int
	// Number is the Slurm error number of the answer, 0 when it had none.
	Number int
	// Message is what slurmrestd said: the description and the error of an
	// answer's first error, or the text of a rejection.
	Message string
	// Err is the cause, when the failure was not an answer: a connection
	// that failed, a body that would not decode.
	Err error
}

// Error writes the failure for a log or for the user.
func (e *Error) Error() string {
	var b strings.Builder
	fmt.Fprintf(&b, "%s: %s", e.Op, e.Kind)
	if e.Status != 0 {
		fmt.Fprintf(&b, " (HTTP %d", e.Status)
		if e.Number != 0 {
			fmt.Fprintf(&b, ", Slurm error %d", e.Number)
		}
		b.WriteString(")")
	}
	if e.Message != "" {
		fmt.Fprintf(&b, ": %s", e.Message)
	}
	if e.Err != nil {
		fmt.Fprintf(&b, ": %v", e.Err)
	}
	return b.String()
}

// Unwrap returns the cause.
func (e *Error) Unwrap() error {
	return e.Err
}

// KindOf returns the kind of err: that of the Error it wraps, or Protocol for
// an error that is none.
func KindOf(err error) Kind {
	if e, ok := errors.AsType[*Error](err); ok {
		return e.Kind
	}
	return Protocol
}

// Is tells whether err is a failure of kind k.
func Is(err error, k Kind) bool {
	_, ok := errors.AsType[*Error](err)
	return ok && KindOf(err) == k
}
