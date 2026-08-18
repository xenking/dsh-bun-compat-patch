export interface WorkerResourceLimits {
  maxOldGenerationSizeMb?: number;
  maxYoungGenerationSizeMb?: number;
  codeRangeSizeMb?: number;
  stackSizeMb?: number;
}

export interface WorkerOptions {
  workerData?: unknown;
  env?: Record<string, string>;
  execArgv?: string[];
  resourceLimits?: WorkerResourceLimits;
  stdout?: boolean;
  stderr?: boolean;
}

export interface EventLoopUtilization {
  idle: number;
  active: number;
  utilization: number;
}

export interface BridgeFrame {
  t: "message" | "stdout" | "stderr" | "error" | "elu";
  d?: unknown;
  message?: string;
  stack?: string;
}
