export const DESIGN_TABS=['overview','guidelines','assets','reviews','tools'] as const;
export type DesignTab=typeof DESIGN_TABS[number];
export function designTab(value:unknown):DesignTab{return DESIGN_TABS.includes(value as DesignTab)?value as DesignTab:'overview';}
export function designAsset(file:string){return /\.(png|svg|json)$/.test(file);}
export function designReview(file:string){return file.endsWith('.md')&&file!=='brand-guide.md';}
