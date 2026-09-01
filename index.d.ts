export type RequestData =
    | Record<string, unknown>
    | string
    | URLSearchParams
    | FormData
    | null
    | undefined;

export type RequestOptionValue<T = unknown> =
    | T
    | ((options: RequestOptions) => T | Promise<T>);

export type HeaderValue =
    | string
    | number
    | boolean
    | null
    | undefined
    | (() =>
    | string
    | number
    | boolean
    | null
    | undefined
    | Promise<string | number | boolean | null | undefined>);

export type HeaderInit = Record<string, HeaderValue>;

export type HeaderFunction = (
    url: URL,
    data: RequestData,
    options: RequestOptions
) => HeaderInit | Promise<HeaderInit>;

export type CommHeaders = HeaderInit | HeaderFunction;

export interface RequestOptions
    extends Omit<RequestInit, "headers" | "body" | "method"> {
    url: string | URL;
    data?: RequestOptionValue<RequestData>;
    body?: RequestOptionValue<BodyInit | null>;
    method?: string;
    headers?: CommHeaders;
    baseURL?: string | URL;
    [key: string]: unknown;
}

export interface CommDefaults
    extends Omit<RequestInit, "headers" | "body" | "method"> {
    method?: string;
    headers?: CommHeaders;
    [key: string]: unknown;
}

export type VerbOptions = Omit<RequestOptions, "method" | "url"> & {
    url?: string | URL;
    method?: string;
};

export type ConfigureOptions = Partial<CommDefaults>;

export type CommHook = (
    url: URL,
    data: RequestData,
    options: RequestOptions,
    response?: Response
) => void | Response | Promise<void | Response>;

export class CommError extends Error {
    response: Response;

    constructor(message: string, response: Response);
}

export class Comm {
    defaults: CommDefaults;

    constructor();

    configure(options?: ConfigureOptions | false | null): void;

    hook(func: CommHook, pre?: boolean): string;

    before(func: CommHook): string;

    after(func: CommHook): string;

    unhook(id: string | false): void;

    request(options: RequestOptions): Promise<Response>;

    json(options?: Omit<RequestOptions, "url"> & { url?: string | URL }): Promise<Response>;

    delete(options?: VerbOptions, json?: boolean): Promise<Response>;

    get(options?: VerbOptions, json?: boolean): Promise<Response>;

    head(options?: VerbOptions, json?: boolean): Promise<Response>;

    patch(options?: VerbOptions, json?: boolean): Promise<Response>;

    post(options?: VerbOptions, json?: boolean): Promise<Response>;

    put(options?: VerbOptions, json?: boolean): Promise<Response>;

    options(options?: VerbOptions, json?: boolean): Promise<Response>;
}

export interface VueApp {
    config: {
        globalProperties: Record<string, unknown>;
    };
}

export interface CommPlugin {
    installed?: boolean;
    (app: VueApp): void;
}

export const comm: Comm;
export const install: CommPlugin;

declare const defaultComm: Comm;

export default defaultComm;
