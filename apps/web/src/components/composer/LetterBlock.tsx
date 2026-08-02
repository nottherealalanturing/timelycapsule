'use client';

import { Button, cn } from '@tc/ui-web';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useState } from 'react';
import type { CapsuleDraft } from '../../lib/use-capsule-draft';

/** Static prompt packs — contextual-to-type/occasion packs are a later refinement; this pass ships one general-purpose pack. */
const PROMPTS = [
  'What do I hope has changed by the time you read this?',
  "What's something you're afraid to admit right now?",
  'Describe this exact moment — the room, the weather, the noise.',
  'What do you want me to remember about who you are today?',
  "What's a promise you're making to yourself?",
];

interface SlashCommand {
  label: string;
  run: () => void;
}

function slashCommands(editor: Editor): SlashCommand[] {
  const raw: { label: string; run: (e: Editor) => void }[] = [
    { label: 'Heading', run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: 'Bullet list', run: (e) => e.chain().focus().toggleBulletList().run() },
    { label: 'Quote', run: (e) => e.chain().focus().toggleBlockquote().run() },
    { label: 'Divider', run: (e) => e.chain().focus().setHorizontalRule().run() },
  ];
  return raw.map((c) => ({ label: c.label, run: () => c.run(editor) }));
}

export function LetterBlock({ draft }: { draft: CapsuleDraft }) {
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Deliberately minimal marks per 02-UX-DESIGN.md §5.5.
        strike: false,
        code: false,
        codeBlock: false,
      }),
      Placeholder.configure({ placeholder: 'Write what you want them to know…' }),
    ],
    content: draft.contentDoc as object,
    onUpdate: ({ editor: e }) => {
      draft.setContentDoc(e.getJSON());
      const { from } = e.state.selection;
      const textBefore = e.state.doc.textBetween(Math.max(0, from - 20), from, '\n');
      const match = /(?:^|\s)\/(\w*)$/.exec(textBefore);
      setSlashQuery(match ? match[1]! : null);
    },
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  if (!editor) return null;

  function insertPrompt(prompt: string) {
    editor!.chain().focus().insertContent({ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: prompt }] }] }).run();
    setPromptsOpen(false);
  }

  function runSlashCommand(cmd: SlashCommand) {
    const { from } = editor!.state.selection;
    const textBefore = editor!.state.doc.textBetween(Math.max(0, from - (slashQuery?.length ?? 0) - 1), from, '\n');
    const slashIndex = textBefore.lastIndexOf('/');
    if (slashIndex !== -1) {
      const deleteFrom = from - (textBefore.length - slashIndex);
      editor!.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
    }
    cmd.run();
    setSlashQuery(null);
  }

  const commands = slashQuery !== null ? slashCommands(editor).filter((c) => c.label.toLowerCase().includes(slashQuery.toLowerCase())) : [];

  return (
    <section aria-label="Letter" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[length:var(--text-body-s)] font-medium text-secondary">Letter</h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => setPromptsOpen((v) => !v)}>
          Prompts
        </Button>
      </div>

      {promptsOpen ? (
        <div className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-[var(--color-rule)] p-2">
          {PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => insertPrompt(prompt)}
              className="rounded-[var(--radius-input)] px-3 py-2 text-left text-[length:var(--text-body-s)] text-secondary hover:bg-[var(--color-bg-raised)]"
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <EditorContent
          editor={editor}
          className={cn(
            'min-h-[240px] rounded-[var(--radius-card)] border border-[var(--color-rule)] px-4 py-3',
            'prose prose-sm max-w-none text-foreground focus-within:border-[var(--color-interactive)]',
          )}
        />
        {commands.length > 0 ? (
          <div className="absolute left-4 top-full z-20 mt-1 w-48 rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-[var(--color-bg-raised)] p-1 shadow-md">
            {commands.map((cmd) => (
              <button
                key={cmd.label}
                type="button"
                onClick={() => runSlashCommand(cmd)}
                className="w-full rounded-[var(--radius-input)] px-3 py-2 text-left text-[length:var(--text-body-s)] text-foreground hover:bg-[var(--color-bg-primary)]"
              >
                {cmd.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
