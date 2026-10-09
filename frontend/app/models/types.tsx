export const Name = {
    regex: new RegExp(`^[^\u0000]{1,255}$`),
    helperText: "The name cannot be blank and may be at most 255 characters long.",
};

export const QualityRank = {
    ge: -32768,
    le: 32767,
    helperText: "The quality rank must be between -32768 and 32767 (inclusive)."
}

type DecimalValidationOptions = {
    allowEmpty?: boolean;
};

type Vector3String = {
    x: string;
    y: string;
    z: string;
};

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function countSignificantDigits(integerPart: string, fractionPart: string) {
    const normalizedIntegerPart = integerPart.replace(/^0+/, '');
    const normalizedFractionPart = fractionPart.replace(/0+$/, '');

    return `${normalizedIntegerPart}${normalizedFractionPart}`.length;
}

function validateDecimal(value: string, helperText: string, options?: DecimalValidationOptions) {
    const trimmed = value.trim();
    if (trimmed === '') {
        return options?.allowEmpty ? null : helperText;
    }

    if (!DECIMAL_PATTERN.test(trimmed)) {
        return helperText;
    }

    const unsignedValue = trimmed.replace(/^[+-]/, '');
    const [integerPart, fractionPart = ''] = unsignedValue.split('.');
    if (fractionPart.length > 6) {
        return helperText;
    }

    if (countSignificantDigits(integerPart, fractionPart) > 12) {
        return helperText;
    }

    return null;
}

function validatePositiveDecimal(value: string, helperText: string, options?: DecimalValidationOptions) {
    const scalarError = validateDecimal(value, helperText, options);
    if (scalarError) {
        return scalarError;
    }

    const trimmed = value.trim();
    if (trimmed === '') {
        return null;
    }

    return Number(trimmed) > 0 ? null : helperText;
}

function validateVector3(
    vector: Vector3String,
    validateComponent: (value: string, options?: DecimalValidationOptions) => string | null,
    options?: DecimalValidationOptions,
) {
    for (const component of ['x', 'y', 'z'] as const) {
        const componentError = validateComponent(vector[component], options);
        if (componentError) {
            return `${component.toUpperCase()}: ${componentError}`;
        }
    }

    return null;
}

const DECIMAL_PLACES = 6;
const DECIMAL_DIGITS = 12;

export const DecimalCoord = {
    places: DECIMAL_PLACES,
    digits: DECIMAL_DIGITS,
    helperText: `The value must have at most ${DECIMAL_DIGITS} digits and ${DECIMAL_PLACES} decimal places.`,
    validate(value: string, options?: DecimalValidationOptions) {
        return validateDecimal(value, this.helperText, options);
    },
};

export const DecimalSize = {
    places: DECIMAL_PLACES,
    digits: DECIMAL_DIGITS,
    helperText: `The value must be positive with at most ${DECIMAL_DIGITS} digits and ${DECIMAL_PLACES} decimal places.`,
    validate(value: string, options?: DecimalValidationOptions) {
        return validatePositiveDecimal(value, this.helperText, options);
    },
};

export const DecimalCoord3 = {
    helperText: `Each component have at most ${DECIMAL_DIGITS} digits and ${DECIMAL_PLACES} decimal places.`,
    validate(vector: Vector3String, options?: DecimalValidationOptions) {
        return validateVector3(vector, (value, validationOptions) => DecimalCoord.validate(value, validationOptions), options);
    },
};

export const DecimalSize3 = {
    helperText: `Each component must be positive with at most ${DECIMAL_DIGITS} digits and ${DECIMAL_PLACES} decimal places.`,
    validate(vector: Vector3String, options?: DecimalValidationOptions) {
        return validateVector3(vector, (value, validationOptions) => DecimalSize.validate(value, validationOptions), options);
    },
};

function hasUriScheme(value: string) {
    return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

function hasParentTraversal(value: string) {
    return value.split('/').some(part => part === '..');
}

export const FileURI = {
    regex: new RegExp(`^[^\u0000]{1,255}$`),
    targetHelperText: "The URI must be relative and cannot navigate to a parent directory.",
    helperText: "The URI cannot be blank, may be at most 255 characters long, must be relative, and cannot navigate to a parent directory.",
    validate(value: string) {
        if (!this.regex.test(value)) {
            return this.helperText;
        }

        if (value.startsWith('/') || hasUriScheme(value) || hasParentTraversal(value)) {
            return this.targetHelperText;
        }

        return null;
    },
};
