// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"strconv"
	"strings"
)

// suggest completes the message for a key no field has: with the field that
// was probably meant, which it also returns, when one is close enough to be
// a slip of the hand, and with the fields there are otherwise.
//
// Close is one or two slips, and fewer than half the letters of the field:
// a dropped, a doubled, a wrong or a swapped letter, and a key in another
// case. Without the second bound every four-letter word is close to every
// other that shares two letters with it, and "port" would be taken for
// "host".
//
// Adapted from GSI-HPC/clusterctl internal/config/schema.go.
func suggest(written string, known []string) (meant, hint string) {
	slips := 3
	for _, name := range known {
		if d := editDistance(strings.ToLower(written), strings.ToLower(name)); d < slips && 2*d < len(name) {
			meant, slips = name, d
		}
	}
	switch {
	case meant != "":
		return meant, "; did you mean " + strconv.Quote(meant) + "?"
	case len(known) == 1:
		return "", "; the one field here is " + all(known)
	default:
		return "", "; the fields here are " + all(known)
	}
}

// editDistance counts the slips that turn a into b: a character dropped,
// added or replaced, or two neighbours swapped. clusterctl counts a swap as
// two; it is the commonest slip on a keyboard, and here it is one.
//
// Adapted from GSI-HPC/clusterctl internal/config/schema.go.
func editDistance(a, b string) int {
	before := make([]int, len(b)+1)
	previous := make([]int, len(b)+1)
	current := make([]int, len(b)+1)
	for j := range previous {
		previous[j] = j
	}
	for i := 1; i <= len(a); i++ {
		current[0] = i
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			current[j] = min(previous[j]+1, current[j-1]+1, previous[j-1]+cost)
			if i > 1 && j > 1 && a[i-1] == b[j-2] && a[i-2] == b[j-1] {
				current[j] = min(current[j], before[j-2]+1)
			}
		}
		before, previous, current = previous, current, before
	}
	return previous[len(b)]
}
