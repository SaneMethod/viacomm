/**
 * Simple central point for interacting with the server, and a thin layer over the fetch API.
 * @See: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
 * @author ckeefer
 */

import {isFunction, isString, cloneDeep} from "lodash-es";

const URL = window.URL;
const clone = window.structuredClone || cloneDeep;

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
     * @param {{headers:<object|Function>=, body:<any>=, url:string, data:object|string=, method:string=}} opts
     * @returns {Promise<Response>}
     */
    request(opts){
        let headers = this.defaults.headers,
            optsHeaders = opts.headers;

        opts = Object.assign({}, this.defaults, opts);

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
    };

    /**
     * Simple proxy to request for a common use-case - sending json.
     * @returns {Promise<Response>}
     */
    json(opts){
        opts = opts || {};
        opts.headers = Object.assign({}, opts.headers, {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
        });

        if (opts.data && !(typeof opts.data === 'string')){
            opts.data = JSON.stringify(opts.data);
        }

        return this.request(opts);
    }
}

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
export {CommError, comm, install};
