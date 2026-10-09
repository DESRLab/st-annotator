import * as THREE from 'three';

/**
 * Defines each event that can be dispatched by {@link FormInput}.
 * 
 * @template {{} | null} T The type of value stored in the input.
 * @typedef {object} FormInputEventMap
 * @property {{ value: T | undefined }} change The event when the value in the input has been
 * changed.
 */

/**
 * @template {{} | null} T The type of value stored in the input.
 * @typedef {object} FormInputOptions
 * @property {string} labelText The text displayed in the associated label.
 * @property {string} id The HTML `id` of the input.
 * @property {string} inputType The HTML `type` of the input.
 * @property {T} value The initial value to store in the input.
 * @property {(value: T) => string} serializeValue Serializes the value to display in the input.
 * @property {(value: string) => T} parseValue Parses the value from the display in the input.
 * If the value is invalid, an {@link Error} should be thrown; its `message` is displayed to
 * the user accordingly.
 * @property {T} [min] The minimum value of the input.
 * @property {T} [max] The maximum value of the input.
 * @property {T} [step] The increment of the input.
 * @property {string} [description=''] The description of the input. May contain inner HTML
 * elements.
 * @property {boolean} [disabled=false] The HTML `disabled` of the input. This also sets the
 * HTML `readonly` of the input.
 */

/**
 * Represents a form input that contains a possibly non-string value.
 * 
 * @template {{} | null} T The type of value stored in the input.
 * @augments THREE.EventDispatcher<FormInputEventMap<T>>
 */
export class FormInput extends THREE.EventDispatcher {

    /**
     * A DOM element representing this input.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * The text displayed in the associated label.
     * 
     * @readonly
     * @type {string}
     */
    labelText;

    /**
     * The HTML `type` of the input.
     * 
     * @readonly
     * @type {string}
     */
    inputType;

    /**
     * The description of the input.
     * 
     * @readonly
     * @type {string}
     */
    description;

    /**
     * Serializes the value to display in the input.
     * 
     * @readonly
     * @type {(value: T) => string}
     */
    serializeValue;

    /**
     * Parses the value from the display in the input.
     * 
     * If the value is invalid, an {@link Error} should be thrown.
     * 
     * @readonly
     * @type {(value: string) => T}
     */
    parseValue;

    /**
     * The HTML input element.
     * 
     * @readonly
     * @type {HTMLInputElement}
     */
    #inputElem;

    /**
     * Displays the error message when the value is invalid.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    #invalidElem;

    /**
     * @type {T | undefined}
     */
    #min = undefined;

    /**
     * The minimum value of the input, or `undefined` if not set.
     * 
     * Note that since the type of value may not be directly comparable,
     * this class cannot perform range validation automatically;
     * instead, you should set up your own validation in {@link parseValue}.
     * 
     * @type {T | undefined}
     */
    get min() { return this.#min; }

    set min(value) {
        if (this.#min !== value) {
            this.#inputElem.min = (value === undefined) ? ''
                : this.serializeValue(value);

            this.#min = value;

            this.#updateValue(this.#inputElem.value);
        }
    }

    /**
     * @type {T | undefined}
     */
    #max = undefined;

    /**
     * The maximum value of the input, or `undefined` if not set.
     * 
     * Note that since the type of value may not be directly comparable,
     * this class cannot perform range validation automatically;
     * instead, you should set up your own validation in {@link parseValue}.
     * 
     * @type {T | undefined}
     */
    get max() { return this.#max; }

    set max(value) {
        if (this.#max !== value) {
            this.#inputElem.max = (value === undefined) ? ''
                : this.serializeValue(value);

            this.#max = value;

            this.#updateValue(this.#inputElem.value);
        }
    }

    /**
     * @type {T | undefined}
     */
    #step = undefined;

    /**
     * The increment of the input, or `undefined` if not set.
     * 
     * @type {T | undefined}
     */
    get step() { return this.#step; }

    set step(value) {
        if (this.#step !== value) {
            this.#inputElem.step = (value === undefined) ? ''
                : this.serializeValue(value);

            this.#step = value;
        }
    }

    /**
     * @type {T | undefined}
     */
    #value = undefined;

    /**
     * The value in the input, or `undefined` if the value is invalid.
     * 
     * @type {T | undefined}
     */
    get value() { return this.#value; }

    set value(value) {
        if (this.#value !== value) {
            this.#inputElem.value = (value === undefined) ? ''
                : this.serializeValue(value);

            this.#updateValue(this.#inputElem.value);
        }
    }

    /**
     * `true` if the value in the input is valid; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get isValid() { return this.#value !== undefined; }

    /**
     * The HTML `disabled` of the input. This also sets the HTML `readonly` of the input.
     * 
     * @type {boolean}
     */
    get disabled() { return this.#inputElem.disabled; }

    set disabled(value) {
        this.#inputElem.disabled = value;
        this.#inputElem.readOnly = value;
    }

    #onInputChange = () => {
        this.#updateValue(this.#inputElem.value);
    };

    /**
     * Creates an form input that contains a possibly non-string value.
     * 
     * @param {FormInputOptions<T>} options The options of the input.
     */
    constructor(options) {
        super();

        const dom = document.createElement('div');
        dom.className = 'mb-3';
        {
            const labelElem = document.createElement('label');
            labelElem.htmlFor = options.id;
            labelElem.className = 'form-label';
            labelElem.textContent = options.labelText;
            dom.appendChild(labelElem);

            const inputElem = document.createElement('input');
            inputElem.id = options.id;
            inputElem.className = 'form-control';
            inputElem.type = options.inputType;
            dom.appendChild(inputElem);

            const descriptionElem = document.createElement('div');
            descriptionElem.className = 'form-text';
            descriptionElem.innerHTML = options.description ?? '';
            dom.appendChild(descriptionElem);

            const invalidElem = document.createElement('div');
            invalidElem.className = 'invalid-feedback';
            dom.appendChild(invalidElem);

            this.#inputElem = inputElem;
            this.#invalidElem = invalidElem;
        }
        this.dom = dom;

        this.labelText = options.labelText;
        this.inputType = options.inputType;
        this.description = options.description ?? '';
        this.serializeValue = options.serializeValue;
        this.parseValue = options.parseValue;
        this.disabled = options.disabled ?? false;

        this.#inputElem.addEventListener('change', this.#onInputChange);

        this.min = options.min;
        this.max = options.max;
        this.step = options.step;
        this.value = options.value;
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#inputElem.removeEventListener('change', this.#onInputChange);
    }

    /**
     * Updates the value in the input.
     * 
     * @param {string} strValue The serialized value to update the input with.
     */
    #updateValue(strValue) {
        try {
            this.#value = this.parseValue(strValue);

            this.#inputElem.classList.remove('is-invalid');
            this.#invalidElem.textContent = '';
        } catch (e) {
            this.#value = undefined;

            this.#inputElem.classList.add('is-invalid');
            this.#invalidElem.textContent = (e instanceof Error) ? e.message : 'Unknown error';
        }

        this.dispatchEvent({ type: 'change', value: this.value });
    }
}
