import {
  resolvePaperProfileSelection,
  type PaperGeneratedJournalProfile,
  type PaperProfileId,
} from "@/paper/profiles"

export type PaperConversationJournalSource = "builtin" | "generated" | "generic"

export interface PaperConversationJournal {
  profile_id: PaperProfileId
  journal_name?: string
  official_url?: string
  source: PaperConversationJournalSource
  generated_profile?: PaperGeneratedJournalProfile
  updated_at: string
}

let currentJournal: PaperConversationJournal = {
  profile_id: "cjc-paper",
  journal_name: "中国计算机学报",
  source: "builtin",
  updated_at: new Date().toISOString(),
}

const journalTarget = new EventTarget()

export function getPaperConversationJournal() {
  return currentJournal
}

export function setPaperConversationJournal(input: {
  target_profile?: string
  target_journal?: string
  target_journal_url?: string
}) {
  const selection = resolvePaperProfileSelection(input)
  currentJournal = {
    profile_id: selection.profile_id,
    journal_name: selection.journal_name ?? "中国计算机学报",
    official_url: input.target_journal_url,
    source: "builtin",
    generated_profile: selection.generated_profile,
    updated_at: new Date().toISOString(),
  }
  journalTarget.dispatchEvent(new Event("paper-conversation-journal.changed"))
  return currentJournal
}

export function subscribePaperConversationJournal(listener: () => void) {
  const handler = () => listener()
  journalTarget.addEventListener("paper-conversation-journal.changed", handler)
  return () => journalTarget.removeEventListener("paper-conversation-journal.changed", handler)
}
