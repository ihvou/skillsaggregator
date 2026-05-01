import type { SupabaseClient } from "npm:@supabase/supabase-js@2.48.1";

type LogLevel = "debug" | "info" | "warn" | "error";

interface RunLoggerOptions {
  runId?: string | null;
  agentType: string;
}

export function createRunLogger(supabase: SupabaseClient, options: RunLoggerOptions) {
  async function event(
    level: LogLevel,
    eventType: string,
    message: string,
    metadata: Record<string, unknown> = {},
  ) {
    const entry = {
      run_id: options.runId ?? null,
      agent_type: options.agentType,
      level,
      event_type: eventType,
      message,
      metadata,
      at: new Date().toISOString(),
    };

    const output = JSON.stringify(entry);
    if (level === "error") console.error(output);
    else if (level === "warn") console.warn(output);
    else console.log(output);

    if (!options.runId) return;
    const { error } = await supabase.from("agent_run_events").insert({
      run_id: options.runId,
      level,
      event_type: eventType,
      message,
      metadata_json: metadata,
    });
    if (error) {
      console.warn(JSON.stringify({
        run_id: options.runId,
        agent_type: options.agentType,
        level: "warn",
        event_type: "log_write_failed",
        message: error.message,
        at: new Date().toISOString(),
      }));
    }
  }

  return {
    debug: (eventType: string, message: string, metadata?: Record<string, unknown>) =>
      event("debug", eventType, message, metadata),
    info: (eventType: string, message: string, metadata?: Record<string, unknown>) =>
      event("info", eventType, message, metadata),
    warn: (eventType: string, message: string, metadata?: Record<string, unknown>) =>
      event("warn", eventType, message, metadata),
    error: (eventType: string, message: string, metadata?: Record<string, unknown>) =>
      event("error", eventType, message, metadata),
  };
}
