// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package client

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/GSI-HPC/sdash/internal/slurm/errs"
	"github.com/GSI-HPC/sdash/internal/slurm/releases"
	"github.com/GSI-HPC/sdash/internal/slurm/wire"
)

// errorBodyLimit bounds how much of an answer that is not a success is read:
// an envelope with its errors, or a line of text.
const errorBodyLimit = 1 << 20

// reader reads the body of an answer of success and returns its envelope.
type reader func(io.Reader) (wire.Envelope, error)

// consumerError carries an error of the caller's out of a reader, so that it
// is returned as it is and not taken for an answer sdash cannot read.
type consumerError struct{ err error }

func (e consumerError) Error() string { return e.err.Error() }
func (e consumerError) Unwrap() error { return e.err }

// get sends GET path, with the token of the moment, and reads the answer of
// success with read. An answer that carries errors, or is not a success, is
// an *errs.Error, classified through profile.
func (c *Client) get(ctx context.Context, profile releases.Profile, path string, read reader) error {
	op := http.MethodGet + " " + path
	token, err := c.tokens.Token(ctx)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base.JoinPath(path).String(), nil)
	if err != nil {
		return fmt.Errorf("%s: %w", op, err)
	}
	// JoinPath drops the slash at the end, which slurmrestd's lists keep.
	if strings.HasSuffix(path, "/") && !strings.HasSuffix(req.URL.Path, "/") {
		req.URL.Path += "/"
	}
	req.Header.Set("User-Agent", c.agent)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-SLURM-USER-TOKEN", token.Secret())
	if token.User != "" {
		req.Header.Set("X-SLURM-USER-NAME", token.User)
	}

	start := time.Now()
	resp, err := c.http.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return &errs.Error{Kind: errs.Unavailable, Op: op, Err: err}
	}
	defer func() { _ = resp.Body.Close() }() // read in full or abandoned: the close cannot lose data

	err = c.answer(op, profile, resp, read)
	c.log.Debug("ask slurmrestd", "op", op, "status", resp.StatusCode,
		"elapsed", time.Since(start).Round(time.Millisecond), "error", err)
	if errs.Is(err, errs.Unauthenticated) {
		c.tokens.Refused(ctx, token)
	}
	return err
}

// answer reads resp, the answer to op.
func (c *Client) answer(op string, profile releases.Profile, resp *http.Response, read reader) error {
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return refusal(op, profile, resp)
	}
	env, err := read(resp.Body)
	if ce, ok := errors.AsType[consumerError](err); ok {
		return ce.err
	}
	if err != nil {
		return &errs.Error{Kind: errs.Protocol, Op: op, Status: resp.StatusCode, Err: err}
	}
	if len(env.Errors) > 0 {
		return classify(op, profile, resp.StatusCode, env.Errors)
	}
	return nil
}

// refusal reads an answer that is not a success: an envelope with errors
// when a handler refused, or a line of text when slurmrestd did before any
// handler ran, as for a missing token.
func refusal(op string, profile releases.Profile, resp *http.Response) error {
	body, err := io.ReadAll(io.LimitReader(resp.Body, errorBodyLimit))
	if err != nil {
		return &errs.Error{Kind: profile.Kind(resp.StatusCode), Op: op, Status: resp.StatusCode, Err: err}
	}
	if trimmed := bytes.TrimSpace(body); len(trimmed) > 0 && trimmed[0] == '{' {
		var env wire.Envelope
		if json.Unmarshal(trimmed, &env) == nil && len(env.Errors) > 0 {
			return classify(op, profile, resp.StatusCode, env.Errors)
		}
	}
	return &errs.Error{
		Kind:    profile.Kind(resp.StatusCode),
		Op:      op,
		Status:  resp.StatusCode,
		Message: firstLine(string(body)),
	}
}

// classify makes an *errs.Error of the errors of an answer: by the first
// Slurm error number that says something sdash tells apart, else by the
// HTTP status. An answer of success that carries errors is a request
// slurmctld refused all the same.
func classify(op string, profile releases.Profile, status int, list []wire.Error) error {
	e := &errs.Error{Op: op, Status: status, Message: message(list[0])}
	for _, w := range list {
		if k, ok := errs.OfNumber(w.Number); ok {
			e.Kind, e.Number, e.Message = k, w.Number, message(w)
			return e
		}
		if e.Number == 0 {
			e.Number = w.Number
		}
	}
	if status >= 200 && status <= 299 {
		e.Kind = errs.Rejected
	} else {
		e.Kind = profile.Kind(status)
	}
	return e
}

// message is what an entry of errors says, without Slurm's "No error" for an
// error that has no number.
func message(w wire.Error) string {
	switch {
	case w.Error == "" || w.Number == 0:
		return w.Description
	case w.Description == "":
		return w.Error
	}
	return w.Description + ": " + w.Error
}

// firstLine is the first line of text, for a message.
func firstLine(s string) string {
	line, _, _ := strings.Cut(strings.TrimSpace(s), "\n")
	return strings.TrimSpace(line)
}
