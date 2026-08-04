'use client';

import { cn, Record } from '@tc/ui-web';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';

export interface RecordLetterProps {
  /** TipTap document JSON — the `doc` half of a `LetterEnvelope`. */
  doc: unknown;
  onChange: (doc: unknown) => void;
  onSlashQuery?: (query: string | null) => void;
  editorRef?: (editor: Editor | null) => void;
  className?: string;
}

/**
 * The letter, as a **record**.
 *
 * `05-IDENTITY-DECISION.md` puts the letter in the record register — paper and
 * Source Serif 4 — and it is the archetypal case, the row the table was written
 * for. V1 rendered it as a bordered box on the instrument ground in the UI
 * sans, which made the most emotionally consequential surface in the product
 * look like a form field.
 *
 * Two rules from Gate 1 hold here and are the whole reason this component
 * exists rather than a `className` on the old editor:
 *
 *   1. **A record is an object, never a background.** The instrument ground
 *      stays visible on all four sides at every breakpoint — see the padded
 *      bed this renders inside. The moment paper reaches the viewport edge the
 *      register change reads as a theme toggle and the ceremony dies.
 *   2. The editable area fills the paper. ProseMirror's contenteditable only
 *      grows to its content, so without the `min-h` rule below a short letter
 *      leaves most of the sheet inert — clicking the lower half of a page you
 *      are looking at and having nothing happen.
 *
 * Writing on the record also previews the reveal without previewing content:
 * the writer learns what the artifact looks like while making it.
 */
export function RecordLetter({ doc, onChange, onSlashQuery, editorRef, className }: RecordLetterProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Deliberately minimal marks — `02 §5.5`. A letter is not a document
        // editor, and every affordance here is one more thing between a person
        // and the sentence they are trying to write.
        strike: false,
        code: false,
        codeBlock: false,
      }),
      Placeholder.configure({ placeholder: 'Write what you want them to know…' }),
    ],
    content: (doc ?? undefined) as object | undefined,
    onUpdate: ({ editor: e }) => {
      onChange(e.getJSON());
      if (!onSlashQuery) return;
      const { from } = e.state.selection;
      const before = e.state.doc.textBetween(Math.max(0, from - 20), from, '\n');
      const match = /(?:^|\s)\/(\w*)$/.exec(before);
      onSlashQuery(match ? match[1]! : null);
    },
  });

  useEffect(() => {
    editorRef?.(editor);
    return () => editorRef?.(null);
  }, [editor, editorRef]);

  useEffect(() => () => editor?.destroy(), [editor]);

  if (!editor) {
    // Layout-stable placeholder in the instrument register, with no animation:
    // Motion Constitution 3 forbids anything that reads as loading.
    return <div className={cn('rounded-[var(--radius-record)] bg-[var(--color-bg-primary)] p-4 sm:p-7', className)} aria-hidden />;
  }

  return (
    <div
      // The bed. Instrument ground, visible around the paper on all four sides.
      className={cn('rounded-[var(--radius-record)] bg-[var(--color-bg-primary)] p-3 sm:p-7', className)}
      // Clicking anywhere on the sheet puts the caret in the letter, including
      // the empty space below the last line.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          editor.chain().focus('end').run();
        }
      }}
    >
      {/* Not `flat`: the cast shadow is what lifts paper off the bed, and in
          the light theme the two grounds are close enough in value that
          without it the record stops reading as an object at all. */}
      <Record as="article">
        <EditorContent
          editor={editor}
          className={cn(
            'prose prose-sm max-w-none',
            '[&_.ProseMirror]:min-h-[18rem] [&_.ProseMirror]:outline-none',
            '[&_.ProseMirror_p]:my-[0.65em]',
          )}
        />
      </Record>
    </div>
  );
}
