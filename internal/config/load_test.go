// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"testing/fstest"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// named is a valid profile of a cluster of that name.
func named(name string) string {
	return strings.Replace(profile(viaURL, byEnv), "name: vesta", "name: "+name, 1)
}

// notAProfile is YAML that would fail the load if it were read.
const notAProfile = "kind: NotAProfile\n"

// directoryOf writes files into a new directory and returns its path.
func directoryOf(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for name, content := range files {
		path := filepath.Join(dir, name)
		require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o700))
		require.NoError(t, os.WriteFile(path, []byte(content), 0o600))
	}
	return dir
}

// problemsIn loads dir, which has to hold profiles that are not valid, and
// returns the problems with the directory cut from every file name in them:
// a problem names its file, and where it points at another place that file
// too, by the path sdash opened.
func problemsIn(t *testing.T, dir string) []string {
	t.Helper()
	profiles, err := Load(dir)
	require.Nil(t, profiles, "no cluster is returned beside an error")
	var invalid *Error
	require.ErrorAs(t, err, &invalid)
	rendered := make([]string, len(invalid.Problems))
	for i, problem := range invalid.Problems {
		rendered[i] = strings.ReplaceAll(problem.String(), dir+string(filepath.Separator), "")
	}
	return rendered
}

// Which files are profiles is decided by their names alone. Everything
// else in the directory is left alone, though each of these would fail the
// load if it were read. The file with the extension in capitals has a name
// of its own: a file system that ignores case, as a Mac's does, takes
// vesta.YAML and vesta.yaml for one file.
func TestTheYAMLFilesOfTheDirectoryAreReadAndNothingElse(t *testing.T) {
	t.Parallel()

	dir := directoryOf(t, map[string]string{
		"vesta.yaml":        named("vesta"),
		"others.yaml":       named("lustre") + "---\n" + named("dev"),
		".vesta.yaml.swp":   notAProfile,
		".hidden.yaml":      notAProfile,
		"vesta.yml":         notAProfile,
		"vesta.yaml.bak":    notAProfile,
		"capitals.YAML":     notAProfile,
		"notes.txt":         notAProfile,
		"yaml":              notAProfile,
		"old/vesta.yaml":    notAProfile,
		"old/deeper/x.yaml": notAProfile,
	})

	profiles, err := Load(dir)

	require.NoError(t, err)
	assert.Equal(t, dir, profiles.Dir)
	assert.False(t, profiles.Missing)
	assert.Equal(t, []string{"dev", "lustre", "vesta"}, profiles.Names())
}

// The list is by name whatever the files are called and however the
// documents are spread over them, so that renaming a file reorders nothing
// the user sees.
func TestTheClustersAreSortedByNameWhateverTheirFilesAreCalled(t *testing.T) {
	t.Parallel()

	dir := directoryOf(t, map[string]string{
		"a.yaml": named("zeta") + "---\n" + named("mid"),
		"z.yaml": named("alpha"),
		"m.yaml": named("beta-2") + "---\n" + named("beta-10"),
	})

	profiles, err := Load(dir)

	require.NoError(t, err)
	assert.Equal(t, []string{"alpha", "beta-10", "beta-2", "mid", "zeta"}, profiles.Names())
	assert.Equal(t, Position{File: filepath.Join(dir, "z.yaml"), Line: 4, Column: 3}, profiles.Clusters[0].Position)
	assert.Equal(t, Position{File: filepath.Join(dir, "a.yaml"), Line: 12, Column: 3}, profiles.Clusters[3].Position)
}

// A user who has configured nothing has no clusters, and that is not a
// mistake of theirs.
func TestADirectoryWithoutProfilesHoldsNoClustersAndIsNoError(t *testing.T) {
	t.Parallel()

	t.Run("an empty directory", func(t *testing.T) {
		t.Parallel()

		dir := t.TempDir()

		profiles, err := Load(dir)

		require.NoError(t, err)
		assert.Equal(t, &Profiles{Dir: dir}, profiles)
		assert.Empty(t, profiles.Names())
	})

	t.Run("a directory that does not exist", func(t *testing.T) {
		t.Parallel()

		dir := filepath.Join(t.TempDir(), "sdash")

		profiles, err := Load(dir)

		require.NoError(t, err)
		assert.Equal(t, &Profiles{Dir: dir, Missing: true}, profiles)
		assert.NoDirExists(t, dir, "reading creates nothing")
	})

	t.Run("a directory with files that hold no document", func(t *testing.T) {
		t.Parallel()

		dir := directoryOf(t, map[string]string{"empty.yaml": "", "later.yaml": "# to be written\n---\n"})

		profiles, err := Load(dir)

		require.NoError(t, err)
		assert.Empty(t, profiles.Clusters)
		assert.False(t, profiles.Missing)
	})
}

// What cannot be a directory of profiles is told apart from one that is
// merely not there: the user named something, and it is something else.
func TestAConfigurationDirectoryThatIsNoDirectoryIsAnError(t *testing.T) {
	t.Parallel()

	t.Run("a file", func(t *testing.T) {
		t.Parallel()

		file := filepath.Join(directoryOf(t, map[string]string{"vesta.yaml": named("vesta")}), "vesta.yaml")

		profiles, err := Load(file)

		assert.Nil(t, profiles)
		require.EqualError(t, err, "read the configuration directory: "+file+" is not a directory")
	})

	t.Run("a path through a file", func(t *testing.T) {
		t.Parallel()

		file := filepath.Join(directoryOf(t, map[string]string{"vesta.yaml": named("vesta")}), "vesta.yaml")

		profiles, err := Load(filepath.Join(file, "sdash"))

		assert.Nil(t, profiles)
		require.ErrorIs(t, err, syscall.ENOTDIR)
		assert.Contains(t, err.Error(), "read the configuration directory: ")
	})
}

// A second profile of a name is an error and never replaces the first: a
// stale copy of a file would otherwise decide where sdash connects.
func TestANameUsedTwiceIsAnErrorThatNamesBothPlaces(t *testing.T) {
	t.Parallel()

	t.Run("in two files", func(t *testing.T) {
		t.Parallel()

		dir := directoryOf(t, map[string]string{
			"vesta.yaml":     named("vesta"),
			"vesta_old.yaml": "# the profile before the move\n" + named("vesta"),
			"lustre.yaml":    named("lustre"),
		})

		assert.Equal(t, []string{
			`vesta_old.yaml:5:3: metadata.name: is a name another cluster has, at vesta.yaml:4:3; remove one of them or give it a name of its own`,
		}, problemsIn(t, dir))

		// Both places are paths a user can open as they stand.
		_, err := Load(dir)
		var invalid *Error
		require.ErrorAs(t, err, &invalid)
		assert.Equal(t, filepath.Join(dir, "vesta_old.yaml"), invalid.Problems[0].File)
		assert.Contains(t, invalid.Problems[0].Message, "another cluster has, at "+filepath.Join(dir, "vesta.yaml")+":4:3;")
	})

	t.Run("in one file", func(t *testing.T) {
		t.Parallel()

		dir := directoryOf(t, map[string]string{"clusters.yaml": named("vesta") + "---\n" + named("vesta")})

		assert.Equal(t, []string{
			`clusters.yaml:12:3: metadata.name: is a name another cluster has, at clusters.yaml:4:3; remove one of them or give it a name of its own`,
		}, problemsIn(t, dir))
	})

	t.Run("three times", func(t *testing.T) {
		t.Parallel()

		dir := directoryOf(t, map[string]string{"a.yaml": named("vesta"), "b.yaml": named("vesta"), "c.yaml": named("vesta")})

		assert.Equal(t, []string{
			`b.yaml:4:3: metadata.name: is a name another cluster has, at a.yaml:4:3; remove one of them or give it a name of its own`,
			`c.yaml:4:3: metadata.name: is a name another cluster has, at a.yaml:4:3; remove one of them or give it a name of its own`,
		}, problemsIn(t, dir))
	})
}

// One run reports everything there is to fix, in the order a person works
// through it: file by file, and from the top of each file down.
func TestTheProblemsOfAllFilesAreReportedInTheOrderOfFilesAndLines(t *testing.T) {
	t.Parallel()

	dir := directoryOf(t, map[string]string{
		"b.yaml": profile(viaURL, "token: {env: 1TOKEN}", "user: a b") + "---\n" + named("Lustre"),
		"a.yaml": "apiVersion: sdash/v1\n---\n" + profile(byEnv),
		"c.yaml": "spec: [\n",
		"d.yaml": named("vesta"),
	})

	assert.Equal(t, []string{
		`a.yaml:1:1: apiVersion: is not supported; this sdash reads "sdash/v1alpha1"`,
		`a.yaml:7:1: spec.endpoint: is missing; it names the slurmrestd by "url" or "socket"`,
		`b.yaml:7:11: spec.token.env: ` + notAVariable,
		`b.yaml:8:3: spec.user: is not a user name: letters, digits, ".", "_" and "-", not beginning with "-"`,
		`b.yaml:13:3: metadata.name: is not a name sdash takes: a name is at most 63 of a-z, 0-9 and "-", and begins and ends with a letter or a digit`,
		`c.yaml: is not YAML: line 1: did not find expected node content`,
	}, problemsIn(t, dir))
}

// loadWithin calls Load and fails the test when it does not return. A
// loader that opened a named pipe the usual way would wait for a writer
// that never comes, and the test would hang without saying why.
func loadWithin(t *testing.T, dir string) (*Profiles, error) {
	t.Helper()
	type result struct {
		profiles *Profiles
		err      error
	}
	done := make(chan result, 1)
	go func() {
		profiles, err := Load(dir)
		done <- result{profiles, err}
	}()
	select {
	case got := <-done:
		return got.profiles, got.err
	case <-time.After(30 * time.Second):
		require.FailNow(t, "the load did not return: it waits on something it should not have opened")
		return nil, nil
	}
}

// A profile is a file, or a link to one, as a tool that manages a user's
// configuration files leaves them. Whatever else carries the name of a
// profile is refused by what it is, and none of it is read: a pipe would
// hold sdash for good, and /dev/zero has no end.
func TestOnlyARegularFileIsReadAsAProfile(t *testing.T) {
	t.Parallel()

	elsewhere := directoryOf(t, map[string]string{"vesta.yaml": named("vesta"), "inner/lustre.yaml": named("lustre")})
	dir := t.TempDir()
	require.NoError(t, os.Symlink(filepath.Join(elsewhere, "vesta.yaml"), filepath.Join(dir, "linked.yaml")))

	t.Run("a link to a file is followed", func(t *testing.T) {
		t.Parallel()

		profiles, err := loadWithin(t, dir)

		require.NoError(t, err)
		assert.Equal(t, []string{"vesta"}, profiles.Names())
		assert.Equal(t, filepath.Join(dir, "linked.yaml"), profiles.Clusters[0].Position.File,
			"the profile is where the user put its name, not where the link leads")
	})

	t.Run("anything else is refused and not read", func(t *testing.T) {
		t.Parallel()

		dir := t.TempDir()
		require.NoError(t, os.Symlink(filepath.Join(elsewhere, "vesta.yaml"), filepath.Join(dir, "a-link.yaml")))
		require.NoError(t, syscall.Mkfifo(filepath.Join(dir, "b-pipe.yaml"), 0o600))
		require.NoError(t, os.Mkdir(filepath.Join(dir, "c-directory.yaml"), 0o700))
		require.NoError(t, os.WriteFile(filepath.Join(dir, "c-directory.yaml", "inner.yaml"), []byte(notAProfile), 0o600))
		require.NoError(t, os.Symlink(filepath.Join(elsewhere, "inner"), filepath.Join(dir, "d-link-to-directory.yaml")))
		require.NoError(t, os.Symlink("/dev/zero", filepath.Join(dir, "e-link-to-device.yaml")))
		require.NoError(t, os.Symlink(filepath.Join(dir, "b-pipe.yaml"), filepath.Join(dir, "f-link-to-pipe.yaml")))
		require.NoError(t, os.Symlink(filepath.Join(dir, "nowhere"), filepath.Join(dir, "g-link-to-nothing.yaml")))

		profiles, err := loadWithin(t, dir)

		assert.Nil(t, profiles)
		var invalid *Error
		require.ErrorAs(t, err, &invalid)
		var rendered []string
		for _, problem := range invalid.Problems {
			rendered = append(rendered, strings.TrimPrefix(problem.String(), dir+"/"))
		}
		assert.Equal(t, []string{
			"b-pipe.yaml: is a named pipe, and only a file is read as a profile",
			"c-directory.yaml: is a directory, and only a file is read as a profile",
			"d-link-to-directory.yaml: is a directory, and only a file is read as a profile",
			"e-link-to-device.yaml: is a device, and only a file is read as a profile",
			"f-link-to-pipe.yaml: is a named pipe, and only a file is read as a profile",
			"g-link-to-nothing.yaml: cannot be read: no such file or directory",
		}, rendered)
	})
}

// recorded is a file system that remembers which names were opened.
type recorded struct {
	fs.FS
	opened []string
}

func (r *recorded) Open(name string) (fs.File, error) {
	r.opened = append(r.opened, name)
	return r.FS.Open(name)
}

// Stat describes a file as the file system below does, which opens nothing
// when that is a directory on disk.
func (r *recorded) Stat(name string) (fs.FileInfo, error) {
	return fs.Stat(r.FS, name)
}

// A profile names files: a token file, a CA file, a socket. Reading the
// profile reads none of them. They may not be there yet, and looking is not
// what a check of the profile is for. Here they are there, and beside the
// profiles lies everything that is not one.
//
// The recorder sees what goes through the file system the loader is handed.
// That nothing goes around it is the next test's to show.
func TestNothingIsOpenedButTheDirectoryAndItsProfiles(t *testing.T) {
	t.Parallel()

	beside := directoryOf(t, map[string]string{"token": "eyJhbGciOiJIUzI1NiJ9.e30.c2VjcmV0", "ca.pem": "-----BEGIN CERTIFICATE-----\n", "slurmrestd.socket": ""})
	dir := directoryOf(t, map[string]string{
		"lustre.yaml": profile(
			"endpoint:", "  url: https://slurm.example.org", "  caFile: "+filepath.Join(beside, "ca.pem"),
			"token:", "  file: "+filepath.Join(beside, "token")),
		"vesta.yaml": strings.Replace(profile(
			"endpoint:", "  socket: "+filepath.Join(beside, "slurmrestd.socket"),
			"ssh:", "  host: login.example.org",
			"token:", "  command: ["+filepath.Join(beside, "token")+", "+filepath.Join(beside, "ca.pem")+"]"),
			"name: vesta", "name: lustre-2", 1),
		".hidden.yaml":   notAProfile,
		"notes.txt":      notAProfile,
		"old/vesta.yaml": notAProfile,
	})
	require.NoError(t, syscall.Mkfifo(filepath.Join(dir, "pipe.yaml"), 0o600))
	require.NoError(t, os.Symlink("/dev/zero", filepath.Join(dir, "zero.yaml")))
	files := &recorded{FS: directory(dir)}

	_, err := load(files, dir)

	var invalid *Error
	require.ErrorAs(t, err, &invalid, "the pipe and the device are reported")
	assert.Len(t, invalid.Problems, 2)
	assert.Equal(t, []string{".", "lustre.yaml", "vesta.yaml"}, files.opened)
}

// The loader is handed one directory and reads names inside it. A name that
// leads elsewhere is refused by the directory itself, whatever asks for it.
func TestTheDirectoryOpensNoNameThatLeadsOutOfIt(t *testing.T) {
	t.Parallel()

	outer := directoryOf(t, map[string]string{"secret": "s3cr3t", "sdash/vesta.yaml": named("vesta")})
	dir := directory(filepath.Join(outer, "sdash"))

	for _, name := range []string{"../secret", "/etc/passwd", filepath.Join(outer, "secret"), "a/../../secret", ""} {
		file, err := dir.Open(name)
		require.ErrorIs(t, err, fs.ErrInvalid, name)
		assert.Nil(t, file, name)

		_, err = dir.Stat(name)
		require.ErrorIs(t, err, fs.ErrInvalid, name)
	}

	file, err := dir.Open("vesta.yaml")
	require.NoError(t, err)
	require.NoError(t, file.Close())
}

// The kind of a file is looked at before it is opened, but between the look
// and the open a pipe can take the place of a profile. An open that waited
// on it for a writer would hold sdash at its start for as long as whoever
// put it there liked.
func TestTheDirectoryOpensANamedPipeWithoutWaitingForAWriter(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	pipe := filepath.Join(dir, "vesta.yaml")
	require.NoError(t, syscall.Mkfifo(pipe, 0o600))
	// Should the open wait after all, a writer lets it go when the test
	// ends, so that the test fails and does not leave a thread behind.
	t.Cleanup(func() {
		if writer, err := os.OpenFile(pipe, os.O_WRONLY|syscall.O_NONBLOCK, 0); err == nil {
			_ = writer.Close()
		}
	})

	opened := make(chan error, 1)
	go func() {
		file, err := directory(dir).Open("vesta.yaml")
		if err == nil {
			err = file.Close()
		}
		opened <- err
	}()

	select {
	case err := <-opened:
		require.NoError(t, err)
	case <-time.After(30 * time.Second):
		require.FailNow(t, "the open waits for a writer")
	}
}

// A file the user may not read is a problem of that file, said with the
// others, and not a failure of the load as a whole. A fake stands in for
// the permission: the tests may run as a user no mode keeps out.
func TestAFileThatCannotBeReadIsAProblemOfThatFile(t *testing.T) {
	t.Parallel()

	files := denied{
		FS:   fstest.MapFS{"vesta.yaml": {Data: []byte(named("vesta"))}, "private.yaml": {Data: []byte(named("lustre"))}},
		name: "private.yaml",
	}

	profiles, err := load(files, "/home/alice/.config/sdash")

	assert.Nil(t, profiles)
	var invalid *Error
	require.ErrorAs(t, err, &invalid)
	require.Len(t, invalid.Problems, 1)
	assert.Equal(t, "/home/alice/.config/sdash/private.yaml: cannot be read: permission denied", invalid.Problems[0].String())
}

// denied is a file system one of whose files cannot be opened.
type denied struct {
	fs.FS
	name string
}

func (d denied) Open(name string) (fs.File, error) {
	if name == d.name {
		return nil, &fs.PathError{Op: "open", Path: name, Err: fs.ErrPermission}
	}
	return d.FS.Open(name)
}

func (d denied) Stat(name string) (fs.FileInfo, error) {
	return fs.Stat(d.FS, name)
}

// Between the look at a file and its opening the file can be replaced.
// What is read is judged again once it is open, so a pipe put in the place
// of a profile at that moment is still refused.
func TestAFileReplacedByAPipeBeforeItIsOpenedIsRefused(t *testing.T) {
	t.Parallel()

	files := swapped{
		before: fstest.MapFS{"vesta.yaml": {Data: []byte(named("vesta"))}},
		after:  fstest.MapFS{"vesta.yaml": {Data: []byte(named("vesta")), Mode: fs.ModeNamedPipe | 0o600}},
	}

	profiles, err := load(files, "sdash")

	assert.Nil(t, profiles)
	var invalid *Error
	require.ErrorAs(t, err, &invalid)
	require.Len(t, invalid.Problems, 1)
	assert.Equal(t, "sdash/vesta.yaml: is a named pipe, and only a file is read as a profile", invalid.Problems[0].String())
}

// swapped is a file system that describes its files as before holds them
// and opens them as after does.
type swapped struct {
	before, after fstest.MapFS
}

func (s swapped) Open(name string) (fs.File, error) {
	if name == "." {
		return s.before.Open(name)
	}
	return s.after.Open(name)
}

func (s swapped) Stat(name string) (fs.FileInfo, error) {
	return s.before.Stat(name)
}

// A profile is a few lines. A file of the size of a disk image that carries
// the name of one is not read into memory to find that out.
func TestAFileBeyondTheSizeLimitIsRefused(t *testing.T) {
	t.Parallel()

	comment := "# " + strings.Repeat("x", 61) + "\n"
	atTheLimit := strings.Repeat(comment, maxFileSize/len(comment))
	require.Len(t, atTheLimit, maxFileSize)

	t.Run("a file of exactly the limit is read", func(t *testing.T) {
		t.Parallel()

		profiles, err := Load(directoryOf(t, map[string]string{"long.yaml": atTheLimit}))

		require.NoError(t, err)
		assert.Empty(t, profiles.Clusters)
	})

	t.Run("a file one byte beyond it is not", func(t *testing.T) {
		t.Parallel()

		dir := directoryOf(t, map[string]string{"long.yaml": atTheLimit + "#"})

		assert.Equal(t, []string{"long.yaml: is larger than 1048576 bytes, which no profile is"}, problemsIn(t, dir))
	})

	// A device reports a size of 0 and never ends. The limit holds for what
	// is read, not for what the file says of itself.
	t.Run("a file that understates its size is not either", func(t *testing.T) {
		t.Parallel()

		files := swapped{
			before: fstest.MapFS{"long.yaml": {Data: []byte("# short\n")}},
			after:  fstest.MapFS{"long.yaml": {Data: []byte(atTheLimit + "#")}},
		}

		_, err := load(files, "sdash")

		var invalid *Error
		require.ErrorAs(t, err, &invalid)
		require.Len(t, invalid.Problems, 1)
		assert.Equal(t, "sdash/long.yaml: is larger than 1048576 bytes, which no profile is", invalid.Problems[0].String())
	})
}
