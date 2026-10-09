import $ from 'jquery';

/**
 * Internal method to wrap an AJAX call in a {@link Promise} object.
 * 
 * @param {(url_settings?: string | JQuery.UrlAjaxSettings) => JQuery.jqXHR<unknown>} fn
 * The AJAX call.
 * @param {string} url The unnormalized URL.
 * @param {JQuery.AjaxSettings} settings Refer to the documentation of the AJAX call.
 * The `url`, `success` and `error` settings are fixed and overwrite those provided through
 * this argument.
 * @returns {Promise<unknown>} A promise that resolves to the requested data.
 */
async function wrapAJAX(fn, url, settings) {
    return new Promise((resolve, reject) => {
        fn({
            url: url,
            success: resolve,
            error: (jqXHR, textStatus, errorThrown) => {
                if (jqXHR.responseJSON?.message) {
                    // We prefer extracting the message from JSON
                    reject(new Error(jqXHR.responseJSON?.message));
                } else if (jqXHR.responseText) {
                    reject(new Error(jqXHR.responseText));
                } else {
                    reject(new Error(errorThrown));
                }
            },
            ...settings,
        });
    });
}

/**
 * Wraps a {@link $.get} call in a {@link Promise} object.
 * 
 * @param {string} url The unnormalized URL.
 * @param {JQuery.AjaxSettings} settings Refer to the documentation of {@link $.get}.
 * The `url`, `success` and `error` settings are fixed and overwrite those provided through
 * this argument.
 * @returns {Promise<unknown>} A promise that resolves to the requested data.
 */
export async function get(url, settings) {
    return wrapAJAX($.get, url, settings);
}

/**
 * Wraps a {@link $.post} call in a {@link Promise} object.
 * 
 * @param {string} url The unnormalized URL.
 * @param {JQuery.AjaxSettings} settings Refer to the documentation of {@link $.post}.
 * The `url`, `success` and `error` settings are fixed and overwrite those provided through
 * this argument.
 * @returns {Promise<unknown>} A promise that resolves to the requested data.
 */
export async function post(url, settings) {
    return wrapAJAX($.post, url, settings);
}

/**
 * Parses the data returned from a request into an array.
 * 
 * @param {unknown} data The data to parse.
 * @returns {unknown[]} The parsed data.
 * @throws {Error} If the provided data is not an array.
 */
export function parseArray(data) {
    if (!Array.isArray(data)) {
        console.error('Invalid data:', data);
        throw new Error('The returned data is not an array');
    }

    return data;
}
