// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package wire owns the shapes of what slurmrestd sends, written by hand: one
// set of structs for every data_parser version sdash speaks, with the fields
// sdash reads and no others (doc/adr/0009-one-tolerant-wire-model.md).
//
// A field of an answer that a struct here does not name is skipped, so a
// parser that adds fields needs no change. A field a struct names that the
// answer lacks stays at its zero value; a number slurmrestd can leave unset
// is a Number, whose Set says whether it was. That the fields named here
// exist in each vendored document, with a type that fits, is what the
// conformance test of this package checks, since the compiler cannot.
//
// The browser never sees these shapes: they are mapped to a model of sdash's
// own first.
package wire

import "time"

// Number is a number slurmrestd may leave unset or make unlimited, which it
// sends as {"set": …, "infinite": …, "number": …}. Number is meaningful only
// when Set is true and Infinite false.
type Number[T int64 | float64] struct {
	Set      bool `json:"set"`
	Infinite bool `json:"infinite"`
	Number   T    `json:"number"`
}

// Value returns the number, and false when it is unset or unlimited.
func (n Number[T]) Value() (T, bool) {
	if !n.Set || n.Infinite {
		var zero T
		return zero, false
	}
	return n.Number, true
}

// Int is a Number that holds a whole number.
type Int = Number[int64]

// Time is a point in time that slurmrestd sends as an Int of seconds since
// the epoch.
type Time Int

// Value returns the point in time, and false when it is unset. slurmrestd
// sends 0 for some times it does not know, as a start time of a job that
// has not started, so 0 counts as unset too.
func (t Time) Value() (time.Time, bool) {
	n, ok := Int(t).Value()
	if !ok || n == 0 {
		return time.Time{}, false
	}
	return time.Unix(n, 0), true
}

// Meta is the part of an answer's envelope that names the server.
type Meta struct {
	Plugin struct {
		// DataParser is the data_parser plugin of the answer, its name and
		// its version.
		DataParser string `json:"data_parser"`
	} `json:"plugin"`
	Slurm struct {
		// Release is the Slurm release of slurmrestd, major.minor.micro.
		Release string `json:"release"`
		// Cluster is the name of the cluster.
		Cluster string `json:"cluster"`
	} `json:"slurm"`
}

// Error is an entry of an answer's errors.
type Error struct {
	// Description says what failed, in the words of the handler.
	Description string `json:"description"`
	// Number is the Slurm error number; 0 where the handler had none.
	Number int `json:"error_number"`
	// Error is the text of Number, as Slurm's strerror gives it.
	Error string `json:"error"`
	// Source is the function of slurmrestd that failed.
	Source string `json:"source"`
}

// Warning is an entry of an answer's warnings.
type Warning struct {
	Description string `json:"description"`
	Source      string `json:"source"`
}

// Envelope is what every answer of a handler carries besides its payload.
// slurmrestd writes it after a collection, so a client that streams the
// collection learns of the errors last.
type Envelope struct {
	Meta     Meta      `json:"meta"`
	Errors   []Error   `json:"errors"`
	Warnings []Warning `json:"warnings"`
}

// Head returns the envelope, so that code which reads any answer that
// embeds one can reach it.
func (e *Envelope) Head() *Envelope {
	return e
}
