// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package auth owns the JSON Web Token sdash sends to slurmrestd: where it
// comes from, how long it is held, and that it goes nowhere else
// (doc/adr/0007-jwt-and-the-token-source.md).
//
// A request to slurmrestd runs as the user the token names, which is what
// lets sdash act under the user's own Slurm identity. The token comes from a
// command the cluster's profile names, such as ssh to a login node and
// scontrol token there, or from a variable or a file. It is kept in memory,
// in a Keeper that asks its Source again before the token expires; it is
// never written anywhere, never logged, and never reaches the browser. A
// Token prints and logs without its secret for that reason.
//
// sdash does not verify a token: slurmctld and slurmdbd do. It reads the two
// claims it needs, when the token expires and whom it names, and passes on
// a token whose claims it cannot read, which slurmrestd then refuses.
package auth

import (
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"strings"
	"time"
)

// Token is a JSON Web Token for slurmrestd.
type Token struct {
	secret string
	// User is the Slurm user the token names, in Slurm's claim "sun"; empty
	// when it names none.
	User string
	// Expiry is when the token expires, by its claim "exp"; zero when it
	// does not say.
	Expiry time.Time
}

// Parse makes a Token of the text of one, and reads what it can of its
// claims.
func Parse(s string) Token {
	t := Token{secret: strings.TrimSpace(s)}
	parts := strings.Split(t.secret, ".")
	if len(parts) != 3 {
		return t
	}
	payload, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(parts[1], "="))
	if err != nil {
		return t
	}
	var claims struct {
		Expiry *float64 `json:"exp"`
		User   string   `json:"sun"`
	}
	if json.Unmarshal(payload, &claims) != nil {
		return t
	}
	t.User = claims.User
	if claims.Expiry != nil {
		t.Expiry = time.Unix(int64(*claims.Expiry), 0)
	}
	return t
}

// Secret is the token as slurmrestd takes it, for the header of a request
// and for nothing else.
func (t Token) Secret() string {
	return t.secret
}

// Empty tells whether t holds no token at all.
func (t Token) Empty() bool {
	return t.secret == ""
}

// ExpiredAt tells whether t has expired by the time now. A token that does
// not say when it expires never has, as far as sdash can tell.
func (t Token) ExpiredAt(now time.Time) bool {
	return !t.Expiry.IsZero() && !now.Before(t.Expiry)
}

// String describes t without its secret, so that a token printed by mistake
// gives nothing away.
func (t Token) String() string {
	var b strings.Builder
	b.WriteString("token")
	if t.User != "" {
		b.WriteString(" of " + t.User)
	}
	if !t.Expiry.IsZero() {
		b.WriteString(", expires " + t.Expiry.UTC().Format(time.RFC3339))
	}
	return b.String()
}

// LogValue logs t as String writes it.
func (t Token) LogValue() slog.Value {
	return slog.StringValue(t.String())
}
