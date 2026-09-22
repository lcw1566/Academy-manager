const FILTERED = "[Filtered]";
const MAX_DEPTH = 5;
const MAX_ITEMS = 40;

const SENSITIVE_KEY =
  /(?:^|_)(?:authorization|cookie|set_cookie|password|passwd|secret|token|access_token|refresh_token|api_key|apikey|phone|parent_phone|guardian|checkin_pin|pin|email|body|request_body|response_body)(?:$|_)/i;
const IDENTITY_KEY =
  /^(?:user|student|guardian|reporter|sender|recipient|target)_?id$/i;
const URL_KEY = /^(?:url|uri|href|referrer|filename|abs_path)$/i;

const VALUE_PATTERNS = [
  [/\bBearer\s+[^\s,;]+/gi, `Bearer ${FILTERED}`],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, FILTERED],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, FILTERED],
  [/(?<!\d)(?:01[016789])[- .]?\d{3,4}[- .]?\d{4}(?!\d)/g, FILTERED],
  [
    /(\b(?:access_token|refresh_token|token|password|secret|checkin_pin|pin|otp|code|cookie)\s*[:=]\s*)[^&\s,;]+/gi,
    `$1${FILTERED}`,
  ],
  [/(\b(?:checkin[_ -]?pin|pin|otp)\s+)(?:is\s+)?\d{4,8}\b/gi, `$1${FILTERED}`],
];

export function sanitizeTelemetryString(value) {
  let result = String(value ?? "");
  for (const [pattern, replacement] of VALUE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function errorSummary(error) {
  return {
    name: sanitizeTelemetryString(error?.name || "Error"),
    code: sanitizeTelemetryString(error?.code || ""),
    status: Number.isInteger(error?.status ?? error?.statusCode)
      ? (error.status ?? error.statusCode)
      : null,
    message: sanitizeTelemetryString(error?.message || "Operation failed"),
  };
}

export function sanitizeTelemetryValue(value, depth = 0, seen = new WeakSet()) {
  if (value == null || typeof value === "boolean" || typeof value === "number")
    return value;
  if (typeof value === "string") return sanitizeTelemetryString(value);
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function" || typeof value === "symbol")
    return undefined;
  if (value instanceof Error) return errorSummary(value);
  if (depth >= MAX_DEPTH) return "[Truncated]";
  if (typeof value !== "object") return sanitizeTelemetryString(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ITEMS)
      .map((item) => sanitizeTelemetryValue(item, depth + 1, seen));
  }

  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_ITEMS)) {
    if (SENSITIVE_KEY.test(key) || IDENTITY_KEY.test(key)) {
      output[key] = FILTERED;
      continue;
    }
    if (URL_KEY.test(key) && typeof item === "string") {
      output[key] = sanitizeTelemetryUrl(item);
      continue;
    }
    output[key] = sanitizeTelemetryValue(item, depth + 1, seen);
  }
  return output;
}

export function sanitizeTelemetryUrl(value) {
  if (!value) return value;
  try {
    const url = new URL(String(value));
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      FILTERED,
    );
    return sanitizeTelemetryString(url.toString());
  } catch {
    return sanitizeTelemetryString(String(value).split(/[?#]/)[0]);
  }
}

export function sanitizeSentryBreadcrumb(breadcrumb) {
  if (!breadcrumb) return breadcrumb;
  return {
    type: breadcrumb.type,
    category: breadcrumb.category ? sanitizeTelemetryString(breadcrumb.category) : undefined,
    level: breadcrumb.level,
    timestamp: breadcrumb.timestamp,
    message: breadcrumb.message
      ? sanitizeTelemetryString(breadcrumb.message)
      : breadcrumb.message,
    data: breadcrumb.data
      ? sanitizeTelemetryValue(breadcrumb.data)
      : breadcrumb.data,
  };
}

function sanitizeException(exception) {
  const next = {
    type: exception.type ? sanitizeTelemetryString(exception.type) : undefined,
    value: sanitizeTelemetryString(exception.value || ''),
  };
  if (exception.mechanism) next.mechanism = sanitizeTelemetryValue(exception.mechanism);
  if (exception.stacktrace?.frames) {
    next.stacktrace = {
      frames: exception.stacktrace.frames.map((frame) => ({
        filename: frame.filename ? sanitizeTelemetryUrl(frame.filename) : undefined,
        abs_path: frame.abs_path ? sanitizeTelemetryUrl(frame.abs_path) : undefined,
        module: frame.module ? sanitizeTelemetryString(frame.module) : undefined,
        function: frame.function ? sanitizeTelemetryString(frame.function) : undefined,
        lineno: frame.lineno,
        colno: frame.colno,
        in_app: frame.in_app,
      })),
    };
  }
  return next;
}

export function sanitizeSentryEvent(event) {
  if (!event) return event;
  const next = { ...event };
  delete next.user;
  delete next.attachments;
  delete next.spans;
  delete next.sdkProcessingMetadata;
  if (next.request) {
    next.request = {
      method: next.request.method,
      url: sanitizeTelemetryUrl(next.request.url),
    };
  }
  if (next.exception?.values) {
    next.exception = {
      ...next.exception,
      values: next.exception.values.map(sanitizeException),
    };
  }
  if (next.stacktrace?.frames) {
    next.stacktrace = sanitizeException({ stacktrace: next.stacktrace }).stacktrace;
  }
  if (next.message) next.message = sanitizeTelemetryString(next.message);
  if (next.logentry) {
    next.logentry = {
      message: sanitizeTelemetryString(next.logentry.message || next.logentry.formatted || ''),
    };
  }
  if (next.transaction) next.transaction = sanitizeTelemetryString(next.transaction);
  if (next.fingerprint) next.fingerprint = next.fingerprint.map(sanitizeTelemetryString);
  if (next.extra) next.extra = sanitizeTelemetryValue(next.extra);
  if (next.contexts) next.contexts = sanitizeTelemetryValue(next.contexts);
  if (next.tags) next.tags = sanitizeTelemetryValue(next.tags);
  if (next.breadcrumbs)
    next.breadcrumbs = next.breadcrumbs.map(sanitizeSentryBreadcrumb);
  return next;
}

let consoleInstalled = false;
export function installPrivacySafeConsole(target = globalThis.console) {
  if (consoleInstalled || !target) return;
  for (const method of ["warn", "error"]) {
    const original = target[method]?.bind(target);
    if (!original) continue;
    target[method] = (...args) =>
      original(...args.map((arg) => sanitizeTelemetryValue(arg)));
  }
  consoleInstalled = true;
}
