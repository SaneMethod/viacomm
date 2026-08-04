# ViaComm

## Simple Fetch Wrapper with Vue 3 Plugin Support

ViaComm is a small wrapper around the browser's [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) API. It provides:

- Shared defaults for all requests
- Automatic URL and query-string handling
- Separate request data handling for `GET`/`HEAD` and other methods
- Convenient JSON requests
- Dynamic request and header values
- Consistent errors for unsuccessful HTTP responses
- Optional Vue 3 plugin support through the `$comm` global property

## Installation

Install ViaComm from npm:

```shell
npm install viacomm
```

ViaComm is intended for browser environments and requires the Fetch API, `URL`, `URLSearchParams`, `Headers`, and `structuredClone`.

## Basic Usage

The package exports a configured `comm` singleton as its default export:

```js
import comm from "viacomm";

const response = await comm.request({
    url: "/api/users",
});

const users = await response.json();
```

You can also import the named singleton:

```js
import {comm} from "viacomm";
```

Every request returns a `Promise<Response>`, so the response can be handled using the standard Fetch API methods such as `json()`, `text()`, `blob()`, or `arrayBuffer()`.

## The `Comm` Class

The `Comm` class is the main request client. A new instance can be created when an application needs an independent set of defaults:

```js
import {Comm} from "viacomm";

const api = new Comm();

const response = await api.request({
    url: "/api/status",
});
```

The package's default singleton is suitable for most applications.

### Default Request Options

A new `Comm` instance starts with these defaults:

```js
{
    cache: "default",
    credentials: "same-origin",
    keepalive: false,
    method: "GET",
    redirect: "follow",
    referrer: "client",
    referrerPolicy: "no-referrer-when-downgrade"
}
```

These values are passed to `fetch` unless overridden for an individual request.

### Configuring Defaults

Use `configure()` to add or replace defaults for every request:

```js
import comm from "viacomm";

comm.configure({
    headers: {
        "X-Client": "my-app"
    },
    credentials: "include"
});
```

Configuration is merged into the existing defaults. Calling `configure()` with a falsey value resets the defaults to their original values:

```js
comm.configure(false);
```

Request-specific options take precedence over configured defaults.

## Making Requests

### `request(options)`

`request()` is an asynchronous method that returns a `Promise<Response>`. It accepts Fetch options plus the following ViaComm-specific options:

| Option | Type | Description |
| --- | --- | --- |
| `url` | `string` or `URL` | Required request URL. Relative URLs use `window.location.origin`. |
| `data` | `object` or `string` | Query data for `GET`/`HEAD`, or request body data for other methods. |
| `headers` | `object` or `Function` | Headers for this request. |
| `method` | `string` | HTTP method, such as `GET`, `POST`, `PUT`, or `DELETE`. |
| `body` | `any` | Standard Fetch request body. `data` takes precedence for non-`GET`/`HEAD` requests. |

Always `await` the returned promise or handle it with `.then()`:

```js
const response = await comm.request({
    url: "/api/products"
});
```

A relative URL:

```js
const response = await comm.request({
    url: "/api/products"
});
```

An absolute URL:

```js
const response = await comm.request({
    url: "https://example.com/api/products"
});
```

### Query Parameters

For `GET` and `HEAD` requests, `data` is added to the URL as query parameters. Existing query parameters are preserved, and matching values in `data` override them.

Values that are `null` or `undefined` are ignored:

```js
const response = await comm.request({
    url: "/api/products?sort=name",
    data: {
        page: 2,
        limit: 25,
        discontinued: null
    }
});
```

This produces a request similar to:

```text
/api/products?sort=name&page=2&limit=25
```

### Request Bodies

For methods other than `GET` and `HEAD`, `data` is assigned to the Fetch request body:

```js
    const response = await comm.request({
    url: "/api/products",
    method: "POST",
    data: "product data"
    });
```

For JSON payloads, use `json()` instead.

## HTTP Verb Shortcuts

`delete()`, `get()`, `head()`, `patch()`, `post()`, `put()`, and `options()` are asynchronous convenience methods. Each returns a `Promise<Response>`, so calls should be awaited or handled as promises.

`GET` and `HEAD` shortcuts use query parameters and do not use JSON handling by default.

All other shortcuts send data as JSON by default.

```js
const response = await comm.post("/api/products", {
    data: {
        name: "Example product"
    }
});
```

To send a non-JSON request, pass `false` as the second argument:

```js
const response = await comm.post({
    url: "/api/products",
    data: "product data"
}, false);
```

## JSON Requests

### `json(options)`

`json()` is an asychronous convenience method that returns a `Promise<Response>` for requests that send JSON. It:

- Sets the `Accept` header to `application/json, text/plain, */*`
- Sets the `Content-Type` header to `application/json`
- Serializes non-string `data` with `JSON.stringify()`
- Delegates to `request()`

```js
const response = await comm.json({
    url: "/api/products",
    method: "POST",
    data: {
        name: "Example product",
        price: 19.99
    }
});

const product = await response.json();
```

You can still provide additional headers:

```js
await comm.json({
    url: "/api/products",
    method: "POST",
    headers: {
        Authorization: "Bearer token"
    },
    data: {
        name: "Example product"
    }
});
```

The JSON headers supplied by `json()` take precedence over matching headers supplied in the request options.

## Dynamic Options and Headers

Option values may be functions. ViaComm evaluates them immediately before sending the request, passing the current request options:

```js
comm.configure({
    headers: {
        Authorization: (url, data, options) =>
        `Bearer ${getAccessToken()}`
    }
});
```

Headers may also be functions that receive the resolved URL, request data, and request options:

```js
await comm.request({
    url: "/api/account",
    headers: (url, data, options) => ({
        "X-Request-Method": options.method
    })
});
```

Individual header values can be functions as well:

```js
await comm.request({
    url: "/api/account",
    headers: {
        "X-Request-ID": () => crypto.randomUUID()
    }
});
```

Request-specific headers are merged with configured headers rather than replacing them entirely.

## Error Handling

When `fetch()` receives an unsuccessful HTTP response, ViaComm rejects the promise with a `CommError`. The original `Response` is available through the error's `response` property:

```js
import {CommError} from "viacomm";

try {
    const response = await comm.request({
        url: "/api/products/does-not-exist"
    });
} catch (error) {
    if (error instanceof CommError) {
        console.error(error.message);
        console.error(error.response.status);
    } else {
        // Network and other non-HTTP errors are handled normally.
        console.error(error);
    }
}
```

A missing `url` causes the returned promise to reject:

```js
try {
    await comm.request({});
} catch (error) {
    // Error: You must define a 'url' to make the request against.
}
```

The same behavior applies to `json()` and all HTTP verb shortcuts.

## Using ViaComm with Vue 3

ViaComm can be installed as a Vue 3 plugin. Installation exposes the shared singleton as `$comm` on every component.

### Plugin Installation

Create a Vue plugin wrapper, for example `plugins/comm.js`:

```js
import {comm, install} from "viacomm";

// Configure the shared singleton here if needed.
comm.configure({
    headers: {
        "X-Client": "my-vue-app"
    }
});

export default install;
```

Register the plugin in the application's entry point:

```js
import {createApp} from "vue";
import App from "./App.vue";
import comm from "./plugins/comm";

const app = createApp(App);

app.use(comm);
app.mount("#app");
```

You can also install ViaComm directly:

```js
import {createApp} from "vue";
import {install as comm} from "viacomm";
import App from "./App.vue";

const app = createApp(App);

app.use(comm);
app.mount("#app");
```

The plugin is safe to install more than once; repeated installation attempts are ignored.

### Options API

After installation, use `this.$comm` inside Options API components:
```vue
<template>
<button @click="loadUsers">Load users</button>
</template>

<script>
export default {
    methods: {
        async loadUsers() {
            const response = await this.$comm.request({
                url: "/api/users"
            });

            this.users = await response.json();
        }
    },

    data() {
        return {
            users: []
        };
    }
};
</script>
```
### Composition API

With the Composition API, import the singleton directly:

```vue
<script setup>
import {ref} from "vue";
import {comm} from "viacomm";

const users = ref([]);

async function loadUsers() {
    const response = await comm.request({
        url: "/api/users"
    });

    users.value = await response.json();
}
</script>

<template>
    <button @click="loadUsers">Load users</button>
    <pre>{{ users }}</pre>
</template>
```

## Import Options

The standard package import is:

```js
import comm, {Comm, CommError, install} from "viacomm";
```

The standard build expects `lodash-es` to be available as a peer dependency. A full build is also available, which includes the required lodash functionality:

```js
import comm from "viacomm/dist/viacomm.full.js";
```

Minified builds are available at:

```text
viacomm/dist/viacomm.min.js
viacomm/dist/viacomm.full.min.js
```

Vue is an optional peer dependency, so ViaComm can be used without Vue. The Vue plugin is only needed when installing ViaComm with `app.use()`.

## Browser Support

ViaComm uses browser APIs provided by the Fetch API, including:

- `fetch`
- `URL`
- `URLSearchParams`
- `Headers`
- `window.location.origin`

Use an appropriate polyfill or compatible environment when targeting browsers that do not provide these APIs.

## License

The [LICENSE.txt](./LICENSE.txt) file contains the license details. ViaComm is licensed under the Mozilla Public License, Version 2.0.
