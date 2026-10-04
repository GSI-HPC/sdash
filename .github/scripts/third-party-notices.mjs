// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Writes the listing of third-party licences that every release archive
// carries (doc/adr/0019-version-in-a-signed-tag.md): each Go module linked
// into the binary and each npm package bundled into the user interface, the
// fonts among them, with the name of its licence and the licence text.
// Nothing of it is committed. "make notices" runs it:
//
//   node .github/scripts/third-party-notices.mjs dist/THIRD-PARTY-NOTICES.txt
//
// It needs Go, whose command the variable GO may name, and the frontend's
// packages installed in web/node_modules.
//
// Every doubt stops it: a module the go command links that the listing lacks,
// a licence nobody could name, a package without a licence text, an installed
// package that is not the one the lockfile names. A release is then not
// built, where a listing with a gap would have shipped.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The exact release of go-licenses that names the licence of each Go module
// and finds its text, so that the listing changes only with what sdash
// requires or with this line; raised by hand. It is installed into a
// temporary directory and removed again, since "go run" cannot be used: it
// would build the tool for the target named in GOOS and GOARCH below.
const goLicenses = "github.com/google/go-licenses/v2@v2.0.1";

// The release targets, as in .goreleaser.yaml. What the binary links is asked
// for each of them, because a package may be built for one system only.
const targets = ["linux/amd64", "linux/arm64", "darwin/amd64", "darwin/arm64"];

// The files of a package that state its licence or must travel with it: the
// licence text, and the NOTICE file that Apache-2.0 asks a distributor to
// pass on.
const licenceFile = /^(licen[cs]e|copying|notice|unlicense)([.-].+)?$/i;

const root = path.resolve(import.meta.dirname, "../..");
const go = process.env.GO || "go";

/**
 * @typedef {object} Component
 * @property {string} name
 * @property {string} version
 * @property {string} licence the name of the licence, an SPDX identifier
 * @property {string} directory where the component is installed
 * @property {string[]} files the files that hold the licence text
 */

/**
 * Runs a command in the root of the checkout and returns what it printed.
 * Its standard error goes to this script's, so that a warning of the tool is
 * seen.
 * @param {string} command
 * @param {string[]} args
 * @param {Record<string, string>} [env] added to this script's environment
 */
function run(command, args, env = {}) {
  return execFileSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** @param {string} text */
function lines(text) {
  return text.split("\n").filter((line) => line !== "");
}

/**
 * Orders two strings by their code units, which no locale changes, so that
 * two runs anywhere write the same listing.
 * @param {string} a
 * @param {string} b
 */
function order(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The text of a licence file, with Unix line ends and nothing blank at its
 * end.
 * @param {string} file
 */
function read(file) {
  return readFileSync(file, "utf8").replaceAll("\r\n", "\n").trimEnd();
}

/**
 * The licence files in a directory, in a fixed order.
 * @param {string} directory
 */
function licenceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && licenceFile.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort(order);
}

/**
 * The Go modules linked into the binary, and the standard library.
 *
 * "go list -deps" is the authority on what is linked: it names the module of
 * every package the command imports, for one target at a time. go-licenses
 * supplies the name and the file of each licence. It reports by groups of
 * packages and not by module, so a licence belongs to the module in whose
 * directory its file lies. A module left without a licence is an error.
 * @returns {Component[]}
 */
function goModules() {
  const main = run(go, ["list", "-m"]).trim();
  const scratch = mkdtempSync(path.join(tmpdir(), "sdash-notices-"));
  try {
    // Built for this machine, whatever GOOS and GOARCH say around this
    // script: the go command refuses to install a cross-compiled tool.
    const host = { ...process.env, GOBIN: scratch };
    delete host.GOOS;
    delete host.GOARCH;
    execFileSync(go, ["install", goLicenses], {
      cwd: root,
      env: host,
      stdio: ["ignore", "inherit", "inherit"],
    });
    const template = path.join(scratch, "report.tpl");
    writeFileSync(
      template,
      "{{ range . }}{{ .Name }}\t{{ .LicenseName }}\t{{ .LicensePath }}\n{{ end }}",
    );

    /** @type {Map<string, {version: string, directory: string, licences: Set<string>, files: Set<string>}>} */
    const modules = new Map();
    for (const target of targets) {
      const [goos, goarch] = target.split("/");
      const env = { GOOS: goos, GOARCH: goarch };
      const linked = run(
        go,
        [
          "list",
          "-deps",
          "-f",
          "{{ with .Module }}{{ if not .Main }}{{ .Path }}\t{{ .Version }}\t{{ .Dir }}{{ end }}{{ end }}",
          "./cmd/sdash",
        ],
        env,
      );
      for (const line of lines(linked)) {
        const [name, version, directory] = line.split("\t");
        if (!modules.has(name)) {
          modules.set(name, {
            version,
            directory,
            licences: new Set(),
            files: new Set(),
          });
        }
      }
      const report = run(
        path.join(scratch, "go-licenses"),
        ["report", "./cmd/sdash", "--ignore", main, "--template", template],
        env,
      );
      for (const line of lines(report)) {
        const [name, licence, file] = line.split("\t");
        if (licence === "Unknown" || file === "Unknown") {
          throw new Error(`go-licenses found no licence for ${name}`);
        }
        const module = [...modules.values()].find((candidate) =>
          file.startsWith(candidate.directory + path.sep),
        );
        if (!module) {
          throw new Error(
            `the licence of ${name}, ${file}, lies in no module the binary links`,
          );
        }
        module.licences.add(licence);
        module.files.add(file);
      }
    }

    /** @type {Component[]} */
    const components = [];
    for (const name of [...modules.keys()].sort(order)) {
      const module = modules.get(name);
      if (module.files.size === 0) {
        throw new Error(
          `go-licenses reports no licence for the module ${name}`,
        );
      }
      // The licence files go-licenses found, and whatever else beside them
      // or in the root of the module has to travel with them, such as a
      // NOTICE file.
      const files = new Set(module.files);
      for (const directory of [
        module.directory,
        ...[...module.files].map((file) => path.dirname(file)),
      ]) {
        for (const file of licenceFiles(directory)) {
          files.add(file);
        }
      }
      components.push({
        name,
        version: module.version,
        licence: [...module.licences].sort(order).join(" AND "),
        directory: module.directory,
        files: [...files].sort(order),
      });
    }

    // The standard library and the runtime are linked into every Go binary
    // and are no module, so no tool lists them. The toolchain that runs this
    // script is the one that builds the release.
    const goroot = run(go, ["env", "GOROOT"]).trim();
    components.unshift({
      name: "Go standard library and runtime",
      version: run(go, ["env", "GOVERSION"]).trim(),
      licence: "BSD-3-Clause",
      directory: goroot,
      files: [path.join(goroot, "LICENSE")],
    });
    return components;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * The npm packages bundled into the user interface: the packages web/
 * depends on outside development, with everything they depend on in turn.
 * That is the rule package.json is kept by: what the bundle contains is
 * under "dependencies", a tool is under "devDependencies"
 * (doc/adr/0013-frontend-stack.md). The fonts are npm packages too.
 *
 * The lockfile says which packages those are: it marks every package that
 * only development needs. It is read directly and npm is not asked, because
 * npm masks what looks like a secret in everything it prints, a part of a
 * directory name included.
 * @returns {Component[]}
 */
function npmPackages() {
  const web = path.join(root, "web");
  const lock = JSON.parse(
    readFileSync(path.join(web, "package-lock.json"), "utf8"),
  );
  // A package installed in two places is listed once; two versions of one
  // package are two entries.
  /** @type {Map<string, Component>} */
  const components = new Map();
  for (const [location, locked] of Object.entries(lock.packages)) {
    // The empty location is web/ itself.
    if (location === "" || locked.dev) {
      continue;
    }
    const directory = path.join(web, location);
    if (!existsSync(directory)) {
      // An optional package for another system is not installed here, and
      // so is not in the bundle.
      if (locked.optional) {
        continue;
      }
      throw new Error(`${location} is not installed; run "npm ci" in web/`);
    }
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "package.json"), "utf8"),
    );
    const id = `${manifest.name} ${manifest.version}`;
    // What was bundled is what is installed, so the listing holds only if
    // that is what the lockfile names.
    if (manifest.version !== locked.version) {
      throw new Error(
        `${location} is ${id}, not the ${locked.version} of the lockfile; run "npm ci" in web/`,
      );
    }
    const licence =
      typeof manifest.license === "string"
        ? manifest.license
        : manifest.license?.type;
    if (!licence || licence === "UNLICENSED") {
      throw new Error(`the npm package ${id} names no licence`);
    }
    const files = licenceFiles(directory);
    if (files.length === 0) {
      throw new Error(`the npm package ${id} comes without a licence text`);
    }
    components.set(id, {
      name: manifest.name,
      version: manifest.version,
      licence,
      directory,
      files,
    });
  }
  return [...components.values()].sort(
    (a, b) => order(a.name, b.name) || order(a.version, b.version),
  );
}

/**
 * @param {string} title
 * @param {Component[]} components
 */
function index(title, components) {
  return [
    title,
    "",
    ...components.map(
      (component) =>
        `  ${component.name} ${component.version} (${component.licence})`,
    ),
    "",
  ];
}

/** @param {Component} component */
function entry(component) {
  const rule = "-".repeat(78);
  const out = [
    rule,
    `${component.name} ${component.version}`,
    `Licence: ${component.licence}`,
    rule,
    "",
  ];
  for (const file of component.files) {
    // With several files, each is named by where it lies in the component.
    if (component.files.length > 1) {
      out.push(`[${path.relative(component.directory, file)}]`, "");
    }
    out.push(read(file), "");
  }
  return out;
}

/** @param {string} output the file to write */
function write(output) {
  const modules = goModules();
  const packages = npmPackages();
  const text = [
    "Third-party licences",
    "====================",
    "",
    "sdash is licensed under the Apache License, Version 2.0; see the file",
    "LICENSE. Its binary also contains the software listed below, which other",
    "people wrote and which stays under its own licence. Each entry is listed",
    "with the name of its licence here, and with the licence text further down.",
    "",
    ...index("Go, linked into the binary:", modules),
    ...index("npm packages, bundled into the user interface:", packages),
    ...[...modules, ...packages].flatMap(entry),
  ].join("\n");

  mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  writeFileSync(output, text);
  console.log(
    `${output}: ${modules.length - 1} Go modules and the standard library, ${packages.length} npm packages`,
  );
}

try {
  const output = process.argv[2];
  if (!output) {
    throw new Error("give the file to write");
  }
  write(output);
} catch (error) {
  // The message alone: a stack of this script says nothing about a package
  // without a licence.
  console.error(`third-party-notices: ${error.message}`);
  process.exitCode = 1;
}
