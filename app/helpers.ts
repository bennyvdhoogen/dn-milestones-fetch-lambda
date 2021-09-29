import * as emoji from "https://deno.land/x/emoji/mod.ts";
import { XmlEntities } from "https://deno.land/x/html_entities@v1.0/mod.js";

export function sanitizeString(input: string)
{
  input = XmlEntities.encode(emoji.strip(input).replace("'",""));
  const additional_emojis = [
    '🏼',
    '💃',
    '👨🏻‍⚕️',
    '👨',
    '🏻‍',
    '⚕️',
  ];

  for (const emoji_key in additional_emojis) {
    input = input.replace(additional_emojis[emoji_key], "");
  }

  return input;
}