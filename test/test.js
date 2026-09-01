import assert from "node:assert/strict";
import {afterEach, before, beforeEach, describe, it} from "node:test";

const originalFetch = globalThis.fetch;

globalThis.window = {
    URL,
    location: {
        origin: "https://app.example.test",
    },
    structuredClone: globalThis.structuredClone,
};

const {
    Comm,
    CommError,
    comm,
    install,
} = await import("../index.js");

const defaultOptions = {
    cache: "default",
    credentials: "same-origin",
    keepalive: false,
    method: "GET",
    redirect: "follow",
    referrer: "client",
    referrerPolicy: "no-referrer-when-downgrade",
};

function response({ok = true, status = 200} = {}) {
    return {
        ok,
        status,
        clone() {
            return {
                ok: this.ok,
                status: this.status,
            };
        },
    };
}

function fetchSpy(result = response()) {
    const calls = [];

    const fetch = async (...args) => {
        calls.push(args);
        return result;
    };

    globalThis.fetch = fetch;
    fetch.calls = calls;
    return fetch;
}

function requestOptions(fetch) {
    assert.equal(fetch.calls.length, 1);
    return fetch.calls[0][1];
}

before(() => {
    globalThis.Headers = Headers;
    globalThis.URL = URL;
    globalThis.URLSearchParams = URLSearchParams;
});

beforeEach(() => {
    globalThis.fetch = originalFetch;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("Comm constructor and configuration", () => {
    it("initializes the documented defaults", () => {
        const client = new Comm();

        assert.deepEqual(client.defaults, defaultOptions);
        assert.deepEqual(client._defaults, defaultOptions);
        assert.notStrictEqual(client.defaults, client._defaults);
    });

    it("merges configured defaults", () => {
        const client = new Comm();

        client.configure({
            credentials: "include",
            mode: "cors",
            headers: {
                "X-Client": "test",
            },
        });

        assert.equal(client.defaults.credentials, "include");
        assert.equal(client.defaults.mode, "cors");
        assert.deepEqual(client.defaults.headers, {
            "X-Client": "test",
        });
    });

    it("resets defaults for every falsey configuration value", () => {
        for (const value of [false, null, undefined, "", 0]) {
            const client = new Comm();

            client.configure({
                credentials: "include",
                headers: {
                    "X-Changed": "yes",
                },
            });
            client.configure(value);

            assert.deepEqual(client.defaults, defaultOptions);
            assert.notStrictEqual(client.defaults, client._defaults);
        }
    });

    it("does not mutate the original defaults when configured values are changed", () => {
        const client = new Comm();

        client.configure({
            headers: {
                Authorization: "token",
            },
        });
        client.defaults.headers.Authorization = "changed";

        client.configure(false);

        assert.equal(client.defaults.headers, undefined);
    });
});

describe("request", () => {
    it("throws when url is missing", async () => {
        const client = new Comm();

        await assert.rejects(
            client.request({}),
            {
                name: "Error",
                message: "You must define a 'url' to make the request against.",
            },
        );
    });

    it("uses a relative URL against window.location.origin", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            url: "/users",
        });

        assert.equal(fetch.calls[0][0], "https://app.example.test/users");
    });

    it("uses baseURL origin for relative URLs with leading slashes", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            baseURL: "https://api.example.test/v1/",
            url: "/users",
        });

        assert.equal(fetch.calls[0][0], "https://api.example.test/users");
    });

    it("uses baseURL for relative URLs", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            baseURL: "https://api.example.test/v1/",
            url: "users",
        });

        assert.equal(fetch.calls[0][0], "https://api.example.test/v1/users");
    });

    it("preserves absolute URLs", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            url: "https://api.example.test/users",
        });

        assert.equal(fetch.calls[0][0], "https://api.example.test/users");
    });

    it("preserves absolute URLs when baseURL is provided", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            baseURL: "https://api.example.test/v1/",
            url: "https://other.example.test/users",
        });

        assert.equal(fetch.calls[0][0], "https://other.example.test/users");
    });

    it("accepts a URL instance", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            url: new URL("https://api.example.test/users"),
        });

        assert.equal(fetch.calls[0][0], "https://api.example.test/users");
    });

    it("passes configured defaults to fetch", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            url: "/users",
        });

        assert.deepEqual(
            Object.fromEntries(
                Object.entries(requestOptions(fetch))
                    .filter(([key]) => key !== "headers"),
            ),
            defaultOptions,
        );
    });

    it("allows request options to override defaults", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            url: "/users",
            method: "POST",
            credentials: "include",
            cache: "no-store",
        });

        const options = requestOptions(fetch);

        assert.equal(options.method, "POST");
        assert.equal(options.credentials, "include");
        assert.equal(options.cache, "no-store");
    });

    it("adds GET data to the query string", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            url: "/users?existing=original&unchanged=yes",
            data: {
                existing: "overridden",
                page: 2,
                enabled: false,
                ignoredNull: null,
                ignoredUndefined: undefined,
            },
        });

        const url = new URL(fetch.calls[0][0]);

        assert.equal(url.searchParams.get("existing"), "overridden");
        assert.equal(url.searchParams.get("unchanged"), "yes");
        assert.equal(url.searchParams.get("page"), "2");
        assert.equal(url.searchParams.get("enabled"), "false");
        assert.equal(url.searchParams.has("ignoredNull"), false);
        assert.equal(url.searchParams.has("ignoredUndefined"), false);
    });

    it("adds HEAD data to the query string", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            url: "/status",
            method: "HEAD",
            data: {
                verbose: true,
            },
        });

        assert.equal(
            new URL(fetch.calls[0][0]).searchParams.get("verbose"),
            "true",
        );
        assert.equal(requestOptions(fetch).body, undefined);
    });

    it("uses data as the body for non-GET requests", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            url: "/users",
            method: "POST",
            data: "raw body",
        });

        const options = requestOptions(fetch);

        assert.equal(options.body, "raw body");
        assert.equal(new URL(fetch.calls[0][0]).search, "");
    });

    it("gives data precedence over an explicitly supplied body", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            url: "/users",
            method: "PUT",
            body: "old body",
            data: "new body",
        });

        assert.equal(requestOptions(fetch).body, "new body");
    });

    it("removes ViaComm-only url and data options before fetch", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            url: "/users",
            data: {
                page: 1,
            },
        });

        const options = requestOptions(fetch);

        assert.equal("url" in options, false);
        assert.equal("data" in options, false);
    });

    it("evaluates function-valued request options", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            url: "/users",
            method: () => "PATCH",
            cache: (options) => {
                return options.method === "PATCH"
                    ? "no-store"
                    : "default";
            }
        });

        const options = requestOptions(fetch);

        assert.equal(options.method, "PATCH");
        assert.equal(options.cache, "no-store");
    });

    it("registers before and after hooks", () => {
        const client = new Comm();
        const hook = () => {};

        const h1 = client.hook(hook);
        const h2 = client.before(hook);
        const h3 = client.after(hook);

        assert.deepEqual(client._hooks, [
            {
                func: hook,
                pre: true,
                id: h1,
            },
            {
                func: hook,
                pre: true,
                id: h2,
            },
            {
                func: hook,
                pre: false,
                id: h3,
            },
        ]);
    });
});

describe("request hooks", () => {
    it("runs direct hooks before the request by default", async () => {
        const fetch = fetchSpy();
        const client = new Comm();
        const events = [];

        client.hook((url, data, options) => {
            events.push({
                type: "hook",
                url: url.toString(),
                data,
                method: options.method,
            });
        });

        await client.request({
            url: "/users",
            data: {
                page: 1,
            },
        });

        assert.deepEqual(events, [
            {
                type: "hook",
                url: "https://app.example.test/users?page=1",
                data: {
                    page: 1,
                },
                method: "GET",
            },
        ]);
        assert.equal(fetch.calls.length, 1);
    });

    it("runs before hooks before fetch", async () => {
        const events = [];
        const client = new Comm();

        globalThis.fetch = async (...args) => {
            events.push("fetch");
            return response();
        };

        client.before(() => {
            events.push("before");
        });

        await client.request({
            url: "/users",
        });

        assert.deepEqual(events, ["before", "fetch"]);
    });

    it("runs after hooks after fetch with a cloned response", async () => {
        const expected = response();
        const events = [];
        const client = new Comm();

        globalThis.fetch = async () => {
            events.push("fetch");
            return expected;
        };

        client.after((url, data, options, hookedResponse) => {
            events.push("after");
            assert.equal(url.toString(), "https://app.example.test/users");
            assert.equal(data, undefined);
            assert.equal(options.method, "GET");
            assert.notStrictEqual(hookedResponse, expected);
            assert.deepEqual(hookedResponse, {
                ok: true,
                status: 200,
            });
        });

        const actual = await client.request({
            url: "/users",
        });

        assert.deepEqual(events, ["fetch", "after"]);
        assert.strictEqual(actual, expected);
    });

    it("uses a Response returned by an after hook", async () => {
        const original = new Response("original");
        const replacement = new Response("replacement", {
            headers: {
                "X-Replaced": "yes",
            },
        });
        const client = new Comm();

        fetchSpy(original);
        client.after(async () => replacement);

        const actual = await client.request({
            url: "/users",
        });

        assert.strictEqual(actual, replacement);
        assert.equal(actual.headers.get("X-Replaced"), "yes");
        assert.equal(await actual.text(), "replacement");
    });

    it("passes replacement responses to downstream after hooks", async () => {
        const original = new Response("original");
        const replacement = new Response("replacement");
        const client = new Comm();
        let downstreamResponse;

        fetchSpy(original);

        client.after(() => replacement);
        client.after((url, data, options, hookedResponse) => {
            downstreamResponse = hookedResponse;
        });

        const actual = await client.request({
            url: "/users",
        });

        assert.strictEqual(actual, replacement);
        assert.notStrictEqual(downstreamResponse, replacement);
        assert.equal(await downstreamResponse.text(), "replacement");
    });

    it("ignores non-Response return values from after hooks", async () => {
        const original = new Response("original");
        const client = new Comm();

        fetchSpy(original);
        client.after(() => ({
            ok: true,
            status: 201,
        }));

        const actual = await client.request({
            url: "/users",
        });

        assert.strictEqual(actual, original);
    });

    it("rejects an unsuccessful replacement response with CommError", async () => {
        const original = new Response("original");
        const replacement = new Response("failed", {
            status: 503,
        });
        const client = new Comm();

        fetchSpy(original);
        client.after(() => replacement);

        await assert.rejects(
            client.request({
                url: "/users",
            }),
            (error) => {
                assert.equal(error instanceof CommError, true);
                assert.strictEqual(error.response, replacement);
                return true;
            },
        );
    });

    it("preserves hook registration order", async () => {
        const events = [];
        const client = new Comm();

        globalThis.fetch = async () => {
            events.push("fetch");
            return response();
        };

        const beforeId = client.before(() => {
            events.push("first");
        });
        const secondId = client.hook(() => {
            events.push("second");
        }, true);
        const afterId = client.after((url, data, options, hookedResponse) => {
            events.push("after");
            return response({
                ok: hookedResponse.ok,
                status: hookedResponse.status,
            });
        });

        assert.match(beforeId, /^hook_\d+$/);
        assert.match(secondId, /^hook_\d+$/);
        assert.match(afterId, /^hook_\d+$/);
        assert.notEqual(beforeId, secondId);
        assert.notEqual(secondId, afterId);

        await client.request({
            url: "/users",
        });

        assert.deepEqual(events, ["first", "second", "fetch", "after"]);
    });

    it("registers before and after hooks with unique ids", () => {
        const client = new Comm();
        const hook = () => {};

        const directId = client.hook(hook);
        const beforeId = client.before(hook);
        const afterId = client.after(hook);

        assert.match(directId, /^hook_\d+$/);
        assert.match(beforeId, /^hook_\d+$/);
        assert.match(afterId, /^hook_\d+$/);
        assert.notEqual(directId, beforeId);
        assert.notEqual(beforeId, afterId);

        assert.deepEqual(client._hooks, [
            {
                func: hook,
                pre: true,
                id: directId,
            },
            {
                func: hook,
                pre: true,
                id: beforeId,
            },
            {
                func: hook,
                pre: false,
                id: afterId,
            },
        ]);
    });

    it("removes a hook by id", () => {
        const client = new Comm();
        const firstHook = () => {};
        const secondHook = () => {};

        const firstId = client.hook(firstHook);
        const secondId = client.hook(secondHook);

        client.unhook(firstId);

        assert.deepEqual(client._hooks, [
            {
                func: secondHook,
                pre: true,
                id: secondId,
            },
        ]);
    });

    it("removes all hooks when passed false", () => {
        const client = new Comm();

        client.before(() => {});
        client.after(() => {});

        client.unhook(false);

        assert.deepEqual(client._hooks, []);
    });

    it("does not execute a hook after it is removed", async () => {
        const fetch = fetchSpy();
        const client = new Comm();
        let calls = 0;

        const hookId = client.before(() => {
            calls += 1;
        });

        client.unhook(hookId);

        await client.request({
            url: "/users",
        });

        assert.equal(calls, 0);
        assert.equal(fetch.calls.length, 1);
    });
});

describe("headers", () => {
    it("creates a Headers instance", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.request({
            url: "/users",
            headers: {
                "X-Test": "value",
            },
        });

        assert.equal(requestOptions(fetch).headers instanceof Headers, true);
        assert.equal(requestOptions(fetch).headers.get("X-Test"), "value");
    });

    it("merges default and request-specific headers", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        client.configure({
            headers: {
                "X-Default": "default",
                "X-Shared": "default",
            },
        });

        await client.request({
            url: "/users",
            headers: {
                "X-Request": "request",
                "X-Shared": "request",
            },
        });

        const headers = requestOptions(fetch).headers;

        assert.equal(headers.get("X-Default"), "default");
        assert.equal(headers.get("X-Request"), "request");
        assert.equal(headers.get("X-Shared"), "request");
    });

    it("evaluates function-valued default and request headers", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        client.configure({
            headers: (url, data, options) => ({
                "X-URL": url.pathname,
                "X-Method": options.method,
            }),
        });

        await client.request({
            url: "/users",
            data: {
                page: 1,
            },
            headers: (url, data) => ({
                "X-Data": String(data.page),
                "X-Request-URL": url.pathname,
                "X-Value": () => "computed",
            }),
        });

        const headers = requestOptions(fetch).headers;

        assert.equal(headers.get("X-URL"), "/users");
        assert.equal(headers.get("X-Method"), "GET");
        assert.equal(headers.get("X-Data"), "1");
        assert.equal(headers.get("X-Request-URL"), "/users");
        assert.equal(headers.get("X-Value"), "computed");
    });

    it("allows request headers to override default headers", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        client.configure({
            headers: {
                Authorization: "default-token",
            },
        });

        await client.request({
            url: "/users",
            headers: {
                Authorization: "request-token",
            },
        });

        assert.equal(
            requestOptions(fetch).headers.get("Authorization"),
            "request-token",
        );
    });
});

describe("responses and errors", () => {
    it("resolves with successful responses", async () => {
        const expected = response();
        const fetch = fetchSpy(expected);
        const client = new Comm();

        const actual = await client.request({
            url: "/users",
        });

        assert.strictEqual(actual, expected);
    });

    it("rejects unsuccessful responses with CommError", async () => {
        const failedResponse = response({
            ok: false,
            status: 404,
        });
        const fetch = fetchSpy(failedResponse);
        const client = new Comm();

        await assert.rejects(
            client.request({
                url: "/missing",
            }),
            (error) => {
                assert.equal(error instanceof CommError, true);
                assert.equal(
                    error.message,
                    "Failed GET against https://app.example.test/missing",
                );
                assert.strictEqual(error.response, failedResponse);
                return true;
            },
        );
    });

    it("propagates fetch failures without wrapping them", async () => {
        const networkError = new Error("network failure");
        globalThis.fetch = async () => {
            throw networkError;
        };
        const client = new Comm();

        await assert.rejects(
            client.request({
                url: "/users",
            }),
            (error) => error === networkError,
        );
    });
});

describe("json", () => {
    it("uses empty options when called without arguments", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await assert.rejects(
            client.json(),
            /define a 'url'/,
        );
        assert.equal(fetch.calls.length, 0);
    });

    it("falls back to cloneDeep when structuredClone cannot clone", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.json({
            url: new URL("https://api.example.test/users"),
        });

        assert.equal(fetch.calls[0][0], "https://api.example.test/users");
    });

    it("serializes non-string data and adds JSON headers", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.json({
            url: "/users",
            method: "POST",
            data: {
                name: "Ada",
                active: true,
            },
        });

        const options = requestOptions(fetch);
        assert.equal(options.body, '{"name":"Ada","active":true}');
        assert.equal(
            options.headers.get("Accept"),
            "application/json, text/plain, */*",
        );
        assert.equal(options.headers.get("Content-Type"), "application/json");
    });

    it("does not serialize string data", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.json({
            url: "/users",
            method: "POST",
            data: '{"name":"Ada"}',
        });

        assert.equal(requestOptions(fetch).body, '{"name":"Ada"}');
    });

    it("lets JSON headers override caller-supplied values", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.json({
            url: "/users",
            headers: {
                Accept: "text/html",
                "Content-Type": "text/plain",
                Authorization: "Bearer token",
            },
        });

        const headers = requestOptions(fetch).headers;

        assert.equal(headers.get("Accept"), "application/json, text/plain, */*");
        assert.equal(headers.get("Content-Type"), "application/json");
        assert.equal(headers.get("Authorization"), "Bearer token");
    });

    it("does not mutate the caller's options object", async () => {
        const fetch = fetchSpy();
        const client = new Comm();
        const options = {
            url: "/users",
            method: "POST",
            data: {
                name: "Ada",
            },
            headers: {
                "X-Test": "value",
            },
        };
        const originalData = options.data;
        const originalHeaders = options.headers;

        await client.json(options);

        assert.strictEqual(options.data, originalData);
        assert.strictEqual(options.headers, originalHeaders);
        assert.deepEqual(options.data, {
            name: "Ada",
        });
    });
});

describe("HTTP verb shortcuts", () => {
    for (const verb of ["delete", "get", "head", "patch", "post", "put", "options"]) {
        it(`${verb} uses ${verb.toUpperCase()}${["get", "head"].includes(verb) ? "" : " and JSON by default"}`, async () => {
            const fetch = fetchSpy();
            const client = new Comm();

            await client[verb]({
                url: "/resource",
                data: {
                    value: 1,
                },
            });

            const options = requestOptions(fetch);
            const uverb = verb.toUpperCase();

            assert.equal(options.method, uverb);

            if (["GET", "HEAD"].includes(uverb)) {
                //throw new Error(new URL(fetch.calls[0][0]).searchParams.get('value'));
                assert.equal(new URL(fetch.calls[0][0]).searchParams.get('value'), "1", uverb);
            } else {
                assert.equal(options.headers.get("Content-Type"), "application/json");
                assert.equal(options.body, '{"value":1}');
            }
        });

        it(`${verb} can bypass JSON handling`, async () => {
            const fetch = fetchSpy();
            const client = new Comm();

            await client[verb]({
                url: "/resource",
                data: "raw",
            }, false);

            const options = requestOptions(fetch);

            assert.equal(options.method, verb.toUpperCase());
            assert.equal(options.headers.get("Content-Type"), null);

            if (["GET", "HEAD"].includes(verb.toUpperCase())) {
                assert.equal(new URL(fetch.calls[0][0]).searchParams.get("data"), null);
            } else {
                assert.equal(options.body, "raw");
            }
        });
    }

    it("accepts omitted shortcut options", async () => {
        const fetch = fetchSpy();
        const client = new Comm();

        await client.get({
            url: "/resource",
        });

        assert.equal(requestOptions(fetch).method, "GET");
    });
});

describe("Vue plugin installation", () => {
    it("installs the singleton on app.config.globalProperties", () => {
        const app = {
            config: {
                globalProperties: {},
            },
        };

        install(app);

        assert.strictEqual(app.config.globalProperties.$comm, comm);
    });

    it("ignores repeated installation", () => {
        const firstApp = {
            config: {
                globalProperties: {},
            },
        };
        const secondApp = {
            config: {
                globalProperties: {},
            },
        };

        install(firstApp);
        install(secondApp);

        assert.equal(secondApp.config.globalProperties.$comm, undefined);
    });
});
