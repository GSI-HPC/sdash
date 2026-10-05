// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useId, useRef } from "react";

import { useKeyboardScroll } from "../layout/useKeyboardScroll";
import { Button } from "./Button";
import { cx } from "./classes";
import { DialogBody, DialogFooter, DialogFrame, DialogHeader } from "./Dialog";

// The colour of a method repeats what the word says: reading, writing,
// deleting. On the background of the request each stands at 4.5:1 or more
// in both themes, the green by a hair (4.51:1), so the request lies on
// --bg-base and on nothing darker.
const methods = {
  GET: "text-info-fg",
  POST: "text-ok-fg",
  PUT: "text-ok-fg",
  PATCH: "text-ok-fg",
  DELETE: "text-err-fg",
} as const;

/** The methods a request that is confirmed can have. */
export type RequestMethod = keyof typeof methods;

/** A request as a confirmation shows it before it is sent. */
export interface RequestPreview {
  readonly method: RequestMethod;
  /** The path, with its query string where it has one. */
  readonly path: string;
  /** The body as text, shown as it is. */
  readonly body?: string;
}

/**
 * The body of a request. It scrolls inside its box where it is long, and
 * is then a stop of the Tab key, which says what it is.
 */
function RequestBody({ body }: { body: string }) {
  const bodyRef = useRef<HTMLPreElement>(null);
  const textRef = useRef<HTMLElement>(null);
  useKeyboardScroll(bodyRef, textRef, {
    role: "group",
    "aria-label": "Body of the request",
  });

  return (
    <pre
      ref={bodyRef}
      className="max-h-50 overflow-auto border-t border-bds px-3 py-2.5 whitespace-pre-wrap text-t2 -outline-offset-2"
    >
      {/* A block, so that its size can be watched as the box's is. */}
      <code ref={textRef} className="block">
        {body}
      </code>
    </pre>
  );
}

/**
 * The request about to be sent, as text: its method and path on a line,
 * which has the given id, and its body below.
 */
function Request({
  lineId,
  method,
  path,
  body,
}: RequestPreview & { lineId: string }) {
  return (
    <div
      role="group"
      aria-label="Request"
      className="overflow-hidden rounded-md border border-bds bg-base font-mono text-[0.71875rem]"
    >
      <div id={lineId} className="flex gap-2 px-3 py-2">
        <span className={cx("font-medium", methods[method])}>{method}</span>
        <span className="break-all text-t2">{path}</span>
      </div>
      {body !== undefined && <RequestBody body={body} />}
    </div>
  );
}

/** The props of a confirmation. */
export interface ConfirmDialogProps {
  /** Whether the confirmation shows. */
  open: boolean;
  /** The question: "Delete the example?". It names the dialog. */
  title: string;
  /** What confirming will do, in a sentence or two. */
  description?: ReactNode;
  /** The request that confirming sends. */
  request: RequestPreview;
  /** What the confirming button does, as its text: "Delete example". */
  confirmLabel: string;
  /** The text of the other button; "Cancel" unless said otherwise. */
  cancelLabel?: string;
  /** Confirming destroys something: the button says so by its look. */
  danger?: boolean;
  /**
   * The confirming button cannot be used yet, while an input the caller
   * put into the dialog is not valid.
   */
  confirmDisabled?: boolean;
  /** Called when the user confirms, by the confirming button alone. */
  onConfirm: () => void;
  /** Called when the user backs out, by the other button or by Escape. */
  onCancel: () => void;
  /** An input the confirmation needs, between the text and the request. */
  children?: ReactNode;
}

/**
 * Asks before a change is sent, and shows what will be sent: the method,
 * the path and the body of the request, as text (WCAG 2.1, success
 * criterion 3.3.4; doc/adr/0026-ui-primitives-on-base-ui.md).
 *
 * It is an alert dialog: it asks a question that has to be answered. A
 * press outside does not close it, Escape cancels, and the focus starts on
 * the button that cancels, so that Enter pressed too soon sends nothing.
 * It does not close itself on either answer: the caller sets `open`.
 *
 * The method and the path are part of what describes the dialog, after
 * its text, so that a screen reader says them when the dialog opens: the
 * request is what the question is about. The body is not, since it can be
 * long; it is read in the dialog.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  request,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  // Left to itself the dialog gives the focus to its first control, which
  // is the body of a long request.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();
  const requestId = useId();

  return (
    <DialogFrame
      alert
      describedBy={cx(description !== undefined && descriptionId, requestId)}
      open={open}
      onClose={onCancel}
      initialFocus={cancelRef}
      placement="middle"
      className="w-125"
    >
      <DialogHeader
        title={title}
        {...(description === undefined ? {} : { description, descriptionId })}
      />
      {/*
        The part between the question and the buttons scrolls in a low
        window, so that the buttons stay on the screen.
      */}
      <DialogBody className="flex flex-col gap-3">
        {children}
        <Request {...request} lineId={requestId} />
      </DialogBody>
      <DialogFooter>
        <Button ref={cancelRef} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant="primary"
          tone={danger ? "danger" : "default"}
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </DialogFrame>
  );
}
