// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { CSPProvider } from "@base-ui/react/csp-provider";
import type { ReactNode } from "react";

import { ToastProvider, ToastRegion } from "./Toast";

/**
 * What the primitives need around the application, once.
 *
 * Some parts of Base UI render a `<style>` element, to hide a scrollbar:
 * the list of a select does, and so does its scroll area. The server's
 * Content-Security-Policy allows no style but the linked stylesheet
 * (doc/adr/0012-local-listener-security.md): the browser refuses the
 * element and reports it. The first provider tells Base UI to render
 * none. The select says the same itself, so that it is safe wherever it
 * is rendered; this one is for the part somebody uses later without
 * having read it for such an element. The refusal itself shows in the
 * binary alone, where the end-to-end tests run: Vite serves a component
 * test without the policy.
 *
 * The second holds the toasts, and the region they appear in is rendered
 * here, once for the whole application.
 *
 * There is no provider for the tooltips. Base UI's would have the next
 * tooltip of a row show without its delay, which nothing here asks for.
 * Leaving it out does not keep Base UI from showing one tooltip at a
 * time: it does that with or without the provider, and so closes the
 * reason the keyboard focus brought up when the pointer rests on another
 * control. The tooltip itself sees to it that it stays for as long as its
 * own pointer or focus does (Tooltip.tsx; WCAG 2.1, success criterion
 * 1.4.13).
 *
 * Every primitive but the toast works without this provider, which is how
 * a component test renders one alone.
 */
export function PrimitivesProvider({ children }: { children: ReactNode }) {
  return (
    <CSPProvider disableStyleElements>
      <ToastProvider>
        {children}
        <ToastRegion />
      </ToastProvider>
    </CSPProvider>
  );
}
