// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"maps"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"unicode"

	"go.yaml.in/yaml/v3"

	"github.com/GSI-HPC/sdash/internal/apis/v1alpha1"
)

// Position is a place in a profile file.
type Position struct {
	// File is the path of the file, as sdash opened it.
	File string
	// Line and Column count from 1. Both are 0 when the problem is with the
	// file as a whole, which a file that is not YAML is as well: see
	// syntaxProblem.
	Line, Column int
}

// String renders the position as editors and compilers do, file:line:column,
// or as the file alone where there is no line.
func (p Position) String() string {
	if p.Line == 0 {
		return Printable(p.File)
	}
	return fmt.Sprintf("%s:%d:%d", Printable(p.File), p.Line, p.Column)
}

// Printable renders a name or a value from a profile for a terminal. A file
// name, a path and a program name may hold any character, an escape
// sequence included, which the terminal would obey; such a value is
// returned quoted, and every other as it is.
func Printable(value string) string {
	if strings.ContainsFunc(value, func(r rune) bool { return !unicode.IsPrint(r) }) {
		return strconv.Quote(value)
	}
	return value
}

// Problem is one thing wrong with a profile, at the place it was written.
type Problem struct {
	Position
	// Field is the dotted path of the field the problem is with, such as
	// spec.endpoint.url. It is empty when the problem is with a document or
	// a file as a whole.
	Field string
	// Message says what is wrong and, where it can, what to write instead.
	// It repeats a key that is wrong and never a value: the value may be a
	// secret in the wrong field, and Position says where it stands.
	Message string
}

// String renders the problem on one line, the position first. The field is
// rendered as Printable renders it: the path of an unknown field ends in
// the key as it was written, which may be anything.
func (p Problem) String() string {
	if p.Field == "" {
		return p.Position.String() + ": " + p.Message
	}
	return p.Position.String() + ": " + Printable(p.Field) + ": " + p.Message
}

// Error is what Load returns when the profiles are not valid. It holds every
// problem that was found, so that one run of "sdash config check" shows all
// there is to fix.
type Error struct {
	// Problems are ordered by file, then by line and column.
	Problems []Problem
}

// Error lists the problems, one to a line.
func (e *Error) Error() string {
	var b strings.Builder
	b.WriteString("the cluster profiles are not valid:")
	for _, problem := range e.Problems {
		b.WriteString("\n  ")
		b.WriteString(problem.String())
	}
	return b.String()
}

// Cluster is a cluster profile that was read and found valid.
type Cluster struct {
	v1alpha1.Cluster
	// Position is where the name of the cluster is written.
	Position Position
}

// parse reads the YAML documents of one file. It returns the cluster
// profiles that are valid and everything that is wrong with the others.
//
// A file may hold several documents. One that is empty, or holds comments
// only, is skipped, so that a file may begin with "---" or end with one.
func parse(file string, data []byte) ([]Cluster, []Problem) {
	var clusters []Cluster
	var problems []Problem
	stream := yaml.NewDecoder(bytes.NewReader(data))
	for {
		var root yaml.Node
		err := stream.Decode(&root)
		if errors.Is(err, io.EOF) {
			return clusters, problems
		}
		if err != nil {
			// The library cannot go on after a syntax error, so what
			// follows it in the file is not judged.
			return clusters, append(problems, syntaxProblem(file, err))
		}
		doc := &document{file: file, at: map[string]Position{}, meant: map[string]bool{}, unread: map[string]bool{}}
		if cluster, ok := doc.read(&root); ok {
			clusters = append(clusters, cluster)
		}
		problems = append(problems, doc.problems...)
	}
}

// syntaxProblem turns an error of the YAML library into a Problem with the
// file as a whole.
//
// The library names a line inside its message, "line 3: did not find
// expected key", and no column. The line is not made the position of the
// problem, because it cannot be relied on: for a list that is never closed
// the library names the line before the one the list begins in, and for a
// stray "}" the line before the one it is in. The message is passed on as
// the library wrote it, and reads as the library's.
func syntaxProblem(file string, err error) Problem {
	return Problem{
		Position: Position{File: file},
		Message:  "is not YAML: " + strings.TrimPrefix(err.Error(), "yaml: "),
	}
}

// document is one YAML document while it is read: where its fields were
// written, and what is wrong with it.
type document struct {
	file string
	// at maps the dotted path of every field that was written to the place
	// of its key, and of every list item to its own place. The empty path
	// is the document.
	at map[string]Position
	// meant holds the paths of the fields that a misspelt key probably
	// stands for. Such a field counts as written where a rule asks whether
	// it is there, so that one slip is reported once: as the unknown key,
	// and not again as the field that is missing because of it.
	meant map[string]bool
	// unread holds the paths of the fields whose value could not be read.
	// No rule judges such a field or anything below it: its problem is
	// reported already, and a second one would only repeat it.
	unread   map[string]bool
	problems []Problem
}

// read decodes a document into a cluster profile and validates it. The
// second result is false for an empty document and for one with a problem.
func (d *document) read(root *yaml.Node) (Cluster, bool) {
	// The library hands a document over as a node around its one value.
	if len(root.Content) == 0 {
		return Cluster{}, false
	}
	node := root.Content[0]
	d.at[""] = Position{File: d.file, Line: node.Line, Column: node.Column}
	switch {
	case node.Kind == yaml.ScalarNode && node.ShortTag() == nullTag:
		return Cluster{}, false
	case node.Kind != yaml.MappingNode:
		d.fail("", "a profile is a mapping with apiVersion, kind, metadata and spec, not %s", shape(node))
		return Cluster{}, false
	}
	// The version and the kind are judged before anything else, and alone:
	// the fields of a document of another kind are not unknown fields of
	// this one.
	if !d.typeMeta(node) {
		return Cluster{}, false
	}

	var cluster v1alpha1.Cluster
	d.mapping(node, "", reflect.ValueOf(&cluster).Elem())
	d.validate(&cluster)
	if len(d.problems) > 0 {
		return Cluster{}, false
	}
	return Cluster{Cluster: cluster, Position: d.where("metadata.name")}, true
}

// typeMeta checks the apiVersion and the kind of a document, and says
// whether it is one this sdash reads.
//
// The two keys are looked for by their exact names, before the strict
// reading of the mapping. A key that is close to one of them, such as
// "apiversion" or "Kind", is therefore reported here, as the slip it is and
// at its own place: without that the document would be told that it lacks
// the key, with no word about the one that was written.
func (d *document) typeMeta(root *yaml.Node) bool {
	read := true
	for _, field := range []struct {
		key   string
		check func(string) error
	}{
		{"apiVersion", v1alpha1.CheckAPIVersion},
		{"kind", v1alpha1.CheckKind},
	} {
		written := ""
		key, value := lookup(root, field.key)
		switch {
		case key != nil:
			d.at[field.key] = Position{File: d.file, Line: key.Line, Column: key.Column}
			text, ok := d.text(value, field.key)
			if !ok {
				return false
			}
			written = text
		case d.misspelt(root, field.key):
			// What the misspelt key holds is not judged. The other of the
			// two keys still is.
			read = false
			continue
		}
		if err := field.check(written); err != nil {
			d.fail(field.key, "%s", err)
			return false
		}
	}
	return read
}

// lookup returns the key of that name in a mapping and its value, or nil
// where the mapping has no such key.
func lookup(mapping *yaml.Node, name string) (key, value *yaml.Node) {
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if key := mapping.Content[i]; key.Kind == yaml.ScalarNode && key.Value == name {
			return key, mapping.Content[i+1]
		}
	}
	return nil, nil
}

// misspelt reports the first key of a document that was probably meant to
// be the field name, as the strict reading reports any other key no field
// has, and says whether there is one.
func (d *document) misspelt(root *yaml.Node, name string) bool {
	known := slices.Sorted(maps.Keys(fieldsOf(reflect.TypeFor[v1alpha1.Cluster]())))
	for i := 0; i+1 < len(root.Content); i += 2 {
		key := root.Content[i]
		if key.Kind != yaml.ScalarNode {
			continue
		}
		if meant, hint := suggest(key.Value, known); meant == name {
			d.add(Position{File: d.file, Line: key.Line, Column: key.Column}, key.Value, "unknown field %q%s", key.Value, hint)
			return true
		}
	}
	return false
}

// mapping decodes a YAML mapping into the struct out, whose fields name
// their keys in a yaml tag. It is strict where the YAML library's own
// decoder is lenient: a key no field has is a problem, with the field that
// was probably meant, and so is a key written twice.
func (d *document) mapping(n *yaml.Node, path string, out reflect.Value) {
	if n.Kind != yaml.MappingNode {
		d.fail(path, "must be a mapping, not %s", shape(n))
		return
	}
	fields := fieldsOf(out.Type())
	firstLine := map[string]int{}
	for i := 0; i+1 < len(n.Content); i += 2 {
		key, value := n.Content[i], n.Content[i+1]
		position := Position{File: d.file, Line: key.Line, Column: key.Column}
		if key.Kind != yaml.ScalarNode {
			d.add(position, path, "a key must be a plain string, not %s", shape(key))
			continue
		}
		child := join(path, key.Value)
		if line, twice := firstLine[key.Value]; twice {
			d.unread[child] = true
			d.add(position, child, "is written twice; the first is in line %d", line)
			continue
		}
		firstLine[key.Value] = key.Line
		index, known := fields[key.Value]
		if !known {
			meant, hint := suggest(key.Value, slices.Sorted(maps.Keys(fields)))
			if meant != "" {
				d.meant[join(path, meant)] = true
			}
			d.add(position, child, "unknown field %q%s", key.Value, hint)
			continue
		}
		d.at[child] = position
		d.value(value, child, out.Field(index))
	}
}

// value decodes the value of one field. Every leaf of a profile is text, so
// a scalar is read as the text that was written, whatever YAML would take
// it for: 0600, 1e3 and yes mean to the user what they say. A field of
// another type would need a case here, and a decision on what its literals
// are.
func (d *document) value(n *yaml.Node, path string, out reflect.Value) {
	switch out.Kind() {
	case reflect.String:
		text, ok := d.text(n, path)
		switch {
		case !ok:
		case text == "":
			d.fail(path, "has no value; give it one or remove it")
		case strings.ContainsFunc(text, unicode.IsControl):
			d.fail(path, "holds a control character, such as a line break or a tab")
		default:
			out.SetString(text)
		}
	case reflect.Slice:
		if n.Kind != yaml.SequenceNode {
			hint := ""
			if shape(n) == "a string" {
				hint = "; sdash does not split a string into words"
			}
			d.fail(path, "must be a list of strings, such as [a, b], not %s%s", shape(n), hint)
			return
		}
		items := make([]string, 0, len(n.Content))
		for i, item := range n.Content {
			at := path + "[" + strconv.Itoa(i) + "]"
			d.at[at] = Position{File: d.file, Line: item.Line, Column: item.Column}
			text, ok := d.text(item, at)
			if !ok {
				// A list with an item missing is not the list that was
				// written, so no rule judges it.
				d.unread[path] = true
			}
			items = append(items, text)
		}
		out.Set(reflect.ValueOf(items))
	case reflect.Pointer:
		out.Set(reflect.New(out.Type().Elem()))
		d.mapping(n, path, out.Elem())
	case reflect.Struct:
		d.mapping(n, path, out)
	default:
		d.fail(path, "is of a type sdash cannot read")
	}
}

// text reads a scalar as the text that was written. An alias is refused
// (as clusterctl refuses it): with anchors a value is no longer written
// where it is used, which is what every position here relies on.
func (d *document) text(n *yaml.Node, path string) (string, bool) {
	switch {
	case n.Kind == yaml.AliasNode:
		d.fail(path, "is an alias; a profile takes no anchors and aliases, so write the value out")
	case n.Kind != yaml.ScalarNode:
		d.fail(path, "must be a string, not %s", shape(n))
	case n.ShortTag() == nullTag:
		d.fail(path, "has no value; give it one or remove it")
	case strings.ContainsRune(n.Value, 0):
		d.fail(path, "holds a NUL character")
	default:
		return n.Value, true
	}
	return "", false
}

// nullTag is the tag of a scalar YAML reads as nothing: an empty value, ~
// or null, unless it is quoted.
const nullTag = "!!null"

// shape names what a node is, for a message that says what was written in
// place of what was expected.
func shape(n *yaml.Node) string {
	switch {
	case n.Kind == yaml.MappingNode:
		return "a mapping"
	case n.Kind == yaml.SequenceNode:
		return "a list"
	case n.Kind == yaml.AliasNode:
		return "an alias"
	case n.ShortTag() == nullTag:
		return "an empty value"
	default:
		return "a string"
	}
}

// fieldsOf maps the key of each field of a document type, the name in its
// yaml tag, to the index of the field.
func fieldsOf(t reflect.Type) map[string]int {
	fields := make(map[string]int, t.NumField())
	for i := range t.NumField() {
		fields[t.Field(i).Tag.Get("yaml")] = i
	}
	return fields
}

// join extends a dotted path by a key.
func join(path, key string) string {
	if path == "" {
		return key
	}
	return path + "." + key
}

// fail reports a field whose value cannot be read, at the place the field
// is written, and keeps the rules from judging it a second time.
func (d *document) fail(path, format string, args ...any) {
	d.unread[path] = true
	d.report(path, format, args...)
}

// report adds a problem with the field at path, at the place of that field.
func (d *document) report(path, format string, args ...any) {
	d.add(d.where(path), path, format, args...)
}

// add adds a problem with a field at a place of the document.
func (d *document) add(position Position, field, format string, args ...any) {
	d.problems = append(d.problems, Problem{Position: position, Field: field, Message: fmt.Sprintf(format, args...)})
}

// where is the place the field at path is written. A field that is not
// written has the place of the closest mapping around it that is, and in
// the end that of the document: that is where it is missing.
//
// Adapted from GSI-HPC/clusterctl internal/config/document.go.
func (d *document) where(path string) Position {
	for {
		if position, ok := d.at[path]; ok {
			return position
		}
		if path == "" {
			return Position{File: d.file}
		}
		path = parent(path)
	}
}

// parent is the path of the mapping or the list a path lies in.
func parent(path string) string {
	return path[:max(strings.LastIndexAny(path, ".["), 0)]
}
