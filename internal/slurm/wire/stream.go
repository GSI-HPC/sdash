// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package wire

import (
	"encoding/json"
	"fmt"
	"io"
)

// Stream reads an answer whose payload is the collection under key, and
// hands each element of it to each as soon as it is decoded, so that a list
// of ten thousand jobs is never held as one body
// (doc/adr/0009-one-tolerant-wire-model.md). It returns the envelope, which
// slurmrestd writes after the collection: whoever keeps the elements keeps
// them aside until Stream has returned without an error, and the envelope's
// errors are read.
//
// An element is handed over as a pointer to a value of its own, which each
// may keep. An error of each stops the reading and is returned as it is.
func Stream[T any](r io.Reader, key string, each func(*T) error) (Envelope, error) {
	var env Envelope
	dec := json.NewDecoder(r)
	if err := delim(dec, '{'); err != nil {
		return env, err
	}
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return env, fmt.Errorf("read a member of the answer: %w", err)
		}
		name, _ := tok.(string) // the decoder hands out nothing but a string as a key
		switch name {
		case key:
			if err := elements(dec, key, each); err != nil {
				return env, err
			}
		case "meta":
			err = dec.Decode(&env.Meta)
		case "errors":
			err = dec.Decode(&env.Errors)
		case "warnings":
			err = dec.Decode(&env.Warnings)
		default:
			err = dec.Decode(&json.RawMessage{})
		}
		if err != nil {
			return env, fmt.Errorf("read %s: %w", name, err)
		}
	}
	if err := delim(dec, '}'); err != nil {
		return env, err
	}
	return env, nil
}

// elements reads the array of the collection, which may also be null.
func elements[T any](dec *json.Decoder, key string, each func(*T) error) error {
	tok, err := dec.Token()
	if err != nil {
		return fmt.Errorf("read %s: %w", key, err)
	}
	if tok == nil {
		return nil
	}
	if d, ok := tok.(json.Delim); !ok || d != '[' {
		return fmt.Errorf("read %s: %v where an array was due", key, tok)
	}
	for i := 0; dec.More(); i++ {
		v := new(T)
		if err := dec.Decode(v); err != nil {
			return fmt.Errorf("read %s[%d]: %w", key, i, err)
		}
		if err := each(v); err != nil {
			return err
		}
	}
	return delim(dec, ']')
}

// delim reads the delimiter d.
func delim(dec *json.Decoder, d json.Delim) error {
	tok, err := dec.Token()
	if err != nil {
		return fmt.Errorf("read the answer: %w", err)
	}
	if got, ok := tok.(json.Delim); !ok || got != d {
		return fmt.Errorf("read the answer: %v where %v was due", tok, d)
	}
	return nil
}
