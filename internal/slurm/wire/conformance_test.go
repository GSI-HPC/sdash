// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package wire

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/slurm/versions"
)

// schema is the part of an OpenAPI schema object the conformance test reads.
type schema struct {
	Ref        string             `json:"$ref"`
	Type       string             `json:"type"`
	Properties map[string]*schema `json:"properties"`
	Items      *schema            `json:"items"`
}

// document is a vendored OpenAPI document.
type document struct {
	Paths map[string]map[string]struct {
		Responses map[string]struct {
			Content map[string]struct {
				Schema *schema `json:"schema"`
			} `json:"content"`
		} `json:"responses"`
	} `json:"paths"`
	Components struct {
		Schemas map[string]*schema `json:"schemas"`
	} `json:"components"`
}

func readDocument(t *testing.T, p versions.Parser) document {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("..", "versions", p.Dir(), "openapi.json"))
	require.NoError(t, err)
	var doc document
	require.NoError(t, json.Unmarshal(body, &doc))
	return doc
}

// answer returns the schema of the answer to GET path, with {v} the parser.
func (d document) answer(p versions.Parser, path string) (*schema, error) {
	path = strings.ReplaceAll(path, "{v}", string(p))
	op, ok := d.Paths[path]["get"]
	if !ok {
		return nil, fmt.Errorf("the document has no GET %s", path)
	}
	media, ok := op.Responses["200"].Content["application/json"]
	if !ok || media.Schema == nil {
		return nil, fmt.Errorf("GET %s has no JSON answer", path)
	}
	return media.Schema, nil
}

// resolve follows the $ref of s to the schema it names.
func (d document) resolve(s *schema) *schema {
	for s != nil && s.Ref != "" {
		s = d.Components.Schemas[strings.TrimPrefix(s.Ref, "#/components/schemas/")]
	}
	return s
}

// conform checks that every field of the Go type typ is in the schema s
// with a type that fits, and returns what is not, by its JSON path.
func (d document) conform(at string, typ reflect.Type, s *schema) []string {
	s = d.resolve(s)
	if s == nil {
		return []string{at + ": the schema it refers to is missing"}
	}
	var want string
	switch typ.Kind() {
	case reflect.Struct:
		return d.conformStruct(at, typ, s)
	case reflect.Slice:
		if s.Type != "array" {
			return []string{fmt.Sprintf("%s: an array here, %q in the document", at, s.Type)}
		}
		return d.conform(at+"[]", typ.Elem(), s.Items)
	case reflect.String:
		want = "string"
	case reflect.Bool:
		want = "boolean"
	case reflect.Int, reflect.Int64:
		want = "integer"
	case reflect.Float64:
		want = "number"
	default:
		return []string{fmt.Sprintf("%s: the test knows no %s", at, typ)}
	}
	if s.Type != want {
		return []string{fmt.Sprintf("%s: %s here, %q in the document", at, want, s.Type)}
	}
	return nil
}

func (d document) conformStruct(at string, typ reflect.Type, s *schema) []string {
	if s.Type != "object" && s.Properties == nil {
		return []string{fmt.Sprintf("%s: an object here, %q in the document", at, s.Type)}
	}
	var wrong []string
	for f := range typ.Fields() {
		if f.Anonymous {
			wrong = append(wrong, d.conformStruct(at, f.Type, s)...)
			continue
		}
		name, _, _ := strings.Cut(f.Tag.Get("json"), ",")
		prop, ok := s.Properties[name]
		if !ok {
			wrong = append(wrong, fmt.Sprintf("%s.%s: not in the document", at, name))
			continue
		}
		wrong = append(wrong, d.conform(at+"."+name, f.Type, prop)...)
	}
	return wrong
}

// TestTheWireStructsConformToEveryVendoredDocument is the conformance test
// of doc/adr/0005-versions-releases-and-capabilities.md: each field a struct
// here reads exists in the document of each parser sdash speaks, with a type
// that fits. It stands in for a compiler that cannot know.
func TestTheWireStructsConformToEveryVendoredDocument(t *testing.T) {
	t.Parallel()
	answers := map[string]any{
		"/slurm/{v}/ping/":                          Pings{},
		"/slurm/{v}/jobs/":                          Jobs{},
		"/slurm/{v}/job/{job_id}":                   Jobs{},
		"/slurm/{v}/nodes/":                         Nodes{},
		"/slurm/{v}/node/{node_name}":               Nodes{},
		"/slurm/{v}/partitions/":                    Partitions{},
		"/slurm/{v}/partition/{partition_name}":     Partitions{},
		"/slurm/{v}/reservations/":                  Reservations{},
		"/slurm/{v}/reservation/{reservation_name}": Reservations{},
	}
	for _, p := range versions.Known() {
		doc := readDocument(t, p)
		for path, v := range answers {
			t.Run(string(p)+" "+path, func(t *testing.T) {
				t.Parallel()
				s, err := doc.answer(p, path)
				require.NoError(t, err)
				assert.Empty(t, doc.conform("", reflect.TypeOf(v), s))
			})
		}
	}
}

// The test itself has to tell a field that is missing, or of another type.
func TestTheConformanceTestFindsWhatDoesNotConform(t *testing.T) {
	t.Parallel()
	doc := readDocument(t, versions.Known()[0])
	s, err := doc.answer(versions.Known()[0], "/slurm/{v}/ping/")
	require.NoError(t, err)

	type ping struct {
		Hostname bool  `json:"hostname"`
		Gone     int64 `json:"no_such_field"`
	}
	wrong := doc.conform("", reflect.TypeFor[struct {
		Pings []ping `json:"pings"`
	}](), s)
	assert.ElementsMatch(t, []string{
		`.pings[].hostname: boolean here, "string" in the document`,
		`.pings[].no_such_field: not in the document`,
	}, wrong)
}
