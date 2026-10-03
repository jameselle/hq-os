export const EMAIL_TABS=['overview','workflows','previews','delivery','accounts','tools'] as const;
export type EmailTab=typeof EMAIL_TABS[number];
export function emailTab(value:unknown):EmailTab{return EMAIL_TABS.includes(value as EmailTab)?value as EmailTab:'overview';}
export function legacyLifecycleUrl(preview?:string){return preview?`/email?tab=previews&preview=${encodeURIComponent(preview)}#email-previews`:'/email';}
