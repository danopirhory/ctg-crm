// Barrel for the db query layer. Modules are split by domain; importing
// from "@/lib/db/queries" keeps working exactly as it did when this was
// a single 2,400-line file. Add new queries to the matching domain
// module (or a new one + a line here), not to this file.
export * from "./shared";
export * from "./dashboard";
export * from "./candidates";
export * from "./employees";
export * from "./companies";
export * from "./jobs";
export * from "./matches";
export * from "./placements";
export * from "./prospects";
export * from "./boards";
export * from "./invoices";
export * from "./reviews";
export * from "./tasks";
export * from "./activities";
export * from "./campaigns";
