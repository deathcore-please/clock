export function weatherSymbol(
  conditionId: number,
  at?: string,
  timezone = "Europe/London",
): string {
  if (conditionId >= 200 && conditionId < 300) return "\u26a1";
  if (conditionId >= 300 && conditionId < 600) return "\u2614";
  if (conditionId >= 600 && conditionId < 700) return "\u2744";
  if (conditionId >= 700 && conditionId < 800) return "\u224b";
  if (conditionId === 800) {
    if (at) {
      const hour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: timezone,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(new Date(at)),
      );
      return hour >= 20 || hour < 6 ? "\u263e" : "\u2600";
    }
    return "\u2600";
  }
  if (conditionId > 800) return "\u2601";
  return "\u00b7";
}
