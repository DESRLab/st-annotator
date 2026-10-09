// https://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function ConstrainedString(validSpecialChars: string, minLength: number, maxLength: number) {
  return {
    regex: new RegExp(`^[a-zA-Z0-9${escapeRegExp(validSpecialChars)}]{${minLength},${maxLength}}$`),
    helperText: `This field must consist of ${minLength}-${maxLength} characters. Apart from letters and numbers, you may also use special characters from this list: <code>${validSpecialChars}</code>`,
  };
}
