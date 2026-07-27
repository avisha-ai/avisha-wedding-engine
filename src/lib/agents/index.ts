/**
 * Public surface of the Phase II Multi-Agent IPC Mesh.
 * Import from `@/lib/agents`.
 */
export * from "./types";
export * from "./AgentMesh";
export { LogisticsAgent } from "./LogisticsAgent";
export { EnvironmentalAgent } from "./EnvironmentalAgent";
export { HospitalityAgent } from "./HospitalityAgent";
export { CurationAgent } from "./CurationAgent";

/** Presentation-layer mascot — observes state, contributes no mesh messages. */
export * from "./AviMascot";
