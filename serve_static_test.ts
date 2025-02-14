// Copyright 2019-2020 Yusuke Sakurai. All rights reserved. MIT license.
import {
  assertEquals,
  assertMatch,
} from "./vendor/https/deno.land/std/testing/asserts.ts";
import { createRecorder } from "./testing.ts";
import { serveStatic, buildCacheControlHeader } from "./serve_static.ts";
import { group } from "./_test_util.ts";
import { createApp } from "./app.ts";
import { toIMF } from "./vendor/https/deno.land/std/datetime/mod.ts";

group("serveStatic", (t) => {
  const func = serveStatic("./fixtures/public", {
    contentTypeMap: new Map([[".vue", "application/vue"]]),
  });
  const data: [string, string][] = [
    ["/", "text/html"],
    ["/about/", "text/html"],
    ["/doc", "text/html"],
    ["/index.css", "text/css"],
    ["/index.ts", "application/javascript"],
    ["/index.js", "application/javascript"],
    ["/sample.vue", "application/vue"],
    ["/sample.xx", "application/octet-stream"],
  ];
  data.forEach(([path, type]) => {
    t.test(path, async () => {
      const rec = createRecorder({ url: path });
      await func(rec);
      const resp = await rec.response();
      assertEquals(resp.status, 200);
      const contentType = resp.headers.get("content-type");
      assertMatch(contentType!, new RegExp(type));
    });
  });

  t.test("cace-control", async () => {
    const f = serveStatic("./fixtures/public", {
      cacheControl: {
        public: true,
        maxAge: 3600,
      },
    });
    const rec = createRecorder({ url: "/" });
    await f(rec);
    const resp = await rec.response();
    assertEquals(resp.headers.get("cache-control"), "public, max-age=3600");
  });

  t.test("expires", async () => {
    const expires = new Date();
    const f = serveStatic("./fixtures/public", {
      expires,
    });
    const rec = createRecorder({ url: "/" });
    await f(rec);
    const resp = await rec.response();
    assertEquals(resp.headers.get("expires"), toIMF(expires));
  });
});

group("serveStatic/cacheControl", (t) => {
  t.test("empty", () => {
    const s = buildCacheControlHeader({});
    assertEquals(s, "");
  });
  t.test("basic", () => {
    assertEquals(
      buildCacheControlHeader({
        public: true,
        maxAge: 3600,
        sMaxAge: 1000,
        mustRevalidate: true,
        noTransform: true,
      }),
      "public, max-age=3600, s-maxage=1000, must-revalidate, no-transform",
    );
    assertEquals(
      buildCacheControlHeader({
        private: true,
        sMaxAge: 3600,
        proxyRevalidate: true,
      }),
      "private, s-maxage=3600, proxy-revalidate",
    );
    assertEquals(
      buildCacheControlHeader({
        noCache: true,
      }),
      "no-cache",
    );
    assertEquals(
      buildCacheControlHeader({
        noStore: true,
      }),
      "no-store",
    );
    assertEquals(
      buildCacheControlHeader({
        public: true,
        private: true,
        maxAge: 3600,
        sMaxAge: 1000,
        noCache: true,
        noStore: true,
        mustRevalidate: true,
        proxyRevalidate: true,
        noTransform: true,
      }),
      "public, private, no-cache, no-store, max-age=3600, s-maxage=1000, must-revalidate, proxy-revalidate, no-transform",
    );
  });
});

group("serveStatic integration", (t) => {
  t.setupAll(() => {
    const router = createApp();
    router.use((req) => {
      req.responseHeaders.set("Connection", "close");
    });
    router.use(serveStatic("./fixtures/public"));
    const l = router.listen({ port: 9988 });
    return () => l.close();
  });
  t.test("basic", async () => {
    const resp = await fetch("http://127.0.0.1:9988/index.html");
    assertEquals(resp.status, 200);
    await resp.text();
  });
  t.test("not found", async () => {
    const resp = await fetch("http://127.0.0.1:9988/no-file");
    assertEquals(resp.status, 404);
    await resp.text();
  });
  t.test("Capitalized", async () => {
    const resp = await fetch("http://127.0.0.1:9988/File.txt");
    assertEquals(resp.status, 200);
    await resp.text();
  });
  t.test("Multi bytes", async () => {
    const resp = await fetch("http://127.0.0.1:9988/日本語.txt");
    assertEquals(resp.status, 200);
    await resp.text();
  });
});
