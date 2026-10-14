import type { Tone } from "@/components/ui/badge";
import type { INCIDENT_STATUS } from "@/lib/labels";

export const INCIDENT_TONE: Record<keyof typeof INCIDENT_STATUS, Tone> = { OPEN: "red", IN_PROGRESS: "yellow", RESOLVED: "green", CLOSED: "gray" };
