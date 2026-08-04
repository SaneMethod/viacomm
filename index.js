/**
 * Simple central point for interacting with the server, and a thin layer over the fetch API.
 * @See: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
 * @author ckeefer
 */

import {isFunction, isString, isObject, cloneDeep} from "lodash-es";

const URL = window.URL;
const clone = window.structuredClone || cloneDeep;
const verbs = ["delete", "get", "head", "patch", "post", "put", "options"];
const nobodyVerbs = ["get", "head",];

/**
 * Extends Error to allow us to send through the response from a comm error.
 */
class CommError extends Error{
    constructor(message, response){
        super();
        this.message = message;
        this.response = response;
    }
}

/**
 * Simple class for controlling ajax requests via fetch.
 * Instances have convenience methods for each HTTP verb: delete, get, head, patch, post, put, options.
 * These verb methods accept an options object and an optional json boolean parameter (defaults to true).
 * When json is true (and the verb is not 'get' or 'head'), the request is sent through the json() method.
 */
class Comm{
    constructor(){
        this.defaults = {
            cache:'default',
            credentials:'same-origin',
            keepalive:false,
            method:'GET',
            redirect:'follow',
            referrer:'client',
            referrerPolicy:'no-referrer-when-downgrade',
        };
        this._defaults = clone(this.defaults);
    }

    /**
     * Simple method to set defaults for all requests.
     * Setting opts to a falsey value will reset to defaults.
     * @param {object|false} opts
     */
    configure(opts){
        if (!opts){
            this.defaults = clone(this._defaults);
        } else {
            Object.assign(this.defaults, opts);
        }
    }

    /**
     * Establish the url and details of the request, and send it.
     * @param {{headers:(object|Function)=, body:*=, url:string, data:(object|string)=, method:string=}} opts
     * @returns {Promise<Response>}
     */
    request(opts){
        let headers = this.defaults.headers,
            optsHeaders = opts.headers;

        // We'll handle these separately, and don't want to expand them as part of the usual opts processing.
        delete opts.headers;

        // Don't include props found in opts from this.defaults to prevent key insertion order from
        // being a surprise for consumers of this library; this matters where opts are defined as functions,
        // which depend on the resolved value of a function opt declared ahead of it.
        // @See: `evaluates function-valued request options` in the test suite for an example.
        opts = Object.assign({},
            Object.fromEntries(Object.entries(this._defaults).filter(([key]) => !(key in opts))),
            opts
        );

        /**
         * Allow expansion of any opts set as functions to their return values
         * at this time.
         */
        for (const [key, func] of Object.entries(opts)){
            if (isFunction(func)){
                opts[key] = func(opts);
            }
        }

        let url = opts.url;
        const data = opts.data;

        delete opts.url;
        delete opts.data;

        if (!url){
            throw new Error("You must define a 'url' to make the request against.");
        }

        if (isString(url)){
            url = (url.indexOf('://') === -1) ? new URL(url, window.location.origin) : new URL(url);
        }

        /**
         * If data is specified, make sure we're appending properly if using a GET or HEAD request, or
         * setting the body appropriately otherwise.
         * Pull search params from passed url first, but allow overriding by data object.
         */
        if (data){
            if (['GET', 'HEAD'].includes(opts.method)){
                const params = new URLSearchParams(url.search);
                for (const [key, val] of Object.entries(data)){
                    if (val === void 0 || val === null) {
                        continue;
                    }
                    params.set(key, val);
                }
                url.search = params.toString();
            }else{
                opts.body = data;
            }
        }

        /**
         * Extend headers separately to avoid clobbering values when attempting to add headers.
         */
        if (isFunction(headers)){
            headers = headers(url, data, opts);
        }

        if (isFunction(optsHeaders)){
            optsHeaders = optsHeaders(url, data, opts);
        }

        headers = Object.assign({}, headers, optsHeaders);

        for (const [key, func] of Object.entries(headers)){
            if (isFunction(func)){
                headers[key] = func(url, data, opts);
            }
        }

        opts.headers = new Headers(headers);

        return fetch(url.toString(), opts).then((res) => {
            if (!res.ok){
                throw new CommError(`Failed ${opts.method} against ${url.toString()}`, res);
            }
            return res;
        });
    }

    /**
     * Simple proxy to request for a common use-case - sending json.
     * @returns {Promise<Response>}
     */
    json(opts){
        opts = clone(opts ?? {});

        let optsHeaders = opts.headers;
        delete opts.headers;
        /**
         * Override default headers to include json content type and accept header,
         * while still allowing for custom headers and header functions.
         */
        opts.headers = (url, data, opts) => {
            let headers = {};
            if (isFunction(optsHeaders)){
                headers = optsHeaders(url, data, opts);
            } else if (isObject(optsHeaders)){
                headers = Object.assign({}, optsHeaders);
            }
            for (const [key, func] of Object.entries(headers)){
                if (isFunction(func)){
                    headers[key] = func(url, data, opts);
                }
            }
            headers['Accept'] = 'application/json, text/plain, */*';
            headers['Content-Type'] = 'application/json';
            return headers;
        };

        /**
         * Stringify data to send as json if the method is not GET or HEAD, is
         * an object, and is not a function, FormData, or URLSearchParams.
         */
        if (
            opts.data &&
            isObject(opts.data) &&
            !isFunction(opts.data) &&
            !(opts.data instanceof FormData) &&
            !(opts.data instanceof URLSearchParams)
        ){
            let data = opts.data;
            delete opts.data;
            opts.data = (opts) => {
                if (!nobodyVerbs.includes(opts.method)){
                    opts.data = JSON.stringify(data);
                }
                return opts.data;
            };
        }

        return this.request(opts);
    }
}

/**
 * Adds convenience methods for each supported HTTP verb to Comm,
 * allowing you to make a POST/DELETE/GET/etc. request via a shortcut,
 * like comm.post('/some/url', {data: {}});
 * Routes through to comm.json, unless the optional `json` param is false.
 * @param {object} opts Any additional options to pass to the request.
 * @param {boolean} json Whether to send the request as json.
 * @lends Comm.prototype
 */
Object.assign(Comm.prototype, verbs.reduce((obj, verb) => {
    obj[verb] = function(opts, json = true){
        opts = opts ?? {};
        opts.method = verb.toUpperCase();
        return (json && !nobodyVerbs.includes(verb)) ? this.json(opts) : this.request(opts);
    };
    return obj;
}, {}));

// Comm singleton
const comm = new Comm();

/**
 * Install function, allowing comm to be used as a Vue plugin,
 * utilizing the comm singleton.
 * @param app Vue app.
 */
function install(app){
    if (install.installed) {
        return;
    }

    install.installed = true;

    app.config.globalProperties.$comm = comm;
}

export default comm;
export {CommError, Comm, comm, install};
