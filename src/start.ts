import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const response = (result as { response?: Response }).response;
  if (response && typeof response.headers?.set === "function") {
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
    response.headers.set("X-DNS-Prefetch-Control", "off");
    response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  }
  return result;
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
      },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware],
}));
