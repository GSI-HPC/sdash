// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package browser opens the user's browser on the address sdash serves,
// without showing the launch token to the other users of the machine.
//
// The address carries the token that signs the browser in
// (doc/adr/0012-local-listener-security.md), and the argument list of a
// process is readable by every user of the host. So the desktop's opener is
// never handed the address. It is handed the path of a file, readable by its
// owner alone, that redirects to it: the mechanism Jupyter introduced as
// use_redirect_file for the same reason.
package browser

import (
	"errors"
	"fmt"
	"html"
	"io/fs"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"syscall"
)

// redirectPage is the file the opener is given. It holds no script and no
// style: a page opened from a file has no reason to run either, and the
// link is there for a browser that does not follow the refresh.
const redirectPage = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=%[1]s">
<title>Opening sdash</title>
<p><a href="%[1]s">Open sdash</a></p>
`

// Opener opens an address in the browser of the desktop sdash runs in. Its
// fields are what it takes from the process, so that a test can stand in for
// each; System fills them for the program.
type Opener struct {
	// GOOS names the operating system, as runtime.GOOS does.
	GOOS string
	// Getenv reads a variable of the environment, as os.Getenv does.
	Getenv func(string) string
	// CacheDir returns the user's cache directory, as os.UserCacheDir does.
	CacheDir func() (string, error)
	// Start runs the desktop's opener with its arguments and returns once
	// it has started, without waiting for the browser.
	Start func(name string, args ...string) error
}

// System returns the Opener of the running process.
func System() Opener {
	return Opener{
		GOOS:     runtime.GOOS,
		Getenv:   os.Getenv,
		CacheDir: os.UserCacheDir,
		Start:    start,
	}
}

// Skip says why no browser can be opened from this process, and returns ""
// when one can.
//
// Under SSH the browser that would start is one on the remote host, which
// is not where the user sits. On Linux a process without a display has no
// desktop to open anything in. In both cases the user opens the printed
// address instead.
func (o Opener) Skip() string {
	if o.command() == "" {
		return "no opener is known for " + o.GOOS
	}
	if o.Getenv("SSH_CONNECTION") != "" {
		return "the session runs under SSH"
	}
	if o.GOOS == "linux" && o.Getenv("DISPLAY") == "" && o.Getenv("WAYLAND_DISPLAY") == "" {
		return "neither DISPLAY nor WAYLAND_DISPLAY is set"
	}
	return ""
}

// command names the program that opens a file in the user's default
// application, or "" on a system sdash is not released for.
func (o Opener) command() string {
	switch o.GOOS {
	case "linux":
		return "xdg-open"
	case "darwin":
		return "open"
	default:
		return ""
	}
}

// Open writes a file that redirects to target and hands it to the desktop's
// opener. It returns the path of the file, which holds the launch token and
// which the caller removes when the server stops.
//
// The file lies in a directory under the user's cache directory, named after
// the port of target: a later run on the same port replaces the file of an
// earlier one that could not remove its own.
func (o Opener) Open(target string) (string, error) {
	command := o.command()
	if command == "" {
		return "", errors.New("no opener is known for " + o.GOOS)
	}
	u, err := url.Parse(target)
	if err != nil {
		return "", fmt.Errorf("parse the address to open: %w", err)
	}
	cache, err := o.CacheDir()
	if err != nil {
		return "", fmt.Errorf("find the cache directory: %w", err)
	}

	dir := filepath.Join(cache, "sdash")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("create the directory of the redirect file: %w", err)
	}
	// MkdirAll leaves a directory that exists as it is, whatever its mode.
	if err := os.Chmod(dir, 0o700); err != nil {
		return "", fmt.Errorf("close the directory of the redirect file to other users: %w", err)
	}

	file := filepath.Join(dir, "open-"+u.Port()+".html")
	if err := writePrivate(file, fmt.Sprintf(redirectPage, html.EscapeString(target))); err != nil {
		return "", fmt.Errorf("write the redirect file: %w", err)
	}
	if err := o.Start(command, file); err != nil {
		// Nothing will read the file, and it holds the token.
		_ = os.Remove(file)
		return "", fmt.Errorf("start %s: %w", command, err)
	}
	return file, nil
}

// writePrivate creates file with content, readable and writable by its owner
// alone. A file of that name left by an earlier run is removed first and a
// new one created, since writing into the old one would keep its mode.
func writePrivate(file, content string) error {
	if err := os.Remove(file); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	f, err := os.OpenFile(file, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	_, err = f.WriteString(content)
	return errors.Join(err, f.Close())
}

// start runs the opener and returns once it has started. The opener hands
// the file to the browser and exits; it is waited for in the background so
// that it does not stay behind as a zombie, and its output is discarded so
// that a browser's chatter does not land in the terminal.
//
// Stopping sdash must not take away a browser that the opener happens to
// still be the parent of. So the command is not bound to a context, and it
// runs in a session of its own: Ctrl-C reaches every process of the
// terminal's foreground group, and closing the terminal every process of its
// session, and the opener and what it started are in neither.
func start(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return err
	}
	// The opener's exit status says nothing sdash could act on: the
	// address is printed in any case.
	go func() { _ = cmd.Wait() }()
	return nil
}
