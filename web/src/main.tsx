// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { App } from "./App";
import { createQueryClient } from "./client/query";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("index.html has no element with the id root");
}

// One store for the whole application, made once and outside any component,
// so that what a view has fetched is still there when the view comes back.
const queryClient = createQueryClient();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/*
        The address of a view is a path the browser shows and the server
        answers with this page (doc/adr/0024-addresses-and-keyboard-in-the-shell.md).
      */}
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
