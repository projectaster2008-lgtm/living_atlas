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
      <div className="flex justify-between text-[11px] text-slate-300 tabular-nums">
        <span>{label}</span>
        <span className="text-amber-200 font-medium">{value}</span>
      </div>
      <div className="h-1.5 rounded bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-[#e0a952] transition-all duration-200"
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
      className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 pointer-events-none"
    >
      <div className="w-full max-w-2xl rounded-xl bg-[#0d131d]/96 border border-amber-200/30 p-5 shadow-2xl pointer-events-auto">
        <div className="flex items-start justify-between gap-4 border-b border-slate-700/60 pb-3">
          <div>
            <div className="flex items-center gap-2.5">
              <MessageSquare className="w-4 h-4 text-amber-300" />
              <h2 className="text-lg font-semibold text-[#f7f2e8]">{session.npc.name}</h2>
              <span className="px-2 py-0.5 rounded bg-teal-900/70 border border-teal-400/30 text-[11px] text-teal-200 font-medium">
                {session.relationshipTier}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{session.npc.occupation}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Close [Esc]</span>
          </button>
        </div>

        {/* Relationship Axes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-3">
          <Meter label="Familiarity" value={session.familiarity} />
          <Meter label="Trust" value={session.trust} />
          <Meter label="Friendship" value={session.friendship} />
          <Meter label="Respect" value={session.respect} />
        </div>

        {/* Dialogue Content */}
        <div className="rounded-lg bg-slate-900/80 border border-slate-700/50 p-3.5 text-sm leading-relaxed text-slate-100">
          {session.replyText ? (
            <p>{session.replyText}</p>
          ) : (
            <>
              <p className="text-amber-200 font-medium mb-1">{session.node.greeting}</p>
              <p>{session.node.body}</p>
            </>
          )}
        </div>

        {/* Choices */}
        <div className="mt-3.5 flex flex-col gap-2">
          {!session.replyText &&
            session.node.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => onSelectChoice(choice)}
                className="text-left px-3.5 py-2.5 rounded-lg bg-[#162030] hover:bg-[#1e2d42] border border-amber-200/20 hover:border-amber-300/50 text-sm text-[#f3efe6] cursor-pointer transition-colors"
              >
                {choice.label}
              </button>
            ))}

          <button
            type="button"
            onClick={onClose}
            className="self-end mt-1 px-4 py-2 rounded-lg bg-[#e0a952] hover:bg-[#eab96b] text-[#0c121b] font-semibold text-xs cursor-pointer transition-colors"
          >
            {session.replyText ? 'Continue Exploring' : 'Step Away'}
          </button>
        </div>
      </div>
    </div>
  );
};
