export const EMAIL_TABS=['overview','previews','accounts','tools'] as const;
export type EmailTab=typeof EMAIL_TABS[number];
/** Tabs that moved to the lifecycle centre: approving, testing, modes and delivery live in one place now. */
export const MOVED_TABS=['workflows','delivery'] as const;
export function emailTab(value:unknown):EmailTab{return EMAIL_TABS.includes(value as EmailTab)?value as EmailTab:'overview';}
export function legacyLifecycleUrl(preview?:string){return preview?`/email?tab=previews&preview=${encodeURIComponent(preview)}#email-previews`:'/email';}
