import React, { useEffect } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { ActiveDialogueSession } from './GameRuntime';
import { DialogueChoice } from '../shared/types/world';

interface DialogueModalProps {
  session: ActiveDialogueSession;
  onSelectChoice: (choice: DialogueChoice) => void;
  onClose: () => void;
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11px] text-[#8fa0b3] font-atlas-mono">
        <span>{label}</span>
        <span className="text-[#f3ede0]">{value}</span>
      </div>
      <div className="h-[3px] rounded-full bg-[#19283c] overflow-hidden">
        <div
          className="h-full bg-[#d9a14a] transition-all duration-200"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

export const DialogueModal: React.FC<DialogueModalProps> = ({
  session,
  onSelectChoice,
  onClose,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      data-testid="dialogue-modal"
      className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-3 sm:px-4 pointer-events-none"
    >
      <div className="atlas-modal w-full max-w-2xl max-h-[82vh] overflow-y-auto atlas-scroll rounded-[var(--atlas-radius-lg)] p-5 md:p-6 pointer-events-auto">
        {/* Speaker Ledger Header */}
        <div className="flex items-start justify-between gap-4 border-b atlas-divider pb-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <MessageSquare className="w-4 h-4 text-[#d9a14a] self-center shrink-0" aria-hidden="true" />
              <h2 className="font-atlas-display text-xl font-semibold text-[#f3ede0] leading-tight">
                {session.npc.name}
              </h2>
              <span className="font-atlas-mono text-[11px] uppercase tracking-wider text-[#58b4aa]">
                · {session.relationshipTier}
              </span>
            </div>
            <p className="text-xs text-[#8fa0b3] mt-0.5">{session.npc.occupation}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="atlas-btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--atlas-radius-md)] text-xs text-[#cbd5e1] cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Close [Esc]</span>
          </button>
        </div>

        {/* Hairline Relationship Standing Meters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-b atlas-divider">
          <Meter label="Familiarity" value={session.familiarity} />
          <Meter label="Trust" value={session.trust} />
          <Meter label="Friendship" value={session.friendship} />
          <Meter label="Respect" value={session.respect} />
        </div>

        {/* Editorial Dialogue Passage (60ch measure) */}
        <div className="my-4 border-l-2 border-[#d9a14a]/60 pl-4 max-w-prose text-[15px] leading-relaxed text-[#f3ede0]">
          {session.replyText ? (
            <p>{session.replyText}</p>
          ) : (
            <>
              <p className="font-atlas-display italic text-[#e5b363] mb-1.5">{session.node.greeting}</p>
              <p className="text-[#e2e8f0]">{session.node.body}</p>
            </>
          )}
        </div>

        {/* Conversational Prompts */}
        <div className="pt-2 border-t atlas-divider flex flex-col gap-1.5">
          {!session.replyText &&
            session.node.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => onSelectChoice(choice)}
                className="text-left px-3.5 py-2.5 rounded-[var(--atlas-radius-md)] bg-[#131e2d] hover:bg-[#19283c] border-l-2 border-transparent hover:border-[#d9a14a] text-sm text-[#f3ede0] cursor-pointer transition-colors"
              >
                {choice.label}
              </button>
            ))}

          <button
            type="button"
            onClick={onClose}
            className="atlas-btn-primary self-end mt-2 px-4 py-2 rounded-[var(--atlas-radius-md)] font-semibold text-xs cursor-pointer"
          >
            {session.replyText ? 'Continue Exploring' : 'Step Away'}
          </button>
        </div>
      </div>
    </div>
  );
};
