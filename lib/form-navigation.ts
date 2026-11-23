import "server-only";
import { redirect } from "next/navigation";
import type { FormResult } from "./forms";

export function finishSave(result: FormResult, data: FormData, destination: string) {
  if (result.success && data.get("continue") !== "on") redirect(destination);
  return result;
}
