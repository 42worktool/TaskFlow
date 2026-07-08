import { randomUUID } from 'crypto';
import {
  db,
  CardRecord,
  CardMemberRecord,
  AttachmentRecord,
  CommentRecord,
  LabelRecord,
  CardLabelRecord,
  ListRecord,
} from '../../store';

// ─── Lists ────────────────────────────────────────────────────

export function findListById(id: string): ListRecord | undefined {
  return db.lists.find((l) => l.id === id);
}

// ─── Cards ────────────────────────────────────────────────────

export function findCardById(id: string): CardRecord | undefined {
  return db.cards.find((c) => c.id === id);
}

export function findCardsByListId(listId: string): CardRecord[] {
  return db.cards.filter((c) => c.list_id === listId);
}

export function createCard(data: {
  list_id: string | null;
  user_id: string | null;
  title: string;
  description?: string | null;
  start_at?: string | null;
  deadline?: string | null;
}): CardRecord {
  const maxSeq = db.cards
    .filter((c) => c.list_id === data.list_id)
    .reduce((max, c) => Math.max(max, c.sequence), 0);
  const card: CardRecord = {
    id: randomUUID(),
    list_id: data.list_id,
    user_id: data.user_id,
    title: data.title,
    description: data.description ?? null,
    start_at: data.start_at ?? null,
    deadline: data.deadline ?? null,
    sequence: maxSeq + 1,
    created_at: new Date().toISOString(),
  };
  db.cards.push(card);
  return card;
}

export function updateCard(
  id: string,
  data: { title?: string; description?: string | null },
): CardRecord | undefined {
  const card = db.cards.find((c) => c.id === id);
  if (!card) return undefined;
  if (data.title !== undefined) card.title = data.title;
  if ('description' in data) card.description = data.description ?? null;
  return card;
}

export function updateCardDates(
  id: string,
  data: { start_at?: string | null; deadline?: string | null },
): CardRecord | undefined {
  const card = db.cards.find((c) => c.id === id);
  if (!card) return undefined;
  if ('start_at' in data) card.start_at = data.start_at ?? null;
  if ('deadline' in data) card.deadline = data.deadline ?? null;
  return card;
}

export function updateCardSequence(id: string, sequence: number): CardRecord | undefined {
  const card = db.cards.find((c) => c.id === id);
  if (!card) return undefined;
  card.sequence = sequence;
  return card;
}

export function moveCard(id: string, listId: string | null): CardRecord | undefined {
  const card = db.cards.find((c) => c.id === id);
  if (!card) return undefined;
  card.list_id = listId;
  return card;
}

export function deleteCard(id: string): void {
  const idx = db.cards.findIndex((c) => c.id === id);
  if (idx !== -1) db.cards.splice(idx, 1);
  for (let i = db.cardMembers.length - 1; i >= 0; i--) {
    if (db.cardMembers[i].card_id === id) db.cardMembers.splice(i, 1);
  }
  for (let i = db.attachments.length - 1; i >= 0; i--) {
    if (db.attachments[i].card_id === id) db.attachments.splice(i, 1);
  }
  for (let i = db.comments.length - 1; i >= 0; i--) {
    if (db.comments[i].card_id === id) db.comments.splice(i, 1);
  }
  for (let i = db.cardLabels.length - 1; i >= 0; i--) {
    if (db.cardLabels[i].card_id === id) db.cardLabels.splice(i, 1);
  }
}

// ─── Card Members ─────────────────────────────────────────────

export function findCardMembers(cardId: string): CardMemberRecord[] {
  return db.cardMembers.filter((m) => m.card_id === cardId);
}

export function findCardMember(cardId: string, userId: string): CardMemberRecord | undefined {
  return db.cardMembers.find((m) => m.card_id === cardId && m.user_id === userId);
}

export function addCardMember(cardId: string, userId: string): CardMemberRecord {
  const m: CardMemberRecord = { card_id: cardId, user_id: userId };
  db.cardMembers.push(m);
  return m;
}

export function removeCardMember(cardId: string, userId: string): void {
  const idx = db.cardMembers.findIndex((m) => m.card_id === cardId && m.user_id === userId);
  if (idx !== -1) db.cardMembers.splice(idx, 1);
}

// ─── Attachments ──────────────────────────────────────────────

export function findAttachmentsByCardId(cardId: string): AttachmentRecord[] {
  return db.attachments.filter((a) => a.card_id === cardId);
}

export function findAttachmentById(id: string): AttachmentRecord | undefined {
  return db.attachments.find((a) => a.id === id);
}

export function addAttachment(data: {
  card_id: string;
  file_url: string;
  file_name: string;
}): AttachmentRecord {
  const a: AttachmentRecord = {
    id: randomUUID(),
    card_id: data.card_id,
    file_url: data.file_url,
    file_name: data.file_name,
    created_at: new Date().toISOString(),
  };
  db.attachments.push(a);
  return a;
}

export function removeAttachment(id: string): void {
  const idx = db.attachments.findIndex((a) => a.id === id);
  if (idx !== -1) db.attachments.splice(idx, 1);
}

// ─── Comments ─────────────────────────────────────────────────

export function findCommentsByCardId(cardId: string): CommentRecord[] {
  return db.comments.filter((c) => c.card_id === cardId);
}

export function findCommentById(id: string): CommentRecord | undefined {
  return db.comments.find((c) => c.id === id);
}

export function createComment(data: {
  card_id: string;
  user_id: string;
  comment_str: string;
}): CommentRecord {
  const now = new Date().toISOString();
  const c: CommentRecord = { id: randomUUID(), ...data, created_at: now, updated_at: now };
  db.comments.push(c);
  return c;
}

export function updateComment(id: string, commentStr: string): CommentRecord | undefined {
  const c = db.comments.find((c) => c.id === id);
  if (!c) return undefined;
  c.comment_str = commentStr;
  c.updated_at = new Date().toISOString();
  return c;
}

export function deleteComment(id: string): void {
  const idx = db.comments.findIndex((c) => c.id === id);
  if (idx !== -1) db.comments.splice(idx, 1);
}

// ─── Labels ───────────────────────────────────────────────────

export function findLabelsByWorkspaceId(workspaceId: string): LabelRecord[] {
  return db.labels.filter((l) => l.workspace_id === workspaceId);
}

export function findLabelById(id: string): LabelRecord | undefined {
  return db.labels.find((l) => l.id === id);
}

export function createLabel(data: {
  workspace_id: string;
  label_name: string;
  label_color: string;
}): LabelRecord {
  const now = new Date().toISOString();
  const l: LabelRecord = { id: randomUUID(), ...data, created_at: now, updated_at: now };
  db.labels.push(l);
  return l;
}

export function deleteLabel(id: string): void {
  const idx = db.labels.findIndex((l) => l.id === id);
  if (idx !== -1) db.labels.splice(idx, 1);
  for (let i = db.cardLabels.length - 1; i >= 0; i--) {
    if (db.cardLabels[i].label_id === id) db.cardLabels.splice(i, 1);
  }
}

// ─── Card Labels ──────────────────────────────────────────────

export function findCardLabels(cardId: string): CardLabelRecord[] {
  return db.cardLabels.filter((cl) => cl.card_id === cardId);
}

export function findCardLabel(cardId: string, labelId: string): CardLabelRecord | undefined {
  return db.cardLabels.find((cl) => cl.card_id === cardId && cl.label_id === labelId);
}

export function attachLabel(cardId: string, labelId: string): CardLabelRecord {
  const cl: CardLabelRecord = { card_id: cardId, label_id: labelId };
  db.cardLabels.push(cl);
  return cl;
}

export function detachLabel(cardId: string, labelId: string): void {
  const idx = db.cardLabels.findIndex(
    (cl) => cl.card_id === cardId && cl.label_id === labelId,
  );
  if (idx !== -1) db.cardLabels.splice(idx, 1);
}
