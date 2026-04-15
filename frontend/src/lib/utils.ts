export const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

export const now = () => new Date().toISOString();

export const shortTime = (iso: string) => new Date(iso).toLocaleString();

export const uid = () => Math.random().toString(36).slice(2, 10);

export const parseStatusValue = (raw: string): boolean | number | string => {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.trim() !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
};
