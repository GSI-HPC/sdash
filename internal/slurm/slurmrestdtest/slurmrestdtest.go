// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package slurmrestdtest is a fake slurmrestd for tests: an HTTP server that
// answers with what the slurmrestd of a sind cluster answered, the vendored
// document and captures of one data_parser version and the error cases of
// one Slurm release (doc/adr/0016-e2e-and-fixtures-on-sind.md). It writes no
// answer of its own; a request it has no capture for gets the 404 of a path
// slurmrestd does not know.
package slurmrestdtest

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/GSI-HPC/sdash/internal/slurm/versions"
)

// Token says how the server takes the token of a request.
type Token int

const (
	// Accepted is a token slurmctld and slurmdbd accept.
	Accepted Token = iota
	// Malformed is a token that is no JSON Web Token.
	Malformed
	// Expired is a token whose lifespan is over.
	Expired
)

// Server is a running fake slurmrestd.
type Server struct {
	*httptest.Server
	parser versions.Parser
	// dir holds the document and the captures of the parser, errors the
	// error cases of the release.
	dir    string
	errors string
	status map[string]int
	// captures maps the name of each captured answer to its file. A request
	// is served from it alone, so that no part of a request ever becomes a
	// part of a path that is opened.
	captures map[string]string

	mu       sync.Mutex
	token    Token
	requests []*http.Request
}

// New starts a fake slurmrestd for the parser p, with the error cases of the
// release its document was captured on, and stops it when the test ends.
func New(t testing.TB, p versions.Parser) *Server {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("slurmrestdtest: cannot tell where its sources are")
	}
	slurm := filepath.Join(filepath.Dir(file), "..")
	s := &Server{
		parser: p,
		dir:    filepath.Join(slurm, "versions", p.Dir()),
		status: map[string]int{},
	}
	release, err := s.release()
	if err != nil {
		t.Fatalf("slurmrestdtest: %v", err)
	}
	s.errors = filepath.Join(slurm, "releases", "testdata", release, "errors-"+p.Dir())
	if err := s.readCaptures(); err != nil {
		t.Fatalf("slurmrestdtest: %v", err)
	}
	if err := s.readStatus(); err != nil {
		t.Fatalf("slurmrestdtest: %v", err)
	}
	s.Server = httptest.NewServer(http.HandlerFunc(s.serve))
	t.Cleanup(s.Close)
	return s
}

// release names the directory of the release the document of the parser was
// captured on, as e2e/vendor.sh does.
func (s *Server) release() (string, error) {
	body, err := os.ReadFile(filepath.Join(s.dir, "openapi.json"))
	if err != nil {
		return "", err
	}
	var doc struct {
		Info struct {
			Slurm struct {
				Version struct {
					Major string `json:"major"`
					Minor string `json:"minor"`
				} `json:"version"`
			} `json:"x-slurm"`
		} `json:"info"`
	}
	if err := json.Unmarshal(body, &doc); err != nil {
		return "", err
	}
	v := doc.Info.Slurm.Version
	return "r" + v.Major + v.Minor, nil
}

// readCaptures lists the captured answers of the parser.
func (s *Server) readCaptures() error {
	dir := filepath.Join(s.dir, "testdata")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	s.captures = map[string]string{}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") {
			s.captures[e.Name()] = filepath.Join(dir, e.Name())
		}
	}
	return nil
}

// readStatus reads the HTTP status of each error case.
func (s *Server) readStatus() error {
	f, err := os.Open(filepath.Join(s.errors, "status.tsv"))
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }() // read only
	lines := bufio.NewScanner(f)
	for lines.Scan() {
		code, name, ok := strings.Cut(lines.Text(), "\t")
		n, err := strconv.Atoi(code)
		if !ok || err != nil {
			return &os.PathError{Op: "parse", Path: f.Name(), Err: os.ErrInvalid}
		}
		s.status[name] = n
	}
	return lines.Err()
}

// SetToken makes the server take every token as t from now on.
func (s *Server) SetToken(t Token) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.token = t
}

// Requests returns the requests the server has had, oldest first.
func (s *Server) Requests() []*http.Request {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]*http.Request(nil), s.requests...)
}

// byName maps a path below the parser, as in /slurm/{v}/node/worker-2, to the
// capture of that request, and to an error case for what the cluster lacks.
var byName = []struct {
	pattern *regexp.Regexp
	found   func(m []string) string
	missing string
}{
	{regexp.MustCompile(`^slurm/job/([0-9]+)$`), func(m []string) string { return "slurm-job-" + m[1] + ".json" }, "unknown-job.json"},
	{regexp.MustCompile(`^slurm/node/(worker-[01])$`), func(m []string) string { return "slurm-node-" + m[1] + ".json" }, ""},
	{regexp.MustCompile(`^slurm/node/(worker-2)$`), func(m []string) string { return "slurm-node-" + m[1] + "-drained.json" }, ""},
	{regexp.MustCompile(`^slurm/node/.+$`), nil, "unknown-node.json"},
	{regexp.MustCompile(`^slurm/partition/.+$`), func([]string) string { return "slurm-partition.json" }, ""},
	{regexp.MustCompile(`^slurm/reservation/.+$`), func([]string) string { return "slurm-reservation.json" }, ""},
	{regexp.MustCompile(`^slurmdb/job/([0-9]+)$`), func(m []string) string { return "slurmdb-job-" + m[1] + ".json" }, ""},
	{regexp.MustCompile(`^slurmdb/user/(.+)$`), func(m []string) string { return "slurmdb-user-" + m[1] + ".json" }, ""},
}

func (s *Server) serve(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	s.requests = append(s.requests, r.Clone(r.Context()))
	token := s.token
	s.mu.Unlock()

	// slurmrestd checks that a token is there before it routes, and never
	// whether it is good: slurmctld and slurmdbd do.
	if r.Header.Get("X-SLURM-USER-TOKEN") == "" {
		s.serveError(w, "no-token.json")
		return
	}
	if r.Method != http.MethodGet {
		http.NotFound(w, r)
		return
	}
	if r.URL.Path == "/openapi/v3" {
		s.serveFile(w, http.StatusOK, filepath.Join(s.dir, "openapi.json"))
		return
	}

	api, rest, ok := strings.Cut(strings.TrimPrefix(r.URL.Path, "/"), "/"+string(s.parser)+"/")
	if !ok || (api != "slurm" && api != "slurmdb") {
		http.NotFound(w, r)
		return
	}
	if token != Accepted {
		s.serveBadToken(w, token, api, rest)
		return
	}
	if strings.HasSuffix(rest, "/") {
		if path, ok := s.captures[api+"-"+strings.TrimSuffix(rest, "/")+".json"]; ok {
			s.serveFile(w, http.StatusOK, path)
			return
		}
	}
	for _, b := range byName {
		m := b.pattern.FindStringSubmatch(api + "/" + rest)
		if m == nil {
			continue
		}
		if b.found != nil {
			if path, ok := s.captures[b.found(m)]; ok {
				s.serveFile(w, http.StatusOK, path)
				return
			}
		}
		if b.missing != "" {
			s.serveError(w, b.missing)
			return
		}
	}
	http.NotFound(w, r)
}

// serveBadToken answers as slurmrestd answered a malformed or an expired
// token: the ping as the ping did, every other request below /slurm/ as the
// job list did, and every request below /slurmdb/ as the QOS did.
func (s *Server) serveBadToken(w http.ResponseWriter, t Token, api, rest string) {
	kind := "malformed-token-"
	if t == Expired {
		kind = "expired-token-"
	}
	switch {
	case api == "slurmdb":
		s.serveError(w, kind+"qos.json")
	case rest == "ping/":
		s.serveError(w, kind+"ping.json")
	default:
		s.serveError(w, kind+"jobs.json")
	}
}

// serveError answers with an error case and the status it was captured with.
func (s *Server) serveError(w http.ResponseWriter, name string) {
	status, ok := s.status[name]
	if !ok {
		http.Error(w, "slurmrestdtest: no status for "+name, http.StatusInternalServerError)
		return
	}
	s.serveFile(w, status, filepath.Join(s.errors, name))
}

func (s *Server) serveFile(w http.ResponseWriter, status int, path string) {
	body, err := os.ReadFile(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(body) > 0 && body[0] == '{' {
		w.Header().Set("Content-Type", "application/json")
	} else {
		w.Header().Set("Content-Type", "text/plain")
	}
	w.WriteHeader(status)
	_, _ = w.Write(body) // a test that hangs up early gets less; nothing to do about it
}
