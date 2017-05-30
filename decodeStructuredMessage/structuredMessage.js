//  Decode the structured message sent by unabiz-arduino library.

const firstLetter = 1;  //  Letters are assigned codes 1 to 26, for A to Z
const firstDigit = 27;  //  Digits are assigned codes 27 to 36, for 0 to 9

function decodeLetter(code) {
  //  Convert the 5-bit code to a letter.
  if (code === 0) return 0;
  if (code >= firstLetter && code < firstDigit) return (code - firstLetter) + 'a'.charCodeAt(0);
  if (code >= firstDigit) return (code - firstDigit) + '0'.charCodeAt(0);
  return 0;
}

function decodeText(encodedText0) { /* eslint-disable no-bitwise, operator-assignment */
  //  Decode a text string with packed 5-bit letters.
  let encodedText = encodedText0;
  const text = [0, 0, 0];
  for (let j = 0; j < 3; j = j + 1) {
    const code = encodedText & 31;
    const ch = decodeLetter(code);
    if (ch > 0) text[2 - j] = ch;
    encodedText = encodedText >> 5;
  }
  //  Look for the terminating null and decode name with 1, 2 or 3 letters.
  /* eslint-disable no-nested-ternary */
  const result = text[2] ? String.fromCharCode(text[0], text[1], text[2])
    : text[1] ? String.fromCharCode(text[0], text[1])
      : String.fromCharCode(text[0], text[1]);
  /* eslint-enable no-nested-ternary */
  return result;
} /* eslint-enable no-bitwise, operator-assignment */

function decodeMessage(data, textFields) { /* eslint-disable no-bitwise, operator-assignment */
  //  Decode the packed binary SIGFOX message body data e.g. 920e5a00b051680194597b00
  //  2 bytes name, 2 bytes float * 10, 2 bytes name, 2 bytes float * 10, ...
  //  Returns an object with the decoded data e.g. {ctr: 999, lig: 754, tmp: 23}
  //  If the message contains text fields, provide the field names in textFields as an array,
  //  e.g. ['d1', 'd2, 'd3'].
  if (!data) return {};
  try {
    const result = {};
    for (let i = 0; i < data.length; i = i + 8) {
      const name = data.substring(i, i + 4);
      const val = data.substring(i + 4, i + 8);
      const encodedName =
        (parseInt(name[2], 16) << 12) +
        (parseInt(name[3], 16) << 8) +
        (parseInt(name[0], 16) << 4) +
        parseInt(name[1], 16);
      const encodedVal =
        (parseInt(val[2], 16) << 12) +
        (parseInt(val[3], 16) << 8) +
        (parseInt(val[0], 16) << 4) +
        parseInt(val[1], 16);

      //  Decode name.
      const decodedName = decodeText(encodedName);
      if (textFields && textFields.indexOf(decodedName) >= 0) {
        //  Decode the text field.
        result[decodedName] = decodeText(encodedVal);
      } else {
        //  Decode the number.
        result[decodedName] = encodedVal / 10.0;
      }
    }
    return result;
  } catch (error) {
    throw error;
  }
} /* eslint-enable no-bitwise, operator-assignment */

module.exports = {
  decodeMessage,
};
