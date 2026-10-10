type ClassValue = string | false | null | undefined | Record<string, boolean | null | undefined>;

export function cn(...values: ClassValue[]) {
  return values
    .flatMap(value => {
      if (typeof value === "string") return value;
      if (!value || typeof value !== "object") return [];
      return Object.entries(value)
        .filter(([, enabled]) => Boolean(enabled))
        .map(([className]) => className);
    })
    .join(" ");
}
